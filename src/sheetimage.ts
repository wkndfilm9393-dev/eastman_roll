// The marked contact sheet as an image — the customer's main takeaway.
// Geometry, colours and edge print follow renderContactSheet() in
// webapp/index-ocr.html; on top go the customer's sharpie marks and their
// notes, written under each frame with a small ↳ arrow.

import { FILM } from './film';
import { srcUrl } from './img';
import { INK, markPaths } from './marks';
import type { Store } from './store';

const COLS = 6;
const FRAME_W = 400;   // keeps a 36-frame sheet near 3200×4000, under iOS's 16.7MP canvas cap
const BRAND = '#f6853d', ACCENT_DIM = '#8f4d23';
const THEME = { sheet: '#11100f', film: '#080809', perf: '#1a1917', text: '#d6d0c6', dim: '#78746c', white: '#f2f0ec' };
const NOTE_INK = '#b88a5d';
const HELV = (px: number) => `700 ${px.toFixed(0)}px Helvetica,"Helvetica Neue",Arial,sans-serif`;
const MONO = (px: number) => `${px.toFixed(0)}px "OCR-A EFL","SF Mono",Menlo,monospace`;
const HAND = (px: number) => `${px.toFixed(0)}px Kalam,"Nanum Pen Script",cursive`;
const OCR_TRACK = 0.5;

