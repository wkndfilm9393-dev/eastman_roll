import type { Frame, Manifest } from './types';

/** Resolve a manifest path; absolute, blob: and data: URLs (the demo) pass through. */
export const srcUrl = (m: Manifest, path: string) =>
  /^(blob:|data:|https?:|\/)/.test(path) ? path : `/rolls/${m.rollCode}/${path}`;

/** <picture> with AVIF → WebP fallback and explicit dimensions. */
export function picture(m: Manifest, f: Frame, size: 'thumb' | 'screen', lazy = true): HTMLPictureElement {
  const s = f.src[size];
  const pic = document.createElement('picture');
  if (s.avif) {   // the demo has no AVIF, only one in-browser JPEG per size
    const source = document.createElement('source');
    source.type = 'image/avif';
    source.srcset = srcUrl(m, s.avif);
    pic.append(source);
  }
  const img = document.createElement('img');
  img.width = s.w;
  img.height = s.h;
  img.alt = `Frame ${f.number}`;
  img.decoding = 'async';
  img.draggable = false;
  if (lazy) img.loading = 'lazy';
  img.src = srcUrl(m, s.webp);
  pic.append(img);
  return pic;
}

// Warm the cache for screen-size images around the active frame.
const warmed = new Set<string>();
export function preloadScreen(m: Manifest, f: Frame) {
  if (warmed.has(f.id)) return;
  warmed.add(f.id);
  picture(m, f, 'screen', false); // a detached <picture> still fetches its chosen source
}
