// Session merge, shared by the viewer and the Worker. Each frame carries its
// own updatedAt and the newer edit wins, so two devices (or, later, two
// authors) editing different frames never overwrite each other.

import type { FrameState, RollSession } from './types';

export function mergeSessions(a: RollSession, b: RollSession): RollSession {
  const frames: Record<string, FrameState> = { ...a.frames };
  for (const [id, f] of Object.entries(b.frames)) {
    if (!frames[id] || f.updatedAt > frames[id].updatedAt) frames[id] = f;
  }
  const bNote = (b.labNoteAt ?? 0) > (a.labNoteAt ?? 0);
  return {
    ...a,
    frames,
    labNote: bNote ? b.labNote : a.labNote,
    labNoteAt: Math.max(a.labNoteAt ?? 0, b.labNoteAt ?? 0) || undefined,
    submittedAt: Math.max(a.submittedAt ?? 0, b.submittedAt ?? 0) || undefined,
  };
}

/** Latest edit anywhere in the session; compared with submittedAt to spot changes since sending. */
export function lastEdit(s: RollSession): number {
  let t = s.labNoteAt ?? 0;
  for (const f of Object.values(s.frames)) t = Math.max(t, f.updatedAt);
  return t;
}
