import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { PrismaClient, Prisma } from '@prisma/client';
import { attachUserFromJwt, authenticateToken, hashPassword, requireAdmin, requireAuth, verifyPassword, signJwt, verifyJwt, verifyExportToken, signExportToken, getExportDocIdFromToken } from './auth';
import webpush from 'web-push';
import { getTemplatePathIfExists, getTemplateImagePathIfExists, generateFilledPdf, generatePdfFromTemplate, getTemplatesDir, TemplateKind, createPdfFromScreenshotPng } from './templatePdfGenerator';
import * as notificationsService from './services/notifications';

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

// En producción usar orígenes concretos (no '*'). Ejemplo: ALLOWED_ORIGINS=https://app.midominio.com,https://www.midominio.com
const rawOrigins = process.env.ALLOWED_ORIGINS || '*';
const allowedOrigins: string[] | '*' =
  rawOrigins.trim() === '*'
    ? '*'
    : rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);

const io = new Server(httpServer, {
  pingTimeout: 60000, // 60s — default 20s
  pingInterval: 25000, // 25s — default 25s
  connectTimeout: 45000, // 45s para VPN lentas
  transports: ['websocket', 'polling'], // polling como fallback VPN
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

let socketConnectionCount = 0;

// Configuración Web Push (VAPID)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Helper: envía una notificación Web Push a todas las suscripciones de un usuario
async function sendWebPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    const data = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            data
          );
        } catch (err: any) {
          // 410/404 => suscripción inválida: eliminarla
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error('Error enviando Web Push:', err);
          }
        }
      })
    );
  } catch (e) {
    console.error('Error en sendWebPushToUser:', e);
  }
}

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
    if (ok) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Tipo de archivo no permitido. Solo se aceptan JPG, PDF o Excel (xlsx/xls).'
        )
      );
    }
  },
});

app.use(
  cors({
    origin: allowedOrigins === '*' ? true : allowedOrigins,
  })
);
// Aumentar límite de JSON para soportar capturas PNG base64 desde el cliente (html2canvas)
app.use(express.json({ limit: '25mb' }));

// Logging estructurado (Fase 5): método, ruta, status, duración
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    console.log(JSON.stringify({ level, msg: 'request', method: req.method, path: req.path, statusCode: res.statusCode, durationMs }));
  });
  next();
});

app.use(attachUserFromJwt);

// Servir archivos subidos (URL pública: /uploads/nombre.jpg)
app.use('/uploads', express.static(UPLOAD_DIR));

// Health check (for frontend to verify backend is up); socketConnections para observabilidad
app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true, socketConnections: socketConnectionCount });
});

// Subir documento (JPG o PDF) (multipart/form-data, field: "file"); responde con la URL pública
app.post('/api/upload', authenticateToken, (req, res) => {
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
app.get('/api/workspaces', authenticateToken, async (_req, res) => {
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
    console.error('Error fetching workspaces:', error);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Create a new workspace
app.post('/api/workspaces', authenticateToken, async (req, res) => {
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

// Panel de Docs: listas de tareas por usuario (cada usuario solo ve las suyas)
app.get('/api/workspaces/:workspaceId/panel-notes', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
    const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { panelNotes: true } });
    if (!w) return res.status(404).json({ error: 'Workspace no encontrado' });
    let panelNotes: unknown[] = [];
    if (w.panelNotes && String(w.panelNotes).trim()) {
      try {
        const parsed = JSON.parse(w.panelNotes);
        const all = Array.isArray(parsed) ? parsed : [];
        if (userId) {
          panelNotes = all.filter((item: { ownerId?: string }) => item && String(item.ownerId) === userId);
        } else {
          panelNotes = all;
        }
      } catch {
        panelNotes = [];
      }
    }
    res.json({ panelNotes });
  } catch (e) {
    console.error('Error fetching panel notes:', e);
    res.status(500).json({ error: 'Failed to fetch panel notes' });
  }
});

app.patch('/api/workspaces/:workspaceId/panel-notes', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const body = req.body ?? {};
    const panelNotes = Array.isArray(body.panelNotes) ? body.panelNotes : undefined;
    const userId = typeof body.userId === 'string' ? body.userId : null;
    if (panelNotes === undefined) return res.status(400).json({ error: 'panelNotes es obligatorio (array)' });

    let merged: unknown[];
    if (userId) {
      const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { panelNotes: true } });
      if (!w) return res.status(404).json({ error: 'Workspace no encontrado' });
      let current: unknown[] = [];
      if (w.panelNotes && String(w.panelNotes).trim()) {
        try {
          const parsed = JSON.parse(w.panelNotes);
          current = Array.isArray(parsed) ? parsed : [];
        } catch {
          current = [];
        }
      }
      const others = current.filter((item: { ownerId?: string }) => item && String(item.ownerId) !== userId);
      const withOwner = panelNotes.map((n: { ownerId?: string; [k: string]: unknown }) => ({
        ...n,
        ownerId: n.ownerId ?? userId,
      }));
      merged = [...others, ...withOwner];
    } else {
      merged = panelNotes;
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        panelNotes: JSON.stringify(merged),
        panelNotesJson: merged as unknown as Prisma.JsonValue,
      },
    });
    const saved = JSON.parse(workspace.panelNotes || '[]');
    const toReturn = userId ? saved.filter((item: { ownerId?: string }) => String(item?.ownerId) === userId) : saved;
    res.json({ panelNotes: toReturn });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') return res.status(404).json({ error: 'Workspace no encontrado' });
    console.error('Error updating panel notes:', e);
    res.status(500).json({ error: 'Failed to update panel notes' });
  }
});

