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
  type: 'status' | 'date' | 'person' | 'priority' | 'text' | 'timeline' | 'number' | 'file' | 'contact' | 'excel' | 'docs';
  position: number;
  boardId: string;
  settings?: string;
}

export interface Doc {
  id: string;
  title: string;
  type: 'text' | 'sheet';
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

export interface User {
  id: string;
  username: string;
  name: string;
  initials: string;
  color: string;
  role: 'ADMIN' | 'VENTAS' | 'DISENO' | 'TALLER' | 'USER';
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
