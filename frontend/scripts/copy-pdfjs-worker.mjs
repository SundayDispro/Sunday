/**
 * Copia el worker de pdf.js a public/pdfjs-worker.js (extensión .js → MIME correcto en Nginx/SW).
 * Ejecutar tras npm install y antes del build.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const dest = path.join(root, 'public', 'pdfjs-worker.js');

if (!fs.existsSync(src)) {
  console.warn('[copy-pdfjs-worker] No se encontró pdf.worker.min.mjs (¿npm install en frontend?).');
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-pdfjs-worker] -> public/pdfjs-worker.js');