function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, anchor: 'left' | 'center' | 'right' = 'left') {
  const ws = [...text].map(ch => ctx.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + tracking * Math.max(0, ws.length - 1);
  if (anchor === 'center') x -= total / 2; else if (anchor === 'right') x -= total;
  [...text].forEach((ch, i) => { ctx.fillText(ch, x, y); x += ws[i] + tracking; });
  return total;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function perfs(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, bandH: number, unitW: number) {
  const pitch = unitW / 8, pw = pitch * 0.52, ph = bandH * 0.46, cy = y + bandH / 2;
  ctx.fillStyle = THEME.perf;
  for (let x = x0 + pitch * 0.25; x + pw <= x1; x += pitch) { roundRect(ctx, x, cy - ph / 2, pw, ph, ph * 0.28); ctx.fill(); }
}

function bitsFor(seed: string) {
  let h = 2166136261 >>> 0, out = '';
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  for (let i = 0; i < 32; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; out += h.toString(2).padStart(32, '0'); }
  return out;
}

function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bits: string) {
  for (let col = x, i = 0; col < x + w && i < bits.length; i++) {
    const bw = (bits[i] === '1' ? 2 : 1) * (w / 90);
    if (bits[i] === '1') ctx.fillRect(col, y, bw, h);
    col += bw + w / 180;
  }
}

function measure(ctx: CanvasRenderingContext2D, text: string, track: number) {
  let w = 0; for (const ch of text) w += ctx.measureText(ch).width;
  return w + track * Math.max(0, text.length - 1);
}

// Continuous edge print, phase-shifted per strip so the rows read as one film.
function edgePrint(ctx: CanvasRenderingContext2D, o: { x0: number; x1: number; top: number; h: number; bcW: number; bits: string; id: string; phase: number }) {
  const fontPx = o.h * 0.6, track = OCR_TRACK * o.h * 0.1, text = 'EASTMAN FILM LAB';
  ctx.save();
  ctx.beginPath(); ctx.rect(o.x0, o.top, o.x1 - o.x0, o.h); ctx.clip();
  ctx.font = MONO(fontPx); ctx.fillStyle = ACCENT_DIM; ctx.textBaseline = 'middle';
  const gap = fontPx * 1.9, bcH = o.h * 0.56;
  const unit = o.bcW + gap + measure(ctx, text, track) + gap + measure(ctx, o.id, track) + gap;
  for (let x = o.x0 - (((o.phase % unit) + unit) % unit); x < o.x1; x += unit) {
    barcode(ctx, x, o.top + (o.h - bcH) / 2, o.bcW, bcH, o.bits);
    let cx = x + o.bcW + gap;
    cx += tracked(ctx, text, cx, o.top + o.h / 2, track) + gap;
    tracked(ctx, o.id, cx, o.top + o.h / 2, track);
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/), lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>(res => {
    const im = new Image();
    im.crossOrigin = 'anonymous';   // R2 must send CORS headers or the canvas taints
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

/** Render the marked contact sheet. Resolves to a JPEG blob. */
export async function renderSheetImage(store: Store): Promise<Blob> {
  const r = store.roll, n = store.count;
  await Promise.all([document.fonts.load(MONO(20)), document.fonts.load(HAND(20)), document.fonts.load(HELV(20))]).catch(() => {});
  const images = await Promise.all(r.frames.map(f => loadImage(srcUrl(r, f.src.screen.webp))));

  const fw = FRAME_W, fh = fw / FILM.aspect;
  const perfH = fh * FILM.perfBand, rebH = fh * FILM.rebate, fgap = fw * FILM.gap;
  const sgap = perfH * 0.42, pad = fw * 0.9, headH = fw * 0.92;
  const stripH = perfH * 2 + rebH * 2 + fh, strips = Math.ceil(n / COLS);
  const notePx = fw * 0.1,   // same share of the frame as on screen
        noteLine = notePx * 1.3, noteH = noteLine * 2 + fw * 0.08;
  const rowHasNotes = Array.from({ length: strips }, (_, s) =>
    r.frames.slice(s * COLS, s * COLS + COLS).some((_, k) => store.note(s * COLS + k)));
  const W = pad * 2 + COLS * fw + (COLS - 1) * fgap;   // strip ends at the photos
  const H = pad + headH + strips * stripH + (strips - 1) * sgap + rowHasNotes.filter(Boolean).length * noteH + pad;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W); canvas.height = Math.round(H);
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'top';
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = THEME.sheet; ctx.fillRect(0, 0, W, H);

  // header: wordmark + tagline left, roll code / date / count right
  const wm = fw * 0.24;
  ctx.fillStyle = THEME.white; ctx.font = HELV(wm);
  tracked(ctx, 'Eastman Film Lab', pad, pad, -0.05 * wm);
  const tag = fw * 0.098;
  ctx.fillStyle = BRAND; ctx.font = HELV(tag);
  tracked(ctx, 'film develop service', pad, pad + wm * 1.14, -0.05 * tag);
  ctx.font = MONO(fw * 0.12);
  const right = W - pad, tr = OCR_TRACK * fw * 0.02;
  ctx.fillStyle = THEME.text; tracked(ctx, r.rollCode, right, pad + fw * 0.15, tr, 'right');
  ctx.fillStyle = THEME.dim; tracked(ctx, r.date.replace(/-/g, '.'), right, pad + fw * 0.33, tr, 'right');
  ctx.fillStyle = BRAND; tracked(ctx, `${n} FRAMES`, right, pad + fw * 0.51, tr, 'right');
  ctx.strokeStyle = THEME.dim; ctx.lineWidth = 2;
  const ry = pad + headH - fw * 0.14;
  ctx.beginPath(); ctx.moveTo(pad, ry); ctx.lineTo(W - pad, ry); ctx.stroke();

  const bits = bitsFor(r.rollCode);
  let sy = pad + headH;
  for (let s = 0; s < strips; s++) {
    const x0 = pad, x1 = W - pad;
    ctx.fillStyle = THEME.film; ctx.fillRect(x0, sy, x1 - x0, stripH);
    perfs(ctx, x0, x1, sy, perfH, fw);
    perfs(ctx, x0, x1, sy + stripH - perfH, perfH, fw);
    const topReb = sy + perfH, imgY = topReb + rebH, botReb = imgY + fh;
    edgePrint(ctx, { x0, x1, top: topReb, h: rebH, bcW: fw * 0.34, bits, id: r.rollCode, phase: s * (x1 - x0) });

    for (let c = 0; c < COLS; c++) {
      const i = s * COLS + c, fx = x0 + c * (fw + fgap);
      if (i >= n) { ctx.fillStyle = '#0e0e0f'; ctx.fillRect(fx, imgY, fw, fh); continue; }
      const im = images[i], f = r.frames[i];
      if (im) {
        const sc = Math.max(fw / im.naturalWidth, fh / im.naturalHeight);
        const sw = fw / sc, sh = fh / sc;
        ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, fx, imgY, fw, fh);
      } else { ctx.fillStyle = f.color; ctx.fillRect(fx, imgY, fw, fh); }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(fx, imgY, fw, fh);

      ctx.font = MONO(rebH * 0.74); ctx.fillStyle = BRAND;
      tracked(ctx, f.number, fx + fw / 2, botReb + rebH * 0.24, OCR_TRACK * rebH * 0.06, 'center');
      ctx.strokeStyle = ACCENT_DIM; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx + fw / 2, botReb + rebH * 0.06); ctx.lineTo(fx + fw / 2, botReb + rebH * 0.16); ctx.stroke();

      // the customer's sharpie mark, same paths as on screen
      const m = store.mark(i);
      if (m !== 'none') {
        const box = 100 * FILM.aspect;
        ctx.save();
        ctx.translate(fx - fw * 0.07, imgY - fh * 0.07);
        ctx.scale((fw * 1.14) / box, (fh * 1.14) / 100);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const layers = [m === 'reject' ? INK.reject : INK.keep];
        for (const ink of layers) {
          ctx.strokeStyle = ink.color; ctx.globalAlpha = ink.opacity; ctx.lineWidth = ink.width;
          for (const d of markPaths(m, f.id, FILM.aspect)) ctx.stroke(new Path2D(d));
        }
        ctx.restore();
      }
    }
    sy += stripH;

    // notes under their frames, each with a small ↳
    if (rowHasNotes[s]) {
      const ny = sy + fw * 0.03;
      ctx.font = HAND(notePx); ctx.fillStyle = NOTE_INK; ctx.strokeStyle = NOTE_INK;
      ctx.lineWidth = notePx * 0.08; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let c = 0; c < COLS; c++) {
        const i = s * COLS + c;
        const text = i < n ? store.note(i) : '';
        if (!text) continue;
        const fx = x0 + c * (fw + fgap), aw = notePx * 0.9;
        const lines = wrap(ctx, text, fw - aw - notePx * 0.2, 2);
        const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const gx = fx + (fw - (aw + notePx * 0.2 + textW)) / 2;       // centre arrow + text under the frame
        const ay = ny + noteLine * 0.62;
        ctx.beginPath();
        ctx.moveTo(gx + aw * 0.12, ny);
        ctx.quadraticCurveTo(gx + aw * 0.05, ay * 0.6 + ny * 0.4, gx + aw * 0.2, ay);
        ctx.lineTo(gx + aw, ay + aw * 0.02);
        ctx.moveTo(gx + aw * 0.72, ay - aw * 0.22); ctx.lineTo(gx + aw, ay); ctx.lineTo(gx + aw * 0.74, ay + aw * 0.24);
        ctx.stroke();
        lines.forEach((l, k) => ctx.fillText(l, gx + aw + notePx * 0.2, ny + noteLine * 0.15 + k * noteLine));
      }
      sy += noteH;
    } else sy += sgap;
  }

  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.9));
}

