import { putSession } from './api';
import { lastEdit, mergeSessions } from './session';
import type { Manifest, Mark, Picks, PrintRequest, RollSession } from './types';

export type Change =
  | { kind: 'active'; index: number; from: string }
  | { kind: 'mark'; index: number; fresh: boolean }
  | { kind: 'note'; index: number }
  | { kind: 'print'; index: number }
  | { kind: 'labNote' }
  | { kind: 'submitted' };

type Listener = (c: Change) => void;

const KEY = (code: string) => `eastman-loupe:${code}`;
const SYNC_DELAY = 1500, RETRY_DELAY = 10_000;

export interface StoreOptions {
  remote?: RollSession | null;   // the server's copy, merged with this device's
  online?: boolean;              // a backend answered: sync edits to it
  readOnly?: boolean;            // the lab view: show the customer's session, change nothing
}

function readLocal(code: string): RollSession | null {
  try {
    const raw = localStorage.getItem(KEY(code));
    return raw ? (JSON.parse(raw) as RollSession) : null;
  } catch { return null; }
}

/** Single source of truth for one roll: marks, notes and the active frame. */
export class Store {
  readonly session: RollSession;
  readonly online: boolean;
  readonly readOnly: boolean;
  active = 0;
  private listeners = new Set<Listener>();
  private saveTimer = 0;
  private syncTimer = 0;
  private inflight: Promise<unknown> | null = null;
  private dirty = false;

  constructor(readonly roll: Manifest, opts: StoreOptions = {}) {
    const empty: RollSession = { rollCode: roll.rollCode, frames: {} };
    this.readOnly = !!opts.readOnly;
    this.online = !!opts.online && !this.readOnly;
    if (this.readOnly) this.session = opts.remote ?? empty;
    else {
      const local = readLocal(roll.rollCode);
      this.session = opts.remote ? mergeSessions(local ?? empty, opts.remote) : local ?? empty;
      // edits made offline, or on this device before the backend existed, go up now
      if (this.online && local && lastEdit(local) > lastEdit(opts.remote ?? empty)) this.dirty = true;
    }
    if (this.online) {
      if (this.dirty) this.scheduleSync(0);
      // a phone closing the tab mid-debounce must not lose the last mark
      const flush = () => this.flush().catch(() => { /* retried on the next visit */ });
      addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
  }

  get count() { return this.roll.frames.length; }
  frame(i: number) { return this.roll.frames[i]; }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(c: Change) { for (const fn of this.listeners) fn(c); }

  setActive(index: number, from: string) {
    const i = Math.max(0, Math.min(this.count - 1, index));
    if (i === this.active) return;
    this.active = i;
    this.emit({ kind: 'active', index: i, from });
  }

  mark(i: number): Mark { return this.session.frames[this.roll.frames[i].id]?.mark ?? 'none'; }
  note(i: number): string { return this.session.frames[this.roll.frames[i].id]?.note ?? ''; }

  /** Applying the mark a frame already has clears it — marks are a tri-state toggle. */
  toggleMark(i: number, mark: Mark) {
    this.setMark(i, this.mark(i) === mark ? 'none' : mark);
  }

  setMark(i: number, mark: Mark) {
    if (this.readOnly || this.mark(i) === mark) return;
    this.patch(i, { mark });
    this.emit({ kind: 'mark', index: i, fresh: mark !== 'none' });
  }

  setNote(i: number, note: string) {
    if (this.readOnly) return;
    this.patch(i, { note: note.trim() || undefined });
    this.emit({ kind: 'note', index: i });
  }

  print(i: number): PrintRequest {
    return this.session.frames[this.roll.frames[i].id]?.print ?? { copies: 0, size: '4x6' };
  }

  setPrint(i: number, p: PrintRequest) {
    if (this.readOnly) return;
    this.patch(i, { print: { copies: Math.max(0, Math.min(99, p.copies)), size: p.size } });
    this.emit({ kind: 'print', index: i });
  }

  /** The lab payload: frame numbers and requests, no image data. */
  picks(): Picks {
    const out: Picks = { rollCode: this.roll.rollCode, keep: [], reject: [], prints: [], notes: [], labNote: this.session.labNote };
    this.roll.frames.forEach((f, i) => {
      const m = this.mark(i);
      if (m === 'keep') out.keep.push(f.number);
      if (m === 'reject') out.reject.push(f.number);
      const p = this.print(i);
      if (p.copies > 0) out.prints.push({ frame: f.number, copies: p.copies, size: p.size });
      const n = this.note(i);
      if (n) out.notes.push({ frame: f.number, text: n });
    });
    return out;
  }

  setLabNote(text: string) {
    if (this.readOnly) return;
    this.session.labNote = text || undefined;
    this.session.labNoteAt = Date.now();
    this.save();
    this.emit({ kind: 'labNote' });
  }

  tally() {
    let keep = 0, reject = 0;
    for (let i = 0; i < this.count; i++) {
      const m = this.mark(i);
      if (m === 'keep') keep++; else if (m === 'reject') reject++;
    }
    return { total: this.count, keep, reject, none: this.count - keep - reject };
  }

  nextUnmarked(from = this.active): number {
    for (let k = 1; k <= this.count; k++) {
      const i = (from + k) % this.count;
      if (this.mark(i) === 'none') return i;
    }
    return -1;
  }

  private patch(i: number, p: { mark?: Mark; note?: string; print?: PrintRequest }) {
    const id = this.roll.frames[i].id;
    const prev = this.session.frames[id] ?? { id, mark: 'none' as Mark, updatedAt: 0 };
    this.session.frames[id] = { ...prev, ...p, updatedAt: Date.now() };
    this.save();
  }

  /** Sent to the lab, and nothing changed since. */
  get sentUpToDate() {
    const at = this.session.submittedAt;
    return !!at && lastEdit(this.session) <= at;
  }

  markSubmitted(at: number) {
    this.session.submittedAt = at;
    this.writeLocal();
    this.emit({ kind: 'submitted' });
  }

  /** Push pending edits now: before sending picks, and when the page is hidden. */
  async flush(): Promise<void> {
    if (!this.online) return;
    clearTimeout(this.syncTimer);
    while (this.inflight) await this.inflight.catch(() => { /* handled by its caller */ });
    if (!this.dirty) return;
    this.dirty = false;
    this.inflight = putSession(this.roll.rollCode, this.session, document.visibilityState === 'hidden')
      .finally(() => (this.inflight = null));
    try { await this.inflight; }
    catch (e) { this.dirty = true; this.scheduleSync(RETRY_DELAY); throw e; }
  }

  private scheduleSync(ms: number) {
    clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => this.flush().catch(() => { /* retried */ }), ms);
  }

  // Local first so the viewer survives refresh and offline use, then a
  // debounced PUT /api/roll/:code/session when a backend is there.
  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.writeLocal(), 120);
    if (this.online) { this.dirty = true; this.scheduleSync(SYNC_DELAY); }
  }

  private writeLocal() {
    try { localStorage.setItem(KEY(this.roll.rollCode), JSON.stringify(this.session)); } catch { /* private mode */ }
  }
}
