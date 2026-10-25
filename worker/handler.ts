// The roll backend. One handler, two hosts: worker/index.ts on Cloudflare
// (R2 + KV + static assets) and the Vite dev server (vite.config.ts, backed by
// public/rolls and a JSON file). Images are served from the same origin as
// the viewer, so the contact-sheet canvas never taints and R2 needs no CORS.
//
//   GET  /api/roll/:code          → { manifest, session, submissions }
//   PUT  /api/roll/:code/session  → merge marks/notes/prints, returns the merged session
//   POST /api/roll/:code/submit   → body: store.picks(); records it and notifies the lab
//   GET  /rolls/:code/...         → manifest and images from the bucket

import { picksText } from '../src/pickstext';
import { mergeSessions } from '../src/session';
import { PRINT_SIZES, type FrameState, type Manifest, type Picks, type RollSession, type Submission } from '../src/types';

/** The parts of an R2 bucket this uses. */
export interface Bucket {
  get(key: string): Promise<{ body: ReadableStream | null; httpEtag?: string; httpMetadata?: { contentType?: string } } | null>;
}
/** The parts of a KV namespace this uses. */
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
export interface Env {
  ROLLS: Bucket;               // rolls/{CODE}/manifest.json, thumb/, screen/, full/
  SESSIONS: KV;                // session:{CODE}, submissions:{CODE}
  LAB_WEBHOOK_URL?: string;    // where "picks sent" goes; unset = log only
  PUBLIC_ORIGIN?: string;      // origin for /lab links in notifications; default = request origin
}
export interface Ctx { waitUntil(p: Promise<unknown>): void }

const CODE = /^[A-Z0-9]{10,32}$/;
const MAX_BODY = 64 * 1024, MAX_NOTE = 500, MAX_LAB_NOTE = 2000, MAX_SUBMISSIONS = 20;
const SIZES = new Set<string>(PRINT_SIZES.map(s => s.id));
const MARKS = new Set(['none', 'keep', 'reject']);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);

export async function handle(req: Request, env: Env, ctx: Ctx): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/rolls/')) return req.method === 'GET' || req.method === 'HEAD' ? serveImage(url.pathname.slice(1), env) : fail(405, 'method');

  const m = url.pathname.match(/^\/api\/roll\/([^/]+)(\/session|\/submit)?\/?$/);
  if (!m) return url.pathname.startsWith('/api/') ? fail(404, 'not_found') : null;
  const code = m[1].toUpperCase();
  if (!CODE.test(code)) return fail(404, 'not_found');
  const manifest = await readManifest(env, code);
  if (!manifest) return fail(404, 'not_found');

  try {
    if (!m[2] && req.method === 'GET') {
      const [session, submissions] = await Promise.all([readSession(env, code), readSubmissions(env, code)]);
      return json({ manifest, session, submissions });
    }
    if (m[2] === '/session' && req.method === 'PUT') {
      const incoming = cleanSession(await body(req), manifest);
      if (!incoming) return fail(400, 'bad_session');
      const merged = mergeSessions((await readSession(env, code)) ?? { rollCode: code, frames: {} }, incoming);
      merged.rollCode = code;
      await env.SESSIONS.put(`session:${code}`, JSON.stringify(merged));
      return json({ session: merged });
    }
    if (m[2] === '/submit' && req.method === 'POST') {
      const picks = cleanPicks(await body(req), manifest);
      if (!picks) return fail(400, 'bad_picks');
      const at = Date.now();
      const submissions = [...(await readSubmissions(env, code)), { at, picks }].slice(-MAX_SUBMISSIONS);
      const session = (await readSession(env, code)) ?? { rollCode: code, frames: {} };
      session.submittedAt = at;
      await env.SESSIONS.put(`submissions:${code}`, JSON.stringify(submissions));
      await env.SESSIONS.put(`session:${code}`, JSON.stringify(session));
      const labUrl = `${env.PUBLIC_ORIGIN?.replace(/\/$/, '') || url.origin}/lab/${code}`;
      ctx.waitUntil(notify(env, manifest, picks, labUrl, submissions.length));
      return json({ submittedAt: at, labUrl });
    }
    return fail(405, 'method');
  } catch (e) {
    if (e instanceof BadBody) return fail(e.status, e.message);
    throw e;
  }
}

/* ───────────── storage ───────────── */

async function readManifest(env: Env, code: string): Promise<Manifest | null> {
  const o = await env.ROLLS.get(`rolls/${code}/manifest.json`);
  if (!o?.body) return null;
  return (await new Response(o.body).json()) as Manifest;
}
async function readSession(env: Env, code: string): Promise<RollSession | null> {
  const raw = await env.SESSIONS.get(`session:${code}`);
  return raw ? (JSON.parse(raw) as RollSession) : null;
}
async function readSubmissions(env: Env, code: string): Promise<Submission[]> {
  const raw = await env.SESSIONS.get(`submissions:${code}`);
  return raw ? (JSON.parse(raw) as Submission[]) : [];
}

