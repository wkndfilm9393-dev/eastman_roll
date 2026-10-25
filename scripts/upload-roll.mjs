// Uploads an ingested roll to the R2 bucket the Worker reads from.
//
//   node scripts/upload-roll.mjs <CODE> [--bucket eastman-rolls] [--from public/rolls]
//
// Uses `npx wrangler r2 object put --remote`, so run `npx wrangler login` once
// first. Images go up before the manifest: a roll only becomes visible once
// all of its files are there.
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const code = args[0];
if (!code || code.startsWith('--')) { console.error('usage: upload-roll.mjs <CODE> [--bucket eastman-rolls] [--from public/rolls]'); process.exit(1); }
const bucket = opt('bucket', 'eastman-rolls');
const root = path.join(opt('from', 'public/rolls'), code);

const TYPES = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', json: 'application/json' };
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter(d => d.isFile())
  .map(d => path.relative(root, path.join(d.parentPath ?? d.path, d.name)).split(path.sep).join('/'))
  .sort((a, b) => (a === 'manifest.json') - (b === 'manifest.json') || a.localeCompare(b));

for (const [n, rel] of files.entries()) {
  const key = `rolls/${code}/${rel}`;
  const type = TYPES[rel.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
  process.stdout.write(`[${n + 1}/${files.length}] ${key}\n`);
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', path.join(root, rel), '--content-type', type, '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] });
}
console.log(`Done. Customer link: /r/${code} · lab: /lab/${code}`);
