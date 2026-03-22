import fs from 'fs';
import path from 'path';

/**
 * Raíz del paquete backend (donde están uploads/, templates/, etc.).
 * En runtime compilado este archivo vive en dist/src/config/; en ts directo, en src/config/.
 */
function backendRootFromThisModule(): string {
  const isInDist = __dirname.includes(path.sep + 'dist' + path.sep);
  return isInDist
    ? path.resolve(__dirname, '..', '..', '..')
    : path.resolve(__dirname, '..', '..');
}

const fromEnv = process.env.UPLOADS_DIR?.trim();

export const UPLOADS_DIR = fromEnv
  ? path.resolve(fromEnv)
  : path.resolve(backendRootFromThisModule(), 'uploads');

/** Misma convención que antes: carpeta `backups` junto a `uploads` (p. ej. backend/backups). */
export const BACKUPS_DIR = path.join(path.dirname(UPLOADS_DIR), 'backups');

export function ensureUploadDirs(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}