const TYPES: Record<string, string> = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', json: 'application/json' };

async function serveImage(key: string, env: Env): Promise<Response> {
  if (!/^rolls\/[A-Z0-9]{10,32}\/[\w./-]+$/.test(key) || key.includes('..')) return fail(404, 'not_found');
  const o = await env.ROLLS.get(key);
  if (!o?.body) return fail(404, 'not_found');
  const ext = key.split('.').pop()!.toLowerCase();
  const headers = new Headers({
    'content-type': o.httpMetadata?.contentType || TYPES[ext] || 'application/octet-stream',
    // images never change once ingested; the manifest can be re-ingested
    'cache-control': ext === 'json' ? 'public, max-age=60' : 'public, max-age=31536000, immutable',
  });
  if (o.httpEtag) headers.set('etag', o.httpEtag);
  return new Response(o.body, { headers });
}

/* ───────────── validation: only known frames, known values, bounded text ───────────── */

class BadBody extends Error { constructor(readonly status: number, msg: string) { super(msg); } }

async function body(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new BadBody(413, 'too_large');
  try { return JSON.parse(text); } catch { throw new BadBody(400, 'bad_json'); }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanSession(v: unknown, manifest: Manifest): RollSession | null {
  if (!obj(v) || !obj(v.frames)) return null;
  const ids = new Set(manifest.frames.map(f => f.id));
  const now = Date.now();
  const stamp = (t: unknown) => (typeof t === 'number' && t > 0 ? Math.min(t, now) : 0);   // no future-dated edits winning merges forever
  const frames: Record<string, FrameState> = {};
  for (const [id, f] of Object.entries(v.frames)) {
    if (!ids.has(id) || !obj(f)) continue;
    const s: FrameState = { id, mark: MARKS.has(f.mark as string) ? (f.mark as FrameState['mark']) : 'none', updatedAt: stamp(f.updatedAt) };
    const note = str(f.note, MAX_NOTE);
    if (note) s.note = note;
    if (obj(f.print) && SIZES.has(f.print.size as string)) {
      s.print = { copies: Math.max(0, Math.min(99, Math.floor(Number(f.print.copies) || 0))), size: f.print.size as '3x5' | '4x6' };
    }
    frames[id] = s;
  }
  const labNote = str(v.labNote, MAX_LAB_NOTE);
  return { rollCode: manifest.rollCode, frames, labNote: labNote || undefined, labNoteAt: stamp(v.labNoteAt) || undefined };
}

function cleanPicks(v: unknown, manifest: Manifest): Picks | null {
  if (!obj(v)) return null;
  const numbers = new Set(manifest.frames.map(f => f.number));
  const frameList = (a: unknown) => (Array.isArray(a) ? [...new Set(a.filter((n): n is string => typeof n === 'string' && numbers.has(n)))] : []);
  const rows = (a: unknown) => (Array.isArray(a) ? a.filter(obj).filter(x => numbers.has(x.frame as string)) : []);
  return {
    rollCode: manifest.rollCode,
    keep: frameList(v.keep),
    reject: frameList(v.reject),
    prints: rows(v.prints)
      .map(x => ({ frame: x.frame as string, copies: Math.max(0, Math.min(99, Math.floor(Number(x.copies) || 0))), size: x.size as '3x5' | '4x6' }))
      .filter(x => x.copies > 0 && SIZES.has(x.size)),
    notes: rows(v.notes).map(x => ({ frame: x.frame as string, text: str(x.text, MAX_NOTE) })).filter(x => x.text),
    labNote: str(v.labNote, MAX_LAB_NOTE) || undefined,
  };
}

/* ───────────── lab notification ───────────── */

// Where this goes is still open with Bryan (email, KakaoTalk via SOLAPI, or a
// sheet). For now: one JSON POST to LAB_WEBHOOK_URL. `text` suits Slack and
// most webhook relays, `content` suits Discord; the structured picks ride along.
async function notify(env: Env, m: Manifest, picks: Picks, labUrl: string, nth: number) {
  const head = nth > 1 ? `Updated picks (send #${nth})` : 'New picks';
  const text = `${head} — ${labUrl}\n\n${picksText(m, picks)}`;
  if (!env.LAB_WEBHOOK_URL) { console.log(`[lab notify, no LAB_WEBHOOK_URL]\n${text}`); return; }
  try {
    const res = await fetch(env.LAB_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text.slice(0, 2000), rollCode: m.rollCode, roll: m.roll, labUrl, picks }),
    });
    if (!res.ok) console.error(`lab webhook ${res.status}`);
  } catch (e) { console.error('lab webhook failed', e); }
}
