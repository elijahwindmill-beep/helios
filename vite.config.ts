/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * MapLibre 6 runs its tile work in a module worker that imports a shared chunk next to it.
 * Vite's transforms break that worker (they inject the dev client), so serve both files
 * untouched under /maplibre/ in dev and copy them there in the build.
 */
function maplibreWorker(): Plugin {
  const dist = join(dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist');
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
  return {
    name: 'helios-maplibre-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].replace(/^\/maplibre\//, '');
        if (!req.url?.startsWith('/maplibre/') || !name || !files.includes(name)) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(join(dist, name)));
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `maplibre/${name}`, source: readFileSync(join(dist, name)) });
      }
    },
  };
}

// GitHub Pages serves the site from /helios/, local dev from /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/helios/' : '/',
  plugins: [react(), maplibreWorker()],
  server: { port: 5173 },
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
