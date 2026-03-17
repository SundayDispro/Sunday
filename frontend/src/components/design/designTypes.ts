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

export type DesignTool =
  | 'select'
  | 'pen'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'image';

