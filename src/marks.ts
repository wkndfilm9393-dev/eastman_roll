import type { Mark } from './types';

// Sharpie marks, as when a teacher marks a test: an Eastman-orange O for
// keep, a black X for out. Each frame picks one of four variants from a hash of its id, so marks
// look hand-made but stay identical across reloads. The same paths and inks
// drive the on-screen SVG and the exported contact sheet image.

const VARIANTS = 4;
const NS = 'http://www.w3.org/2000/svg';

export const INK = {
  keep: { color: '#f6853d', width: 4.6, opacity: 0.7 },    // brand orange sharpie
  reject: { color: '#000000', width: 4.8, opacity: 0.7 },  // black sharpie
};

function hash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n: number) => n.toFixed(1);

// Marked like a maths test: one confident pen stroke each, no shake.

// A teacher's circle: one smooth pass that opens a touch wider as it goes, so
// the end runs just past the start and sits slightly outside it.
function loop(r: () => number, ar: number): string[] {
  const a0 = -Math.PI * (0.55 + r() * 0.25), sweep = Math.PI * 2 + 0.3 + r() * 0.25;
  const rx = 44 + r() * 2, ry = 41 + r() * 2, tilt = (r() - 0.5) * 0.12, grow = 0.04 + r() * 0.02;
  let d = '';
  for (let s = 0, steps = 72; s <= steps; s++) {
    const t = s / steps, a = a0 + sweep * t, k = 1 - grow / 2 + grow * t;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    d += `${s ? 'L' : 'M'}${fmt((50 + x * Math.cos(tilt) - y * Math.sin(tilt)) * ar)} ${fmt(50 + x * Math.sin(tilt) + y * Math.cos(tilt))}`;
  }
  return [d];
}

// Two straight, decisive strokes.
function cross(r: () => number, ar: number): string[] {
  const j = (n: number) => n + (r() - 0.5) * 4;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `M${fmt(j(x1) * ar)} ${fmt(j(y1))}L${fmt(j(x2) * ar)} ${fmt(j(y2))}`;
  return [line(16, 15, 84, 85), line(84, 15, 16, 85)];
}

/** Path data in a (100·aspect)×100 box that overhangs the frame by 7% each side. */
export function markPaths(kind: Exclude<Mark, 'none'>, frameId: string, aspect = 1.5): string[] {
  const r = rng(hash(`${kind}:${hash(frameId) % VARIANTS}`));
  return kind === 'keep' ? loop(r, aspect) : cross(r, aspect);
}

// Strokes live in the viewBox, so they scale with the frame (no
// non-scaling-stroke, which breaks the pathLength draw animation in Chrome).
export function markSvg(kind: Exclude<Mark, 'none'>, frameId: string, animate: boolean, aspect = 1.5): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${fmt(100 * aspect)} 100`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', `mark mark-${kind}${animate ? ' fresh' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  markPaths(kind, frameId, aspect).forEach((d, i) => {
    const hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'hit');
    hit.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(hit);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('pathLength', '1');
    p.setAttribute('class', 'ink');
    p.style.animationDelay = `${i * 140}ms`;
    svg.append(p);
  });
  return svg;
}

/** Replace whatever mark is drawn in `host` with the current one. */
export function renderMark(host: HTMLElement, mark: Mark, frameId: string, animate = false, aspect = 1.5) {
  host.querySelector(':scope > .mark')?.remove();
  if (mark !== 'none') host.append(markSvg(mark, frameId, animate, aspect));
  host.dataset.mark = mark;
}
