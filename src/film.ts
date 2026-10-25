// The film component — the one place that knows what a strip of 135 looks like.
// Geometry and colours mirror the contact sheet tool (webapp/index-ocr.html:
// filmSpec / perfsH / drawEdgePrint); all sizing lives in CSS under `.film`,
// so restyling to a revised contact sheet only touches this file + that block.

import { picture } from './img';
import { renderMark } from './marks';
import type { Store } from './store';

export const FILM = {
  aspect: 3 / 2,
  perfBand: 0.135,   // × frame height
  rebate: 0.115,     // × frame height
  gap: 0.045,        // × frame width
  edgeText: 'EASTMAN FILM LAB',
};

/** Height of one horizontal strip for a given frame width. */
export const stripHeight = (fw: number) => (fw / FILM.aspect) * (1 + 2 * FILM.perfBand + 2 * FILM.rebate);

// DX-style barcode: bits hashed from the roll code, same scheme as the contact sheet.
function bitsFor(seed: string) {
  let h = 2166136261 >>> 0, out = '';
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  for (let i = 0; i < 4; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    out += h.toString(2).padStart(32, '0');
  }
  return out.slice(0, 60);
}

function barcodeSvg(code: string) {
  const bits = bitsFor(code);
  let x = 0, rects = '';
  for (const b of bits) {
    const w = b === '1' ? 2 : 1;
    if (b === '1') rects += `<rect x="${x}" width="${w}" height="10"/>`;
    x += w + 0.5;
  }
  return `<svg class="bc" viewBox="0 0 ${x} 10" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

/** Continuous edge print: [barcode] EASTMAN FILM LAB  ROLLCODE, repeated. */
export function edgeRibbon(code: string, units: number, vertical = false): HTMLElement {
  const el = document.createElement('div');
  el.className = `ribbon${vertical ? ' v' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  const unit = `<span class="unit">${barcodeSvg(code)}<span>${FILM.edgeText}</span><span>${code}</span></span>`;
  el.innerHTML = unit.repeat(Math.max(1, units));
  return el;
}

/** One frame window + its edge number. Marks render inside `.win`.
 *  `size: null` leaves the window empty for callers that load images on demand. */
export function frameCell(store: Store, i: number, size: 'thumb' | 'screen' | null, lazy = true): HTMLElement {
  const f = store.frame(i);
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.i = String(i);
  const win = document.createElement('div');
  win.className = 'win';
  win.style.backgroundColor = f.color;
  if (size) win.append(picture(store.roll, f, size, lazy));
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = f.number;
  cell.append(win, num);
  renderMark(win, store.mark(i), f.id);
  if (store.note(i)) cell.classList.add('has-note');
  return cell;
}