type Downloads = { save(r: { filename: string; data: Blob }): Promise<unknown> };
// The artifact viewer exposes window.claude.use(); a plain browser doesn't.
async function viewerDownloads(): Promise<Downloads | null> {
  const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!c?.use) return null;
  try { return (await c.use('downloads')) as Downloads | null; } catch { return null; }
}

/** Show the rendered sheet with a save button (a fresh tap keeps iOS share happy). */
export async function openSheetImage(store: Store, host: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'sheet-export';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Contact sheet image');
  el.innerHTML = `<div class="sx-bar"><span class="eyebrow">Contact sheet</span><button class="sheet-x" aria-label="Close">✕</button></div>
    <div class="sx-body"><p class="eyebrow">Drawing your sheet…</p></div>`;
  host.append(el);
  const close = () => { el.remove(); if (url) URL.revokeObjectURL(url); };
  let url = '';
  el.querySelector<HTMLButtonElement>('.sheet-x')!.onclick = close;

  try {
    const blob = await renderSheetImage(store);
    url = URL.createObjectURL(blob);
    const name = `${store.roll.rollCode}-contact-sheet.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    const body = el.querySelector('.sx-body')!;
    body.innerHTML = `<img alt="Your marked contact sheet" /><div class="sx-actions"><button class="pill save">Save image</button></div>
      <p class="eyebrow">On a phone you can also press and hold the image to save it.</p>`;
    body.querySelector('img')!.src = url;
    const note = body.querySelector<HTMLElement>('.eyebrow')!;
    body.querySelector<HTMLButtonElement>('.save')!.onclick = async () => {
      // Inside the claude.ai artifact viewer, downloads go through its own save prompt.
      const downloads = await viewerDownloads();
      if (downloads) {
        try { await downloads.save({ filename: name, data: blob }); }
        catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== 'declined') note.textContent = 'Saving isn’t available here. Press and hold the image to save it.';
        }
        return;
      }
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return; }
        catch (e) { if ((e as Error).name === 'AbortError') return; /* share failed — download instead */ }
      }
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
    };
  } catch {
    el.querySelector('.sx-body')!.innerHTML = '<p class="eyebrow">Couldn’t draw the sheet. Please try again.</p>';
  }
}
