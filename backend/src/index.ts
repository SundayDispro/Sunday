import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (_) {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = (() => {
      if (file.mimetype === 'application/pdf') return '.pdf';
      if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') return '.jpg';
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        return '.xlsx';
      if (file.mimetype === 'application/vnd.ms-excel') return '.xls';
      return path.extname(file.originalname || '').toLowerCase() || '.bin';
    })();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/jpg' ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    if (ok) cb(null, true);
    else cb(new Error('Solo se permiten archivos JPG (image/jpeg) o PDF (application/pdf).'));
  },
});

app.use(cors());
app.use(express.json());

// Servir archivos subidos (URL pública: /uploads/nombre.jpg)
app.use('/uploads', express.static(UPLOAD_DIR));

// Health check (for frontend to verify backend is up)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Subir documento (JPG o PDF) (multipart/form-data, field: "file"); responde con la URL pública
app.post('/api/upload', (req, res) => {
  const sendError = (status: number, message: string) => {
    res.status(status).json({ error: message });
  };
  upload.single('file')(req, res, (err: unknown) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE')
            return sendError(400, 'El archivo no puede superar 5 MB.');
        }
        return sendError(400, err instanceof Error ? err.message : 'Error al subir.');
      }
      if (!req.file) return sendError(400, 'No se envió ningún archivo.');
      const url = '/uploads/' + req.file.filename;
      res.status(201).json({ url });
    } catch (e) {
      console.error('Upload error:', e);
      sendError(500, 'Error interno al guardar el archivo.');
    }
  });
});

// Get all workspaces (for sidebar workspace selector)
app.get('/api/workspaces', async (_req, res) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        boards: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, workspaceId: true },
        },
      },
    });
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Create a new workspace
app.post('/api/workspaces', async (req, res) => {
  try {
    const name = (req.body?.name && String(req.body.name).trim()) || 'Nuevo workspace';
    const workspace = await prisma.workspace.create({
      data: { name },
      include: {
        boards: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, workspaceId: true } },
      },
    });
    res.status(201).json(workspace);
  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Update workspace (rename, description)
app.patch('/api/workspaces/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const name = body.name != null ? String(body.name).trim() : undefined;
    const description = body.description !== undefined ? (body.description === null || body.description === '' ? null : String(body.description)) : undefined;
    const data: { name?: string; description?: string | null } = {};
    if (name !== undefined) data.name = name || 'Nuevo workspace';
    if (description !== undefined) data.description = description;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    const workspace = await prisma.workspace.update({
      where: { id },
      data,
      include: {
        boards: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, workspaceId: true } },
      },
    });
    res.json(workspace);
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Workspace no encontrado' });
    }
    console.error('Error updating workspace:', error);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// Delete workspace (cascade deletes boards)
app.delete('/api/workspaces/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.workspace.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Workspace no encontrado' });
    }
    console.error('Error deleting workspace:', error);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

// Search items and boards by query (all boards)
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q as string)?.trim()?.toLowerCase();
    if (!q) return res.json([]);
    const boards = await prisma.board.findMany({
      include: {
        groups: { include: { items: true } },
      },
    });
    const results: { item: { id: string; name: string; groupId: string }; boardId: string; boardName: string; groupId: string; groupName: string }[] = [];
    for (const board of boards) {
      for (const group of board.groups) {
        for (const item of group.items) {
          if (item.name.toLowerCase().includes(q) || board.name.toLowerCase().includes(q)) {
            results.push({
              item: { id: item.id, name: item.name, groupId: item.groupId },
              boardId: board.id,
              boardName: board.name,
              groupId: group.id,
              groupName: group.name,
            });
          }
        }
      }
    }
    res.json(results.slice(0, 100));
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// Get all boards (for sidebar list), optionally filtered by workspace
app.get('/api/boards', async (req, res) => {
  try {
    const { workspaceId } = req.query as { workspaceId?: string };
    const where = workspaceId ? { workspaceId } : undefined;
    const boards = await prisma.board.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, workspaceId: true },
    });
    res.json(boards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// Reorder columns within a board
app.post('/api/boards/:id/columns/reorder', async (req, res) => {
  try {
    const boardId = req.params.id;
    const updates = (req.body?.updates ?? []) as { id: string; position: number }[];
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array is required' });
    }

    // Ensure all columns belong to the board
    const columnIds = updates.map(u => u.id);
    const columns = await prisma.boardColumn.findMany({
      where: { id: { in: columnIds }, boardId },
    });
    if (columns.length !== updates.length) {
      return res.status(400).json({ error: 'Some columns do not belong to this board' });
    }

    await Promise.all(
      updates.map(u =>
        prisma.boardColumn.update({
          where: { id: u.id },
          data: { position: u.position },
        })
      )
    );

    const reordered = await prisma.boardColumn.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });

    res.json(reordered);
  } catch (error) {
    console.error('Error reordering columns:', error);
    res.status(500).json({ error: 'Failed to reorder columns' });
  }
});

