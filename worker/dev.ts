// The backend inside `npm run dev`: same handler as production, with the
// bucket read from public/rolls and sessions kept in .dev-data/kv.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { handle, type Bucket, type Env, type KV } from './handler';

function fileKV(path: string): KV {
  const data: Record<string, string> = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  return {
    async get(k) { return data[k] ?? null; },
    async put(k, v) {
      data[k] = v;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(data, null, 1));
    },
  };
}

function dirBucket(root: string): Bucket {
  return {
    async get(key) {
      try {
        const buf = await readFile(join(root, key.replace(/^rolls\//, '')));
        return { body: new Response(buf).body };
      } catch { return null; }
    },
  };
}

export function devApi(root: string) {
  const env: Env = {
    ROLLS: dirBucket(join(root, 'public/rolls')),
    SESSIONS: fileKV(join(root, '.dev-data/kv.json')),
    LAB_WEBHOOK_URL: process.env.LAB_WEBHOOK_URL,
  };
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const out = await handle(request, env, { waitUntil: p => void p.catch(console.error) });
    if (!out) return next();
    res.statusCode = out.status;
    out.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await out.arrayBuffer()));
  };
}
