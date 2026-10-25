// Contact sheet: the whole roll laid out as the lab's printed sheet
// (webapp/index-ocr.html renderContactSheet) — header, six-frame strips, edge
// print — with the customer's own grease-pencil marks on the frames and each
// note written small under its own frame. Tapping a frame opens it frame by
// frame.

import { FILM, edgeRibbon, frameCell } from './film';
import { renderMark } from './marks';
import type { Change, Store } from './store';
import type { ViewActions } from './types';

const COLS = 6;
// Small hand-drawn "enter" arrows (↳): down from the frame, then into the
// note. Picked per frame so they don't all look stamped.
const ARROWS = [
  'M2 1c-.4 3.4.2 6.4.8 8.6 2.6.6 5.8.4 9 .2M9.4 7.4l2.6 2.2-2.8 2',
  'M2.4 1.2c.2 3-.4 5.8.6 8.4 2.8.4 5.6.6 8.8 0M9 7.2l2.8 2.4-2.6 2.2',
  'M1.8 1c.6 3.2-.2 6 .8 8.8 3-.2 6-.2 9.2.4M9.6 7.8l2.4 2-3 2',
];
const arrow = (i: number) =>
  `<svg class="note-arrow" viewBox="0 0 14 13" aria-hidden="true"><path d="${ARROWS[i % ARROWS.length]}"/></svg>`;
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export class ContactSheet {
  readonly el = document.createElement('section');
  private page = document.createElement('div');
  private cells: HTMLElement[] = [];
  private notes: HTMLElement[] = [];
  private off: () => void;
  private ro: ResizeObserver;

  constructor(private store: Store, private act: ViewActions) {
    const r = store.roll;
    this.el.className = 'sheet';
    this.page.className = 'sheet-page';
    this.page.innerHTML = `
      <header class="sheet-head">
        <div><div class="sheet-wm">Eastman Film Lab</div><div class="sheet-tag">film develop service</div></div>
        <div class="sheet-meta"><span>${esc(r.rollCode)}</span><span class="dim">${esc(r.date.replace(/-/g, '.'))}</span><span class="brand">${r.frameCount} FRAMES</span></div>
      </header>`;
    this.el.append(this.page);

    const rows = Math.ceil(store.count / COLS);
    for (let s = 0; s < rows; s++) {
      const strip = document.createElement('div');
      strip.className = 'film strip sheet-strip';
      const ribbon = edgeRibbon(r.rollCode, 6);
      // carry the edge print on from the strip above, as the printed sheet does
      (ribbon.firstElementChild as HTMLElement).style.marginLeft = `calc(var(--fw) * ${-((s * 2.7) % 3.1).toFixed(2)})`;
      strip.append(ribbon);
      for (let c = 0; c < COLS; c++) {
        const i = s * COLS + c;
        if (i < store.count) {
          const cell = frameCell(store, i, 'thumb');
          this.cells.push(cell);
          strip.append(cell);
        } else {
          const blank = document.createElement('div');
          blank.className = 'cell blank';
          strip.append(blank);
        }
      }
      const notes = document.createElement('div');
      notes.className = 'film sheet-notes';   // .film supplies the strip's --gap so columns line up
      this.notes.push(notes);
      this.page.append(strip, notes);
      this.renderNotes(s);
    }

    this.page.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const cell = t.closest<HTMLElement>('.cell[data-i]');
      const note = t.closest<HTMLElement>('[data-note]');
      if (cell && t.closest('.mark .hit')) { this.store.setMark(Number(cell.dataset.i), 'none'); return; }
      const i = cell ? Number(cell.dataset.i) : note ? Number(note.dataset.note) : -1;
      if (i >= 0) this.act.showFrame(i);
    });

    this.off = store.on(c => this.onChange(c));
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
    this.highlight();
  }

  private layout() {
    const pad = Math.max(16, Math.min(40, this.el.clientWidth * 0.04));
    const W = Math.min(this.el.clientWidth, 1100) - pad * 2;
    // six frames + five gaps: the strip ends where the photos end, as on the printed sheet
    const fw = Math.floor(W / (COLS + (COLS - 1) * FILM.gap));
    this.page.style.setProperty('--fw', `${fw}px`);
    this.page.style.setProperty('--pad', `${pad}px`);
  }

  // One slot per column, so each note sits directly under its frame.
  private renderNotes(s: number) {
    let any = false, html = '';
    for (let c = 0; c < COLS; c++) {
      const i = s * COLS + c, n = i < this.store.count ? this.store.note(i) : '';
      if (n) any = true;
      html += n ? `<button data-note="${i}" title="${esc(n)}">${arrow(i)}<span>${esc(n)}</span></button>` : '<span></span>';
    }
    this.notes[s].innerHTML = html;
    this.notes[s].hidden = !any;
  }

  private highlight() {
    const a = this.store.active;
    this.cells.forEach((c, i) => c.classList.toggle('active', i === a));
  }

  step(d: number) {
    this.store.setActive(this.store.active + d, 'sheet');
    this.cells[this.store.active].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private onChange(c: Change) {
    if (c.kind === 'active') this.highlight();
    else if (c.kind === 'mark') {
      renderMark(this.cells[c.index].querySelector<HTMLElement>('.win')!, this.store.mark(c.index), this.store.frame(c.index).id, c.fresh);
    } else if (c.kind === 'note') {
      this.cells[c.index].classList.toggle('has-note', !!this.store.note(c.index));
      this.renderNotes(Math.floor(c.index / COLS));
    }
  }

  destroy() { this.off(); this.ro.disconnect(); this.el.remove(); }
}