// Create a new board (REST – no dependency on socket)
app.post('/api/boards', async (req, res) => {
  try {
    const body = req.body ?? {};
    const requestedWorkspaceId = body.workspaceId ? String(body.workspaceId) : null;

    let workspaceIdToUse: string;
    if (requestedWorkspaceId) {
      const existing = await prisma.workspace.findUnique({ where: { id: requestedWorkspaceId } });
      if (!existing) {
        return res.status(400).json({ error: 'Workspace no encontrado' });
      }
      workspaceIdToUse = existing.id;
    } else {
      let workspace = await prisma.workspace.findFirst();
      if (!workspace) {
        workspace = await prisma.workspace.create({
          data: { name: 'Main Workspace' },
        });
      }
      workspaceIdToUse = workspace.id;
    }

    const name = (req.body?.name && String(req.body.name).trim()) || 'Nuevo tablero';
    const newBoard = await prisma.board.create({
      data: { name, workspaceId: workspaceIdToUse },
      select: { id: true, name: true, workspaceId: true },
    });
    res.status(201).json(newBoard);
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Delete board (cascade via Prisma relations)
app.delete('/api/boards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.board.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Board no encontrado' });
    }
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Get the first Board dynamically
app.get('/api/boards/first', async (req, res) => {
  try {
    const board = await prisma.board.findFirst({
      include: {
        groups: {
          orderBy: { position: 'asc' },
          include: {
            items: {
              orderBy: { position: 'asc' },
              include: { columnValues: true }
            }
          }
        },
        columns: {
          orderBy: { position: 'asc' }
        }
      }
    });
    res.json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

app.get('/api/boards/:id', async (req, res) => {
  try {
    const board = await prisma.board.findUnique({
      where: { id: req.params.id },
      include: {
        groups: {
          orderBy: { position: 'asc' },
          include: {
            items: {
              orderBy: { position: 'asc' },
              include: { columnValues: true }
            }
          }
        },
        columns: {
          orderBy: { position: 'asc' }
        }
      }
    });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// Get updates for an item
app.get('/api/items/:itemId/updates', async (req, res) => {
  try {
    const updates = await prisma.update.findMany({
      where: { itemId: req.params.itemId },
      orderBy: { createdAt: 'desc' },
      include: {
        // Since we didn't define a relation name, Prisma allows us to include the User if we had a relation.
        // Wait, schema.prisma doesn't have a formal relation from Update to User!
        // Let's just return what we have and we'll fix the schema in a bit if needed. For now, authorId is just a string.
      }
    });
    // Let's manually fetch users for now to avoid another schema migration just for a relation
    const userIds = [...new Set(updates.map(u => u.authorId))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    const userMap = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {} as any);
    
    const enriched = updates.map(u => ({ ...u, authorUser: userMap[u.authorId] }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});

// --- Bandeja feed (publicaciones con @mentions) ---
app.get('/api/feed', async (req, res) => {
  try {
    const filter = req.query.filter as string; // 'mentions' = solo donde me mencionaron
    const userId = req.query.userId as string;
    const posts = await prisma.feedPost.findMany({
      orderBy: { createdAt: 'desc' },
      include: { author: true },
      take: 200,
    });
    let list = posts.map(p => {
      const author = p.author ? { ...p.author, password: undefined } : p.author;
      return {
        ...p,
        author,
        mentionedUserIds: (() => { try { return JSON.parse(p.mentionedUserIds || '[]'); } catch { return []; } })(),
      };
    });
    if (filter === 'mentions' && userId) {
      list = list.filter(p => {
        const ids = (p as any).mentionedUserIds as string[];
        return Array.isArray(ids) && ids.includes(userId);
      });
    }
    res.json(list);
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

app.post('/api/feed', async (req, res) => {
  try {
    const { content, authorId, mentionedUserIds } = req.body ?? {};
    if (!content || typeof content !== 'string' || !authorId) {
      return res.status(400).json({ error: 'content y authorId son obligatorios' });
    }
    const ids = Array.isArray(mentionedUserIds) ? mentionedUserIds : [];
    const post = await prisma.feedPost.create({
      data: {
        content: content.trim(),
        authorId,
        mentionedUserIds: JSON.stringify(ids),
      },
      include: { author: true },
    });
    res.status(201).json({ ...post, mentionedUserIds: ids });
  } catch (error) {
    console.error('Feed post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// --- Auth & Users API ---

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    
    // In a real app use bcrypt.compare, here we use simple text for demo since it's a clone test
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el login' });
  }
});

// Admin endpoint to create a new user
app.post('/api/users', async (req, res) => {
  try {
    const { username, name, password, adminId, role: bodyRole } = req.body;
    
    // Simple admin check
    const reqAdmin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!reqAdmin || reqAdmin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Sólo los administradores pueden crear usuarios' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya está registrado' });
    }

    const allowedRoles = ['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER'];
    const role = allowedRoles.includes(bodyRole) ? bodyRole : 'USER';

    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
    const colors = ['#00c875', '#fdab3d', '#e2445c', '#5559df', '#6e3cbb', '#0073ea'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const newUser = await prisma.user.create({
      data: {
        username,
        name,
        initials,
        color,
        password, // Accept password from admin
        role
      }
    });

    io.emit('user_added', newUser); // Broadcast if needed
    res.json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// --- Sync profile config (per role) ---

type SyncProfile = {
  syncDocs: boolean;
  syncExcel: boolean;
  syncFiles: boolean;
};

const ROLE_SYNC_PROFILES: Record<string, SyncProfile> = {
  ADMIN: { syncDocs: true, syncExcel: true, syncFiles: true },
  DISENO: { syncDocs: true, syncExcel: true, syncFiles: true },
  VENTAS: { syncDocs: true, syncExcel: true, syncFiles: false },
  TALLER: { syncDocs: true, syncExcel: false, syncFiles: false },
  USER: { syncDocs: true, syncExcel: false, syncFiles: false },
};

function getSyncProfileForRole(role: string): SyncProfile {
  return ROLE_SYNC_PROFILES[role] || ROLE_SYNC_PROFILES.USER;
}

// --- Notifications API ---

app.get('/api/notifications', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        item: {
          include: {
            columnValues: true,
            group: { include: { board: true } },
          },
        },
      },
    });
    res.json(notifications);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    await prisma.notification.updateMany({
      where: { userId },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

// --- Export folders from boards (one-shot) ---
import os from 'os';

function classifyFileType(url: string): 'docs' | 'excel' | 'file' {
  const lower = url.toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.pdf')) return 'docs';
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')) return 'excel';
  return 'file';
}

app.post('/api/export/folders', async (req, res) => {
  try {
    const { userId, boardId, basePath } = req.body ?? {};
    if (!userId || !boardId) {
      return res.status(400).json({ error: 'userId y boardId son obligatorios' });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const syncProfile = getSyncProfileForRole(user.role);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        workspace: true,
        groups: {
          orderBy: { position: 'asc' },
          include: {
            items: {
              orderBy: { position: 'asc' },
              include: { columnValues: true },
            },
          },
        },
        columns: { orderBy: { position: 'asc' } },
      },
    });

    if (!board) return res.status(404).json({ error: 'Tablero no encontrado' });

    const rootPath = basePath && typeof basePath === 'string' && basePath.trim()
      ? basePath
      : path.join(os.homedir(), 'SundayExports');

    const workspaceDir = path.join(rootPath, board.workspace?.name || 'Workspace');
    const boardDir = path.join(workspaceDir, board.name);

    fs.mkdirSync(boardDir, { recursive: true });

    const docsColumns = board.columns.filter(c => c.type === 'docs');
    const excelColumns = board.columns.filter(c => c.type === 'excel');
    const fileColumns = board.columns.filter(c => c.type === 'file');

    const createdPaths: string[] = [];

    const allGroups = board.groups as any[];
    const rootGroups = allGroups.filter(g => !g.parentGroupId);

    const getChildren = (parentId: string) =>
      allGroups.filter(g => g.parentGroupId === parentId);

    for (const group of rootGroups) {
      const monthDir = path.join(boardDir, group.name);
      fs.mkdirSync(monthDir, { recursive: true });
      createdPaths.push(monthDir);

      const clientGroups = getChildren(group.id);
      const targetGroups = clientGroups.length > 0 ? clientGroups : [group];

      for (const client of targetGroups) {
        const clientDir = clientGroups.length > 0
          ? path.join(monthDir, client.name)
          : monthDir;
        if (!fs.existsSync(clientDir)) {
          fs.mkdirSync(clientDir, { recursive: true });
          createdPaths.push(clientDir);
        }

        for (const item of client.items) {
          const safeItemName = item.name || 'Elemento';
          const itemDir = path.join(clientDir, safeItemName.replace(/[\\\\/:*?\"<>|]/g, '_'));
          fs.mkdirSync(itemDir, { recursive: true });
          createdPaths.push(itemDir);

          const handleColumnSet = (columnsArr: typeof board.columns, enabled: boolean) => {
            if (!enabled) return;
            for (const col of columnsArr) {
              const cv = item.columnValues.find((v: any) => v.columnId === col.id);
              if (!cv || !cv.value) continue;
              const value = cv.value.trim();
              if (!value) continue;
              const type = classifyFileType(value);
              if (type === 'docs' && !syncProfile.syncDocs) continue;
              if (type === 'excel' && !syncProfile.syncExcel) continue;
              if (type === 'file' && !syncProfile.syncFiles) continue;

              const filename = `${col.title.replace(/[\\\\/:*?\"<>|]/g, '_')}.url.txt`;
              const filePath = path.join(itemDir, filename);
              fs.writeFileSync(filePath, value, 'utf8');
              createdPaths.push(filePath);
            }
          };

          handleColumnSet(docsColumns, syncProfile.syncDocs);
          handleColumnSet(excelColumns, syncProfile.syncExcel);
          handleColumnSet(fileColumns, syncProfile.syncFiles);
        }
      }
    }

    return res.json({
      ok: true,
      rootPath,
      createdCount: createdPaths.length,
    });
  } catch (e) {
    console.error('Export folders error:', e);
    return res.status(500).json({ error: 'Error al exportar carpetas' });
  }
});

// --- Docs API (simple docs/sheets por workspace/board) ---
// Comprobar que las rutas de docs están cargadas (útil si POST /api/docs da 404)
app.get('/api/docs/check', (_req, res) => {
  res.json({ ok: true, docs: true });
});

app.get('/api/docs', async (req, res) => {
  try {
    const { workspaceId, boardId } = req.query as { workspaceId?: string; boardId?: string };
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es obligatorio' });
    }
    const docs = await prisma.doc.findMany({
      where: {
        workspaceId,
        boardId: boardId || undefined,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(docs);
  } catch (e) {
    console.error('Error fetching docs list:', e);
    res.status(500).json({ error: 'Failed to fetch docs' });
  }
});

app.post('/api/docs', async (req, res) => {
  try {
    const body = req.body ?? {};
    const workspaceId = String(body.workspaceId || '').trim();
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es obligatorio' });
    }
    const title = (body.title && String(body.title).trim()) || 'Nuevo doc';
    const type = (body.type && String(body.type).trim()) || 'text';
    const content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content ?? {});
    const doc = await prisma.doc.create({
      data: {
        title,
        type,
        content,
        workspaceId,
        boardId: body.boardId ? String(body.boardId) : null,
        createdBy: body.createdBy ? String(body.createdBy) : null,
      },
    });
    res.status(201).json(doc);
  } catch (e) {
    console.error('Error creating doc:', e);
    const msg = e instanceof Error ? e.message : 'Failed to create doc';
    res.status(500).json({ error: msg });
  }
});

app.get('/api/docs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.doc.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: 'Doc no encontrado' });
    res.json(doc);
  } catch (e) {
    console.error('Error fetching doc:', e);
    res.status(500).json({ error: 'Failed to fetch doc' });
  }
});

app.patch('/api/docs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const data: { title?: string; content?: string; type?: string } = {};
    if (body.title !== undefined) data.title = String(body.title).trim() || 'Sin título';
    if (body.type !== undefined) data.type = String(body.type).trim() || 'text';
    if (body.content !== undefined) {
      data.content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content ?? {});
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    const doc = await prisma.doc.update({ where: { id }, data });
    res.json(doc);
  } catch (e) {
    console.error('Error updating doc:', e);
    if ((e as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Doc no encontrado' });
    }
    res.status(500).json({ error: 'Failed to update doc' });
  }
});

app.delete('/api/docs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.doc.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error('Error deleting doc:', e);
    if ((e as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Doc no encontrado' });
    }
    res.status(500).json({ error: 'Failed to delete doc' });
  }
});

// DELETE item (misma lógica que socket delete_item: persistencia en BD)
app.delete('/api/items/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId es obligatorio' });
    }
    await prisma.$transaction([
      prisma.columnValue.deleteMany({ where: { itemId } }),
      prisma.update.deleteMany({ where: { itemId } }),
      prisma.notification.deleteMany({ where: { itemId } }),
      prisma.item.delete({ where: { id: itemId } }),
    ]);
    res.status(204).send();
  } catch (e) {
    console.error('Error deleting item:', e);
    if ((e as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Item no encontrado' });
    }
    res.status(500).json({ error: 'Error al eliminar el elemento' });
  }
});

// Socket.io real-time connection handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ── ITEM EVENTS ──────────────────────────────────────────────────────────

  socket.on('update_item_name', async (data) => {
    try {
      const updated = await prisma.item.update({
        where: { id: data.itemId },
        data: { name: data.name },
        include: { columnValues: true },
      });
      io.emit('item_updated', updated);
    } catch (e) {
      console.error('Error updating item name:', e);
    }
  });

  socket.on('add_item', async (data) => {
    try {
      const { groupId, name, position } = data;
      const newItem = await prisma.item.create({
        data: { groupId, name, position },
        include: { columnValues: true }
      });
      io.emit('item_added', newItem);
    } catch (e) {
      console.error('Error adding item:', e);
    }
  });

  socket.on('move_item', async (data) => {
    try {
      const { itemId, newGroupId, newPosition } = data;
      const updated = await prisma.item.update({
        where: { id: itemId },
        data: { groupId: newGroupId, position: newPosition }
      });
      socket.broadcast.emit('item_moved', updated);
    } catch (err) {
      console.error('Error moving item:', err);
    }
  });

  socket.on('delete_item', async (data) => {
    try {
      const itemId = typeof data?.itemId === 'string' ? data.itemId : null;
      if (!itemId) {
        console.error('delete_item: itemId inválido', data);
        return;
      }
      await prisma.$transaction([
        prisma.columnValue.deleteMany({ where: { itemId } }),
        prisma.update.deleteMany({ where: { itemId } }),
        prisma.notification.deleteMany({ where: { itemId } }),
        prisma.item.delete({ where: { id: itemId } }),
      ]);
      io.emit('item_deleted', { itemId });
    } catch (e) {
      console.error('Error deleting item:', e);
    }
  });

  // ── COLUMN VALUE EVENTS ──────────────────────────────────────────────────

  socket.on('update_column_value', async (data) => {
    try {
      const { itemId, columnId, value } = data;
      const column = await prisma.boardColumn.findUnique({ where: { id: columnId } });
      const updated = await prisma.columnValue.upsert({
        where: { itemId_columnId: { itemId, columnId } },
        update: { value },
        create: { itemId, columnId, value }
      });
      io.emit('column_value_updated', updated);
      // Notificación al usuario asignado cuando se actualiza columna Personas
      if (column?.type === 'person' && value && typeof value === 'string' && value.trim()) {
        const assignedUserId = value.trim();
        const notif = await prisma.notification.create({
          data: { userId: assignedUserId, itemId, type: 'assigned', read: false },
        });
        io.emit('notification_created', notif);
      }
    } catch (e) {
      console.error('Error updating column value:', e);
    }
  });

  // ── BOARD EVENTS ───────────────────────────────────────────────────────────

  socket.on('rename_board', async (data) => {
    try {
      const { boardId, name } = data;
      const updated = await prisma.board.update({ where: { id: boardId }, data: { name: name.trim() } });
      io.emit('board_renamed', updated);
    } catch (e) {
      console.error('Error renaming board:', e);
    }
  });

  socket.on('add_board', async (data) => {
    try {
      let workspace = await prisma.workspace.findFirst();
      if (!workspace) {
        workspace = await prisma.workspace.create({
          data: { name: 'Main Workspace' },
        });
      }
      const name = (data.name && String(data.name).trim()) || 'Nuevo tablero';
      const newBoard = await prisma.board.create({
        data: { name, workspaceId: workspace.id },
      });
      io.emit('board_added', newBoard);
    } catch (e) {
      console.error('Error adding board:', e);
    }
  });

  // ── GROUP EVENTS ──────────────────────────────────────────────────────────

  socket.on('delete_group', async (data) => {
    try {
      const { groupId } = data;
      await prisma.group.delete({ where: { id: groupId } });
      io.emit('group_deleted', { groupId });
    } catch (e) {
      console.error('Error deleting group:', e);
    }
  });

  socket.on('add_group', async (data) => {
    try {
      const { boardId, name, color, position, parentGroupId } = data;
      const newGroup = await prisma.group.create({
        data: { boardId, name, color, position, parentGroupId: parentGroupId || null },
        include: { items: { include: { columnValues: true } } }
      });
      io.emit('group_added', newGroup);
    } catch (e) {
      console.error('Error adding group:', e);
    }
  });

  socket.on('rename_group', async (data) => {
    try {
      const { groupId, name, color } = data;
      const updateData: { name?: string; color?: string } = {};
      if (name !== undefined) updateData.name = name;
      if (color !== undefined) updateData.color = color;
      const updated = await prisma.group.update({ where: { id: groupId }, data: updateData });
      io.emit('group_renamed', updated);
    } catch (e) {
      console.error('Error renaming group:', e);
    }
  });

  socket.on('move_group', async (data) => {
    try {
      const { groupId, newPosition } = data;
      const updated = await prisma.group.update({ where: { id: groupId }, data: { position: newPosition } });
      socket.broadcast.emit('group_moved', updated);
    } catch (e) {
      console.error('Error moving group:', e);
    }
  });

  // ── COLUMN EVENTS ─────────────────────────────────────────────────────────

  socket.on('add_column', async (data) => {
    try {
      const { boardId, title, type, position, settings } = data;
      const newColumn = await prisma.boardColumn.create({
        data: { boardId, title, type, position, settings: settings || null }
      });
      io.emit('column_added', newColumn);
    } catch (e) {
      console.error('Error adding column:', e);
    }
  });

  socket.on('rename_column', async (data) => {
    try {
      const { columnId, title } = data;
      const updated = await prisma.boardColumn.update({ where: { id: columnId }, data: { title } });
      io.emit('column_renamed', updated);
    } catch (e) {
      console.error('Error renaming column:', e);
    }
  });

  socket.on('delete_column', async (data) => {
    try {
      const { columnId } = data;
      await prisma.columnValue.deleteMany({ where: { columnId } });
      await prisma.boardColumn.delete({ where: { id: columnId } });
      io.emit('column_deleted', { columnId });
    } catch (e) {
      console.error('Error deleting column:', e);
    }
  });

  // ── UPDATE / COMMENT EVENTS ───────────────────────────────────────────────

  socket.on('add_update', async (data) => {
    try {
      const { itemId, content, authorId } = data;
      const newUpdate = await prisma.update.create({
        data: { itemId, content, authorId: authorId }
      });
      
      // Let's also fetch the author user to send back the full object
      const user = await prisma.user.findUnique({ where: { id: authorId } });
      const enrichedUpdate = { ...newUpdate, authorUser: user };
      
      io.emit('update_added', enrichedUpdate);
    } catch (e) {
      console.error('Error adding update:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Sunday Server running on port ${PORT}`);
});
