// Plain-text picks: what the share-sheet fallback sends, what the lab
// notification carries, and what the lab view shows. Shared with the Worker.

import { PRINT_SIZES, type Manifest, type Picks } from './types';

const sizeLabel = (id: string) => PRINT_SIZES.find(s => s.id === id)?.label ?? id;

export function picksText(r: Pick<Manifest, 'rollCode' | 'title' | 'date'>, p: Picks): string {
  const lines = [`Eastman Film Lab · ${r.rollCode}`, `${r.title} · ${r.date}`, ''];
  lines.push(`Keep: ${p.keep.join(', ') || '—'}`);
  lines.push(`Out: ${p.reject.join(', ') || '—'}`);
  if (p.prints.length) {
    lines.push('', 'Prints:');
    for (const x of p.prints) lines.push(`  #${x.frame} — ${x.copies} × ${sizeLabel(x.size)}`);
  }
  if (p.notes.length) {
    lines.push('', 'Notes:');
    for (const x of p.notes) lines.push(`  #${x.frame} — ${x.text}`);
  }
  if (p.labNote) lines.push('', 'Requests:', p.labNote);
  return lines.join('\n');
}
