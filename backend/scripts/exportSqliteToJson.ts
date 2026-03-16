import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';

/**
 * Exporta las tablas clave de backend/prisma/dev.db a JSON,
 * generando un fichero por tabla en backend/sqlite-export.
 */

const DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db');
const EXPORT_DIR = path.join(process.cwd(), 'sqlite-export');

type TableName =
  | 'User'
  | 'Workspace'
  | 'Board'
  | 'Group'
  | 'Item'
  | 'BoardColumn'
  | 'ColumnValue'
  | 'Doc'
  | 'TemplateConfig'
  | 'Notification'
  | 'FeedPost'
  | 'PushSubscription'
  | 'CalendarEvent';

const TABLES: { table: TableName; file: string }[] = [
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

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function exportTable(db: sqlite3.Database, table: TableName, filePath: string): Promise<void> {
  console.log(`Exportando tabla ${table} a ${filePath} ...`);
  const rows = await new Promise<any[]>((resolve, reject) => {
    db.all(`SELECT * FROM "${table}"`, (err, result) => {
      if (err) return reject(err);
      resolve(result ?? []);
    });
  });
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
}

async function main() {
  ensureDir(EXPORT_DIR);

  console.log('Abriendo SQLite en', DB_PATH);
  const db = new sqlite3.Database(DB_PATH);

  try {
    for (const { table, file } of TABLES) {
      const filePath = path.join(EXPORT_DIR, file);
      await exportTable(db, table, filePath);
    }
    console.log('Exportación completada correctamente en', EXPORT_DIR);
  } catch (e) {
    console.error('Error exportando datos desde SQLite:', e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();

