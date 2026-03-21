export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  boards: Board[];
}

export interface Board {
  id: string;
  name: string;
  workspaceId: string;
  groups: Group[];
  columns: BoardColumn[];
}

export interface Group {
  id: string;
  name: string;
  color: string;
  position: number;
  boardId: string;
  parentGroupId?: string | null;
  items: Item[];
}

export interface Item {
  id: string;
  name: string;
  position: number;
  groupId: string;
  columnValues: ColumnValue[];
}

export interface BoardColumn {
  id: string;
  title: string;
  type: 'status' | 'date' | 'person' | 'priority' | 'text' | 'timeline' | 'number' | 'file' | 'contact' | 'excel' | 'docs' | 'billing_docs' | 'folio';
  position: number;
  boardId: string;
  settings?: string;
}

/** Evento solo de calendario (no pertenece a ningún grupo ni item del tablero). */
export interface CalendarEvent {
  id: string;
  boardId: string;
  eventDate: string;
  name: string;
  eventType: string;
  createdAt?: string;
  updatedAt?: string;
}

export type DocType = 'text' | 'sheet' | 'cotizacion' | 'levantamiento' | 'hoja_trabajo';

export interface Doc {
  id: string;
  title: string;
  type: DocType;
  content: string;
  boardId?: string | null;
  workspaceId: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnValue {
  id: string;
  value: string;
  itemId: string;
  columnId: string;
}

export interface StatusOption {
  id: string;
  label: string;
  color: string;
}

export interface StatusSettings {
  options: StatusOption[];
}

export type UserStatus = 'available' | 'busy' | 'offline';

export interface User {
  id: string;
  username: string;
  name: string;
  initials: string;
  color: string;
  role: 'ADMIN' | 'VENTAS' | 'DISENO' | 'TALLER' | 'USER';
  status?: UserStatus;
  avatarUrl?: string | null;
}

/** Subconjunto del autor usado en listados de menciones (NotificationsPage). */
export type FeedPostAuthorPreview = Pick<User, 'id' | 'name' | 'initials' | 'color'>;

/**
 * Elemento devuelto por GET /api/feed (y creación POST): menciones vienen como string[] parseado en servidor.
 * Campos extra de Prisma (p. ej. mentionedUserIdsJson) pueden llegar en JSON pero la UI no los usa → no los incluimos.
 */
export interface FeedPost {
  id: string;
  content: string;
  authorId: string;
  author?: User | FeedPostAuthorPreview;
  mentionedUserIds: string[];
  createdAt: string;
}

export interface Update {
  id: string;
  content: string;
  authorId: string;
  authorUser?: User;
  itemId: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  itemId: string;
  type: string;
  read: boolean;
  createdAt: string;
  item?: Item & { group?: { id: string; name: string; board?: { id: string; name: string } } };
}

// Contrato API plantillas PDF: ver
// TemplateConfigState en
// components/pages/docs/pdfTemplateConfig.ts

export interface Design {
  id: string;
  workspaceId: string;
  name: string;
  content: string;
  contentJson?: unknown;
  thumbnailUrl?: string | null;
  boardId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cuerpo de POST /api/push/subscribe.
 * El navegador envía el objeto PushSubscription serializado (JSON.stringify).
 */
export interface WebPushSubscribeRequestBody {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
}
