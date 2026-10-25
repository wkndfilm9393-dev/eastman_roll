// Loupe overlay: one frame full screen. Click toggles between fit and 1:1 at
// the clicked point; drag pans while at 1:1. ← → step, Esc closes.

import { picture } from './img';
import { renderMark } from './marks';
import type { Store } from './store';

export class Loupe {
  readonly el = document.createElement('div');
  private stage = document.createElement('div');
  private label = document.createElement('div');
  private win = document.createElement('div');
  private img: HTMLImageElement | null = null;
  private zoomed = false;
  private ar = 1.5;
  private tx = 0;
  private ty = 0;
  private off: () => void;

  constructor(private store: Store, private onClose: () => void) {
    this.el.className = 'loupe';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Frame loupe');
    this.stage.className = 'stage';
    this.label.className = 'loupe-label eyebrow';
    const close = document.createElement('button');
    close.className = 'loupe-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.onclick = () => this.onClose();
    this.el.append(this.stage, this.label, close);
    this.bindPointer();
    this.off = store.on(c => {
      if (c.kind === 'active') this.show();
      if (c.kind === 'mark' && c.index === store.active) {
        renderMark(this.win, store.mark(c.index), store.frame(c.index).id, c.fresh, this.ar);
      }
    });
    this.show();
  }

  get isZoomed() { return this.zoomed; }

  private show() {
    const i = this.store.active, f = this.store.frame(i);
    const pic = picture(this.store.roll, f, 'screen', false);
    // the window is sized to the frame so marks sit around the picture, not the screen
    this.win = document.createElement('div');
    this.win.className = 'lwin';
    this.ar = f.src.screen.w / f.src.screen.h;
    this.win.style.setProperty('--ar', String(this.ar));
    this.win.style.backgroundColor = f.color;
    this.win.append(pic);
    this.stage.replaceChildren(this.win);
    this.img = pic.querySelector('img');
    this.setZoom(false);
    renderMark(this.win, this.store.mark(i), f.id, false, this.ar);
    this.label.textContent = `Frame ${f.number} / ${this.store.count}`;
  }

  /** Toggle 1:1. `at` is the viewport point to keep under the cursor. */
  toggleZoom(at?: { x: number; y: number }) {
    if (this.zoomed || !this.img) { this.setZoom(false); return; }
    const r = this.img.getBoundingClientRect();
    // 1:1 in device pixels, but always at least a useful magnification
    const scale = Math.max(1.6, this.img.naturalWidth / devicePixelRatio / r.width);
    const px = at ? at.x : r.left + r.width / 2, py = at ? at.y : r.top + r.height / 2;
    // keep the clicked point fixed: offset from image centre scales by `scale`
    this.tx = -(px - (r.left + r.width / 2)) * (scale - 1);
    this.ty = -(py - (r.top + r.height / 2)) * (scale - 1);
    this.zoomScale = scale;
    this.setZoom(true);
  }

  private zoomScale = 1;
  private setZoom(on: boolean) {
    this.zoomed = on;
    this.el.classList.toggle('zoomed', on);
    if (!on) { this.tx = this.ty = 0; this.zoomScale = 1; }
    this.apply();
  }

  private apply() {
    if (!this.img) return;
    this.img.style.transform = this.zoomed
      ? `translate(${this.tx}px, ${this.ty}px) scale(${this.zoomScale})`
      : '';
  }

  private bindPointer() {
    let id = -1, x0 = 0, y0 = 0, t0x = 0, t0y = 0, moved = false;
    this.stage.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.mark .hit')) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0x = this.tx; t0y = this.ty; moved = false;
      this.stage.setPointerCapture(id);
    });
    this.stage.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 4) moved = true;
      if (this.zoomed && moved) {
        this.tx = t0x + (e.clientX - x0);
        this.ty = t0y + (e.clientY - y0);
        this.apply();
      }
    });
    this.stage.addEventListener('pointerup', e => {
      if (e.pointerId !== id) return;
      id = -1;
      if (!moved) this.toggleZoom({ x: e.clientX, y: e.clientY });
    });
    this.stage.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.mark .hit')) this.store.setMark(this.store.active, 'none');
    });
  }

  destroy() { this.off(); this.el.remove(); }
}
