import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The service worker stays hand-written; at build time it gets the list of hashed files to precache.
function serviceWorker() {
  return {
    name: 'numly-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const shell = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png', ...Object.keys(bundle).map(f => `/${f}`)];
      const source = readFileSync(new URL('./web/sw.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source.replace('self.__SHELL', JSON.stringify(shell)) });
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [svelte(), serviceWorker()],
  build: { outDir: '../dist', emptyOutDir: true },
  // `npm run dev` runs the Worker on 8790; the API (including the WebSocket) is proxied to it.
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8790', ws: true } } },
});
