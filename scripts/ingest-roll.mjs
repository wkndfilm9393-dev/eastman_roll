// Turns a folder of lab scans into a viewer-ready roll.
//
//   node scripts/ingest-roll.mjs <scanDir> [--code XXXXXXXXXX] [--stock "Portra 400"]
//                                [--date YYYY-MM-DD] [--roll 0412] [--title "..."] [--out public/rolls]
//
// Per frame: thumb (480px, AVIF+WebP), screen (2048px, AVIF+WebP), full (original
// JPEG, download only — the viewer never loads it). Writes manifest.json.
// Without --code a fresh unguessable 10-character code is generated.
import sharp from 'sharp';
import { readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const src = args[0];
if (!src || src.startsWith('--')) { console.error('usage: ingest-roll.mjs <scanDir> [--code ..] [--stock ..] [--date ..] [--roll ..]'); process.exit(1); }

// No 0/O/1/I/L — codes are printed on sleeves and may be typed by hand.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newCode = (n = 10) => [...randomBytes(n)].map(b => ALPHABET[b % ALPHABET.length]).join('');

const code = opt('code', newCode());
if (!/^[A-Z0-9]{10,}$/.test(code)) { console.error('roll code must be ≥10 chars A–Z/0–9'); process.exit(1); }
const stock = opt('stock', 'Unknown stock');
const date = opt('date', new Date().toISOString().slice(0, 10));
const roll = opt('roll', '');
const title = opt('title', roll ? `Roll ${roll} — ${stock}` : stock);
const outRoot = path.join(opt('out', 'public/rolls'), code);

const SIZES = { thumb: { edge: 480, avif: 50, webp: 70 }, screen: { edge: 2048, avif: 55, webp: 78 } };

const files = (await readdir(src)).filter(f => /\.(jpe?g|tiff?)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!files.length) { console.error(`no .jpg/.tif in ${src}`); process.exit(1); }

for (const d of ['thumb', 'screen', 'full']) await mkdir(path.join(outRoot, d), { recursive: true });

const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const frames = [];
let bytes = { thumb: 0, screen: 0 };

for (const [i, file] of files.entries()) {
  const id = String(i + 1).padStart(2, '0');
  const input = path.join(src, file);
  const base = sharp(input, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const w = meta.autoOrient?.width ?? meta.width, h = meta.autoOrient?.height ?? meta.height;
  const { dominant } = await base.clone().stats();
  const entry = {
    id, number: String(i + 1), file,
    width: w, height: h, orientation: w >= h ? 'landscape' : 'portrait',
    color: hex(dominant), src: {},
  };
  for (const [name, s] of Object.entries(SIZES)) {
    const r = base.clone().resize({ width: s.edge, height: s.edge, fit: 'inside', withoutEnlargement: true });
    const a = await r.clone().avif({ quality: s.avif, effort: 4 }).toFile(path.join(outRoot, name, `${id}.avif`));
    const wb = await r.clone().webp({ quality: s.webp }).toFile(path.join(outRoot, name, `${id}.webp`));
    entry.src[name] = { avif: `${name}/${id}.avif`, webp: `${name}/${id}.webp`, w: a.width, h: a.height };
    bytes[name] += a.size;
  }
  const ext = /\.tiff?$/i.test(file) ? null : '.jpg';
  if (ext) await copyFile(input, path.join(outRoot, 'full', `${id}.jpg`));
  else await base.clone().jpeg({ quality: 95 }).toFile(path.join(outRoot, 'full', `${id}.jpg`));
  entry.src.full = `full/${id}.jpg`;
  frames.push(entry);
  process.stdout.write(`\r${i + 1}/${files.length}`);
}

const manifest = { rollCode: code, roll, title, stock, date, frameCount: frames.length, frames };
await writeFile(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 1));
const kb = n => (n / 1024).toFixed(0) + 'KB';
console.log(`\n${code}: ${frames.length} frames · avif thumbs avg ${kb(bytes.thumb / frames.length)} · screens avg ${kb(bytes.screen / frames.length)}`);
console.log(`open /r/${code}`);