// Trabajo asignado al usuario (para pantalla Hoy agregada).
// Nota: no requiere authenticateToken para simplificar acceso desde móviles en desarrollo.
app.get('/api/my-work', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
    if (!userId) {
      return res.status(400).json({ error: 'userId es obligatorio' });
    }

    const boards = await prisma.board.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      select: {
        id: true,
        name: true,
        workspaceId: true,
        columns: { select: { id: true, type: true } },
        groups: {
          select: {
            id: true,
            name: true,
            items: {
              select: {
                id: true,
                name: true,
                columnValues: { select: { columnId: true, value: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const items: Array<{
      boardId: string;
      boardName: string;
      groupId: string;
      groupName: string;
      itemId: string;
      itemName: string;
    }> = [];

    // Versión simplificada: devolver TODOS los items de los tableros del workspace (o de todos)
    // para que Inicio siempre tenga contenido, aunque aún no filtremos por usuario.
    for (const board of boards) {
      for (const group of board.groups) {
        for (const item of group.items) {
          items.push({
            boardId: board.id,
            boardName: board.name,
            groupId: group.id,
            groupName: group.name,
            itemId: item.id,
            itemName: item.name,
          });
        }
      }
    }

    res.json({ items });
  } catch (e) {
    console.error('Error en /api/my-work:', e);
    res.status(500).json({ error: 'Error interno al obtener mi trabajo' });
  }
});

// Grupos de documentos por usuario (custom groups + assignments), mismo patrón que panel-notes
app.get('/api/workspaces/:workspaceId/doc-groups', authenticateToken, async (req, res) => {
  const defaultPayload = {
    groups: [] as { id: string; name: string }[],
    assignments: {} as Record<string, string>,
    subgroupsByType: {} as Record<string, { id: string; name: string }[]>,
    subgroupAssignments: {} as Record<string, string>,
  };
  try {
    const { workspaceId } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
    const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, docGroups: true } });
    if (!w) return res.status(404).json({ error: 'Workspace no encontrado' });
    const docGroupsRaw = (w as { docGroups?: string | null }).docGroups;
    if (docGroupsRaw && String(docGroupsRaw).trim()) {
      try {
        const parsed = JSON.parse(docGroupsRaw) as Record<string, {
          groups?: { id: string; name: string }[];
          assignments?: Record<string, string>;
          subgroupsByType?: Record<string, { id: string; name: string }[]>;
          subgroupAssignments?: Record<string, string>;
        }>;
        const userData = userId && parsed[userId] ? parsed[userId] : null;
        if (userData) {
          defaultPayload.groups = Array.isArray(userData.groups) ? userData.groups : [];
          defaultPayload.assignments = userData.assignments && typeof userData.assignments === 'object' ? userData.assignments : {};
          defaultPayload.subgroupsByType = userData.subgroupsByType && typeof userData.subgroupsByType === 'object' ? userData.subgroupsByType : {};
          defaultPayload.subgroupAssignments = userData.subgroupAssignments && typeof userData.subgroupAssignments === 'object' ? userData.subgroupAssignments : {};
        }
      } catch (_) {
        // keep defaults on parse error
      }
    }
    return res.json(defaultPayload);
  } catch (e) {
    console.error('Error fetching doc-groups:', e);
    // Defensivo: ante cualquier error (BD, modelo, etc.) devolver 200 con estructura vacía
    return res.status(200).json(defaultPayload);
  }
});

app.patch('/api/workspaces/:workspaceId/doc-groups', authenticateToken, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const body = req.body ?? {};
    const userId = typeof body.userId === 'string' ? body.userId : null;
    if (!userId) return res.status(400).json({ error: 'userId es obligatorio' });

    const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { docGroups: true } });
    if (!w) return res.status(404).json({ error: 'Workspace no encontrado' });

    let all: Record<string, { groups: { id: string; name: string }[]; assignments: Record<string, string> }> = {};
    if (w.docGroups && String(w.docGroups).trim()) {
      try {
        all = JSON.parse(w.docGroups);
        if (!all || typeof all !== 'object') all = {};
      } catch {
        all = {};
      }
    }

    let current = all[userId];
    if (!current || typeof current !== 'object') {
      current = { groups: [], assignments: {}, subgroupsByType: {}, subgroupAssignments: {} };
    }
    if (!current.subgroupsByType || typeof current.subgroupsByType !== 'object') current.subgroupsByType = {};
    if (!current.subgroupAssignments || typeof current.subgroupAssignments !== 'object') current.subgroupAssignments = {};
    if (Array.isArray(body.groups)) {
      current.groups = body.groups;
    }
    if (body.assignments !== undefined && typeof body.assignments === 'object') {
      current.assignments = body.assignments;
    }
    if (body.subgroupsByType !== undefined && typeof body.subgroupsByType === 'object') {
      current.subgroupsByType = body.subgroupsByType;
    }
    if (body.subgroupAssignments !== undefined && typeof body.subgroupAssignments === 'object') {
      current.subgroupAssignments = body.subgroupAssignments;
    }
    all[userId] = current;

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { docGroups: JSON.stringify(all) },
    });
    res.json({
      groups: current.groups,
      assignments: current.assignments,
      subgroupsByType: current.subgroupsByType,
      subgroupAssignments: current.subgroupAssignments,
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') return res.status(404).json({ error: 'Workspace no encontrado' });
    console.error('Error updating doc-groups:', e);
    res.status(500).json({ error: 'Failed to update doc-groups' });
  }
});

