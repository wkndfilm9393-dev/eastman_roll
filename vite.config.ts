import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// appType 'spa' (the default) serves index.html for /r/:code in dev and preview.
// `npm run demo` builds one self-contained HTML file (fonts and code inlined, no
// sample rolls) that opens from disk and starts from the photo picker.
export default defineConfig(({ mode }) =>
  mode === 'demo'
    ? {
        plugins: [viteSingleFile()],
        publicDir: false,
        build: { target: 'es2020', outDir: 'demo-dist', assetsInlineLimit: 100_000_000 },
      }
    : { build: { target: 'es2020', assetsInlineLimit: 0 } },
);
