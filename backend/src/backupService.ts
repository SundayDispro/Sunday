import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const BACKUPS_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUP_DAYS = 30;

type BackupMeta = {
  date: string;
  files: number;
};

function getBackupZipPath(date: string): string {
  return path.join(BACKUPS_DIR, `${date}.zip`);
}

function getBackupMetaPath(date: string): string {
  return path.join(BACKUPS_DIR, `${date}.json`);
}

async function countFilesRecursive(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursive(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

/**
 * Corre en el hilo principal del proceso Node.
 * Se mantiene asi por simplicidad; si crece mucho el volumen se puede mover a worker.
 */
export async function runBackup(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const zipPath = getBackupZipPath(date);
  const metaPath = getBackupMetaPath(date);
  const startedAt = Date.now();

  await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

  let fileCount = 0;
  try {
    fileCount = await countFilesRecursive(UPLOADS_DIR);
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'backup_count_files_error', error: String(e) }));
  }

  console.log(JSON.stringify({ level: 'info', msg: 'backup_start', date, fileCount }));

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(UPLOADS_DIR, false);
    void archive.finalize();
  });

  await fs.promises.writeFile(metaPath, JSON.stringify({ date, files: fileCount } satisfies BackupMeta), 'utf8');

  const stat = await fs.promises.stat(zipPath);
  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    level: 'info',
    msg: 'backup_done',
    date,
    files: fileCount,
    sizeMb: Number((stat.size / 1_048_576).toFixed(2)),
    elapsedMs,
  }));
}

export async function cleanOldBackups(): Promise<void> {
  await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
  const cutoffMs = Date.now() - MAX_BACKUP_DAYS * 24 * 60 * 60 * 1000;

  try {
    const entries = await fs.promises.readdir(BACKUPS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.zip')) continue;

      const datePart = entry.name.slice(0, 10);
      const parsed = Date.parse(`${datePart}T00:00:00.000Z`);
      if (Number.isNaN(parsed) || parsed >= cutoffMs) continue;

      const zipPath = path.join(BACKUPS_DIR, entry.name);
      const metaPath = getBackupMetaPath(datePart);
      await fs.promises.rm(zipPath, { force: true });
      await fs.promises.rm(metaPath, { force: true });
      console.log(JSON.stringify({ level: 'info', msg: 'backup_pruned', date: datePart }));
    }
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'backup_clean_error', error: String(e) }));
  }
}

export async function getBackupList(): Promise<Array<{ date: string; files: number; sizeMb: number }>> {
  await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
  const result: Array<{ date: string; files: number; sizeMb: number }> = [];
  const entries = await fs.promises.readdir(BACKUPS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.zip')) continue;
    const date = entry.name.slice(0, -4);
    const zipPath = path.join(BACKUPS_DIR, entry.name);
    const stat = await fs.promises.stat(zipPath).catch(() => null);
    if (!stat) continue;

    let files = 0;
    const metaPath = getBackupMetaPath(date);
    const metaRaw = await fs.promises.readFile(metaPath, 'utf8').catch(() => null);
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw) as Partial<BackupMeta>;
        if (typeof meta.files === 'number' && Number.isFinite(meta.files)) {
          files = meta.files;
        }
      } catch {
        // ignore malformed metadata
      }
    }

    result.push({
      date,
      files,
      sizeMb: Number((stat.size / 1_048_576).toFixed(2)),
    });
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}
