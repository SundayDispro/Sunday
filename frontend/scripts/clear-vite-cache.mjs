/**
 * Borra la caché de pre-bundling de Vite (node_modules/.vite).
 * Evita 504 "Outdated Optimize Dep" cuando deps o el servidor quedan desincronizados.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const viteCache = path.join(root, 'node_modules', '.vite');

try {
  fs.rmSync(viteCache, { recursive: true, force: true });
  console.log('[clear-vite-cache] OK: eliminado node_modules/.vite');
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn('[clear-vite-cache]', msg);
}
