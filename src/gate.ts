// Frame by frame: one landscape frame on a horizontal strip. The strip is cut
// to exactly the photo's width — no leader, no neighbouring frames — and
// swiping sideways winds on to the next frame. Horizontal swipe belongs to the
// film, so marking uses the thumb-zone buttons or a vertical flick on the
// frame (up = keep, down = out); double-tap zooms, long-press adds a note.

import { FILM, edgeRibbon, frameCell, stripHeight } from './film';
import { picture, preloadScreen } from './img';
import { renderMark } from './marks';
import type { Change, Store } from './store';
import type { ViewActions } from './types';

const LOAD = 2, RELEASE = 6, FLICK = 56, LONG_PRESS = 550, DOUBLE_TAP = 300;

export class Gate {
  readonly el = document.createElement('section');
  private scroller = document.createElement('div');
  private track = document.createElement('div');
  private scrub = document.createElement('div');
  private cells: HTMLElement[] = [];
  private loaded = new Set<number>();
  private fw = 0;
  private pitch = 0;
  private raf = 0;
  private seeking = -1;
  private off: () => void;
  private ro: ResizeObserver;

  constructor(private store: Store, private act: ViewActions) {
    this.el.className = 'gate';
    this.scroller.className = 'gate-scroll';
    this.track.className = 'film strip gate-track';
    this.scrub.className = 'scrub';
    this.scrub.setAttribute('role', 'slider');
    this.scrub.setAttribute('aria-label', 'Roll position');
    this.scrub.setAttribute('aria-valuemin', '1');
    this.scrub.setAttribute('aria-valuemax', String(store.count));
    this.scrub.tabIndex = 0;
    this.scroller.append(this.track);
    this.el.append(this.scroller, this.scrub);

    for (let i = 0; i < store.count; i++) {
      this.cells.push(frameCell(store, i, 'thumb'));
      const t = document.createElement('i');
      t.dataset.mark = store.mark(i);
      this.scrub.append(t);
    }
    this.track.append(...this.cells);

    this.bindScroll();
    this.bindGestures();
    this.bindScrub();
    this.off = store.on(c => this.onChange(c));
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  private layout() {
    const W = this.el.clientWidth;
    const H = this.el.clientHeight - this.scrub.offsetHeight - 16;
    this.fw = Math.floor(Math.min(W - 32, H / stripHeight(1)));
    this.pitch = this.fw * (1 + FILM.gap);
    this.el.style.setProperty('--fw', `${this.fw}px`);
    this.scroller.style.width = `${this.fw}px`;   // the strip ends where the photo ends
    this.track.querySelector('.ribbon')?.remove();
    this.track.prepend(edgeRibbon(this.store.roll.rollCode, Math.ceil((this.store.count * this.pitch) / (this.fw * 1.1))));
    this.scrollToIndex(this.store.active, false);
  }

  private bindScroll() {
    this.scroller.addEventListener('scroll', () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        if (!this.pitch) return;
        if (this.seeking >= 0) {
          if (Math.abs(this.scroller.scrollLeft - this.seeking * this.pitch) > 2) return;
          this.seeking = -1;
        }
        this.store.setActive(Math.round(this.scroller.scrollLeft / this.pitch), 'gate-scroll');
      });
    }, { passive: true });
    this.scroller.addEventListener('scrollend', () => (this.seeking = -1));
    this.scroller.addEventListener('touchstart', () => (this.seeking = -1), { passive: true });
    this.scroller.addEventListener('wheel', () => (this.seeking = -1), { passive: true });

    this.track.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const cell = t.closest<HTMLElement>('.cell');
      if (cell && t.closest('.mark .hit')) this.store.setMark(Number(cell.dataset.i), 'none');
    });
  }

  private bindGestures() {
    let x0 = 0, y0 = 0, id = -1, win: HTMLElement | null = null, i = -1;
    let vertical = false, moved = false, press = 0, lastTap = 0;
    const reset = () => {
      if (win) { win.style.transform = ''; delete win.dataset.flick; }
      id = -1; win = null;
    };
    this.track.addEventListener('pointerdown', e => {
      const w = (e.target as HTMLElement).closest<HTMLElement>('.win');
      if (!w || (e.target as HTMLElement).closest('.mark .hit')) return;
      i = Number(w.closest<HTMLElement>('.cell')!.dataset.i);
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; win = w;
      vertical = moved = false;
      press = window.setTimeout(() => {
        if (!moved && id >= 0) { reset(); this.act.editNote(i); }
      }, LONG_PRESS);
    });
    this.track.addEventListener('pointermove', e => {
      if (e.pointerId !== id || !win) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!moved && Math.hypot(dx, dy) > 8) {
        moved = true; clearTimeout(press);
        vertical = Math.abs(dy) > Math.abs(dx) * 1.4;
        if (!vertical) { reset(); return; }       // a sideways swipe belongs to the scroller
      }
      if (vertical) {
        const d = Math.max(-90, Math.min(90, dy));
        win.style.transform = `translateY(${d * 0.5}px)`;
        win.dataset.flick = dy < -FLICK ? 'keep' : dy > FLICK ? 'reject' : '';
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id || !win) return;
      clearTimeout(press);
      const dy = e.clientY - y0;
      if (vertical && Math.abs(dy) > FLICK) this.store.setMark(i, dy < 0 ? 'keep' : 'reject');
      else if (!moved && e.type === 'pointerup') {
        const now = performance.now();
        if (now - lastTap < DOUBLE_TAP) { lastTap = 0; this.act.openLoupe(i); }
        else lastTap = now;
      }
      reset();
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', e => { if (e.pointerId === id) { clearTimeout(press); reset(); } });
    this.track.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Thumb-sized scrubber: drag along it to jump through the roll.
  private bindScrub() {
    const at = (x: number) => {
      const r = this.scrub.getBoundingClientRect();
      return Math.round(((x - r.left) / r.width) * (this.store.count - 1));
    };
    let dragging = false;
    this.scrub.addEventListener('pointerdown', e => {
      dragging = true;
      this.scrollToIndex(at(e.clientX), false);
      try { this.scrub.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    });
    this.scrub.addEventListener('pointermove', e => { if (dragging) this.scrollToIndex(at(e.clientX), false); });
    this.scrub.addEventListener('pointerup', () => (dragging = false));
    this.scrub.addEventListener('pointercancel', () => (dragging = false));
  }

  // Screen-size images for active ±2 sit over the thumbs; released past ±6.
  private window() {
    const a = this.store.active;
    for (let i = Math.max(0, a - LOAD); i <= Math.min(this.store.count - 1, a + LOAD); i++) {
      if (this.loaded.has(i)) continue;
      this.loaded.add(i);
      const pic = picture(this.store.roll, this.store.frame(i), 'screen', false);
      pic.className = 'hi';
      this.cells[i].querySelector('.win > picture')!.after(pic);   // over the thumb, under the mark
    }
    for (const i of [...this.loaded]) {
      if (Math.abs(i - a) > RELEASE) {
        this.cells[i].querySelector('.win .hi')?.remove();
        this.loaded.delete(i);
      }
    }
    const f = this.store.roll.frames[a + 3];
    if (f) preloadScreen(this.store.roll, f);
    [...this.scrub.children].forEach((t, i) => t.classList.toggle('on', i === a));
    this.scrub.setAttribute('aria-valuenow', String(a + 1));
  }

  scrollToIndex(i: number, smooth: boolean) {
    i = Math.max(0, Math.min(this.store.count - 1, i));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.seeking = i;   // relayouts and glides must not let a passing frame steal focus
    this.scroller.scrollTo({ left: i * this.pitch, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    this.store.setActive(i, 'gate-goto');
    this.window();
  }

  step(d: number) { this.scrollToIndex(this.store.active + d, true); }

  private onChange(c: Change) {
    if (c.kind === 'active') {
      if (c.from !== 'gate-scroll' && c.from !== 'gate-goto') this.scrollToIndex(c.index, false);
      this.window();
    } else if (c.kind === 'mark') {
      const win = this.cells[c.index].querySelector<HTMLElement>('.win')!;
      renderMark(win, this.store.mark(c.index), this.store.frame(c.index).id, c.fresh);
      (this.scrub.children[c.index] as HTMLElement).dataset.mark = this.store.mark(c.index);
    } else if (c.kind === 'note') {
      this.cells[c.index].classList.toggle('has-note', !!this.store.note(c.index));
    }
  }

  destroy() { this.off(); this.ro.disconnect(); this.el.remove(); }
}
