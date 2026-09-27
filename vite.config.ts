/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves files from a package untouched under /<prefix>/ in dev and copies them there in the
 * build: MapLibre 6's worker, which Vite's transforms break (they inject the dev client).
 */
function packageFiles(prefix: string, pkg: string, folder: string, files: string[]): Plugin {
  const dir = fileURLToPath(new URL(`./node_modules/${pkg}/${folder}/`, import.meta.url));
  const types: Record<string, string> = { mjs: 'text/javascript', js: 'text/javascript', wasm: 'application/wasm' };
  return {
    name: `helios-files-${prefix}`,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].replace(new RegExp(`^/${prefix}/`), '');
        if (!req.url?.startsWith(`/${prefix}/`) || !name || !files.includes(name)) return next();
        res.setHeader('Content-Type', types[name.split('.').pop()!] ?? 'application/octet-stream');
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `${prefix}/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}

// GitHub Pages serves the site from /zenit/, local dev from /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/zenit/' : '/',
  plugins: [
    react(),
    packageFiles('maplibre', 'maplibre-gl', 'dist', ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']),
  ],
  server: { port: 5173 },
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