// Update workspace (rename, description)
app.patch('/api/workspaces/:id', authenticateToken, async (req, res) => {
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
app.delete('/api/workspaces/:id', authenticateToken, async (req, res) => {
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
app.get('/api/boards', authenticateToken, async (req, res) => {
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
app.post('/api/boards/:id/columns/reorder', authenticateToken, async (req, res) => {
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
app.post('/api/boards', authenticateToken, async (req, res) => {
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
app.delete('/api/boards/:id', authenticateToken, async (req, res) => {
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
app.get('/api/boards/first', authenticateToken, async (req, res) => {
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

// Ligar un doc/sheet guardado al elemento del tablero (ruta literal antes de /:id)
app.post('/api/boards/link-doc', authenticateToken, async (req, res) => {
  try {
    const body = req.body ?? {};
    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    const columnId = typeof body.columnId === 'string' ? body.columnId.trim() : '';
    const docId = typeof body.docId === 'string' ? body.docId.trim() : '';
    const docType = typeof body.docType === 'string' ? body.docType.trim() : '';
    if (!itemId || !columnId || !docId || !docType) {
      return res.status(400).json({ error: 'itemId, columnId, docId y docType son obligatorios' });
    }
    const validDocTypes = ['cotizacion', 'levantamiento', 'hoja_trabajo', 'sheet'];
    if (!validDocTypes.includes(docType)) {
      return res.status(400).json({ error: 'docType debe ser cotizacion, levantamiento, hoja_trabajo o sheet' });
    }
    const column = await prisma.boardColumn.findUnique({
      where: { id: columnId },
      select: { id: true, type: true, boardId: true },
    });
    if (!column) {
      return res.status(404).json({ error: 'Columna no encontrada' });
    }
    if (column.type === 'excel') {
      const value = JSON.stringify({ docId });
      const updated = await prisma.columnValue.upsert({
        where: { itemId_columnId: { itemId, columnId } },
        update: { value },
        create: { itemId, columnId, value },
      });
      if (column.boardId) {
        io.to(boardRoom(column.boardId)).emit('column_value_updated', updated);
      } else {
        io.emit('column_value_updated', updated);
      }
      return res.json({ ok: true, updated });
    }
    if (column.type === 'docs') {
      const existing = await prisma.columnValue.findUnique({
        where: { itemId_columnId: { itemId, columnId } },
      });
      let parsed: Record<string, unknown> = {};
      if (existing?.value) {
        try {
          parsed = JSON.parse(existing.value) as Record<string, unknown>;
        } catch {
          // mantener valor previo si no es JSON
        }
      }
      const docIdKey = docType === 'cotizacion' ? 'cotizacionDocId' : docType === 'levantamiento' ? 'levantamientoDocId' : 'hojaTrabajoDocId';
      parsed[docIdKey] = docId;
      const value = JSON.stringify(parsed);
      const updated = await prisma.columnValue.upsert({
        where: { itemId_columnId: { itemId, columnId } },
        update: { value },
        create: { itemId, columnId, value },
      });
      if (column.boardId) {
        io.to(boardRoom(column.boardId)).emit('column_value_updated', updated);
      } else {
        io.emit('column_value_updated', updated);
      }
      return res.json({ ok: true, updated });
    }
    return res.status(400).json({ error: 'Solo se puede ligar en columnas de tipo docs o excel' });
  } catch (e) {
    console.error('Error linking doc to board item:', e);
    res.status(500).json({ error: 'Error al ligar el documento' });
  }
});

app.get('/api/boards/:id', authenticateToken, async (req, res) => {
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
app.get('/api/items/:itemId/updates', authenticateToken, async (req, res) => {
  try {
    const updates = await prisma.update.findMany({
      where: { itemId: req.params.itemId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        itemId: true,
        authorId: true,
        author: {
          select: { id: true, username: true, name: true, initials: true, color: true },
        },
      },
    });
    const safe = updates.map(u => {
      const { author, ...rest } = u as any;
      if (!author) return { ...rest, author: null };
      const { password, ...safeAuthor } = author;
      return { ...rest, author: safeAuthor };
    });
    res.json(safe);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});

// --- Bandeja feed (publicaciones con @mentions) ---
app.get('/api/feed', authenticateToken, async (req, res) => {
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

app.post('/api/feed', authenticateToken, async (req, res) => {
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

    // Notificaciones Web Push a los usuarios mencionados (en background, no bloquea la respuesta)
    if (ids.length > 0) {
      const mentionedExcludingAuthor = ids.filter((id: string) => id !== authorId);
      if (mentionedExcludingAuthor.length > 0) {
        prisma.user
          .findMany({
            where: { id: { in: mentionedExcludingAuthor } },
            select: { id: true },
          })
          .then(async (mentionedUsers) => {
            const preview =
              content.length > 120 ? content.slice(0, 120) + '…' : content;
            for (const mu of mentionedUsers) {
              await sendWebPushToUser(mu.id, {
                title: 'Te mencionaron en Sunday',
                body: preview,
                url: '/inbox',
                tag: `mention-${post.id}`,
              });
            }
          })
          .catch((e) => console.error('Error enviando Web Push por mención:', e));
      }
    }
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
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const ok = await verifyPassword(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { status: 'available' },
    });
    const { password: _p, ...userWithoutPassword } = updated;
    const token = signJwt({ userId: updated.id, role: updated.role });
    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el login' });
  }
});

// Admin endpoint to create a new user
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, name, password, role: bodyRole } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya está registrado' });
    }

    const allowedRoles = ['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER'];
    const role = allowedRoles.includes(bodyRole) ? bodyRole : 'USER';

    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
    const colors = ['#00c875', '#fdab3d', '#e2445c', '#5559df', '#6e3cbb', '#0073ea'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        username,
        name,
        initials,
        color,
        password: passwordHash,
        role,
        status: 'offline',
      }
    });

    const { password: _p, ...userWithoutPassword } = newUser;
    // Broadcast global por ahora; en el futuro se puede segmentar por workspace o rol.
    // Global: lista de usuarios visible para todos; Fase 3+ podría usar room por workspace
    io.emit('user_added', userWithoutPassword);
    res.json(userWithoutPassword);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Get all users (sin enviar password)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    const safe = users.map(({ password: _p, ...u }) => u);
    res.json(safe);
  } catch (e) {
    console.error('Error fetching users:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Actualizar datos básicos de un usuario (solo ADMIN)
app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, password, role: bodyRole } = req.body ?? {};

    const data: {
      name?: string;
      username?: string;
      password?: string;
      role?: string;
    } = {};

    if (typeof name === 'string' && name.trim()) {
      data.name = name.trim();
    }

    if (typeof username === 'string' && username.trim()) {
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser && existingUser.id !== id) {
        return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
      }
      data.username = username.trim();
    }

    if (typeof password === 'string' && password.trim()) {
      data.password = await hashPassword(password);
    }

    if (typeof bodyRole === 'string') {
      const allowedRoles = ['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER'];
      if (!allowedRoles.includes(bodyRole)) {
        return res.status(400).json({ error: 'Rol inválido' });
      }
      data.role = bodyRole;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    const { password: _p, ...safe } = updated;
    // Broadcast global por ahora; en el futuro se puede segmentar por workspace o rol.
    // Global: lista de usuarios; Fase 3+ podría usar room por workspace
    io.emit('user_updated', safe);
    res.json(safe);
  } catch (e) {
    console.error('Error updating user:', e);
    if ((e as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Actualizar estado del usuario (solo el propio usuario)
app.patch('/api/users/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const valid = ['available', 'busy', 'offline'];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido. Use: available, busy u offline' });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Cualquier usuario puede cambiar solo su propio estado
    if (req.authUser?.id !== id) {
      return res.status(403).json({ error: 'Solo puedes cambiar tu propio estado' });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { status },
    });
    const { password: _p, ...safe } = updated;
    res.json(safe);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// Eliminar usuario (solo ADMIN)
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (req.authUser && target.id === req.authUser.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar usuario' });
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

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const notifications = await notificationsService.findManyByUserId(prisma, userId);
    res.json(notifications);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await notificationsService.markAsRead(prisma, id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    await notificationsService.markAllAsRead(prisma, userId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed' });
  }
});

// --- Web Push API (suscripciones PWA) ---

// Devuelve la clave pública VAPID para que el frontend pueda suscribirse
app.get('/api/push/public-key', (_req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Web Push no configurado (falta VAPID_PUBLIC_KEY)' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Registrar/actualizar una suscripción Web Push para un usuario
app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const { userId, subscription } = req.body ?? {};
    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'userId y subscription válidos son obligatorios' });
    }
    const { endpoint, keys } = subscription;
    const existing = await prisma.pushSubscription.findFirst({
      where: { userId: String(userId), endpoint: String(endpoint) },
    });
    if (existing) {
      const updated = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          p256dh: String(keys.p256dh),
          auth: String(keys.auth),
        },
      });
      return res.json(updated);
    }
    const created = await prisma.pushSubscription.create({
      data: {
        userId: String(userId),
        endpoint: String(endpoint),
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
      },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('Error registrando suscripción push:', e);
    res.status(500).json({ error: 'Error al registrar suscripción push' });
  }
});

// Eliminar una suscripción (opcional)
app.post('/api/push/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const { userId, endpoint } = req.body ?? {};
    if (!userId || !endpoint) {
      return res.status(400).json({ error: 'userId y endpoint son obligatorios' });
    }
    await prisma.pushSubscription.deleteMany({
      where: { userId: String(userId), endpoint: String(endpoint) },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error eliminando suscripción push:', e);
    res.status(500).json({ error: 'Error al eliminar suscripción push' });
  }
});

// --- Export folders: copiar archivos de uploads a ~/SundayExports (solo ítems asignados al usuario) ---
import os from 'os';

const EXPORT_BASE = path.join(os.homedir(), 'SundayExports');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function sanitizeFolderName(name: string): string {
  return (name || '').replace(/[<>:"/\\|?*]/g, '_').trim() || 'Sin_nombre';
}

function isAssignedToUser(columnValues: { columnId: string; value: string }[], personColumnId: string, userId: string): boolean {
  const cv = columnValues.find(v => v.columnId === personColumnId);
  if (!cv?.value) return false;
  const raw = cv.value.trim();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.includes(userId);
    return String(parsed) === userId;
  } catch {
    return raw === userId;
  }
}

app.post('/api/export/folders', authenticateToken, async (req, res) => {
  const errors: string[] = [];
  let copied = 0;
  let skipped = 0;
  try {
    const { userId, boardId } = req.body ?? {};
    if (!userId || !boardId) {
      return res.status(400).json({ error: 'userId y boardId son obligatorios' });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
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

    const personCol = board.columns.find(c => c.type === 'person');
    const fileColumns = board.columns.filter(c => c.type === 'docs' || c.type === 'excel' || c.type === 'file');

    const allGroups = board.groups as { id: string; name: string; parentGroupId: string | null; items: { id: string; name: string; columnValues: { columnId: string; value: string }[] }[] }[];
    const getChildren = (parentId: string) => allGroups.filter(g => g.parentGroupId === parentId);
    const rootGroups = allGroups.filter(g => !g.parentGroupId);

    const fsPromises = fs.promises;

    for (const rootGroup of rootGroups) {
      const yearMonth = sanitizeFolderName(rootGroup.name);
      const clientGroups = getChildren(rootGroup.id);
      const targetClients = clientGroups.length > 0 ? clientGroups : [rootGroup];

      for (const client of targetClients) {
        const clientName = sanitizeFolderName(client.name);
        for (const item of client.items) {
          if (!personCol || !isAssignedToUser(item.columnValues, personCol.id, String(userId))) continue;

          const itemName = sanitizeFolderName(item.name || 'Elemento');
          const itemDir = path.join(EXPORT_BASE, yearMonth, clientName, itemName);

          for (const col of fileColumns) {
            const cv = item.columnValues.find(v => v.columnId === col.id);
            if (!cv?.value) continue;
            const value = cv.value.trim();
            if (!value.startsWith('/uploads/')) continue;

            const filename = path.basename(value);
            if (!filename) continue;
            const srcPath = path.join(UPLOADS_DIR, filename);
            const destPath = path.join(itemDir, filename);

            try {
              await fsPromises.access(srcPath, fs.constants.F_OK);
            } catch {
              errors.push(`Origen no encontrado: ${value}`);
              continue;
            }

            try {
              await fsPromises.access(destPath, fs.constants.F_OK);
              skipped++;
              continue;
            } catch {
              // dest no existe, continuamos
            }

            try {
              await fsPromises.mkdir(itemDir, { recursive: true });
              await fsPromises.copyFile(srcPath, destPath);
              copied++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              errors.push(`${filename}: ${msg}`);
            }
          }
        }
      }
    }

    return res.json({
      ok: true,
      exportPath: EXPORT_BASE,
      copied,
      skipped,
      errors,
    });
  } catch (e) {
    console.error('Export folders error:', e);
    return res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : 'Error al exportar carpetas',
      copied,
      skipped,
      errors,
    });
  }
});

// --- Docs API (simple docs/sheets por workspace/board) ---
// Comprobar que las rutas de docs están cargadas (útil si POST /api/docs da 404)
app.get('/api/docs/check', (_req, res) => {
  res.json({ ok: true, docs: true });
});

app.get('/api/docs', authenticateToken, async (req, res) => {
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

app.post('/api/docs', authenticateToken, async (req, res) => {
  try {
    const body = req.body ?? {};
    const workspaceId = String(body.workspaceId || '').trim();
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId es obligatorio' });
    }
    const title = (body.title && String(body.title).trim()) || 'Nuevo doc';
    const type = (body.type && String(body.type).trim()) || 'text';
    const rawContent = body.content ?? {};
    const content =
      typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const contentJson =
      typeof rawContent === 'string'
        ? (JSON.parse(rawContent) as unknown as Prisma.JsonValue)
        : (rawContent as unknown as Prisma.JsonValue);
    const doc = await prisma.doc.create({
      data: {
        title,
        type,
        content,
        contentJson,
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

// --- Configuración de plantilla de cotización (por workspace) ----------------

// Endpoints antiguos de configuración de plantilla de cotización se han
// eliminado para simplificar el flujo. Ahora la generación usa únicamente
// la plantilla PDF base y las posiciones definidas en templatePdfGenerator.ts.

// HEAD para comprobar existencia del doc (usado por DocsCellRenderer sin cuerpo)
app.head('/api/docs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.doc.findUnique({ where: { id }, select: { id: true } });
    if (!doc) return res.status(404).end();
    res.status(200).end();
  } catch (e) {
    console.error('Error checking doc:', e);
    res.status(500).end();
  }
});

// Cache de contenido para exportación por captura: mismo contenido que el preview (draft actual).
const exportContentCache = new Map<string, { content: Record<string, unknown>; docId: string; docType: string; expires: number }>();
const EXPORT_CONTENT_TTL_MS = 120_000; // 2 min

function cleanupExportContentCache(): void {
  const now = Date.now();
  for (const [key, entry] of exportContentCache.entries()) {
    if (entry.expires < now) exportContentCache.delete(key);
  }
}

app.get('/api/docs/export-content', (req, res) => {
  const token = (req.query.token as string)?.trim();
  const contentKey = (req.query.contentKey as string)?.trim();
  if (!token || !contentKey) return res.status(400).json({ error: 'Faltan token o contentKey' });
  try {
    const { docId } = verifyExportToken(token);
    cleanupExportContentCache();
    const entry = exportContentCache.get(contentKey);
    if (!entry) return res.status(404).json({ error: 'Contenido de exportación expirado o ya usado' });
    if (entry.docId !== docId) return res.status(403).json({ error: 'No autorizado' });
    exportContentCache.delete(contentKey);
    res.json({ content: entry.content, docType: entry.docType });
  } catch {
    res.status(401).json({ error: 'Token de exportación inválido o expirado' });
  }
});

// Verificación de token de exportación (sin auth de sesión)
app.get('/api/docs/export-verify', (req, res) => {
  const token = (req.query.token as string)?.trim();
  if (!token) return res.status(400).json({ error: 'Falta token' });
  try {
    const { docId } = verifyExportToken(token);
    res.json({ docId });
  } catch {
    res.status(401).json({ error: 'Token de exportación inválido o expirado' });
  }
});

app.get('/api/docs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const auth = req.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const exportDocId = token ? getExportDocIdFromToken(token) : null;
    if (exportDocId != null && exportDocId !== id) {
      return res.status(403).json({ error: 'No autorizado para este documento' });
    }
    const doc = await prisma.doc.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: 'Doc no encontrado' });
    res.json(doc);
  } catch (e) {
    console.error('Error fetching doc:', e);
    res.status(500).json({ error: 'Failed to fetch doc' });
  }
});

app.patch('/api/docs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const data: { title?: string; content?: string; type?: string; contentJson?: Prisma.JsonValue } = {};
    if (body.title !== undefined) data.title = String(body.title).trim() || 'Sin título';
    if (body.type !== undefined) data.type = String(body.type).trim() || 'text';
    if (body.content !== undefined) {
      const rawContent = body.content;
      data.content =
        typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent ?? {});
      data.contentJson =
        typeof rawContent === 'string'
          ? (JSON.parse(rawContent) as unknown as Prisma.JsonValue)
          : (rawContent as unknown as Prisma.JsonValue);
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

app.delete('/api/docs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // 1) Eliminar el doc
    await prisma.doc.delete({ where: { id } });

    // 2) Limpiar referencias en columnas de tipo docs/excel donde este id esté como docId
    try {
      const relevantColumns = await prisma.boardColumn.findMany({
        where: {
          type: { in: ['docs', 'excel'] },
        },
        select: { id: true, type: true },
      });

      if (relevantColumns.length > 0) {
        const columnMap = new Map<string, string>();
        for (const c of relevantColumns) {
          columnMap.set(c.id, c.type);
        }
        const columnIds = relevantColumns.map((c) => c.id);

        const columnValues = await prisma.columnValue.findMany({
          where: {
            columnId: { in: columnIds },
          },
        });

        for (const cv of columnValues) {
          const colType = columnMap.get(cv.columnId);
          if (!cv.value || !colType) continue;

          let changed = false;
          let nextValue: string | null = cv.value;

          if (colType === 'excel') {
            // Formato esperado: { docId?: string; url?: string }
            let parsed: { docId?: string; url?: string } | null = null;
            try {
              parsed = JSON.parse(cv.value);
            } catch {
              parsed = null;
            }
            if (parsed) {
              if (String(parsed.docId || '') === String(id)) {
                delete parsed.docId;
                changed = true;
              }
              if (!parsed.docId && !parsed.url) {
                nextValue = '';
              } else {
                nextValue = JSON.stringify(parsed);
              }
            }
          } else if (colType === 'docs') {
            // Formato esperado: JSON con posibles claves *DocId
            let parsed: Record<string, unknown> | null = null;
            try {
              parsed = JSON.parse(cv.value);
            } catch {
              parsed = null;
            }
            if (parsed) {
              const keys: Array<keyof typeof parsed> = [
                'cotizacionDocId',
                'levantamientoDocId',
                'hojaTrabajoDocId',
              ];
              for (const k of keys) {
                if (String(parsed[k] ?? '') === String(id)) {
                  delete parsed[k];
                  changed = true;
                }
              }
              if (Object.keys(parsed).length === 0) {
                nextValue = '';
              } else {
                nextValue = JSON.stringify(parsed);
              }
            }
          }

          if (changed) {
            const updated = await prisma.columnValue.update({
              where: { id: cv.id },
              data: { value: nextValue ?? '' },
            });
            io.emit('column_value_updated', updated);
          }
        }
      }
    } catch (cleanupErr) {
      console.error('Error limpiando referencias de doc en columnas:', cleanupErr);
    }

    res.status(204).send();
  } catch (e) {
    console.error('Error deleting doc:', e);
    if ((e as { code?: string })?.code === 'P2025') {
      return res.status(404).json({ error: 'Doc no encontrado' });
    }
    res.status(500).json({ error: 'Failed to delete doc' });
  }
});

// ── Templates (PDF plantillas para cotización, levantamiento, hoja de trabajo) ────────────────
const TEMPLATE_KINDS = ['cotizacion', 'levantamiento', 'hoja_trabajo'] as const;

app.get('/api/templates/:kind', authenticateToken, (req, res) => {
  const kind = req.params.kind as string;
  if (!TEMPLATE_KINDS.includes(kind as (typeof TEMPLATE_KINDS)[number])) {
    return res.status(400).json({ error: 'Tipo de plantilla no válido' });
  }
  const templatePath = getTemplatePathIfExists(kind as (typeof TEMPLATE_KINDS)[number]);
  if (templatePath) {
    res.setHeader('Content-Type', 'application/pdf');
    return res.sendFile(templatePath, (err) => {
      if (err) res.status(500).json({ error: 'Error al enviar plantilla' });
    });
  }
  const templateImage = getTemplateImagePathIfExists(kind as (typeof TEMPLATE_KINDS)[number]);
  if (templateImage) {
    res.setHeader('Content-Type', templateImage.isPng ? 'image/png' : 'image/jpeg');
    return res.sendFile(templateImage.path, (err) => {
      if (err) res.status(500).json({ error: 'Error al enviar plantilla' });
    });
  }
  return res.status(404).json({ error: 'Plantilla no encontrada. Coloca el PDF o JPG en backend/templates/' + kind + '.pdf (o .jpg)' });
});

// Subida de plantilla PDF base diseñada en Illustrator/Corel para un tipo concreto.
// Solo ADMIN. Guarda el archivo como backend/templates/<kind>.pdf
app.post(
  '/api/templates/:kind/upload',
  authenticateToken,
  requireAdmin,
  upload.single('file'),
  async (req, res) => {
    try {
      const kind = req.params.kind as (typeof TEMPLATE_KINDS)[number];
      if (!TEMPLATE_KINDS.includes(kind)) {
        return res.status(400).json({ error: 'Tipo de plantilla no válido' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No se envió ningún archivo' });
      }
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Solo se aceptan archivos PDF para plantillas' });
      }

      const templatesDir = getTemplatesDir();
      try {
        fs.mkdirSync(templatesDir, { recursive: true });
      } catch {
        // ignorar si ya existe
      }
      const targetPath = path.join(templatesDir, `${kind}.pdf`);
      fs.copyFileSync(req.file.path, targetPath);

      return res.status(201).json({
        ok: true,
        kind,
        path: `/templates/${kind}.pdf`,
      });
    } catch (e) {
      console.error('Error subiendo plantilla PDF:', e);
      return res.status(500).json({ error: 'Error al subir plantilla PDF' });
    }
  }
);

// Relleno directo de plantilla PDF con pdf-lib.
// Paso 1: solo cotización con 3 campos básicos (cliente, fecha, total).
app.post('/api/templates/:kind/fill', authenticateToken, async (req, res) => {
  try {
    const kind = req.params.kind as (typeof TEMPLATE_KINDS)[number];
    if (!TEMPLATE_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'Tipo de plantilla no válido' });
    }
    const body = req.body ?? {};
    const fields = (body.fields ?? {}) as Record<string, string | number | null | undefined>;

    const buffer = await generateFilledPdf(kind as TemplateKind, fields);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${kind}.pdf"`);
    return res.send(buffer);
  } catch (e) {
    console.error('Error rellenando plantilla PDF:', e);
    const msg = e instanceof Error ? e.message : 'Error al generar PDF desde plantilla';
    if (msg.includes('Plantilla') && msg.includes('no encontrada')) {
      return res.status(404).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Generación PDF: con docId intentamos captura del preview (idéntico); si falla o no hay docId, pdf-lib o Puppeteer.
app.post('/api/templates/:kind/generate', authenticateToken, async (req, res) => {
  console.log(`[PDF] Generating ${req.params.kind}...`);
  try {
    const kind = req.params.kind as string;
    if (!TEMPLATE_KINDS.includes(kind as (typeof TEMPLATE_KINDS)[number])) {
      return res.status(400).json({ error: 'Tipo de plantilla no válido' });
    }
    const rawContent = req.body?.content;
    const content =
      rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)
        ? (rawContent as Record<string, unknown>)
        : {};
    const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? String(req.body.imageDataUrl) : null;
    const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : null;
    const templatePdfPath = getTemplatePathIfExists(kind as (typeof TEMPLATE_KINDS)[number]);

    // Plantilla PDF: rellenar con pdf-lib (misma plantilla + customBoxes que el preview).
    // Para cotización priorizamos siempre la plantilla vectorial. Si algo falla, caemos
    // automáticamente al flujo html-worker para no bloquear la descarga.
    if (templatePdfPath) {
      try {
        const buffer = await generatePdfFromTemplate(kind as TemplateKind, content);
        res.setHeader('X-PDF-Method', 'template');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="' + kind + '.pdf"');
        return res.send(buffer);
      } catch (err) {
        console.error('[PDF] Error in generatePdfFromTemplate, falling back to html-worker:', err);
      }
    }

    const { generatePdfFromDocument } = await import('./htmlPdfGenerator');
    const buffer = await generatePdfFromDocument({
      content,
      format: 'Letter',
      templatePdfPath: templatePdfPath ?? undefined,
    });
    res.setHeader('X-PDF-Method', 'html-worker');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + kind + '.pdf"');
    res.send(buffer);
  } catch (e) {
    console.error('Error generating PDF:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al generar PDF' });
  }
});

// En producción, servir el frontend compilado (Vite build) desde Express.
// Asume que el build vive en ../frontend/dist relativo al backend.
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(process.cwd(), '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    const indexHtml = path.join(frontendDist, 'index.html');
    fs.access(indexHtml, fs.constants.F_OK, (err) => {
      if (err) return next();
      res.sendFile(indexHtml);
    });
  });
}

// Configuración global de plantilla (posiciones, fuente). GET: todos; PUT: guardar por usuario.
function getDefaultTemplateConfig() {
  return {
    fieldPositions: {} as Record<string, { x: number; y: number }>,
    fontColor: '#000000',
    fontFamily: 'Helvetica',
    fontSize: 11,
    fontBold: false,
    fontItalic: false,
    customBoxes: [] as Array<Record<string, unknown>>,
  };
}

app.get('/api/templates/:kind/config', authenticateToken, async (req, res) => {
  const defaultConfig = getDefaultTemplateConfig();
  try {
    const kind = req.params.kind as string;
    if (!TEMPLATE_KINDS.includes(kind as (typeof TEMPLATE_KINDS)[number])) {
      return res.status(400).json({ error: 'Tipo de plantilla no válido' });
    }
    const row = await prisma.templateConfig.findUnique({ where: { docType: kind } });
    if (!row) return res.json(defaultConfig);
    try {
      defaultConfig.fieldPositions = typeof row.fieldPositions === 'string' ? JSON.parse(row.fieldPositions) : (row.fieldPositions as Record<string, { x: number; y: number }>) ?? {};
    } catch (_) {}
    try {
      const raw = row.customBoxes;
      defaultConfig.customBoxes = typeof raw === 'string' ? (JSON.parse(raw) || []) : (Array.isArray(raw) ? raw : []);
    } catch (_) {
      defaultConfig.customBoxes = [];
    }
    defaultConfig.fontColor = row.fontColor || '#000000';
    defaultConfig.fontFamily = row.fontFamily || 'Helvetica';
    defaultConfig.fontSize = row.fontSize ?? 11;
    defaultConfig.fontBold = row.fontBold ?? false;
    defaultConfig.fontItalic = row.fontItalic ?? false;
    return res.json(defaultConfig);
  } catch (e) {
    console.error('Error fetching template config:', e);
    // Defensivo: tabla inexistente, excepción, etc. → 200 con config por defecto
    return res.status(200).json(defaultConfig);
  }
});

app.put('/api/templates/:kind/config', authenticateToken, async (req, res) => {
  try {
    const kind = req.params.kind as string;
    if (!TEMPLATE_KINDS.includes(kind as (typeof TEMPLATE_KINDS)[number])) {
      return res.status(400).json({ error: 'Tipo de plantilla no válido' });
    }
    const body = req.body || {};
    const userIdRaw =
      (body.userId as string) ||
      (req.query.userId as string) ||
      (req.get('X-User-Id') ?? '').trim() ||
      '';
    const userIdTrim = typeof userIdRaw === 'string' ? userIdRaw.trim() : '';
    const usernameTrim = typeof body.username === 'string' ? body.username.trim() : (req.get('X-User-Username') ?? '').trim();
    if (!userIdTrim && !usernameTrim) {
      return res.status(403).json({ error: 'Se requiere userId o username (body, query o header)' });
    }
    let user = userIdTrim ? await prisma.user.findUnique({ where: { id: userIdTrim } }) : null;
    if (!user && usernameTrim) {
      user = await prisma.user.findUnique({ where: { username: usernameTrim } });
    }
    if (!user) {
      return res.status(403).json({ error: 'Usuario no encontrado. Cierra sesión y vuelve a iniciar sesión para actualizar tu usuario.' });
    }
    const fieldPositions = body.fieldPositions != null ? body.fieldPositions : {};
    const fontColor = typeof body.fontColor === 'string' ? body.fontColor : '#000000';
    const fontFamily = typeof body.fontFamily === 'string' ? body.fontFamily : 'Helvetica';
    const fontSize = typeof body.fontSize === 'number' ? Math.max(8, Math.min(24, body.fontSize)) : (typeof body.fontSize === 'string' ? Math.max(8, Math.min(24, parseInt(body.fontSize, 10) || 11)) : 11);
    const fontBold = body.fontBold === true || body.fontBold === 'true';
    const fontItalic = body.fontItalic === true || body.fontItalic === 'true';
    const customBoxes = Array.isArray(body.customBoxes) ? body.customBoxes : [];
    const fieldPositionsStr =
      typeof fieldPositions === 'object' && fieldPositions !== null
        ? JSON.stringify(fieldPositions)
        : '{}';
    const customBoxesStr = JSON.stringify(customBoxes);
    await prisma.templateConfig.upsert({
      where: { docType: kind },
      create: {
        docType: kind,
        fieldPositions: fieldPositionsStr,
        fieldPositionsJson: fieldPositions as unknown as Prisma.JsonValue,
        fontColor,
        fontFamily,
        fontSize,
        fontBold,
        fontItalic,
        customBoxes: customBoxesStr,
        customBoxesJson: customBoxes as unknown as Prisma.JsonValue,
      },
      update: {
        fieldPositions: fieldPositionsStr,
        fieldPositionsJson: fieldPositions as unknown as Prisma.JsonValue,
        fontColor,
        fontFamily,
        fontSize,
        fontBold,
        fontItalic,
        customBoxes: customBoxesStr,
        customBoxesJson: customBoxes as unknown as Prisma.JsonValue,
      },
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('Error saving template config:', e);
    const err = e as { code?: string };
    if (err?.code === 'P2021' || (typeof (e as Error).message === 'string' && (e as Error).message?.includes('does not exist'))) {
      return res.status(503).json({
        error: 'La tabla de configuración de plantillas no existe. Ejecuta: npx prisma migrate deploy o npx prisma db push',
      });
    }
    const msg = e instanceof Error ? e.message : 'Error al guardar configuración de plantilla';
    return res.status(500).json({ error: msg });
  }
});

// ── Calendar-only events (no se crean en tablero ni grupo) ─────────────────
app.get('/api/boards/:boardId/calendar-events', authenticateToken, async (req, res) => {
  try {
    const boardId = req.params.boardId;
    const events = await prisma.calendarEvent.findMany({
      where: { boardId },
      orderBy: { eventDate: 'asc' },
    });
    res.json(events);
  } catch (e) {
    console.error('Error fetching calendar events:', e);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

app.post('/api/boards/:boardId/calendar-events', authenticateToken, async (req, res) => {
  try {
    const boardId = req.params.boardId;
    const { name, eventType, date, time } = req.body as { name?: string; eventType?: string; date?: string; time?: string };
    if (!eventType || !date) {
      return res.status(400).json({ error: 'eventType y date son obligatorios' });
    }
    // Parsear YYYY-MM-DD y HH:mm como día civil + hora (evita desfase por UTC)
    const parts = String(date).trim().split('-').map(Number);
    const [y, m, day] = parts.length >= 3 ? [parts[0], parts[1] - 1, parts[2]] : [0, 0, 0];
    const timeStr = time ? String(time).trim() : '09:00';
    const [hh, mm] = timeStr.split(':').map(n => (n !== undefined && n !== '' ? Number(n) : NaN));
    const eventDate = new Date(y, m, day, Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
    if (isNaN(eventDate.getTime())) {
      return res.status(400).json({ error: 'Fecha inválida' });
    }
    const event = await prisma.calendarEvent.create({
      data: {
        boardId,
        eventDate,
        name: (name && String(name).trim()) || 'Evento',
        eventType: String(eventType),
      },
    });
    io.to(boardRoom(boardId)).emit('calendar_event_added', event);
    res.status(201).json(event);
  } catch (e) {
    console.error('Error creating calendar event:', e);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

app.patch('/api/boards/:boardId/calendar-events/:eventId', authenticateToken, async (req, res) => {
  try {
    const { boardId, eventId } = req.params;
    const { name, eventType, date, time } = req.body as { name?: string; eventType?: string; date?: string; time?: string };
    const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, boardId } });
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' });
    const updates: { name?: string; eventType?: string; eventDate?: Date } = {};
    if (name !== undefined) updates.name = String(name).trim() || existing.name;
    if (eventType !== undefined) updates.eventType = String(eventType);
    if (date !== undefined && time !== undefined) {
      const parts = String(date).trim().split('-').map(Number);
      const [y, m, day] = parts.length >= 3 ? [parts[0], parts[1] - 1, parts[2]] : [existing.eventDate.getFullYear(), existing.eventDate.getMonth(), existing.eventDate.getDate()];
      const [hh, mm] = String(time).trim().split(':').map(n => (n !== undefined && n !== '' ? Number(n) : NaN));
      updates.eventDate = new Date(y, m, day, Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
    }
    const event = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: updates,
    });
    io.to(boardRoom(boardId)).emit('calendar_event_updated', event);
    res.json(event);
  } catch (e) {
    console.error('Error updating calendar event:', e);
    res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

app.delete('/api/boards/:boardId/calendar-events/:eventId', authenticateToken, async (req, res) => {
  try {
    const { boardId, eventId } = req.params;
    await prisma.calendarEvent.deleteMany({ where: { id: eventId, boardId } });
    io.to(boardRoom(boardId)).emit('calendar_event_deleted', { boardId, eventId });
    res.status(204).send();
  } catch (e) {
    console.error('Error deleting calendar event:', e);
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

// DELETE item (misma lógica que socket delete_item: persistencia en BD)
app.delete('/api/items/:id', authenticateToken, async (req, res) => {
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

// Helper: room por tablero y por usuario (Fase 3)
const boardRoom = (boardId: string) => `board:${boardId}`;
const userRoom = (userId: string) => `user:${userId}`;

// Socket.io real-time connection handler
io.on('connection', (socket) => {
  socketConnectionCount += 1;
  console.log(JSON.stringify({ level: 'info', msg: 'socket_connected', socketId: socket.id, connectionCount: socketConnectionCount }));

  // Autenticación por JWT en handshake: unir al room del usuario para notificaciones/comentarios
  const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
  if (token && typeof token === 'string') {
    try {
      const payload = verifyJwt(token);
      socket.join(userRoom(payload.userId));
      (socket as any).data = { ...((socket as any).data || {}), userId: payload.userId };
    } catch {
      // Token inválido o expirado: no unir a user room
    }
  }

  socket.on('join_board', (data: { boardId?: string }) => {
    const boardId = typeof data?.boardId === 'string' ? data.boardId : null;
    if (!boardId) return;
    socket.join(boardRoom(boardId));
  });

  socket.on('leave_board', (data: { boardId?: string }) => {
    const boardId = typeof data?.boardId === 'string' ? data.boardId : null;
    if (!boardId) return;
    socket.leave(boardRoom(boardId));
  });

  // ── ITEM EVENTS ──────────────────────────────────────────────────────────

  socket.on('update_item_name', async (data) => {
    try {
      const updated = await prisma.item.update({
        where: { id: data.itemId },
        data: { name: data.name },
        include: {
          columnValues: true,
          group: { select: { boardId: true } },
        },
      });
      const room = boardRoom(updated.group.boardId);
      io.to(room).emit('item_updated', updated);
    } catch (e) {
      console.error('Error updating item name:', e);
    }
  });

  socket.on('add_item', async (data) => {
    try {
      const { groupId, name, position, initialColumnValues } = data as {
        groupId: string;
        name: string;
        position: number;
        initialColumnValues?: { columnId: string; value: string }[];
      };
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { boardId: true },
      });
      if (!group) return;
      const newItem = await prisma.item.create({
        data: { groupId, name, position },
        include: { columnValues: true },
      });
      if (Array.isArray(initialColumnValues) && initialColumnValues.length > 0) {
        for (const cv of initialColumnValues) {
          if (cv?.columnId && typeof cv.value === 'string') {
            await prisma.columnValue.upsert({
              where: { itemId_columnId: { itemId: newItem.id, columnId: cv.columnId } },
              update: { value: cv.value },
              create: { itemId: newItem.id, columnId: cv.columnId, value: cv.value }
            });
          }
        }
        const withValues = await prisma.item.findUnique({
          where: { id: newItem.id },
          include: { columnValues: true }
        });
        io.to(boardRoom(group.boardId)).emit('item_added', withValues ?? newItem);
      } else {
        io.to(boardRoom(group.boardId)).emit('item_added', newItem);
      }
    } catch (e) {
      console.error('Error adding item:', e);
    }
  });

  socket.on('move_item', async (data) => {
    try {
      const { itemId, newGroupId, newPosition } = data;
      const updated = await prisma.item.update({
        where: { id: itemId },
        data: { groupId: newGroupId, position: newPosition },
        include: {
          group: { select: { boardId: true } },
        },
      });
      const room = boardRoom(updated.group.boardId);
      socket.to(room).emit('item_moved', updated);
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
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: { group: { select: { boardId: true } } },
      });
      await prisma.$transaction([
        prisma.columnValue.deleteMany({ where: { itemId } }),
        prisma.update.deleteMany({ where: { itemId } }),
        prisma.notification.deleteMany({ where: { itemId } }),
        prisma.item.delete({ where: { id: itemId } }),
      ]);
      if (item?.group?.boardId) {
        io.to(boardRoom(item.group.boardId)).emit('item_deleted', { itemId });
      } else {
        // Caso raro sin boardId: mantener global por compatibilidad.
        io.emit('item_deleted', { itemId });
      }
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
      if (column) {
        io.to(boardRoom(column.boardId)).emit('column_value_updated', updated);
      } else {
        // Fallback global si no hay board asociado.
        io.emit('column_value_updated', updated);
      }

      // Regla Taller→Facturación: al marcar "colocado" se crea columna "Estado Facturación" si no existe
      // y se setea "Pendiente de facturar". Si el board ya tiene una columna "Estado Facturación" con
      // otra configuración, se usa esa columna (puede haber conflicto de opciones).
      if (
        column &&
        (column.type === 'status' || column.type === 'priority') &&
        column.title === 'Estado Taller' &&
        typeof value === 'string' &&
        value.trim()
      ) {
        try {
          const parsed = JSON.parse(value);
          const optionId = parsed?.optionId as string | undefined;
          if (optionId === 'colocado') {
            // Asegurar que exista la columna "Estado Facturación" en el mismo board
            let billingColumn = await prisma.boardColumn.findFirst({
              where: {
                boardId: column.boardId,
                title: 'Estado Facturación',
                type: 'status',
              },
            });

            if (!billingColumn) {
              const lastCol = await prisma.boardColumn.findFirst({
                where: { boardId: column.boardId },
                orderBy: { position: 'desc' },
              });
              const newPosition = (lastCol?.position ?? 0) + 1024;
              const billingSettings = {
                options: [
                  { id: 'pendiente_factura', label: 'Pendiente de facturar', color: '#fdab3d' },
                  { id: 'facturado', label: 'Facturado', color: '#579bfc' },
                  { id: 'cobrado', label: 'Cobrado', color: '#00c875' },
                  { id: 'default', label: '', color: '#c4c4c4' },
                ],
              };
              billingColumn = await prisma.boardColumn.create({
                data: {
                  boardId: column.boardId,
                  title: 'Estado Facturación',
                  type: 'status',
                  position: newPosition,
                  settings: JSON.stringify(billingSettings),
                  settingsJson: billingSettings as unknown as Prisma.JsonValue,
                },
              });
              io.to(boardRoom(column.boardId)).emit('column_added', billingColumn);
            }

            if (billingColumn) {
              const existingBilling = await prisma.columnValue.findUnique({
                where: {
                  itemId_columnId: {
                    itemId,
                    columnId: billingColumn.id,
                  },
                },
              });

              if (!existingBilling) {
                const billingValue = await prisma.columnValue.create({
                  data: {
                    itemId,
                    columnId: billingColumn.id,
                    value: JSON.stringify({ optionId: 'pendiente_factura' }),
                  },
                });
                io.to(boardRoom(column.boardId)).emit('column_value_updated', billingValue);
              }
            }
          }
        } catch (err) {
          // Valor no es JSON válido o no tiene optionId esperado; log para depuración
          console.warn(JSON.stringify({ level: 'warn', msg: 'taller_facturacion_skip', itemId, columnId, reason: err instanceof Error ? err.message : 'invalid_value' }));
        }
      }

      // Notificación Web Push al usuario asignado cuando se actualiza columna Personas
      if (column?.type === 'person' && value && typeof value === 'string' && value.trim()) {
        const assignedUserId = value.trim();
        const notif = await prisma.notification.create({
          data: { userId: assignedUserId, itemId, type: 'assigned', read: false },
        });
        io.to(userRoom(assignedUserId)).emit('notification_created', notif);

        await sendWebPushToUser(assignedUserId, {
          title: 'Te asignaron un elemento',
          body: 'Revisa tus notificaciones en Sunday.',
          url: '/inbox',
          tag: `assigned-${itemId}`,
        });
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
      io.to(boardRoom(boardId)).emit('board_renamed', updated);
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
      // Global: listado de tableros; Fase 3+ podría usar room por workspace
      io.emit('board_added', newBoard);
    } catch (e) {
      console.error('Error adding board:', e);
    }
  });

  // ── GROUP EVENTS ──────────────────────────────────────────────────────────

  socket.on('delete_group', async (data) => {
    try {
      const { groupId } = data;
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { boardId: true },
      });
      await prisma.group.delete({ where: { id: groupId } });
      if (group?.boardId) {
        io.to(boardRoom(group.boardId)).emit('group_deleted', { groupId });
      } else {
        // Fallback global si no hay board asociado.
        io.emit('group_deleted', { groupId });
      }
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
      io.to(boardRoom(boardId)).emit('group_added', newGroup);
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
      const group = await prisma.group.findUnique({
        where: { id: updated.id },
        select: { boardId: true },
      });
      if (group?.boardId) {
        io.to(boardRoom(group.boardId)).emit('group_renamed', { id: updated.id, name: updated.name, color: updated.color });
      } else {
        // Fallback global si no hay board asociado.
        io.emit('group_renamed', { id: updated.id, name: updated.name, color: updated.color });
      }
    } catch (e) {
      console.error('Error renaming group:', e);
    }
  });

  socket.on('move_group', async (data) => {
    try {
      const { groupId, newPosition } = data;
      const updated = await prisma.group.update({ where: { id: groupId }, data: { position: newPosition } });
      const group = await prisma.group.findUnique({
        where: { id: updated.id },
        select: { boardId: true },
      });
      if (group?.boardId) {
        socket.to(boardRoom(group.boardId)).emit('group_moved', updated);
      } else {
        socket.broadcast.emit('group_moved', updated);
      }
    } catch (e) {
      console.error('Error moving group:', e);
    }
  });

  // ── COLUMN EVENTS ─────────────────────────────────────────────────────────

  socket.on('add_column', async (data) => {
    try {
      const { boardId, title, type, position, settings } = data;
      const settingsJson =
        settings && typeof settings === 'string'
          ? (JSON.parse(settings) as unknown as Prisma.JsonValue)
          : (settings as unknown as Prisma.JsonValue | null);
      const newColumn = await prisma.boardColumn.create({
        data: {
          boardId,
          title,
          type,
          position,
          settings: settings || null,
          settingsJson: settingsJson ?? null,
        }
      });
      io.to(boardRoom(boardId)).emit('column_added', newColumn);
    } catch (e) {
      console.error('Error adding column:', e);
    }
  });

  socket.on('rename_column', async (data) => {
    try {
      const { columnId, title } = data;
      const updated = await prisma.boardColumn.update({ where: { id: columnId }, data: { title } });
      const column = await prisma.boardColumn.findUnique({
        where: { id: updated.id },
        select: { boardId: true },
      });
      if (column?.boardId) {
        io.to(boardRoom(column.boardId)).emit('column_renamed', updated);
      } else {
        // Fallback global si no hay board asociado.
        io.emit('column_renamed', updated);
      }
    } catch (e) {
      console.error('Error renaming column:', e);
    }
  });

  socket.on('update_column_settings', async (data) => {
    try {
      const { columnId, settings } = data;
      const parsedSettings =
        settings && typeof settings === 'string'
          ? (JSON.parse(settings) as unknown as Prisma.JsonValue)
          : (settings as unknown as Prisma.JsonValue | null);
      const updated = await prisma.boardColumn.update({
        where: { id: columnId },
        data: {
          settings: settings ?? null,
          settingsJson: parsedSettings ?? null,
        },
      });
      const column = await prisma.boardColumn.findUnique({
        where: { id: updated.id },
        select: { boardId: true },
      });
      if (column?.boardId) {
        io.to(boardRoom(column.boardId)).emit('column_settings_updated', updated);
      } else {
        // Fallback global si no hay board asociado.
        io.emit('column_settings_updated', updated);
      }
    } catch (e) {
      console.error('Error updating column settings:', e);
    }
  });

  socket.on('delete_column', async (data) => {
    try {
      const { columnId } = data;
      const column = await prisma.boardColumn.findUnique({
        where: { id: columnId },
        select: { boardId: true },
      });
      await prisma.columnValue.deleteMany({ where: { columnId } });
      await prisma.boardColumn.delete({ where: { id: columnId } });
      if (column?.boardId) {
        io.to(boardRoom(column.boardId)).emit('column_deleted', { columnId });
      } else {
        // Fallback global si no hay board asociado.
        io.emit('column_deleted', { columnId });
      }
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

      const [fullUpdate, item] = await Promise.all([
        prisma.update.findUnique({
          where: { id: newUpdate.id },
          include: { author: true },
        }),
        prisma.item.findUnique({
          where: { id: itemId },
          select: {
            name: true,
            group: { include: { board: { select: { name: true } } } },
            columnValues: {
              where: { column: { type: 'person' } },
              select: { value: true },
            },
          },
        }),
      ]);

      const safeUpdate = (() => {
        if (!fullUpdate) return newUpdate;
        const { author, ...rest } = fullUpdate as any;
        if (!author) return { ...rest, author: null };
        const { password, ...safeAuthor } = author;
        return { ...rest, author: safeAuthor };
      })();

      // Emitir a autor y a usuarios asignados al ítem (rooms por usuario)
      const recipientIds = new Set<string>();
      if (authorId) recipientIds.add(authorId);
      item.columnValues.forEach((cv) => {
        const v = cv.value?.trim();
        if (v) recipientIds.add(v);
      });
      recipientIds.forEach((uid) => io.to(userRoom(uid)).emit('update_added', safeUpdate));

      // Notificaciones Web Push a los usuarios asignados al item (excepto el propio autor)
      if (item && authorId) {
        const assignedUserIds = item.columnValues
          .map((cv) => cv.value?.trim())
          .filter((v): v is string => !!v && v !== authorId);

        if (assignedUserIds.length > 0) {
          const assignedUsers = await prisma.user.findMany({
            where: { id: { in: assignedUserIds } },
            select: { id: true },
          });
          const preview = content.length > 100 ? content.slice(0, 100) + '…' : content;
          for (const au of assignedUsers) {
            await sendWebPushToUser(au.id, {
              title: 'Nuevo comentario en un elemento asignado',
              body: preview,
              url: '/inbox',
              tag: `comment-${item.id}`,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error adding update:', e);
    }
  });

  socket.on('disconnect', () => {
    socketConnectionCount = Math.max(0, socketConnectionCount - 1);
    console.log(JSON.stringify({ level: 'info', msg: 'socket_disconnected', socketId: socket.id, connectionCount: socketConnectionCount }));
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Sunday Server running on port ${PORT}`);
});
