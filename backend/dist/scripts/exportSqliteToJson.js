"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sqlite3_1 = __importDefault(require("sqlite3"));
/**
 * Exporta las tablas clave de backend/prisma/dev.db a JSON,
 * generando un fichero por tabla en backend/sqlite-export.
 */
const DB_PATH = path_1.default.join(process.cwd(), 'prisma', 'dev.db');
const EXPORT_DIR = path_1.default.join(process.cwd(), 'sqlite-export');
const TABLES = [
    { table: 'User', file: 'user.json' },
    { table: 'Workspace', file: 'workspace.json' },
    { table: 'Board', file: 'board.json' },
    { table: 'Group', file: 'group.json' },
    { table: 'Item', file: 'item.json' },
    { table: 'BoardColumn', file: 'boardColumn.json' },
    { table: 'ColumnValue', file: 'columnValue.json' },
    { table: 'Doc', file: 'doc.json' },
    { table: 'TemplateConfig', file: 'templateConfig.json' },
    { table: 'Notification', file: 'notification.json' },
    { table: 'FeedPost', file: 'feedPost.json' },
    { table: 'PushSubscription', file: 'pushSubscription.json' },
    { table: 'CalendarEvent', file: 'calendarEvent.json' },
];
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
async function exportTable(db, table, filePath) {
    console.log(`Exportando tabla ${table} a ${filePath} ...`);
    const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM "${table}"`, (err, result) => {
            if (err)
                return reject(err);
            resolve(result ?? []);
        });
    });
    fs_1.default.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
}
async function main() {
    ensureDir(EXPORT_DIR);
    console.log('Abriendo SQLite en', DB_PATH);
    const db = new sqlite3_1.default.Database(DB_PATH);
    try {
        for (const { table, file } of TABLES) {
            const filePath = path_1.default.join(EXPORT_DIR, file);
            await exportTable(db, table, filePath);
        }
        console.log('Exportación completada correctamente en', EXPORT_DIR);
    }
    catch (e) {
        console.error('Error exportando datos desde SQLite:', e);
        process.exitCode = 1;
    }
    finally {
        db.close();
    }
}
main();
