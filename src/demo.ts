// Demo mode: build a roll from photos picked on the device. Nothing is
// uploaded — each photo is shrunk in the browser to the viewer's two sizes
// (thumb 480px, screen 2048px) so a phone doesn't hold 36 full-size decodes.

import type { Frame, Manifest } from './types';

const THUMB = 480, SCREEN = 2048;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error(file.name)); };
    im.src = url;
  });
}

function resized(im: HTMLImageElement, edge: number): Promise<{ url: string; w: number; h: number; color?: string }> {
  const s = Math.min(1, edge / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.round(im.naturalWidth * s), h = Math.round(im.naturalHeight * s);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob(b => (b ? res({ url: URL.createObjectURL(b), w, h }) : rej(new Error('encode'))), 'image/jpeg', 0.86));
}

// Average colour from a 1×1 draw: the placeholder shown while a frame decodes.
function averageColor(im: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(im, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export async function buildDemoRoll(files: File[], onProgress: (done: number, total: number) => void): Promise<Manifest> {
  const list = files.filter(f => f.type.startsWith('image/'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const frames: Frame[] = [];
  for (const [i, file] of list.entries()) {
    onProgress(i, list.length);
    let im: HTMLImageElement;
    try { im = await load(file); } catch { continue; }   // e.g. HEIC on a browser that can't decode it
    const thumb = await resized(im, THUMB), screen = await resized(im, SCREEN);
    const n = frames.length + 1;
    frames.push({
      id: String(n).padStart(2, '0'), number: String(n),
      width: im.naturalWidth, height: im.naturalHeight,
      orientation: im.naturalWidth >= im.naturalHeight ? 'landscape' : 'portrait',
      color: averageColor(im),
      src: {
        thumb: { avif: '', webp: thumb.url, w: thumb.w, h: thumb.h },
        screen: { avif: '', webp: screen.url, w: screen.w, h: screen.h },
        full: '',
      },
    });
  }
  onProgress(list.length, list.length);
  const stamp = Date.now().toString(36).toUpperCase();
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    rollCode: `DEMO${stamp}`.slice(0, 14),
    roll: 'Demo', title: 'Demo roll', stock: 'Your photos', date,
    frameCount: frames.length, frames,
  };
}
