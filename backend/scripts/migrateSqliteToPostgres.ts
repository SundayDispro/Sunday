import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Script de migración desde los JSON exportados de SQLite (backend/sqlite-export)
 * hacia PostgreSQL (DATABASE_URL en .env).
 *
 * Requisitos previos:
 * - Haber ejecutado `npx prisma migrate dev` o `npx prisma migrate deploy` contra Postgres.
 * - Haber ejecutado `npx ts-node scripts/exportSqliteToJson.ts` para generar backend/sqlite-export/*.json.
 */

const prisma = new PrismaClient();

type Json = unknown;

type UserRow = {
  id: string;
  username: string;
  name: string;
  initials: string;
  color: string;
  password: string;
  role: string;
  status: string;
  createdAt: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
  panelNotes: string | null;
  docGroups: string | null;
  createdAt: string;
  updatedAt: string;
};

type BoardRow = {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
};

type GroupRow = {
  id: string;
  name: string;
  color: string;
  position: number;
  boardId: string;
  parentGroupId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ItemRow = {
  id: string;
  name: string;
  position: number;
  groupId: string;
  createdAt: string;
  updatedAt: string;
};

type BoardColumnRow = {
  id: string;
  title: string;
  type: string;
  position: number;
  boardId: string;
  settings: string | null;
};

type ColumnValueRow = {
  id: string;
  value: string;
  itemId: string;
  columnId: string;
};

type DocRow = {
  id: string;
  title: string;
  type: string;
  content: string;
  boardId: string | null;
  workspaceId: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type TemplateConfigRow = {
  id: string;
  docType: string;
  fieldPositions: string;
  fontColor: string;
  fontFamily: string;
  fontSize: number;
  fontBold: number | boolean;
  fontItalic: number | boolean;
  customBoxes: string;
  updatedAt: string;
};

type NotificationRow = {
  id: string;
  userId: string;
  itemId: string;
  type: string;
  read: number | boolean;
  createdAt: string;
};

type FeedPostRow = {
  id: string;
  content: string;
  authorId: string;
  mentionedUserIds: string;
  createdAt: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userId: string;
  createdAt: string;
};

type CalendarEventRow = {
  id: string;
  boardId: string;
  eventDate: string;
  name: string;
  eventType: string;
  createdAt: string;
  updatedAt: string;
};

type SqliteDump = {
  user: UserRow[];
  workspace: WorkspaceRow[];
  board: BoardRow[];
  group: GroupRow[];
  item: ItemRow[];
  boardColumn: BoardColumnRow[];
  columnValue: ColumnValueRow[];
  doc: DocRow[];
  templateConfig: TemplateConfigRow[];
  notification: NotificationRow[];
  feedPost: FeedPostRow[];
  pushSubscription: PushSubscriptionRow[];
  calendarEvent: CalendarEventRow[];
};

const EXPORT_DIR = path.join(process.cwd(), 'sqlite-export');

function safeParseJson<T = Json>(value: string | null | undefined): T | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    console.error('Error parseando JSON legacy:', e);
    return null;
  }
}

function safeBool(value: number | boolean): boolean {
  if (typeof value === 'boolean') return value;
  return value ? true : false;
}

function safeDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Fecha inválida: ${value}`);
  }
  return d;
}

function readJsonFile<T>(fileName: string): T {
  const fullPath = path.join(EXPORT_DIR, fileName);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw) as T;
}

async function migrateInBatches<T>(
  rows: T[],
  batchSize: number,
  handler: (batch: T[]) => Promise<void>,
  label: string
) {
  console.log(`Migrando ${label}: ${rows.length} filas (batchSize=${batchSize})`);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await handler(batch);
    console.log(`  ${label}: ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

