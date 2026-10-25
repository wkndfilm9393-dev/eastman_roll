// Generates a placeholder roll of 36 synthetic "scans" (3000×2000 JPEG) so the
// viewer can be built and tested before real lab scans arrive.
// Usage: node scripts/make-sample-scans.mjs <outDir> [count]
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const out = process.argv[2];
const count = +(process.argv[3] || 36);
if (!out) { console.error('usage: make-sample-scans.mjs <outDir> [count]'); process.exit(1); }
await mkdir(out, { recursive: true });

let seed = 412;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hsl = (h, s, l) => `hsl(${h % 360},${s}%,${l}%)`;

for (let i = 1; i <= count; i++) {
  const W = 3000, H = 2000;
  const hue = Math.round(rnd() * 360), warm = 20 + rnd() * 30;
  const sky = hsl(hue, 25 + rnd() * 30, 55 + rnd() * 25);
  const ground = hsl(hue + 30 + warm, 20 + rnd() * 25, 18 + rnd() * 20);
  const horizon = Math.round(H * (0.45 + rnd() * 0.25));
  const sun = { x: Math.round(rnd() * W), y: Math.round(rnd() * horizon), r: 120 + rnd() * 260 };
  const blocks = Array.from({ length: 3 + Math.floor(rnd() * 6) }, () => {
    const w = 120 + rnd() * 600, h = 200 + rnd() * 900, x = rnd() * W;
    return `<rect x="${x}" y="${horizon - h}" width="${w}" height="${h}" fill="${hsl(hue + 180 * rnd(), 15, 10 + rnd() * 25)}" opacity="${0.6 + rnd() * 0.4}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${hsl(hue + 25, 40, 75)}"/></linearGradient>
      <radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    <circle cx="${sun.x}" cy="${sun.y}" r="${sun.r}" fill="${hsl(hue + 40, 70, 85)}" opacity=".7"/>
    ${blocks}
    <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${ground}"/>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
    <text x="${W - 120}" y="${H - 110}" font-family="Helvetica" font-size="90" fill="#fff" opacity=".35" text-anchor="end">SAMPLE ${i}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 })
    .toFile(path.join(out, `${String(i).padStart(3, '0')}.jpg`));
}
console.log(`wrote ${count} sample scans to ${out}`);
