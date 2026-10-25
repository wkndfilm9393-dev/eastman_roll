// Talking to the roll backend (worker/handler.ts). Where there is no backend
// (plain static hosting, the single-file demo) the viewer still works: the
// manifest comes from /rolls/{code}/manifest.json and everything stays local.

import type { Picks, RollResponse, RollSession } from './types';

export class NotFound extends Error {}

const api = (code: string, path = '') => `/api/roll/${encodeURIComponent(code)}${path}`;

/** Roll + saved session. `online` is false when only static files answered. */
export async function fetchRoll(code: string): Promise<RollResponse & { online: boolean }> {
  try {
    const res = await fetch(api(code));
    if (res.headers.get('content-type')?.includes('application/json')) {
      if (res.status === 404) throw new NotFound();
      if (res.ok) return { ...(await res.json() as RollResponse), online: true };
    }
  } catch (e) { if (e instanceof NotFound) throw e; }   // offline or no backend: try the static manifest
  const res = await fetch(`/rolls/${encodeURIComponent(code)}/manifest.json`);
  if (!res.ok) throw new NotFound();
  return { manifest: await res.json(), session: null, submissions: [], online: false };
}

/** Upsert the session; returns the server's merged copy. */
export async function putSession(code: string, s: RollSession, keepalive = false): Promise<RollSession> {
  const res = await fetch(api(code, '/session'), {
    method: 'PUT', keepalive,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error(`session ${res.status}`);
  return (await res.json() as { session: RollSession }).session;
}

export async function submitPicks(code: string, picks: Picks): Promise<{ submittedAt: number }> {
  const res = await fetch(api(code, '/submit'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(picks),
  });
  if (!res.ok) throw new Error(`submit ${res.status}`);
  return res.json();
}
