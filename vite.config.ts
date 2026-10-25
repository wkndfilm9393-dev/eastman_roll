import { rmSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { devApi } from './worker/dev';

// appType 'spa' (the default) serves index.html for /r/:code in dev and preview.
// `npm run dev` also runs the roll backend (worker/handler.ts) on /api/*.
// `npm run demo` builds one self-contained HTML file (fonts and code inlined, no
// sample rolls) that opens from disk and starts from the photo picker.
export default defineConfig(({ mode }) =>
  mode === 'demo'
    ? {
        plugins: [viteSingleFile()],
        publicDir: false,
        build: { target: 'es2020', outDir: 'demo-dist', assetsInlineLimit: 100_000_000 },
      }
    : {
        plugins: [
          { name: 'roll-api', configureServer: s => void s.middlewares.use(devApi(s.config.root)) },
          // rolls live in R2 in production; local sample rolls stay out of the deploy
          { name: 'no-rolls', apply: 'build', closeBundle: () => rmSync('dist/rolls', { recursive: true, force: true }) },
        ],
        build: { target: 'es2020', assetsInlineLimit: 0 },
      },
);