async function main() {
  console.log('Leyendo export de SQLite desde', EXPORT_DIR);

  const dump: SqliteDump = {
    user: readJsonFile<UserRow[]>('user.json'),
    workspace: readJsonFile<WorkspaceRow[]>('workspace.json'),
    board: readJsonFile<BoardRow[]>('board.json'),
    group: readJsonFile<GroupRow[]>('group.json'),
    item: readJsonFile<ItemRow[]>('item.json'),
    boardColumn: readJsonFile<BoardColumnRow[]>('boardColumn.json'),
    columnValue: readJsonFile<ColumnValueRow[]>('columnValue.json'),
    doc: readJsonFile<DocRow[]>('doc.json'),
    templateConfig: readJsonFile<TemplateConfigRow[]>('templateConfig.json'),
    notification: readJsonFile<NotificationRow[]>('notification.json'),
    feedPost: readJsonFile<FeedPostRow[]>('feedPost.json'),
    pushSubscription: readJsonFile<PushSubscriptionRow[]>('pushSubscription.json'),
    calendarEvent: readJsonFile<CalendarEventRow[]>('calendarEvent.json'),
  };

  const BATCH = 200;

  // User
  await migrateInBatches(dump.user, BATCH, async (batch) => {
    await prisma.user.createMany({
      data: batch.map((row) => ({
        id: row.id,
        username: row.username,
        name: row.name,
        initials: row.initials,
        color: row.color,
        password: row.password,
        role: row.role,
        status: row.status,
        createdAt: safeDate(row.createdAt),
      })),
      skipDuplicates: true,
    });
  }, 'User');

  // Workspace
  await migrateInBatches(dump.workspace, BATCH, async (batch) => {
    await prisma.workspace.createMany({
      data: batch.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        panelNotes: row.panelNotes,
        panelNotesJson: safeParseJson(row.panelNotes),
        docGroups: row.docGroups,
        docGroupsJson: safeParseJson(row.docGroups),
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'Workspace');

  // Board
  await migrateInBatches(dump.board, BATCH, async (batch) => {
    await prisma.board.createMany({
      data: batch.map((row) => ({
        id: row.id,
        name: row.name,
        workspaceId: row.workspaceId,
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'Board');

  // Group
  await migrateInBatches(dump.group, BATCH, async (batch) => {
    await prisma.group.createMany({
      data: batch.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        position: row.position,
        boardId: row.boardId,
        parentGroupId: row.parentGroupId,
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'Group');

  // Item
  await migrateInBatches(dump.item, BATCH, async (batch) => {
    await prisma.item.createMany({
      data: batch.map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position,
        groupId: row.groupId,
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'Item');

  // BoardColumn
  await migrateInBatches(dump.boardColumn, BATCH, async (batch) => {
    await prisma.boardColumn.createMany({
      data: batch.map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        position: row.position,
        boardId: row.boardId,
        settings: row.settings,
        settingsJson: safeParseJson(row.settings),
      })),
      skipDuplicates: true,
    });
  }, 'BoardColumn');

  // ColumnValue
  await migrateInBatches(dump.columnValue, BATCH, async (batch) => {
    await prisma.columnValue.createMany({
      data: batch.map((row) => ({
        id: row.id,
        value: row.value,
        valueJson: safeParseJson(row.value),
        itemId: row.itemId,
        columnId: row.columnId,
      })),
      skipDuplicates: true,
    });
  }, 'ColumnValue');

  // Doc
  await migrateInBatches(dump.doc, BATCH, async (batch) => {
    await prisma.doc.createMany({
      data: batch.map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        content: row.content,
        contentJson: safeParseJson(row.content),
        boardId: row.boardId,
        workspaceId: row.workspaceId,
        createdBy: row.createdBy,
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'Doc');

  // TemplateConfig
  await migrateInBatches(dump.templateConfig, BATCH, async (batch) => {
    await prisma.templateConfig.createMany({
      data: batch.map((row) => ({
        id: row.id,
        docType: row.docType,
        fieldPositions: row.fieldPositions,
        fieldPositionsJson: safeParseJson(row.fieldPositions),
        fontColor: row.fontColor,
        fontFamily: row.fontFamily,
        fontSize: row.fontSize,
        fontBold: safeBool(row.fontBold),
        fontItalic: safeBool(row.fontItalic),
        customBoxes: row.customBoxes,
        customBoxesJson: safeParseJson(row.customBoxes),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'TemplateConfig');

  // Notification
  await migrateInBatches(dump.notification, BATCH, async (batch) => {
    await prisma.notification.createMany({
      data: batch.map((row) => ({
        id: row.id,
        userId: row.userId,
        itemId: row.itemId,
        type: row.type,
        read: safeBool(row.read),
        createdAt: safeDate(row.createdAt),
      })),
      skipDuplicates: true,
    });
  }, 'Notification');

  // FeedPost
  await migrateInBatches(dump.feedPost, BATCH, async (batch) => {
    await prisma.feedPost.createMany({
      data: batch.map((row) => ({
        id: row.id,
        content: row.content,
        authorId: row.authorId,
        mentionedUserIds: row.mentionedUserIds,
        mentionedUserIdsJson: safeParseJson(row.mentionedUserIds),
        createdAt: safeDate(row.createdAt),
      })),
      skipDuplicates: true,
    });
  }, 'FeedPost');

  // PushSubscription
  await migrateInBatches(dump.pushSubscription, BATCH, async (batch) => {
    await prisma.pushSubscription.createMany({
      data: batch.map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        userId: row.userId,
        createdAt: safeDate(row.createdAt),
      })),
      skipDuplicates: true,
    });
  }, 'PushSubscription');

  // CalendarEvent
  await migrateInBatches(dump.calendarEvent, BATCH, async (batch) => {
    await prisma.calendarEvent.createMany({
      data: batch.map((row) => ({
        id: row.id,
        boardId: row.boardId,
        eventDate: safeDate(row.eventDate),
        name: row.name,
        eventType: row.eventType,
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
      })),
      skipDuplicates: true,
    });
  }, 'CalendarEvent');

  console.log('Migración completada. Validando conteos...');

  const [
    userCount,
    workspaceCount,
    boardCount,
    groupCount,
    itemCount,
    boardColumnCount,
    columnValueCount,
    docCount,
    templateConfigCount,
    notificationCount,
    feedPostCount,
    pushSubscriptionCount,
    calendarEventCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.board.count(),
    prisma.group.count(),
    prisma.item.count(),
    prisma.boardColumn.count(),
    prisma.columnValue.count(),
    prisma.doc.count(),
    prisma.templateConfig.count(),
    prisma.notification.count(),
    prisma.feedPost.count(),
    prisma.pushSubscription.count(),
    prisma.calendarEvent.count(),
  ]);

  console.table({
    User: { sqlite: dump.user.length, postgres: userCount },
    Workspace: { sqlite: dump.workspace.length, postgres: workspaceCount },
    Board: { sqlite: dump.board.length, postgres: boardCount },
    Group: { sqlite: dump.group.length, postgres: groupCount },
    Item: { sqlite: dump.item.length, postgres: itemCount },
    BoardColumn: { sqlite: dump.boardColumn.length, postgres: boardColumnCount },
    ColumnValue: { sqlite: dump.columnValue.length, postgres: columnValueCount },
    Doc: { sqlite: dump.doc.length, postgres: docCount },
    TemplateConfig: { sqlite: dump.templateConfig.length, postgres: templateConfigCount },
    Notification: { sqlite: dump.notification.length, postgres: notificationCount },
    FeedPost: { sqlite: dump.feedPost.length, postgres: feedPostCount },
    PushSubscription: { sqlite: dump.pushSubscription.length, postgres: pushSubscriptionCount },
    CalendarEvent: { sqlite: dump.calendarEvent.length, postgres: calendarEventCount },
  });
}

main()
  .catch((e) => {
    console.error('Error en migración SQLite -> Postgres:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });