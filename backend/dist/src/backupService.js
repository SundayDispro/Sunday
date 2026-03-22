"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBackup = runBackup;
exports.cleanOldBackups = cleanOldBackups;
exports.getBackupList = getBackupList;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const archiver_1 = __importDefault(require("archiver"));
const paths_1 = require("./config/paths");
const MAX_BACKUP_DAYS = 30;
function getBackupZipPath(date) {
    return path_1.default.join(paths_1.BACKUPS_DIR, `${date}.zip`);
}
function getBackupMetaPath(date) {
    return path_1.default.join(paths_1.BACKUPS_DIR, `${date}.json`);
}
async function countFilesRecursive(dir) {
    let count = 0;
    const entries = await fs_1.default.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            count += await countFilesRecursive(fullPath);
        }
        else if (entry.isFile()) {
            count += 1;
        }
    }
    return count;
}
/**
 * Corre en el hilo principal del proceso Node.
 * Se mantiene asi por simplicidad; si crece mucho el volumen se puede mover a worker.
 */
async function runBackup() {
    const date = new Date().toISOString().slice(0, 10);
    const zipPath = getBackupZipPath(date);
    const metaPath = getBackupMetaPath(date);
    const startedAt = Date.now();
    await fs_1.default.promises.mkdir(paths_1.BACKUPS_DIR, { recursive: true });
    await fs_1.default.promises.mkdir(paths_1.UPLOADS_DIR, { recursive: true });
    let fileCount = 0;
    try {
        fileCount = await countFilesRecursive(paths_1.UPLOADS_DIR);
    }
    catch (e) {
        console.warn(JSON.stringify({ level: 'warn', msg: 'backup_count_files_error', error: String(e) }));
    }
    console.log(JSON.stringify({ level: 'info', msg: 'backup_start', date, fileCount }));
    await new Promise((resolve, reject) => {
        const output = fs_1.default.createWriteStream(zipPath);
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 6 } });
        let settled = false;
        const fail = (err) => {
            if (settled)
                return;
            settled = true;
            try {
                archive.abort();
            }
            catch {
                // ignore
            }
            void fs_1.default.promises
                .unlink(zipPath)
                .catch(() => { })
                .finally(() => {
                console.warn(JSON.stringify({
                    level: 'warn',
                    msg: 'backup_archive_error',
                    error: String(err),
                }));
                reject(err instanceof Error ? err : new Error(String(err)));
            });
        };
        output.on('close', () => {
            if (settled)
                return;
            settled = true;
            resolve();
        });
        output.on('error', fail);
        archive.on('error', fail);
        archive.pipe(output);
        archive.directory(paths_1.UPLOADS_DIR, false);
        void archive.finalize();
    });
    await fs_1.default.promises.writeFile(metaPath, JSON.stringify({ date, files: fileCount }), 'utf8');
    const stat = await fs_1.default.promises.stat(zipPath);
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
async function cleanOldBackups() {
    await fs_1.default.promises.mkdir(paths_1.BACKUPS_DIR, { recursive: true });
    const cutoffMs = Date.now() - MAX_BACKUP_DAYS * 24 * 60 * 60 * 1000;
    try {
        const entries = await fs_1.default.promises.readdir(paths_1.BACKUPS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.zip'))
                continue;
            const datePart = entry.name.slice(0, 10);
            const parsed = Date.parse(`${datePart}T00:00:00.000Z`);
            if (Number.isNaN(parsed) || parsed >= cutoffMs)
                continue;
            const zipPath = path_1.default.join(paths_1.BACKUPS_DIR, entry.name);
            const metaPath = getBackupMetaPath(datePart);
            await fs_1.default.promises.rm(zipPath, { force: true });
            await fs_1.default.promises.rm(metaPath, { force: true });
            console.log(JSON.stringify({ level: 'info', msg: 'backup_pruned', date: datePart }));
        }
    }
    catch (e) {
        console.warn(JSON.stringify({ level: 'warn', msg: 'backup_clean_error', error: String(e) }));
    }
}
async function getBackupList() {
    await fs_1.default.promises.mkdir(paths_1.BACKUPS_DIR, { recursive: true });
    const result = [];
    const entries = await fs_1.default.promises.readdir(paths_1.BACKUPS_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.zip'))
            continue;
        const date = entry.name.slice(0, -4);
        const zipPath = path_1.default.join(paths_1.BACKUPS_DIR, entry.name);
        const stat = await fs_1.default.promises.stat(zipPath).catch(() => null);
        if (!stat)
            continue;
        let files = 0;
        const metaPath = getBackupMetaPath(date);
        const metaRaw = await fs_1.default.promises.readFile(metaPath, 'utf8').catch(() => null);
        if (metaRaw) {
            try {
                const meta = JSON.parse(metaRaw);
                if (typeof meta.files === 'number' && Number.isFinite(meta.files)) {
                    files = meta.files;
                }
            }
            catch {
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
