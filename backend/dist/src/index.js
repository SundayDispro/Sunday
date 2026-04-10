"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./env");
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const node_cron_1 = __importDefault(require("node-cron"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const paths_1 = require("./config/paths");
const multer_1 = __importDefault(require("multer"));
const client_1 = require("@prisma/client");
const auth_1 = require("./auth");
const web_push_1 = __importDefault(require("web-push"));
const templatePdfGenerator_1 = require("./templatePdfGenerator");
const notificationsService = __importStar(require("./services/notifications"));
const backupService_1 = require("./backupService");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
// SECURITY-VERIFIED: cabeceras HTTP de seguridad (CSP, HSTS, etc.) las aplica el reverse proxy (p. ej. Nginx); no se usa helmet en Node.
/** Rechazo en fileFilter de multer: el cliente solo recibe mensaje genérico (SECURITY M6). */
class MulterFileRejectedError extends Error {
    constructor() {
        super('MulterFileRejected');
        this.name = 'MulterFileRejectedError';
    }
}
/** FIX 8: no filtrar mensajes de Prisma/BD al cliente. */
const GENERIC_INTERNAL_ERROR = 'Error interno del servidor';
const isProduction = process.env.NODE_ENV === 'production';
/**
 * IDOR (docs/diseños): el workspace debe existir; si hay boardId, el tablero debe existir y coincidir en workspaceId.
 * Sin membresía por usuario en el esquema actual: mismo alcance operativo que listar workspaces/tablas autenticado.
 */
async function assertUserCanAccessWorkspaceForDocOrDesign(res, workspaceId, boardId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!ws) {
        res.status(404).json({ error: 'Workspace no encontrado' });
        return false;
    }
    if (boardId) {
        const board = await prisma.board.findUnique({ where: { id: boardId }, select: { workspaceId: true } });
        if (!board) {
            res.status(404).json({ error: 'Tablero no encontrado' });
            return false;
        }
        if (board.workspaceId !== workspaceId) {
            res.status(403).json({ error: 'No autorizado' });
            return false;
        }
    }
    return true;
}
/**
 * FIX 10: respuestas HTTP coherentes para errores Prisma frecuentes (evita duplicar if (code === 'P2025') en cada ruta).
 * Devuelve true si respondió y la ruta no debe seguir.
 */
function handlePrismaError(err, res, notFoundDetail) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code ?? '') : '';
    if (code === 'P2025') {
        res.status(404).json({ error: notFoundDetail ?? 'Recurso no encontrado' });
        return true;
    }
    if (code === 'P2002') {
        res.status(409).json({ error: 'Conflicto: el registro ya existe' });
        return true;
    }
    if (code === 'P2003') {
        res.status(400).json({ error: 'Referencia inválida' });
        return true;
    }
    return false;
}
/** FIX 10: mitigar fuerza bruta contra credenciales. */
const loginRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos o vuelve más tarde.' },
});
/**
 * Rate limit global para /api.
 * - Desarrollo: desactivado (skip) para no bloquear HMR, recargas y depuración.
 * - Producción: límite más alto; POST /api/login y GET /api/health excluidos del contador global
 *   (login sigue protegido por loginRateLimiter; evita 429 al iniciar sesión tras uso intensivo de la API).
 */
const apiGlobalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 800 : 50_000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
    skip: (req) => {
        if (!isProduction)
            return true;
        if (req.method === 'POST' && req.path === '/login')
            return true;
        if (req.method === 'GET' && req.path === '/health')
            return true;
        return false;
    },
});
const jsonBodyParser1mb = express_1.default.json({ limit: '1mb' });
const jsonBodyParser25mb = express_1.default.json({ limit: '25mb' });
/** Cuerpos JSON grandes solo en rutas que guardan contenido de docs/diseños o exportación PDF (base64, etc.). */
function selectJsonBodyParser(req, res, next) {
    const method = req.method;
    const p = req.path;
    const large = (method === 'POST' && p === '/api/docs') ||
        (method === 'PATCH' && /^\/api\/docs\/[^/]+$/.test(p)) ||
        (method === 'POST' && p === '/api/designs') ||
        (method === 'PATCH' && /^\/api\/designs\/[^/]+$/.test(p)) ||
        (method === 'POST' && /^\/api\/templates\/[^/]+\/generate$/.test(p)) ||
        (method === 'PATCH' && /^\/api\/workspaces\/[^/]+\/panel-notes$/.test(p)) ||
        (method === 'PATCH' && /^\/api\/workspaces\/[^/]+\/doc-groups$/.test(p));
    (large ? jsonBodyParser25mb : jsonBodyParser1mb)(req, res, next);
}
/** Errores típicos de Prisma/pg cuando la BD no está accesible o las credenciales fallan. */
function isPrismaDbUnavailable(err) {
    if (!err || typeof err !== 'object')
        return false;
    const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
    if (name === 'PrismaClientInitializationError')
        return true;
    const msg = err instanceof Error ? err.message : String(err);
    return (msg.includes("Can't reach database server") ||
        msg.includes('P1001') ||
        msg.includes('P1000') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('password authentication failed') ||
        msg.includes('28P01'));
}
const httpServer = (0, http_1.createServer)(app);
function toValueJson(legacyValue) {
    const v = (legacyValue ?? '').toString();
    const trimmed = v.trim();
    if (!trimmed)
        return null;
    try {
        return JSON.parse(v);
    }
    catch {
        // Si es un valor "plano" (no JSON), lo guardamos como string en el shadow JSONB.
        return v;
    }
}
/** Query/params de Express pueden ser `string | string[]`; normaliza a un string o null. */
function queryParamToString(value) {
    if (typeof value === 'string')
        return value.trim() || null;
    if (Array.isArray(value) && typeof value[0] === 'string')
        return value[0].trim() || null;
    return null;
}
/** Solo loopback: para scripts locales (p. ej. tarea al inicio de Windows) sin JWT. No usar X-Forwarded-For. */
function isRequestFromLoopback(req) {
    const addr = req.socket.remoteAddress ?? '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
/** `JsonValue` admite `null` plano; en create/update Prisma espera `InputJsonValue` o `JsonNull`. */
function jsonToInput(v) {
    if (v === undefined)
        return undefined;
    if (v === null)
        return client_1.Prisma.JsonNull;
    return v;
}
// CORS estricto:
// - En producción: ALLOWED_ORIGINS NO puede ser vacío ni '*'.
// - En dev: se permite '*' para no bloquear el ciclo rápido.
const rawOrigins = (process.env.ALLOWED_ORIGINS ?? '').trim();
if (isProduction && (!rawOrigins || rawOrigins === '*')) {
    throw new Error("ALLOWED_ORIGINS requerido en producción y no puede ser '*'. Define una lista separada por comas (p.ej. https://app.midominio.com,https://www.midominio.com).");
}
const allowedOrigins = rawOrigins === ''
    ? '*'
    : rawOrigins === '*'
        ? '*'
        : rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);
if (isProduction && allowedOrigins !== '*' && allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS inválido: la lista de orígenes resultó vacía.');
}
/** Quick Tunnel de Cloudflare: la URL HTTPS cambia en cada arranque de cloudflared. */
function isTryCloudflareQuickTunnelOrigin(origin) {
    try {
        const u = new URL(origin);
        return u.protocol === 'https:' && u.hostname.endsWith('.trycloudflare.com');
    }
    catch {
        return false;
    }
}
/**
 * Por defecto desactivado (variable ausente o no "truthy").
 * No activar en producción salvo pruebas puntuales: permitiría orígenes *.trycloudflare.com (Quick Tunnel).
 */
const trustTrycloudflareTunnelOrigins = ['1', 'true', 'yes'].includes((process.env.ALLOW_TRYCLOUDFLARE_ORIGINS ?? '').trim().toLowerCase());
const corsDynamicOrigin = (origin, callback) => {
    if (allowedOrigins === '*') {
        callback(null, true);
        return;
    }
    if (!origin) {
        // En producción se rechazan peticiones sin cabecera Origin (p. ej. file://, herramientas mal configuradas).
        if (isProduction) {
            callback(null, false);
            return;
        }
        callback(null, true);
        return;
    }
    if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
    }
    if (trustTrycloudflareTunnelOrigins && isTryCloudflareQuickTunnelOrigin(origin)) {
        callback(null, true);
        return;
    }
    callback(null, false);
};
const io = new socket_io_1.Server(httpServer, {
    pingTimeout: 60000, // 60s — default 20s
    pingInterval: 25000, // 25s — default 25s
    connectTimeout: 45000, // 45s para VPN lentas
    transports: ['websocket', 'polling'], // polling como fallback VPN
    cors: {
        origin: corsDynamicOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});
let socketConnectionCount = 0;
const boardRoom = (boardId) => `board:${boardId}`;
const userRoom = (userId) => `user:${userId}`;
const SOCKET_IO_ALLOWED_ROLES = new Set(['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER']);
/** FIX 5: destinatarios de board_added por datos de Prisma (workspace), no solo sockets conectados. */
async function getUserIdsForWorkspaceNotification(workspaceId) {
    const [docRows, designRows, roleUsers] = await Promise.all([
        prisma.doc.findMany({ where: { workspaceId }, select: { createdBy: true } }),
        prisma.design.findMany({ where: { workspaceId }, select: { createdBy: true } }),
        prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'VENTAS', 'DISENO'] } },
            select: { id: true },
        }),
    ]);
    const ids = new Set();
    docRows.forEach((d) => {
        if (d.createdBy)
            ids.add(d.createdBy);
    });
    designRows.forEach((d) => {
        if (d.createdBy)
            ids.add(d.createdBy);
    });
    roleUsers.forEach((u) => ids.add(u.id));
    if (ids.size === 0) {
        const all = await prisma.user.findMany({ select: { id: true } });
        return all.map((u) => u.id);
    }
    return [...ids];
}
// SECURITY-VERIFIED: JWT obligatorio en handshake Socket.IO (sin sesión anónima).
// FIX 3: JWT válido obligatorio en el handshake Socket.io (rechaza conexión anónima).
io.use(async (socket, next) => {
    const tokenMaybe = socket.handshake.auth?.token;
    const token = typeof tokenMaybe === 'string' ? tokenMaybe.trim() : '';
    if (!token)
        return next(new Error('unauthorized'));
    try {
        const payload = (0, auth_1.verifyJwt)(token);
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user || !SOCKET_IO_ALLOWED_ROLES.has(user.role))
            return next(new Error('unauthorized'));
        const bag = socket.data ?? {};
        Object.assign(bag, { userId: user.id, role: user.role });
        socket.data = bag;
        socket.join(userRoom(user.id));
        next();
    }
    catch {
        next(new Error('unauthorized'));
    }
});
// Configuración Web Push (VAPID)
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
// Si falta configuración de VAPID (por ejemplo en tu entorno local),
// generamos y persistimos claves para que Web Push funcione sin editar env manualmente.
// Nota: si ya existían suscripciones con otras claves, habrá que re-suscribir.
const VAPID_KEYS_PATH = path_1.default.join(process.cwd(), 'vapid-keys.json');
(() => {
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
        return;
    try {
        const raw = fs_1.default.readFileSync(VAPID_KEYS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.publicKey && parsed?.privateKey) {
            VAPID_PUBLIC_KEY = parsed.publicKey;
            VAPID_PRIVATE_KEY = parsed.privateKey;
            process.env.VAPID_PUBLIC_KEY = parsed.publicKey;
            process.env.VAPID_PRIVATE_KEY = parsed.privateKey;
            return;
        }
    }
    catch {
        // ignore (archivo no existe o JSON inválido)
    }
    try {
        const keys = web_push_1.default.generateVAPIDKeys();
        if (keys?.publicKey && keys?.privateKey) {
            fs_1.default.writeFileSync(VAPID_KEYS_PATH, JSON.stringify(keys, null, 2), 'utf8');
            VAPID_PUBLIC_KEY = keys.publicKey;
            VAPID_PRIVATE_KEY = keys.privateKey;
            process.env.VAPID_PUBLIC_KEY = keys.publicKey;
            process.env.VAPID_PRIVATE_KEY = keys.privateKey;
        }
    }
    catch (e) {
        console.warn('No se pudieron generar/leer claves VAPID para Web Push:', e);
    }
})();
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    web_push_1.default.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
// Helper: envía una notificación Web Push a todas las suscripciones de un usuario
async function sendWebPushToUser(userId, payload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
        return;
    try {
        const subs = await prisma.pushSubscription.findMany({ where: { userId } });
        // Badging API (si está disponible) necesita un número.
        // Aquí contamos solo notificaciones persistidas en BD (asignaciones/actualizaciones con Notification en tabla).
        const unreadCount = await prisma.notification.count({ where: { userId, read: false } }).catch(() => 0);
        const data = JSON.stringify({ ...payload, badgeCount: unreadCount });
        await Promise.all(subs.map(async (sub) => {
            try {
                await web_push_1.default.sendNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                }, data);
            }
            catch (err) {
                // 410/404 => suscripción inválida: eliminarla
                if (err?.statusCode === 410 || err?.statusCode === 404) {
                    await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => { });
                }
                else {
                    console.error('Error enviando Web Push:', err);
                }
            }
        }));
    }
    catch (e) {
        console.error('Error en sendWebPushToUser:', e);
    }
}
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, paths_1.UPLOADS_DIR),
    filename: (_req, file, cb) => {
        const safeExt = (() => {
            if (file.mimetype === 'application/pdf')
                return '.pdf';
            if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg')
                return '.jpg';
            if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                return '.xlsx';
            if (file.mimetype === 'application/vnd.ms-excel')
                return '.xls';
            return path_1.default.extname(file.originalname || '').toLowerCase() || '.bin';
        })();
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype === 'image/jpeg' ||
            file.mimetype === 'image/jpg' ||
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel';
        if (ok) {
            cb(null, true);
        }
        else {
            console.warn('[multer] tipo no permitido:', file.mimetype, file.originalname);
            cb(new MulterFileRejectedError());
        }
    },
});
const avatarUpload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (imageTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            console.warn('[multer avatar] tipo no permitido:', file.mimetype, file.originalname);
            cb(new MulterFileRejectedError());
        }
    },
});
app.use((0, cors_1.default)({
    origin: corsDynamicOrigin,
}));
app.use('/api', apiGlobalRateLimiter);
// JSON: 1mb por defecto; 25mb solo en rutas con payloads grandes (docs, diseños, export PDF, panel-notes, doc-groups).
app.use(selectJsonBodyParser);
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
app.use(auth_1.attachUserFromJwt);
// Evitar que iOS Safari (y otros móviles) cacheen respuestas de la API
app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.append('Vary', 'Authorization');
    res.append('Vary', 'Cookie');
    next();
});
// SECURITY-ACCEPTED-RISK: /uploads sin auth de sesión; nombres de archivo no adivinables (timestamp+random). Riesgo residual de enumeración bajo control en red interna.
app.use('/uploads', express_1.default.static(paths_1.UPLOADS_DIR));
// Health check (for frontend to verify backend is up); socketConnections para observabilidad
app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true, socketConnections: socketConnectionCount });
});
// Mensaje de sistema en el feed (Bandeja): solo desde 127.0.0.1 / ::1 — sin JWT.
// Autor: SYSTEM_FEED_AUTHOR_ID en .env, o el primer usuario ADMIN por createdAt.
// SECURITY-VERIFIED: restricción a loopback; Nginx no debe reenviar /api/internal/* al exterior (solo localhost o túnel SSH al propio host).
// FIX 11: el reverse proxy NO debe exponer /api/internal/* a Internet (solo localhost o red interna).
app.post('/api/internal/feed/system-message', async (req, res) => {
    try {
        if (!isRequestFromLoopback(req)) {
            return res.status(403).json({ error: 'Solo localhost' });
        }
        const { content } = req.body ?? {};
        if (!content || typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ error: 'content es obligatorio' });
        }
        const envAuthor = (process.env.SYSTEM_FEED_AUTHOR_ID ?? '').trim();
        let authorId = null;
        if (envAuthor) {
            const u = await prisma.user.findUnique({ where: { id: envAuthor } });
            if (u)
                authorId = u.id;
        }
        if (!authorId) {
            const admin = await prisma.user.findFirst({
                where: { role: 'ADMIN' },
                orderBy: { createdAt: 'asc' },
            });
            if (!admin) {
                return res.status(500).json({ error: 'No hay usuario ADMIN para publicar en el feed' });
            }
            authorId = admin.id;
        }
        const post = await prisma.feedPost.create({
            data: {
                content: content.trim(),
                authorId,
                mentionedUserIds: '[]',
                mentionedUserIdsJson: [],
            },
            include: { author: true },
        });
        const author = post.author ? { ...post.author, password: undefined } : post.author;
        res.status(201).json({ ...post, author, mentionedUserIds: [] });
    }
    catch (error) {
        console.error('system feed message error:', error);
        res.status(500).json({ error: 'No se pudo crear la publicación del feed de sistema' });
    }
});
// Subir documento (JPG o PDF) (multipart/form-data, field: "file"); responde con la URL pública
app.post('/api/upload', auth_1.authenticateToken, (req, res) => {
    const sendError = (status, message) => {
        res.status(status).json({ error: message });
    };
    upload.single('file')(req, res, (err) => {
        try {
            if (err) {
                if (err instanceof multer_1.default.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE')
                        return sendError(400, 'El archivo no puede superar 5 MB.');
                    console.error('[upload] MulterError:', err.code, err.message);
                }
                else {
                    console.error('[upload] error:', err);
                }
                return sendError(400, 'Error al procesar el archivo');
            }
            if (!req.file)
                return sendError(400, 'No se envió ningún archivo.');
            const url = '/uploads/' + req.file.filename;
            res.status(201).json({ url });
        }
        catch (e) {
            console.error('Upload error:', e);
            sendError(500, 'Error interno al guardar el archivo.');
        }
    });
});
// Get all workspaces (for sidebar workspace selector)
app.get('/api/workspaces', auth_1.authenticateToken, async (_req, res) => {
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
    }
    catch (error) {
        console.error('Error fetching workspaces:', error);
        res.status(500).json({ error: 'No se pudieron cargar los workspaces' });
    }
});
// Bootstrap de navegación: devuelve workspaces + boards en una sola llamada.
// Útil para clientes móviles con redes/proxies inestables donde una de las dos rutas falle.
app.get('/api/bootstrap', auth_1.authenticateToken, async (_req, res) => {
    try {
        const [workspaces, boards] = await Promise.all([
            prisma.workspace.findMany({
                orderBy: { createdAt: 'asc' },
                include: {
                    boards: {
                        orderBy: { createdAt: 'asc' },
                        select: { id: true, name: true, workspaceId: true },
                    },
                },
            }),
            prisma.board.findMany({
                orderBy: { createdAt: 'asc' },
                select: { id: true, name: true, workspaceId: true },
            }),
        ]);
        res.json({ workspaces, boards });
    }
    catch (error) {
        console.error('Error fetching bootstrap payload:', error);
        res.status(500).json({ error: 'No se pudo cargar el arranque (bootstrap)' });
    }
});
// Create a new workspace (solo ADMIN: creación de nivel superior)
app.post('/api/workspaces', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN']), async (req, res) => {
    try {
        const name = (req.body?.name && String(req.body.name).trim()) || 'Nuevo workspace';
        const workspace = await prisma.workspace.create({
            data: { name },
            include: {
                boards: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, workspaceId: true } },
            },
        });
        res.status(201).json(workspace);
    }
    catch (error) {
        console.error('Error creating workspace:', error);
        res.status(500).json({ error: 'No se pudo crear el workspace' });
    }
});
// Panel de Docs: listas de tareas por usuario (cada usuario solo ve las suyas)
app.get('/api/workspaces/:workspaceId/panel-notes', auth_1.authenticateToken, async (req, res) => {
    try {
        const workspaceId = queryParamToString(req.params.workspaceId);
        if (!workspaceId)
            return res.status(400).json({ error: 'workspaceId inválido' });
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const requestedUserId = queryParamToString(req.query.userId);
        const effectiveUserId = authUser.role === 'ADMIN' && requestedUserId ? requestedUserId : authUser.id;
        const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { panelNotes: true } });
        if (!w)
            return res.status(404).json({ error: 'Workspace no encontrado' });
        let panelNotes = [];
        if (w.panelNotes && String(w.panelNotes).trim()) {
            try {
                const parsed = JSON.parse(w.panelNotes);
                const all = Array.isArray(parsed) ? parsed : [];
                panelNotes = all.filter((item) => item && String(item.ownerId) === effectiveUserId);
            }
            catch {
                panelNotes = [];
            }
        }
        res.json({ panelNotes });
    }
    catch (e) {
        console.error('Error fetching panel notes:', e);
        res.status(500).json({ error: 'No se pudieron cargar las notas del panel' });
    }
});
app.patch('/api/workspaces/:workspaceId/panel-notes', auth_1.authenticateToken, async (req, res) => {
    try {
        const workspaceId = queryParamToString(req.params.workspaceId);
        if (!workspaceId)
            return res.status(400).json({ error: 'workspaceId inválido' });
        const body = req.body ?? {};
        const panelNotes = Array.isArray(body.panelNotes) ? body.panelNotes : undefined;
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const requestedUserId = typeof body.userId === 'string' ? body.userId : null;
        const effectiveUserId = authUser.role === 'ADMIN' && requestedUserId ? requestedUserId : authUser.id;
        if (panelNotes === undefined)
            return res.status(400).json({ error: 'panelNotes es obligatorio (array)' });
        let merged;
        const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { panelNotes: true } });
        if (!w)
            return res.status(404).json({ error: 'Workspace no encontrado' });
        let current = [];
        if (w.panelNotes && String(w.panelNotes).trim()) {
            try {
                const parsed = JSON.parse(w.panelNotes);
                current = Array.isArray(parsed) ? parsed : [];
            }
            catch {
                current = [];
            }
        }
        const others = current.filter((item) => item ? String(item.ownerId) !== effectiveUserId : false);
        // FIX 3 (IDOR panel-notes): no permitir que el cliente fije ownerId ajeno; siempre el usuario efectivo (o el que un ADMIN edita vía userId).
        const withOwner = panelNotes.map((n) => ({
            ...n,
            ownerId: effectiveUserId,
        }));
        merged = [...others, ...withOwner];
        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                panelNotes: JSON.stringify(merged),
                panelNotesJson: merged,
            },
        });
        const saved = JSON.parse(workspace.panelNotes || '[]');
        const toReturn = saved.filter((item) => String(item?.ownerId) === effectiveUserId);
        res.json({ panelNotes: toReturn });
    }
    catch (e) {
        if (handlePrismaError(e, res, 'Workspace no encontrado'))
            return;
        console.error('Error updating panel notes:', e);
        res.status(500).json({ error: 'No se pudieron actualizar las notas del panel' });
    }
});
// Trabajo asignado al usuario (para pantalla Hoy agregada).
app.get('/api/my-work', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        const workspaceId = queryParamToString(req.query.workspaceId);
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
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
        const items = [];
        for (const board of boards) {
            const personColumns = board.columns.filter((c) => c.type === 'person');
            if (!personColumns.length)
                continue;
            for (const group of board.groups) {
                for (const item of group.items) {
                    const assigned = personColumns.some((pc) => isAssignedToUser(item.columnValues, pc.id, String(userId)));
                    if (!assigned)
                        continue;
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
    }
    catch (e) {
        console.error('Error en /api/my-work:', e);
        res.status(500).json({ error: 'Error interno al obtener mi trabajo' });
    }
});
// ── Listas de tareas (Google Tasks) ─────────────────────────────────────────
async function ensureDefaultTaskList(userId) {
    const count = await prisma.userTaskList.count({ where: { userId } });
    if (count > 0)
        return;
    await prisma.userTaskList.create({
        data: { userId, name: 'Mis tareas', position: 1024 },
    });
}
app.get(['/api/user-task-lists', '/api/user_task_lists'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        await ensureDefaultTaskList(userId);
        const lists = await prisma.userTaskList.findMany({
            where: { userId },
            orderBy: { position: 'asc' },
            include: { _count: { select: { tasks: true } } },
        });
        res.json(lists);
    }
    catch (e) {
        console.error('Error GET /api/user-task-lists:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.post(['/api/user-task-lists', '/api/user_task_lists'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const name = String(req.body?.name ?? '').trim() || 'Lista sin título';
        const maxPos = await prisma.userTaskList.aggregate({
            where: { userId },
            _max: { position: true },
        });
        const position = (maxPos._max.position ?? 0) + 1024;
        const list = await prisma.userTaskList.create({
            data: { userId, name, position },
        });
        res.status(201).json(list);
    }
    catch (e) {
        console.error('Error POST /api/user-task-lists:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.patch(['/api/user-task-lists/:id', '/api/user_task_lists/:id'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const id = String(req.params.id ?? '').trim();
        const list = await prisma.userTaskList.findFirst({ where: { id, userId } });
        if (!list)
            return res.status(404).json({ error: 'Lista no encontrada' });
        const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
        const position = req.body?.position !== undefined && Number.isFinite(Number(req.body.position))
            ? Number(req.body.position)
            : undefined;
        const updated = await prisma.userTaskList.update({
            where: { id },
            data: {
                ...(name ? { name } : {}),
                ...(position !== undefined ? { position } : {}),
            },
        });
        res.json(updated);
    }
    catch (e) {
        console.error('Error PATCH /api/user-task-lists/:id:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.delete(['/api/user-task-lists/:id', '/api/user_task_lists/:id'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const id = String(req.params.id ?? '').trim();
        const list = await prisma.userTaskList.findFirst({ where: { id, userId } });
        if (!list)
            return res.status(404).json({ error: 'Lista no encontrada' });
        const totalLists = await prisma.userTaskList.count({ where: { userId } });
        if (totalLists <= 1) {
            return res.status(400).json({ error: 'Debe quedar al menos una lista' });
        }
        await prisma.userTaskList.delete({ where: { id } });
        res.status(204).end();
    }
    catch (e) {
        console.error('Error DELETE /api/user-task-lists/:id:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
// Tareas personales (listas + subtareas). Query: listId requerido.
app.get(['/api/user-tasks', '/api/user_tasks'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const listId = queryParamToString(req.query.listId);
        if (!listId)
            return res.status(400).json({ error: 'listId requerido' });
        const list = await prisma.userTaskList.findFirst({ where: { id: listId, userId } });
        if (!list)
            return res.status(404).json({ error: 'Lista no encontrada' });
        const tasks = await prisma.userTask.findMany({
            where: { userId, listId },
            orderBy: [{ completed: 'asc' }, { position: 'asc' }],
        });
        res.json(tasks);
    }
    catch (e) {
        console.error('Error en /api/user-tasks:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.post(['/api/user-tasks', '/api/user_tasks'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const title = String(req.body?.title ?? '').trim();
        if (!title)
            return res.status(400).json({ error: 'Título requerido' });
        const listId = String(req.body?.listId ?? '').trim();
        if (!listId)
            return res.status(400).json({ error: 'listId requerido' });
        const list = await prisma.userTaskList.findFirst({ where: { id: listId, userId } });
        if (!list)
            return res.status(404).json({ error: 'Lista no encontrada' });
        let parentId = null;
        if (req.body?.parentId != null && req.body?.parentId !== '') {
            const pid = String(req.body.parentId).trim();
            const parent = await prisma.userTask.findFirst({
                where: { id: pid, userId, listId },
            });
            if (!parent)
                return res.status(400).json({ error: 'Tarea padre no válida' });
            parentId = pid;
        }
        const notes = String(req.body?.notes ?? '').trim();
        let dueDate = null;
        if (req.body?.dueDate != null && req.body?.dueDate !== '') {
            const d = new Date(String(req.body.dueDate));
            if (!Number.isNaN(d.getTime()))
                dueDate = d;
        }
        const maxPos = await prisma.userTask.aggregate({
            where: { userId, listId, parentId },
            _max: { position: true },
        });
        const position = (maxPos._max.position ?? 0) + 1024;
        const task = await prisma.userTask.create({
            data: { userId, listId, parentId, title, notes, dueDate, position },
        });
        res.status(201).json(task);
    }
    catch (e) {
        console.error('Error POST /api/user-tasks:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.patch(['/api/user-tasks/:id', '/api/user_tasks/:id'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const id = String(req.params.id ?? '').trim();
        if (!id)
            return res.status(400).json({ error: 'ID inválido' });
        const existing = await prisma.userTask.findFirst({ where: { id, userId } });
        if (!existing)
            return res.status(404).json({ error: 'Tarea no encontrada' });
        const data = {};
        if (req.body?.title !== undefined)
            data.title = String(req.body.title).trim() || existing.title;
        if (req.body?.notes !== undefined)
            data.notes = String(req.body.notes);
        if (req.body?.completed !== undefined)
            data.completed = Boolean(req.body.completed);
        if (req.body?.position !== undefined && Number.isFinite(Number(req.body.position))) {
            data.position = Number(req.body.position);
        }
        if (req.body?.dueDate !== undefined) {
            if (req.body.dueDate === null || req.body.dueDate === '')
                data.dueDate = null;
            else {
                const d = new Date(String(req.body.dueDate));
                if (!Number.isNaN(d.getTime()))
                    data.dueDate = d;
            }
        }
        if (req.body?.listId !== undefined) {
            const lid = String(req.body.listId).trim();
            const ok = await prisma.userTaskList.findFirst({ where: { id: lid, userId } });
            if (!ok)
                return res.status(400).json({ error: 'Lista no válida' });
            data.listId = lid;
        }
        if (req.body?.parentId !== undefined) {
            if (req.body.parentId === null || req.body.parentId === '') {
                data.parentId = null;
            }
            else {
                const pid = String(req.body.parentId).trim();
                if (pid === id)
                    return res.status(400).json({ error: 'parentId inválido' });
                const parent = await prisma.userTask.findFirst({
                    where: { id: pid, userId, listId: data.listId ?? existing.listId },
                });
                if (!parent)
                    return res.status(400).json({ error: 'Tarea padre no válida' });
                data.parentId = pid;
            }
        }
        const task = await prisma.userTask.update({ where: { id }, data });
        res.json(task);
    }
    catch (e) {
        console.error('Error PATCH /api/user-tasks/:id:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.delete(['/api/user-tasks/:id', '/api/user_tasks/:id'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const id = String(req.params.id ?? '').trim();
        if (!id)
            return res.status(400).json({ error: 'ID inválido' });
        const deleted = await prisma.userTask.deleteMany({ where: { id, userId } });
        if (deleted.count === 0)
            return res.status(404).json({ error: 'Tarea no encontrada' });
        res.status(204).end();
    }
    catch (e) {
        console.error('Error DELETE /api/user-tasks/:id:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.post(['/api/user-tasks/reorder', '/api/user_tasks/reorder'], auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const listId = String(req.body?.listId ?? '').trim();
        if (!listId)
            return res.status(400).json({ error: 'listId requerido' });
        const list = await prisma.userTaskList.findFirst({ where: { id: listId, userId } });
        if (!list)
            return res.status(404).json({ error: 'Lista no encontrada' });
        const parentId = req.body?.parentId === null || req.body?.parentId === ''
            ? null
            : req.body?.parentId != null
                ? String(req.body.parentId).trim()
                : null;
        const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
        const ids = orderedIds.map((x) => String(x)).filter(Boolean);
        if (ids.length === 0)
            return res.status(400).json({ error: 'orderedIds requerido' });
        await prisma.$transaction(ids.map((taskId, index) => prisma.userTask.updateMany({
            where: { id: taskId, userId, listId, parentId },
            data: { position: (index + 1) * 1024 },
        })));
        const tasks = await prisma.userTask.findMany({
            where: { userId, listId },
            orderBy: [{ completed: 'asc' }, { position: 'asc' }],
        });
        res.json(tasks);
    }
    catch (e) {
        console.error('Error POST /api/user-tasks/reorder:', e);
        res.status(500).json({ error: 'Error interno' });
    }
});
app.get('/api/workspaces/:workspaceId/doc-groups', auth_1.authenticateToken, async (req, res) => {
    const defaultPayload = {
        groups: [],
        assignments: {},
        subgroupsByType: {},
        subgroupAssignments: {},
    };
    try {
        const workspaceId = queryParamToString(req.params.workspaceId);
        if (!workspaceId)
            return res.status(400).json({ error: 'workspaceId inválido' });
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const effectiveUserId = authUser.id;
        const w = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, docGroups: true, docGroupsJson: true },
        });
        if (!w)
            return res.status(404).json({ error: 'Workspace no encontrado' });
        const docGroupsRaw = w.docGroups;
        const docGroupsJsonRaw = w.docGroupsJson;
        let parsed = null;
        if (docGroupsRaw && String(docGroupsRaw).trim()) {
            try {
                parsed = JSON.parse(docGroupsRaw);
            }
            catch (_) {
                // keep defaults on parse error
            }
        }
        if (!parsed && docGroupsJsonRaw && typeof docGroupsJsonRaw === 'object' && !Array.isArray(docGroupsJsonRaw)) {
            parsed = docGroupsJsonRaw;
        }
        if (parsed) {
            const userData = parsed[effectiveUserId] ? parsed[effectiveUserId] : null;
            if (userData) {
                defaultPayload.groups = Array.isArray(userData.groups) ? userData.groups : [];
                defaultPayload.assignments =
                    userData.assignments && typeof userData.assignments === 'object' ? userData.assignments : {};
                defaultPayload.subgroupsByType =
                    userData.subgroupsByType && typeof userData.subgroupsByType === 'object' ? userData.subgroupsByType : {};
                defaultPayload.subgroupAssignments =
                    userData.subgroupAssignments && typeof userData.subgroupAssignments === 'object' ? userData.subgroupAssignments : {};
            }
        }
        return res.json(defaultPayload);
    }
    catch (e) {
        console.error('Error fetching doc-groups:', e);
        // Defensivo: ante cualquier error (BD, modelo, etc.) devolver 200 con estructura vacía
        return res.status(200).json(defaultPayload);
    }
});
app.patch('/api/workspaces/:workspaceId/doc-groups', auth_1.authenticateToken, async (req, res) => {
    try {
        const workspaceId = queryParamToString(req.params.workspaceId);
        if (!workspaceId)
            return res.status(400).json({ error: 'workspaceId inválido' });
        const body = req.body ?? {};
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const effectiveUserId = authUser.id;
        const w = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { docGroups: true } });
        if (!w)
            return res.status(404).json({ error: 'Workspace no encontrado' });
        let all = {};
        if (w.docGroups && String(w.docGroups).trim()) {
            try {
                const parsed = JSON.parse(w.docGroups);
                all = parsed && typeof parsed === 'object' ? parsed : {};
            }
            catch {
                all = {};
            }
        }
        let current = all[effectiveUserId];
        if (!current || typeof current !== 'object') {
            current = { groups: [], assignments: {}, subgroupsByType: {}, subgroupAssignments: {} };
        }
        if (!current.subgroupsByType || typeof current.subgroupsByType !== 'object')
            current.subgroupsByType = {};
        if (!current.subgroupAssignments || typeof current.subgroupAssignments !== 'object')
            current.subgroupAssignments = {};
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
        all[effectiveUserId] = current;
        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                docGroups: JSON.stringify(all),
                docGroupsJson: all,
            },
        });
        res.json({
            groups: current.groups,
            assignments: current.assignments,
            subgroupsByType: current.subgroupsByType,
            subgroupAssignments: current.subgroupAssignments,
        });
    }
    catch (e) {
        if (handlePrismaError(e, res, 'Workspace no encontrado'))
            return;
        console.error('Error updating doc-groups:', e);
        res.status(500).json({ error: 'No se pudieron actualizar los grupos de documentos' });
    }
});
// Update workspace (rename, description) — solo ADMIN
app.patch('/api/workspaces/:id', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN']), async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const body = req.body ?? {};
        const name = body.name != null ? String(body.name).trim() : undefined;
        const description = body.description !== undefined ? (body.description === null || body.description === '' ? null : String(body.description)) : undefined;
        const data = {};
        if (name !== undefined)
            data.name = name || 'Nuevo workspace';
        if (description !== undefined)
            data.description = description;
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
    }
    catch (error) {
        if (handlePrismaError(error, res, 'Workspace no encontrado'))
            return;
        console.error('Error updating workspace:', error);
        res.status(500).json({ error: 'No se pudo actualizar el workspace' });
    }
});
// Delete workspace (cascade deletes boards)
app.delete('/api/workspaces/:id', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN']), async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        await prisma.workspace.delete({ where: { id } });
        res.status(204).send();
    }
    catch (error) {
        if (handlePrismaError(error, res, 'Workspace no encontrado'))
            return;
        console.error('Error deleting workspace:', error);
        res.status(500).json({ error: 'No se pudo eliminar el workspace' });
    }
});
// Search items and boards by query (all boards)
app.get('/api/search', auth_1.authenticateToken, async (req, res) => {
    try {
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const qRaw = queryParamToString(req.query.q);
        const q = qRaw?.toLowerCase() ?? '';
        if (!q)
            return res.json([]);
        const workspaceId = queryParamToString(req.query.workspaceId);
        const isBroadRole = ['ADMIN', 'VENTAS', 'DISENO'].includes(authUser.role);
        // TODO(db/perf): reducir include y mover más filtros al query de DB (evitar filtrar todo en memoria).
        const boards = await prisma.board.findMany({
            where: workspaceId ? { workspaceId } : undefined,
            include: {
                workspace: { select: { name: true } },
                columns: { select: { id: true, type: true } },
                groups: {
                    include: {
                        items: {
                            select: {
                                id: true,
                                name: true,
                                groupId: true,
                                columnValues: { select: { columnId: true, value: true } },
                            },
                        },
                    },
                },
            },
        });
        const results = [];
        for (const board of boards) {
            const personColumns = board.columns.filter((c) => c.type === 'person');
            for (const group of board.groups) {
                for (const item of group.items) {
                    if (!item?.name)
                        continue;
                    if (!isBroadRole) {
                        if (!personColumns.length)
                            continue;
                        const assigned = personColumns.some((pc) => isAssignedToUser(item.columnValues, pc.id, String(authUser.id)));
                        if (!assigned)
                            continue;
                    }
                    if (item.name.toLowerCase().includes(q) || (isBroadRole && board.name.toLowerCase().includes(q))) {
                        results.push({
                            item: { id: item.id, name: item.name, groupId: item.groupId },
                            boardId: board.id,
                            boardName: board.name,
                            workspaceName: board.workspace?.name ?? '',
                            groupId: group.id,
                            groupName: group.name,
                        });
                    }
                }
            }
        }
        res.json(results.slice(0, 100));
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Error en la búsqueda' });
    }
});
// Get all boards (for sidebar list), optionally filtered by workspace
app.get('/api/boards', auth_1.authenticateToken, async (req, res) => {
    try {
        const workspaceId = queryParamToString(req.query.workspaceId);
        const where = workspaceId ? { workspaceId } : undefined;
        const boards = await prisma.board.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, workspaceId: true },
        });
        res.json(boards);
    }
    catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar los tableros' });
    }
});
// Reorder columns within a board (estructura del tablero: ADMIN, VENTAS)
app.post('/api/boards/:id/columns/reorder', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS']), async (req, res) => {
    try {
        const boardId = queryParamToString(req.params.id);
        if (!boardId)
            return res.status(400).json({ error: 'board id inválido' });
        const updates = (req.body?.updates ?? []);
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'Se requiere el array updates' });
        }
        // Ensure all columns belong to the board
        const columnIds = updates.map(u => u.id);
        const columns = await prisma.boardColumn.findMany({
            where: { id: { in: columnIds }, boardId },
        });
        if (columns.length !== updates.length) {
            return res.status(400).json({ error: 'Algunas columnas no pertenecen a este tablero' });
        }
        await Promise.all(updates.map(u => prisma.boardColumn.update({
            where: { id: u.id },
            data: { position: u.position },
        })));
        const reordered = await prisma.boardColumn.findMany({
            where: { boardId },
            orderBy: { position: 'asc' },
        });
        res.json(reordered);
    }
    catch (error) {
        console.error('Error reordering columns:', error);
        res.status(500).json({ error: 'No se pudo reordenar las columnas' });
    }
});
// Create a new board (REST – no dependency on socket)
app.post('/api/boards', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS']), async (req, res) => {
    try {
        const body = req.body ?? {};
        const requestedWorkspaceId = body.workspaceId ? String(body.workspaceId) : null;
        let workspaceIdToUse;
        if (requestedWorkspaceId) {
            const existing = await prisma.workspace.findUnique({ where: { id: requestedWorkspaceId } });
            if (!existing) {
                return res.status(400).json({ error: 'Workspace no encontrado' });
            }
            workspaceIdToUse = existing.id;
        }
        else {
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
    }
    catch (error) {
        console.error('Error creating board:', error);
        res.status(500).json({ error: 'No se pudo crear el tablero' });
    }
});
// Delete board (cascade via Prisma relations)
app.delete('/api/boards/:id', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN']), async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        await prisma.board.delete({ where: { id } });
        res.status(204).send();
    }
    catch (error) {
        if (handlePrismaError(error, res, 'Tablero no encontrado'))
            return;
        console.error('Error deleting board:', error);
        res.status(500).json({ error: 'No se pudo eliminar el tablero' });
    }
});
// Get the first Board dynamically
app.get('/api/boards/first', auth_1.authenticateToken, async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: 'No se pudo cargar el recurso' });
    }
});
// Ligar un doc/sheet guardado al elemento del tablero (ruta literal antes de /:id) — creación/edición de ítem
app.post('/api/boards/link-doc', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS', 'DISENO']), async (req, res) => {
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
            const valueJsonIn = jsonToInput(toValueJson(value));
            const updated = await prisma.columnValue.upsert({
                where: { itemId_columnId: { itemId, columnId } },
                update: { value, valueJson: valueJsonIn },
                create: { itemId, columnId, value, valueJson: valueJsonIn },
            });
            io.to(boardRoom(column.boardId)).emit('column_value_updated', updated);
            return res.json({ ok: true, updated });
        }
        if (column.type === 'docs') {
            const existing = await prisma.columnValue.findUnique({
                where: { itemId_columnId: { itemId, columnId } },
            });
            let parsed = {};
            if (existing?.value) {
                try {
                    parsed = JSON.parse(existing.value);
                }
                catch {
                    // mantener valor previo si no es JSON
                }
            }
            const docIdKey = docType === 'cotizacion' ? 'cotizacionDocId' : docType === 'levantamiento' ? 'levantamientoDocId' : 'hojaTrabajoDocId';
            parsed[docIdKey] = docId;
            const value = JSON.stringify(parsed);
            const valueJsonIn = jsonToInput(toValueJson(value));
            const updated = await prisma.columnValue.upsert({
                where: { itemId_columnId: { itemId, columnId } },
                update: { value, valueJson: valueJsonIn },
                create: { itemId, columnId, value, valueJson: valueJsonIn },
            });
            io.to(boardRoom(column.boardId)).emit('column_value_updated', updated);
            return res.json({ ok: true, updated });
        }
        return res.status(400).json({ error: 'Solo se puede ligar en columnas de tipo docs o excel' });
    }
    catch (e) {
        console.error('Error linking doc to board item:', e);
        res.status(500).json({ error: 'Error al ligar el documento' });
    }
});
// SECURITY-ACCEPTED-RISK: app interna sin multi-tenancy; todo usuario autenticado puede acceder a un tablero por id (no hay modelo de membresía en Prisma).
app.get('/api/boards/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const board = await prisma.board.findUnique({
            where: { id },
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
        if (!board)
            return res.status(404).json({ error: 'Tablero no encontrado' });
        res.json(board);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo cargar el tablero' });
    }
});
// SECURITY-ACCEPTED-RISK: mismo criterio que GET /api/boards/:id; no se valida pertenencia del ítem al tablero del usuario (app interna, sin membresía).
// Get updates for an item
app.get('/api/items/:itemId/updates', auth_1.authenticateToken, async (req, res) => {
    try {
        const itemId = queryParamToString(req.params.itemId);
        if (!itemId)
            return res.status(400).json({ error: 'itemId inválido' });
        const updates = await prisma.update.findMany({
            where: { itemId },
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
            const { author, ...rest } = u;
            if (!author)
                return { ...rest, author: null };
            const { password, ...safeAuthor } = author;
            return { ...rest, author: safeAuthor };
        });
        res.json(safe);
    }
    catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar las actualizaciones' });
    }
});
// --- Bandeja feed (publicaciones con @mentions) ---
app.get('/api/feed', auth_1.authenticateToken, async (req, res) => {
    try {
        const filter = queryParamToString(req.query.filter) ?? ''; // 'mentions' = solo donde me mencionaron
        const authUserId = req.authUser?.id;
        if (!authUserId)
            return res.status(401).json({ error: 'No autenticado' });
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
                mentionedUserIds: (() => { try {
                    return JSON.parse(p.mentionedUserIds || '[]');
                }
                catch {
                    return [];
                } })(),
            };
        });
        if (filter === 'mentions') {
            list = list.filter(p => {
                const ids = p.mentionedUserIds;
                return Array.isArray(ids) && ids.includes(authUserId);
            });
        }
        res.json(list);
    }
    catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: 'No se pudo cargar el feed' });
    }
});
app.post('/api/feed', auth_1.authenticateToken, async (req, res) => {
    try {
        const { content, authorId, mentionedUserIds } = req.body ?? {};
        const authUserId = req.authUser?.id;
        if (!authUserId)
            return res.status(401).json({ error: 'No autenticado' });
        if (!content || typeof content !== 'string' || !authorId) {
            return res.status(400).json({ error: 'content y authorId son obligatorios' });
        }
        if (authorId !== authUserId) {
            return res.status(403).json({ error: 'authorId no autorizado' });
        }
        const ids = Array.isArray(mentionedUserIds)
            ? Array.from(new Set(mentionedUserIds
                .filter((id) => typeof id === 'string' && !!id.trim())
                .map((id) => id.trim())
                .filter((id) => id !== authorId)))
            : [];
        const post = await prisma.feedPost.create({
            data: {
                content: content.trim(),
                authorId,
                mentionedUserIds: JSON.stringify(ids),
                mentionedUserIdsJson: ids,
            },
            include: { author: true },
        });
        res.status(201).json({ ...post, mentionedUserIds: ids });
        // Notificaciones Web Push a los usuarios mencionados (en background, no bloquea la respuesta)
        if (ids.length > 0) {
            const mentionedExcludingAuthor = ids.filter((id) => id !== authorId);
            if (mentionedExcludingAuthor.length > 0) {
                prisma.user
                    .findMany({
                    where: { id: { in: mentionedExcludingAuthor } },
                    select: { id: true },
                })
                    .then(async (mentionedUsers) => {
                    const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;
                    for (const mu of mentionedUsers) {
                        await sendWebPushToUser(mu.id, {
                            title: 'Te mencionaron en Sunday',
                            body: preview,
                            url: '/?tab=notifications',
                            tag: `mention-${post.id}`,
                        });
                    }
                })
                    .catch((e) => console.error('Error enviando Web Push por mención:', e));
            }
        }
    }
    catch (error) {
        console.error('Feed post error:', error);
        res.status(500).json({ error: 'No se pudo crear la publicación' });
    }
});
// --- Auth & Users API ---
app.post('/api/login', loginRateLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
        }
        const normalizedUsername = username.trim();
        const user = await prisma.user.findFirst({
            where: {
                username: { equals: normalizedUsername, mode: 'insensitive' },
            },
        });
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const ok = await (0, auth_1.verifyPassword)(password, user.password);
        if (!ok) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { status: 'available' },
        });
        const { password: _p, ...userWithoutPassword } = updated;
        const token = (0, auth_1.signJwt)({ userId: updated.id, role: updated.role });
        res.json({ user: userWithoutPassword, token });
    }
    catch (err) {
        console.error(err);
        if (isPrismaDbUnavailable(err)) {
            return res.status(503).json({
                error: 'No se pudo conectar a PostgreSQL. Revisa DATABASE_URL en backend/.env y que el servidor esté en marcha. Guía: docs/DEV_SETUP_POSTGRES.md',
            });
        }
        res.status(500).json({ error: 'Error en el login' });
    }
});
// Admin endpoint to create a new user
app.post('/api/users', auth_1.requireAuth, auth_1.requireAdmin, async (req, res) => {
    try {
        const { username, name, password, role: bodyRole } = req.body;
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'El usuario ya está registrado' });
        }
        const allowedRoles = ['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER'];
        const role = allowedRoles.includes(bodyRole) ? bodyRole : 'USER';
        const initials = name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
        const colors = ['#00c875', '#fdab3d', '#e2445c', '#5559df', '#6e3cbb', '#0073ea'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const passwordHash = await (0, auth_1.hashPassword)(password);
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
        // Para la iteración actual usamos room por usuario para evitar broadcast global residual.
        io.to(userRoom(userWithoutPassword.id)).emit('user_added', userWithoutPassword);
        res.json(userWithoutPassword);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});
// FIX 9: ADMIN ve el perfil completo (sin password); el resto solo datos necesarios para asignación/UI sin hash ni campos internos extra.
app.get('/api/users', auth_1.authenticateToken, async (req, res) => {
    try {
        if (req.authUser?.role === 'ADMIN') {
            const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
            const safe = users.map(({ password: _p, ...u }) => u);
            res.json(safe);
            return;
        }
        const users = await prisma.user.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                username: true,
                name: true,
                initials: true,
                color: true,
                role: true,
                status: true,
                avatarUrl: true,
                preferences: true,
            },
        });
        res.json(users);
    }
    catch (e) {
        console.error('Error fetching users:', e);
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
/** Preferencias de UI (tema, etc.): debe ir ANTES de PATCH /api/users/:id para que "me" no se interprete como :id. */
app.patch('/api/users/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const uid = req.authUser?.id;
        if (!uid)
            return res.status(401).json({ error: 'No autenticado' });
        const { preferences } = req.body ?? {};
        if (preferences !== undefined &&
            (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences))) {
            return res.status(400).json({ error: 'preferences debe ser un objeto JSON' });
        }
        const existing = await prisma.user.findUnique({ where: { id: uid } });
        if (!existing)
            return res.status(404).json({ error: 'Usuario no encontrado' });
        const prev = existing.preferences ?? {};
        const merged = preferences && typeof preferences === 'object'
            ? { ...prev, ...preferences }
            : prev;
        const updated = await prisma.user.update({
            where: { id: uid },
            data: { preferences: merged },
        });
        const { password: _p, ...safe } = updated;
        res.json(safe);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar preferencias' });
    }
});
// Actualizar datos básicos de un usuario (solo ADMIN)
app.patch('/api/users/:id', auth_1.requireAuth, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const { name, username, password, role: bodyRole } = req.body ?? {};
        const data = {};
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
            data.password = await (0, auth_1.hashPassword)(password);
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
        // Para la iteración actual usamos room por usuario para evitar broadcast global residual.
        io.to(userRoom(safe.id)).emit('user_updated', safe);
        res.json(safe);
    }
    catch (e) {
        console.error('Error updating user:', e);
        if (e?.code === 'P2025') {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});
// Actualizar estado del usuario (solo el propio usuario)
app.patch('/api/users/:id/status', auth_1.requireAuth, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const { status } = req.body;
        const valid = ['available', 'busy', 'offline'];
        if (!status || !valid.includes(status)) {
            return res.status(400).json({ error: 'Estado inválido. Use: available, busy u offline' });
        }
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user)
            return res.status(404).json({ error: 'Usuario no encontrado' });
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
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});
/** Subir foto de perfil (solo el propio usuario). multipart field: "avatar" */
app.patch('/api/users/:id/avatar', auth_1.authenticateToken, (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (err) {
            console.error('[avatar] multer:', err);
            return res.status(400).json({ error: 'Error al procesar el archivo' });
        }
        next();
    });
}, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        if (req.authUser?.id !== id) {
            return res.status(403).json({ error: 'Solo puedes actualizar tu propio avatar' });
        }
        const file = req.file;
        if (!file?.filename) {
            return res.status(400).json({ error: 'Archivo de imagen requerido (campo avatar)' });
        }
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) {
            try {
                fs_1.default.unlinkSync(path_1.default.join(paths_1.UPLOADS_DIR, file.filename));
            }
            catch {
                /* ignore */
            }
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const prevUrl = existing.avatarUrl;
        if (prevUrl && typeof prevUrl === 'string' && prevUrl.startsWith('/uploads/')) {
            const prevBase = path_1.default.basename(prevUrl);
            if (prevBase && prevBase !== file.filename) {
                const prevPath = path_1.default.join(paths_1.UPLOADS_DIR, prevBase);
                try {
                    if (fs_1.default.existsSync(prevPath))
                        fs_1.default.unlinkSync(prevPath);
                }
                catch {
                    /* ignore */
                }
            }
        }
        const publicPath = `/uploads/${file.filename}`;
        const updated = await prisma.user.update({
            where: { id },
            data: { avatarUrl: publicPath },
        });
        const { password: _p, ...safe } = updated;
        io.to(userRoom(safe.id)).emit('user_updated', safe);
        res.json(safe);
    }
    catch (e) {
        console.error('PATCH /api/users/:id/avatar', e);
        res.status(500).json({ error: 'Error al guardar el avatar' });
    }
});
// Eliminar usuario (solo ADMIN)
app.delete('/api/users/:id', auth_1.requireAuth, auth_1.requireAdmin, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const target = await prisma.user.findUnique({ where: { id } });
        if (!target)
            return res.status(404).json({ error: 'Usuario no encontrado' });
        if (req.authUser && target.id === req.authUser.id) {
            return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
        }
        await prisma.user.delete({ where: { id } });
        res.status(204).send();
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});
const ROLE_SYNC_PROFILES = {
    ADMIN: { syncDocs: true, syncExcel: true, syncFiles: true },
    DISENO: { syncDocs: true, syncExcel: true, syncFiles: true },
    VENTAS: { syncDocs: true, syncExcel: true, syncFiles: false },
    TALLER: { syncDocs: true, syncExcel: false, syncFiles: false },
    USER: { syncDocs: true, syncExcel: false, syncFiles: false },
};
function getSyncProfileForRole(role) {
    return ROLE_SYNC_PROFILES[role] || ROLE_SYNC_PROFILES.USER;
}
// --- Notifications API ---
app.get('/api/notifications', auth_1.authenticateToken, async (req, res) => {
    try {
        // IDOR fix: el usuario solo puede ver sus propias notificaciones.
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 50);
        const skip = Math.max(parseInt(String(req.query.skip ?? '0'), 10) || 0, 0);
        const type = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim() : undefined;
        const paginated = await notificationsService.findManyByUserIdPaginated(prisma, userId, {
            skip,
            take: limit,
            type,
        });
        res.json(paginated);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'No se pudieron cargar las notificaciones' });
    }
});
/** Resumen ligero para badge y punto “reciente” — no sustituye la lista paginada. */
app.get('/api/notifications/unread-summary', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const [unreadCount, recentUnreadCount] = await Promise.all([
            notificationsService.countUnreadForUser(prisma, userId),
            notificationsService.countRecentUnreadForUser(prisma, userId, 2 * 60 * 1000),
        ]);
        res.json({
            unreadCount,
            recentUnread: recentUnreadCount > 0,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'No se pudo cargar el resumen de no leídas' });
    }
});
app.patch('/api/notifications/:id/read', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        await notificationsService.markAsRead(prisma, id, userId);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'No se pudo marcar como leída' });
    }
});
app.patch('/api/notifications/read-all', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        await notificationsService.markAllAsRead(prisma, userId);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
// --- Web Push API (suscripciones PWA) ---
// Debug público: valida si el backend tiene configurado VAPID.
// (No devuelve llaves, solo estado para ayudarte a depurar PWA/Web Push en móvil.)
app.get('/api/push/config', (_req, res) => {
    res.json({
        vapidConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
        hasVapidPublicKey: Boolean(VAPID_PUBLIC_KEY),
        hasVapidPrivateKey: Boolean(VAPID_PRIVATE_KEY),
    });
});
// Devuelve la clave pública VAPID para que el frontend pueda suscribirse
app.get('/api/push/public-key', (_req, res) => {
    if (!VAPID_PUBLIC_KEY) {
        return res.status(503).json({ error: 'Web Push no configurado (falta VAPID_PUBLIC_KEY)' });
    }
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});
// Registrar/actualizar una suscripción Web Push para un usuario
app.post('/api/push/subscribe', auth_1.authenticateToken, async (req, res) => {
    try {
        const authUserId = req.authUser?.id;
        const { subscription } = req.body ?? {};
        if (!authUserId)
            return res.status(401).json({ error: 'No autenticado' });
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return res.status(400).json({ error: 'subscription válida es obligatoria' });
        }
        const { endpoint, keys } = subscription;
        const endpointStr = String(endpoint);
        // Seguridad de ownership: un endpoint de dispositivo/navegador debe pertenecer a un solo usuario.
        // Esto limpia suscripciones antiguas cruzadas por el bug previo (userId en body confiable).
        await prisma.pushSubscription.deleteMany({
            where: {
                endpoint: endpointStr,
                NOT: { userId: authUserId },
            },
        });
        const existing = await prisma.pushSubscription.findFirst({
            where: { userId: authUserId, endpoint: endpointStr },
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
                userId: authUserId,
                endpoint: endpointStr,
                p256dh: String(keys.p256dh),
                auth: String(keys.auth),
            },
        });
        res.status(201).json(created);
    }
    catch (e) {
        console.error('Error registrando suscripción push:', e);
        res.status(500).json({ error: 'Error al registrar suscripción push' });
    }
});
// Eliminar una suscripción (opcional)
app.post('/api/push/unsubscribe', auth_1.authenticateToken, async (req, res) => {
    try {
        const authUserId = req.authUser?.id;
        const { endpoint } = req.body ?? {};
        if (!authUserId)
            return res.status(401).json({ error: 'No autenticado' });
        if (!endpoint) {
            return res.status(400).json({ error: 'endpoint es obligatorio' });
        }
        await prisma.pushSubscription.deleteMany({
            where: { userId: authUserId, endpoint: String(endpoint) },
        });
        res.json({ ok: true });
    }
    catch (e) {
        console.error('Error eliminando suscripción push:', e);
        res.status(500).json({ error: 'Error al eliminar suscripción push' });
    }
});
// Debug: enviar un Web Push de prueba al usuario autenticado
app.post('/api/push/test', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        await sendWebPushToUser(userId, {
            title: 'Test push Sunday',
            body: 'Si recibes esto en iPhone, Web Push está funcionando.',
            url: '/?tab=notifications',
            tag: 'push-test',
        });
        res.json({ ok: true });
    }
    catch (e) {
        console.error('Error enviando push test:', e);
        res.status(500).json({ error: 'No se pudo enviar la prueba de push' });
    }
});
// Estado de suscripción (útil para depurar PWA/Web Push en móvil)
app.get('/api/push/status', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.authUser?.id;
        if (!userId)
            return res.status(401).json({ error: 'No autenticado' });
        const subs = await prisma.pushSubscription.findMany({
            where: { userId },
            select: { id: true, endpoint: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json({
            vapidConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
            subscriptions: subs,
            count: subs.length,
            hasSubscription: subs.length > 0,
        });
    }
    catch (e) {
        console.error('Error en /api/push/status:', e);
        res.status(500).json({ error: 'No se pudo obtener el estado de push' });
    }
});
// --- Export folders: generar manifiesto para sincronización local (solo ítems asignados al usuario) ---
function sanitizeFolderName(name) {
    return (name || '').replace(/[<>:"/\\|?*]/g, '_').trim() || 'Sin_nombre';
}
function isAssignedToUser(columnValues, personColumnId, userId) {
    const cv = columnValues.find(v => v.columnId === personColumnId);
    if (!cv?.value)
        return false;
    const raw = cv.value.trim();
    if (!raw)
        return false;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
            return parsed.includes(userId);
        return String(parsed) === userId;
    }
    catch {
        return raw === userId;
    }
}
function extractUploadUrls(value) {
    if (!value)
        return [];
    const trimmed = value.trim();
    if (!trimmed)
        return [];
    // TODO: resolver *DocId para columnas docs (requiere lookup adicional a DB por referencia).
    if (trimmed.startsWith('/uploads/'))
        return [trimmed];
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const url = parsed.url;
            if (typeof url === 'string' && url.startsWith('/uploads/'))
                return [url];
        }
    }
    catch {
        // payload no JSON
    }
    return [];
}
function extractPersonUserIds(value) {
    if (!value || typeof value !== 'string')
        return [];
    const trimmed = value.trim();
    if (!trimmed)
        return [];
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed
                .map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
                .filter(Boolean);
        }
        if (typeof parsed === 'string')
            return parsed.trim() ? [parsed.trim()] : [];
        const scalar = String(parsed ?? '').trim();
        return scalar ? [scalar] : [];
    }
    catch {
        return [trimmed];
    }
}
async function deletePhysicalFileIfUnreferenced(fileUrl, excludeItemId) {
    if (!fileUrl.startsWith('/uploads/'))
        return;
    const filename = path_1.default.basename(fileUrl);
    if (!filename)
        return;
    try {
        // TODO: migrar a verificación por valueJson/parse estructurado para evitar falsos positivos de contains.
        const refCount = await prisma.columnValue.count({
            where: {
                value: { contains: `/uploads/${filename}` },
                ...(excludeItemId ? { NOT: { itemId: excludeItemId } } : {}),
            },
        });
        if (refCount > 0)
            return;
        await fs_1.default.promises.unlink(path_1.default.join(paths_1.UPLOADS_DIR, filename));
    }
    catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(`[cleanup] No se pudo eliminar ${fileUrl}:`, e);
        }
    }
}
async function collectExportManifestFiles(boardId, userId) {
    // TODO(db/perf): optimizar manifiesto export con selects mínimos y filtrado progresivo por columnas/tipos.
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
    if (!board)
        return null;
    const personCol = board.columns.find(c => c.type === 'person');
    const fileColumns = board.columns.filter(c => c.type === 'docs' || c.type === 'excel' || c.type === 'file');
    if (!personCol || fileColumns.length === 0)
        return [];
    const allGroups = board.groups;
    const getChildren = (parentId) => allGroups.filter(g => g.parentGroupId === parentId);
    const rootGroups = allGroups.filter(g => !g.parentGroupId);
    const files = [];
    const seen = new Set();
    for (const rootGroup of rootGroups) {
        const yearMonth = sanitizeFolderName(rootGroup.name);
        const clientGroups = getChildren(rootGroup.id);
        const targetClients = clientGroups.length > 0 ? clientGroups : [rootGroup];
        for (const client of targetClients) {
            const clientName = sanitizeFolderName(client.name);
            for (const item of client.items) {
                if (!isAssignedToUser(item.columnValues, personCol.id, String(userId)))
                    continue;
                const itemName = sanitizeFolderName(item.name || 'Elemento');
                for (const col of fileColumns) {
                    const cv = item.columnValues.find(v => v.columnId === col.id);
                    if (!cv?.value)
                        continue;
                    const uploadUrls = extractUploadUrls(cv.value);
                    for (const url of uploadUrls) {
                        const filename = path_1.default.basename(url);
                        if (!filename)
                            continue;
                        const srcPath = path_1.default.join(paths_1.UPLOADS_DIR, filename);
                        const stat = await fs_1.default.promises.stat(srcPath).catch(() => null);
                        if (!stat?.isFile())
                            continue;
                        const zipPath = path_1.default.posix.join(yearMonth, clientName, itemName, filename);
                        const dedupeKey = `${zipPath}|${url}`;
                        if (seen.has(dedupeKey))
                            continue;
                        seen.add(dedupeKey);
                        files.push({
                            zipPath,
                            url,
                            filename,
                            size: stat.size,
                        });
                    }
                }
            }
        }
    }
    return files;
}
app.get('/api/export/folders/files', auth_1.authenticateToken, async (req, res) => {
    try {
        const boardId = queryParamToString(req.query.boardId);
        const userId = queryParamToString(req.query.userId);
        if (!boardId || !userId) {
            return res.status(400).json({ error: 'boardId y userId son obligatorios' });
        }
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        if (authUser.role !== 'ADMIN' && authUser.id !== userId) {
            return res.status(403).json({ error: 'No autorizado para este userId' });
        }
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user)
            return res.status(404).json({ error: 'Usuario no encontrado' });
        const files = await collectExportManifestFiles(boardId, userId);
        if (files === null)
            return res.status(404).json({ error: 'Tablero no encontrado' });
        return res.json({ ok: true, files, total: files.length });
    }
    catch (e) {
        console.error('Export folders manifest error:', e);
        return res.status(500).json({ ok: false, error: GENERIC_INTERNAL_ERROR });
    }
});
// --- Docs API (simple docs/sheets por workspace/board) ---
// Comprobar que las rutas de docs están cargadas (útil si POST /api/docs da 404)
app.get('/api/docs/check', (_req, res) => {
    res.json({ ok: true, docs: true });
});
app.get('/api/docs', auth_1.authenticateToken, async (req, res) => {
    try {
        const workspaceId = queryParamToString(req.query.workspaceId);
        const boardId = queryParamToString(req.query.boardId);
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId es obligatorio' });
        }
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, workspaceId, boardId)))
            return;
        const docs = await prisma.doc.findMany({
            where: {
                workspaceId,
                boardId: boardId || undefined,
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(docs);
    }
    catch (e) {
        console.error('Error fetching docs list:', e);
        res.status(500).json({ error: 'No se pudieron cargar los documentos' });
    }
});
app.post('/api/docs', auth_1.authenticateToken, async (req, res) => {
    try {
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const body = req.body ?? {};
        const workspaceId = String(body.workspaceId || '').trim();
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId es obligatorio' });
        }
        const boardId = body.boardId ? String(body.boardId) : null;
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, workspaceId, boardId)))
            return;
        const title = (body.title && String(body.title).trim()) || 'Nuevo doc';
        const type = (body.type && String(body.type).trim()) || 'text';
        const rawContent = body.content ?? {};
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        const contentJson = typeof rawContent === 'string'
            ? JSON.parse(rawContent)
            : rawContent;
        // FIX 4: atribución de autor solo en servidor (evita spoofing de createdBy).
        const doc = await prisma.doc.create({
            data: {
                title,
                type,
                content,
                contentJson: jsonToInput(contentJson),
                workspaceId,
                boardId,
                createdBy: authUser.id,
            },
        });
        res.status(201).json(doc);
    }
    catch (e) {
        console.error('Error creating doc:', e);
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
// --- Configuración de plantilla de cotización (por workspace) ----------------
// Endpoints antiguos de configuración de plantilla de cotización se han
// eliminado para simplificar el flujo. Ahora la generación usa únicamente
// la plantilla PDF base y las posiciones definidas en templatePdfGenerator.ts.
// HEAD para comprobar existencia del doc (usado por DocsCellRenderer sin cuerpo)
app.head('/api/docs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).end();
        const doc = await prisma.doc.findUnique({
            where: { id },
            select: { id: true, workspaceId: true, boardId: true },
        });
        if (!doc)
            return res.status(404).end();
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, doc.workspaceId, doc.boardId)))
            return;
        res.status(200).end();
    }
    catch (e) {
        console.error('Error checking doc:', e);
        res.status(500).end();
    }
});
// Cache de contenido para exportación por captura: mismo contenido que el preview (draft actual).
const exportContentCache = new Map();
const EXPORT_CONTENT_TTL_MS = 120_000; // 2 min
function cleanupExportContentCache() {
    const now = Date.now();
    for (const [key, entry] of exportContentCache.entries()) {
        if (entry.expires < now)
            exportContentCache.delete(key);
    }
}
app.get('/api/docs/export-content', (req, res) => {
    const token = req.query.token?.trim();
    const contentKey = req.query.contentKey?.trim();
    if (!token || !contentKey)
        return res.status(400).json({ error: 'Faltan token o contentKey' });
    try {
        const { docId } = (0, auth_1.verifyExportToken)(token);
        cleanupExportContentCache();
        const entry = exportContentCache.get(contentKey);
        if (!entry)
            return res.status(404).json({ error: 'Contenido de exportación expirado o ya usado' });
        if (entry.docId !== docId)
            return res.status(403).json({ error: 'No autorizado' });
        exportContentCache.delete(contentKey);
        res.json({ content: entry.content, docType: entry.docType });
    }
    catch {
        res.status(401).json({ error: 'Token de exportación inválido o expirado' });
    }
});
// Verificación de token de exportación (sin auth de sesión)
app.get('/api/docs/export-verify', (req, res) => {
    const token = req.query.token?.trim();
    if (!token)
        return res.status(400).json({ error: 'Falta token' });
    try {
        const { docId } = (0, auth_1.verifyExportToken)(token);
        res.json({ docId });
    }
    catch {
        res.status(401).json({ error: 'Token de exportación inválido o expirado' });
    }
});
app.get('/api/docs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const auth = req.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        // FIX 7: docId de exportación solo desde JWT verificado (firma), no jwt.decode.
        let exportDocId = null;
        if (token) {
            try {
                const exp = (0, auth_1.verifyExportToken)(token);
                exportDocId = exp.docId;
            }
            catch {
                exportDocId = null;
            }
        }
        if (exportDocId != null && exportDocId !== id) {
            return res.status(403).json({ error: 'No autorizado para este documento' });
        }
        const doc = await prisma.doc.findUnique({ where: { id } });
        if (!doc)
            return res.status(404).json({ error: 'Doc no encontrado' });
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, doc.workspaceId, doc.boardId)))
            return;
        res.json(doc);
    }
    catch (e) {
        console.error('Error fetching doc:', e);
        res.status(500).json({ error: 'No se pudo cargar el documento' });
    }
});
app.patch('/api/docs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const existing = await prisma.doc.findUnique({
            where: { id },
            select: { workspaceId: true, boardId: true },
        });
        if (!existing)
            return res.status(404).json({ error: 'Doc no encontrado' });
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, existing.workspaceId, existing.boardId)))
            return;
        const body = req.body ?? {};
        const data = {};
        if (body.title !== undefined)
            data.title = String(body.title).trim() || 'Sin título';
        if (body.type !== undefined)
            data.type = String(body.type).trim() || 'text';
        if (body.content !== undefined) {
            const rawContent = body.content;
            data.content =
                typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent ?? {});
            const parsedJson = typeof rawContent === 'string'
                ? JSON.parse(rawContent)
                : rawContent;
            data.contentJson = jsonToInput(parsedJson);
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Nada que actualizar' });
        }
        const doc = await prisma.doc.update({ where: { id }, data });
        res.json(doc);
    }
    catch (e) {
        console.error('Error updating doc:', e);
        if (e?.code === 'P2025') {
            return res.status(404).json({ error: 'Doc no encontrado' });
        }
        res.status(500).json({ error: 'No se pudo actualizar el documento' });
    }
});
app.delete('/api/docs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const meta = await prisma.doc.findUnique({
            where: { id },
            select: { workspaceId: true, boardId: true },
        });
        if (!meta)
            return res.status(404).json({ error: 'Doc no encontrado' });
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, meta.workspaceId, meta.boardId)))
            return;
        const cleanupUrls = new Set();
        const updatesToEmit = [];
        await prisma.$transaction(async (tx) => {
            // 1) Eliminar el doc
            await tx.doc.delete({ where: { id } });
            // 2) Limpiar referencias en columnas de tipo docs/excel donde este id esté como docId
            const relevantColumns = await tx.boardColumn.findMany({
                where: {
                    type: { in: ['docs', 'excel'] },
                },
                select: { id: true, type: true, boardId: true },
            });
            if (relevantColumns.length === 0)
                return;
            const columnMap = new Map();
            for (const c of relevantColumns) {
                columnMap.set(c.id, { colType: c.type, boardId: c.boardId });
            }
            const columnIds = relevantColumns.map((c) => c.id);
            const columnValues = await tx.columnValue.findMany({
                where: {
                    columnId: { in: columnIds },
                },
            });
            for (const cv of columnValues) {
                const meta = columnMap.get(cv.columnId);
                const colType = meta?.colType;
                const boardId = meta?.boardId;
                if (!cv.value || !colType || !boardId)
                    continue;
                // Recolectar posibles archivos para limpieza física posterior.
                const referencedUrls = extractUploadUrls(cv.value);
                for (const url of referencedUrls)
                    cleanupUrls.add(url);
                let changed = false;
                let nextValue = cv.value;
                if (colType === 'excel') {
                    // Formato esperado: { docId?: string; url?: string }
                    let parsed = null;
                    try {
                        parsed = JSON.parse(cv.value);
                    }
                    catch {
                        parsed = null;
                    }
                    if (parsed) {
                        if (String(parsed.docId || '') === String(id)) {
                            delete parsed.docId;
                            changed = true;
                        }
                        if (!parsed.docId && !parsed.url) {
                            nextValue = '';
                        }
                        else {
                            nextValue = JSON.stringify(parsed);
                        }
                    }
                }
                else if (colType === 'docs') {
                    // Formato esperado: JSON con posibles claves *DocId
                    let parsed = null;
                    try {
                        parsed = JSON.parse(cv.value);
                    }
                    catch {
                        parsed = null;
                    }
                    if (parsed) {
                        const keys = [
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
                        }
                        else {
                            nextValue = JSON.stringify(parsed);
                        }
                    }
                }
                if (changed) {
                    const valueLegacy = nextValue ?? '';
                    const updated = await tx.columnValue.update({
                        where: { id: cv.id },
                        data: { value: valueLegacy, valueJson: jsonToInput(toValueJson(valueLegacy)) },
                    });
                    updatesToEmit.push({ boardId, updated });
                }
            }
        });
        for (const { boardId, updated } of updatesToEmit) {
            io.to(boardRoom(boardId)).emit('column_value_updated', updated);
        }
        void Promise.all(Array.from(cleanupUrls).map((url) => deletePhysicalFileIfUnreferenced(url)));
        res.status(204).send();
    }
    catch (e) {
        console.error('Error deleting doc:', e);
        if (e?.code === 'P2025') {
            return res.status(404).json({ error: 'Doc no encontrado' });
        }
        res.status(500).json({ error: 'No se pudo eliminar el documento' });
    }
});
// --- Designs API (editores vectoriales por workspace) ---
app.get('/api/designs', auth_1.authenticateToken, async (req, res) => {
    try {
        const workspaceId = queryParamToString(req.query.workspaceId);
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId es obligatorio' });
        }
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, workspaceId, null)))
            return;
        const designs = await prisma.design.findMany({
            where: { workspaceId },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(designs);
    }
    catch (e) {
        console.error('Error fetching designs list:', e);
        res.status(500).json({ error: 'No se pudieron cargar los diseños' });
    }
});
app.post('/api/designs', auth_1.authenticateToken, async (req, res) => {
    try {
        const authUser = req.authUser;
        if (!authUser)
            return res.status(401).json({ error: 'No autenticado' });
        const body = req.body ?? {};
        const workspaceId = String(body.workspaceId || '').trim();
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId es obligatorio' });
        }
        const boardId = body.boardId ? String(body.boardId) : null;
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, workspaceId, boardId)))
            return;
        const name = (body.name && String(body.name).trim()) || 'Nuevo diseño';
        const rawContent = body.content ?? {};
        let content;
        let contentJson;
        if (typeof rawContent === 'string') {
            content = rawContent;
            try {
                contentJson = JSON.parse(rawContent);
            }
            catch {
                contentJson = undefined;
            }
        }
        else {
            content = JSON.stringify(rawContent);
            contentJson = rawContent;
        }
        // FIX 4: createdBy solo desde la sesión (evita spoofing).
        const design = await prisma.design.create({
            data: {
                name,
                content,
                contentJson: jsonToInput(contentJson),
                workspaceId,
                boardId,
                createdBy: authUser.id,
            },
        });
        res.status(201).json(design);
    }
    catch (e) {
        console.error('Error creating design:', e);
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
app.get('/api/designs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const design = await prisma.design.findUnique({ where: { id } });
        if (!design)
            return res.status(404).json({ error: 'Diseño no encontrado' });
        // FIX 1 (IDOR): mismo criterio de workspace/board que en docs.
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, design.workspaceId, design.boardId)))
            return;
        res.json(design);
    }
    catch (e) {
        console.error('Error fetching design:', e);
        res.status(500).json({ error: 'No se pudo cargar el diseño' });
    }
});
app.patch('/api/designs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const existing = await prisma.design.findUnique({
            where: { id },
            select: { workspaceId: true, boardId: true },
        });
        if (!existing)
            return res.status(404).json({ error: 'Diseño no encontrado' });
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, existing.workspaceId, existing.boardId)))
            return;
        const body = req.body ?? {};
        const data = {};
        if (body.name !== undefined)
            data.name = String(body.name).trim() || 'Sin título';
        if (body.content !== undefined) {
            const rawContent = body.content;
            if (typeof rawContent === 'string') {
                data.content = rawContent;
                try {
                    data.contentJson = jsonToInput(JSON.parse(rawContent));
                }
                catch {
                    data.contentJson = undefined;
                }
            }
            else {
                data.content = JSON.stringify(rawContent ?? {});
                data.contentJson = jsonToInput(rawContent);
            }
        }
        if (body.thumbnailUrl !== undefined) {
            data.thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl) : null;
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Nada que actualizar' });
        }
        const design = await prisma.design.update({ where: { id }, data });
        res.json(design);
    }
    catch (e) {
        console.error('Error updating design:', e);
        if (e?.code === 'P2025') {
            return res.status(404).json({ error: 'Diseño no encontrado' });
        }
        res.status(500).json({ error: 'No se pudo actualizar el diseño' });
    }
});
app.delete('/api/designs/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const id = queryParamToString(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'id inválido' });
        const meta = await prisma.design.findUnique({
            where: { id },
            select: { workspaceId: true, boardId: true },
        });
        if (!meta)
            return res.status(404).json({ error: 'Diseño no encontrado' });
        if (!(await assertUserCanAccessWorkspaceForDocOrDesign(res, meta.workspaceId, meta.boardId)))
            return;
        await prisma.design.delete({ where: { id } });
        res.status(204).end();
    }
    catch (e) {
        console.error('Error deleting design:', e);
        if (e?.code === 'P2025') {
            return res.status(404).json({ error: 'Diseño no encontrado' });
        }
        res.status(500).json({ error: 'No se pudo eliminar el diseño' });
    }
});
// ── Templates (PDF plantillas para cotización, levantamiento, hoja de trabajo) ────────────────
const TEMPLATE_KINDS = ['cotizacion', 'levantamiento', 'hoja_trabajo'];
app.get('/api/templates/:kind', auth_1.authenticateToken, (req, res) => {
    const kind = String(req.params.kind || '').trim().toLowerCase();
    if (!TEMPLATE_KINDS.includes(kind)) {
        return res.status(400).json({ error: 'Tipo de plantilla no válido' });
    }
    const templatePath = (0, templatePdfGenerator_1.getTemplatePathIfExists)(kind);
    if (templatePath) {
        res.setHeader('Content-Type', 'application/pdf');
        return res.sendFile(templatePath, (err) => {
            if (err)
                res.status(500).json({ error: 'Error al enviar plantilla' });
        });
    }
    const templateImage = (0, templatePdfGenerator_1.getTemplateImagePathIfExists)(kind);
    if (templateImage) {
        res.setHeader('Content-Type', templateImage.isPng ? 'image/png' : 'image/jpeg');
        return res.sendFile(templateImage.path, (err) => {
            if (err)
                res.status(500).json({ error: 'Error al enviar plantilla' });
        });
    }
    return res.status(404).json({ error: 'Plantilla no encontrada. Coloca el PDF o JPG en backend/templates/' + kind + '.pdf (o .jpg)' });
});
// Subida de plantilla PDF base diseñada en Illustrator/Corel para un tipo concreto.
// Solo ADMIN. Guarda el archivo como backend/templates/<kind>.pdf
app.post('/api/templates/:kind/upload', auth_1.authenticateToken, auth_1.requireAdmin, upload.single('file'), async (req, res) => {
    try {
        const kind = req.params.kind;
        if (!TEMPLATE_KINDS.includes(kind)) {
            return res.status(400).json({ error: 'Tipo de plantilla no válido' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No se envió ningún archivo' });
        }
        if (req.file.mimetype !== 'application/pdf') {
            try {
                await fs_1.default.promises.unlink(req.file.path);
            }
            catch (unlinkErr) {
                console.warn('No se pudo borrar archivo temporal de plantilla inválida:', unlinkErr);
            }
            return res.status(400).json({ error: 'Solo se aceptan archivos PDF para plantillas' });
        }
        const templatesDir = (0, templatePdfGenerator_1.getTemplatesDir)();
        try {
            fs_1.default.mkdirSync(templatesDir, { recursive: true });
        }
        catch {
            // ignorar si ya existe
        }
        const targetPath = path_1.default.join(templatesDir, `${kind}.pdf`);
        fs_1.default.copyFileSync(req.file.path, targetPath);
        return res.status(201).json({
            ok: true,
            kind,
            path: `/templates/${kind}.pdf`,
        });
    }
    catch (e) {
        console.error('Error subiendo plantilla PDF:', e);
        return res.status(500).json({ error: 'Error al subir plantilla PDF' });
    }
});
// Relleno directo de plantilla PDF con pdf-lib.
// Paso 1: solo cotización con 3 campos básicos (cliente, fecha, total).
app.post('/api/templates/:kind/fill', auth_1.authenticateToken, async (req, res) => {
    try {
        const kind = req.params.kind;
        if (!TEMPLATE_KINDS.includes(kind)) {
            return res.status(400).json({ error: 'Tipo de plantilla no válido' });
        }
        const body = req.body ?? {};
        const fields = (body.fields ?? {});
        const buffer = await (0, templatePdfGenerator_1.generateFilledPdf)(kind, fields);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${kind}.pdf"`);
        return res.send(buffer);
    }
    catch (e) {
        console.error('Error rellenando plantilla PDF:', e);
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('Plantilla') && msg.includes('no encontrada')) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }
        return res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// Generación PDF:
// 1) Camino principal: captura 1:1 de la vista /docs/export (React + pdf.js + plantilla real) a 300 dpi.
// 2) Fallback 1: worker interno (generatePdfFromDocument) rasterizado a 300 dpi sin depender del frontend.
// 3) Fallback 2: PDF vectorial generatePdfFromTemplate para no romper la descarga.
app.post('/api/templates/:kind/generate', auth_1.authenticateToken, async (req, res) => {
    console.log(`[PDF] Generating ${req.params.kind}...`);
    try {
        const kind = req.params.kind;
        if (!TEMPLATE_KINDS.includes(kind)) {
            return res.status(400).json({ error: 'Tipo de plantilla no válido' });
        }
        const rawContent = req.body?.content;
        const content = rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)
            ? rawContent
            : {};
        const docId = typeof req.body?.docId === 'string' ? req.body.docId.trim() : null;
        // Guardamos el contenido en caché para que la vista /docs/export lo use exactamente igual
        // que el preview (buildPdfContent → customBoxes, etc.) y Puppeteer haga una captura 1:1.
        const contentKey = crypto_1.default.randomUUID();
        exportContentCache.set(contentKey, {
            content,
            docId: docId ?? '',
            docType: kind,
            expires: Date.now() + EXPORT_CONTENT_TTL_MS,
        });
        const exportToken = (0, auth_1.signExportToken)({
            userId: req.authUser.id,
            docId: docId ?? '',
            purpose: 'export',
        });
        let buffer;
        let pdfMethod = 'client-capture';
        try {
            const { generatePdfFromExportPreview, generatePdfFromDocument } = await Promise.resolve().then(() => __importStar(require('./htmlPdfGenerator')));
            // 1) Captura real del frontend (/docs/export) a escala 300/96 (300 dpi efectivos)
            buffer = await generatePdfFromExportPreview({
                frontendUrl: FRONTEND_URL,
                docId: docId ?? '',
                token: exportToken,
                contentKey,
                exportScale: 3.125,
            });
        }
        catch (clientCaptureError) {
            console.warn('[PDF] Client capture failed, trying worker rasterization:', clientCaptureError);
            try {
                const { generatePdfFromDocument } = await Promise.resolve().then(() => __importStar(require('./htmlPdfGenerator')));
                const templatePdfPath = (0, templatePdfGenerator_1.getTemplatePathIfExists)(kind);
                buffer = await generatePdfFromDocument({
                    content,
                    templatePdfPath: templatePdfPath ?? undefined,
                });
                pdfMethod = 'raster-300dpi';
            }
            catch (workerError) {
                console.warn('[PDF] Worker rasterization failed, falling back to vector PDF:', workerError);
                buffer = await (0, templatePdfGenerator_1.generatePdfFromTemplate)(kind, content);
                pdfMethod = 'vector-fallback';
            }
        }
        finally {
            exportContentCache.delete(contentKey);
        }
        res.setHeader('X-PDF-Method', pdfMethod);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="' + kind + '.pdf"');
        res.send(buffer);
    }
    catch (e) {
        console.error('Error generating PDF:', e);
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
// En producción, servir el frontend compilado (Vite build) desde Express.
// Asume que el build vive en ../frontend/dist relativo al backend.
if (process.env.NODE_ENV === 'production') {
    const frontendDist = path_1.default.join(process.cwd(), '..', 'frontend', 'dist');
    // Middleware para evitar cache de sw.js y index.html
    app.use((req, res, next) => {
        const filename = req.path.split('/').pop();
        if (filename === 'sw.js') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }
        else if (filename === 'index.html' || req.path === '/') {
            res.setHeader('Cache-Control', 'no-cache');
        }
        else if (req.path.includes('/assets/')) {
            // Los assets de Vite tienen hash, se pueden cachear agresivamente
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
    });
    app.use(express_1.default.static(frontendDist, {
        index: false, // Desactivamos el index automático para manejarlo abajo
    }));
    // Express 5 / path-to-regexp: no usar app.get('*'). SPA fallback solo para GET/HEAD.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD')
            return next();
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
            return next();
        }
        const indexHtml = path_1.default.join(frontendDist, 'index.html');
        fs_1.default.access(indexHtml, fs_1.default.constants.F_OK, (err) => {
            if (err)
                return next();
            res.sendFile(indexHtml);
        });
    });
}
// Configuración global de plantilla (posiciones, fuente). GET: todos; PUT: guardar por usuario.
function getDefaultTemplateConfig() {
    return {
        fieldPositions: {},
        fontColor: '#000000',
        fontFamily: 'Helvetica',
        fontSize: 11,
        fontBold: false,
        fontItalic: false,
        customBoxes: [],
        defaultContent: {},
    };
}
app.get('/api/templates/:kind/config', auth_1.authenticateToken, async (req, res) => {
    const defaultConfig = getDefaultTemplateConfig();
    try {
        const kind = req.params.kind;
        if (!TEMPLATE_KINDS.includes(kind)) {
            return res.status(400).json({ error: 'Tipo de plantilla no válido' });
        }
        const row = await prisma.templateConfig.findUnique({ where: { docType: kind } });
        if (!row)
            return res.json(defaultConfig);
        try {
            defaultConfig.fieldPositions = typeof row.fieldPositions === 'string' ? JSON.parse(row.fieldPositions) : row.fieldPositions ?? {};
        }
        catch (_) { }
        try {
            const raw = row.customBoxes;
            defaultConfig.customBoxes = typeof raw === 'string' ? (JSON.parse(raw) || []) : (Array.isArray(raw) ? raw : []);
        }
        catch (_) {
            defaultConfig.customBoxes = [];
        }
        defaultConfig.fontColor = row.fontColor || '#000000';
        defaultConfig.fontFamily = row.fontFamily || 'Helvetica';
        defaultConfig.fontSize = row.fontSize ?? 11;
        defaultConfig.fontBold = row.fontBold ?? false;
        defaultConfig.fontItalic = row.fontItalic ?? false;
        try {
            const dc = row.defaultContentJson;
            if (dc != null && typeof dc === 'object' && !Array.isArray(dc)) {
                defaultConfig.defaultContent = dc;
            }
        }
        catch (_) { }
        return res.json(defaultConfig);
    }
    catch (e) {
        console.error('Error fetching template config:', e);
        // Defensivo: tabla inexistente, excepción, etc. → 200 con config por defecto
        return res.status(200).json(defaultConfig);
    }
});
// FIX 2: configuración global de plantillas PDF solo modificable por ADMIN (evita takeover de layout PDF).
app.put('/api/templates/:kind/config', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const kind = req.params.kind;
        if (!TEMPLATE_KINDS.includes(kind)) {
            return res.status(400).json({ error: 'Tipo de plantilla no válido' });
        }
        const body = req.body || {};
        const userIdRaw = body.userId ||
            req.query.userId ||
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
        const hasDefaultContentKey = Object.prototype.hasOwnProperty.call(body, 'defaultContent');
        const defaultContentPayload = hasDefaultContentKey && body.defaultContent != null && typeof body.defaultContent === 'object' && !Array.isArray(body.defaultContent)
            ? body.defaultContent
            : hasDefaultContentKey
                ? client_1.Prisma.JsonNull
                : undefined;
        const fieldPositionsStr = typeof fieldPositions === 'object' && fieldPositions !== null
            ? JSON.stringify(fieldPositions)
            : '{}';
        const customBoxesStr = JSON.stringify(customBoxes);
        const baseCreate = {
            docType: kind,
            fieldPositions: fieldPositionsStr,
            fieldPositionsJson: fieldPositions,
            fontColor,
            fontFamily,
            fontSize,
            fontBold,
            fontItalic,
            customBoxes: customBoxesStr,
            customBoxesJson: customBoxes,
        };
        const baseUpdate = {
            fieldPositions: fieldPositionsStr,
            fieldPositionsJson: fieldPositions,
            fontColor,
            fontFamily,
            fontSize,
            fontBold,
            fontItalic,
            customBoxes: customBoxesStr,
            customBoxesJson: customBoxes,
        };
        const createWithDefault = defaultContentPayload !== undefined
            ? { ...baseCreate, defaultContentJson: defaultContentPayload }
            : baseCreate;
        const updateWithDefault = defaultContentPayload !== undefined
            ? { ...baseUpdate, defaultContentJson: defaultContentPayload }
            : baseUpdate;
        try {
            await prisma.templateConfig.upsert({
                where: { docType: kind },
                create: createWithDefault,
                update: updateWithDefault,
            });
        }
        catch (upsertErr) {
            const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
            // Compatibilidad: algunos entornos siguen con Prisma Client sin `defaultContentJson`.
            if (msg.includes('Unknown argument `defaultContentJson`')) {
                await prisma.templateConfig.upsert({
                    where: { docType: kind },
                    create: baseCreate,
                    update: baseUpdate,
                });
            }
            else {
                throw upsertErr;
            }
        }
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('Error saving template config:', e);
        const err = e;
        if (err?.code === 'P2021' || (typeof e.message === 'string' && e.message?.includes('does not exist'))) {
            return res.status(503).json({
                error: 'La tabla de configuración de plantillas no existe. Ejecuta: npx prisma migrate deploy o npx prisma db push',
            });
        }
        return res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
// ── Calendar-only events (no se crean en tablero ni grupo) ─────────────────
app.get('/api/boards/:boardId/calendar-events', auth_1.authenticateToken, async (req, res) => {
    try {
        const boardId = queryParamToString(req.params.boardId);
        if (!boardId)
            return res.status(400).json({ error: 'boardId inválido' });
        const events = await prisma.calendarEvent.findMany({
            where: { boardId },
            orderBy: { eventDate: 'asc' },
        });
        res.json(events);
    }
    catch (e) {
        console.error('Error fetching calendar events:', e);
        res.status(500).json({ error: 'No se pudieron cargar los eventos del calendario' });
    }
});
app.post('/api/boards/:boardId/calendar-events', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS', 'DISENO']), async (req, res) => {
    try {
        const boardId = queryParamToString(req.params.boardId);
        if (!boardId)
            return res.status(400).json({ error: 'boardId inválido' });
        const { name, eventType, date, time } = req.body;
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
    }
    catch (e) {
        console.error('Error creating calendar event:', e);
        res.status(500).json({ error: 'No se pudo crear el evento del calendario' });
    }
});
app.patch('/api/boards/:boardId/calendar-events/:eventId', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS', 'DISENO']), async (req, res) => {
    try {
        const boardId = queryParamToString(req.params.boardId);
        const eventId = queryParamToString(req.params.eventId);
        if (!boardId || !eventId)
            return res.status(400).json({ error: 'boardId o eventId inválido' });
        const { name, eventType, date, time } = req.body;
        const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, boardId } });
        if (!existing)
            return res.status(404).json({ error: 'Evento no encontrado' });
        const updates = {};
        if (name !== undefined)
            updates.name = String(name).trim() || existing.name;
        if (eventType !== undefined)
            updates.eventType = String(eventType);
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
    }
    catch (e) {
        console.error('Error updating calendar event:', e);
        res.status(500).json({ error: 'No se pudo actualizar el evento del calendario' });
    }
});
app.delete('/api/boards/:boardId/calendar-events/:eventId', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS', 'DISENO']), async (req, res) => {
    try {
        const boardId = queryParamToString(req.params.boardId);
        const eventId = queryParamToString(req.params.eventId);
        if (!boardId || !eventId)
            return res.status(400).json({ error: 'boardId o eventId inválido' });
        await prisma.calendarEvent.deleteMany({ where: { id: eventId, boardId } });
        io.to(boardRoom(boardId)).emit('calendar_event_deleted', { boardId, eventId });
        res.status(204).send();
    }
    catch (e) {
        console.error('Error deleting calendar event:', e);
        res.status(500).json({ error: 'No se pudo eliminar el evento del calendario' });
    }
});
// DELETE item (misma lógica que socket delete_item: persistencia en BD)
app.delete('/api/items/:id', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS']), async (req, res) => {
    try {
        const itemIdParam = req.params.id;
        const itemId = Array.isArray(itemIdParam) ? itemIdParam[0] : itemIdParam;
        if (!itemId) {
            return res.status(400).json({ error: 'itemId es obligatorio' });
        }
        const itemWithFiles = await prisma.item.findUnique({
            where: { id: itemId },
            select: {
                columnValues: { select: { value: true } },
            },
        });
        const uploadUrls = Array.from(new Set((itemWithFiles?.columnValues ?? []).flatMap(cv => extractUploadUrls(cv.value))));
        await prisma.$transaction([
            prisma.columnValue.deleteMany({ where: { itemId } }),
            prisma.update.deleteMany({ where: { itemId } }),
            prisma.notification.deleteMany({ where: { itemId } }),
            prisma.item.delete({ where: { id: itemId } }),
        ]);
        void Promise.all(uploadUrls.map(url => deletePhysicalFileIfUnreferenced(url, itemId))).catch((err) => console.error('Error borrando archivos (DELETE /api/items):', err));
        res.status(204).send();
    }
    catch (e) {
        console.error('Error deleting item:', e);
        if (handlePrismaError(e, res))
            return;
        res.status(500).json({ error: 'Error al eliminar el elemento' });
    }
});
// --- Cotizaciones (folio autoincremental; PDF solo en cliente) ---
app.post('/api/cotizaciones', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS', 'DISENO', 'TALLER']), async (req, res) => {
    try {
        const auth = req.authUser;
        if (!auth)
            return res.status(401).json({ error: 'No autenticado' });
        const body = req.body ?? {};
        const clienteRaw = body.cliente;
        const cliente = typeof clienteRaw === 'string' && clienteRaw.trim() ? clienteRaw.trim() : null;
        const rawItems = body.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return res.status(400).json({ error: 'items debe ser un array no vacío' });
        }
        const items = [];
        for (const raw of rawItems) {
            if (!raw || typeof raw !== 'object') {
                return res.status(400).json({ error: 'Ítem inválido' });
            }
            const r = raw;
            const servicio = typeof r.servicio === 'string' ? r.servicio.trim() : '';
            if (!servicio)
                return res.status(400).json({ error: 'Cada ítem requiere servicio' });
            const sufijo = typeof r.sufijo === 'string' ? r.sufijo.trim() : '';
            if (!sufijo)
                return res.status(400).json({ error: 'Cada ítem requiere sufijo' });
            const cantidad = Number(r.cantidad);
            const precioUnit = Number(r.precioUnit);
            const total = Number(r.total);
            if (!Number.isFinite(cantidad) || cantidad < 0) {
                return res.status(400).json({ error: 'cantidad inválida' });
            }
            if (!Number.isFinite(precioUnit) || precioUnit < 0) {
                return res.status(400).json({ error: 'precioUnit inválido' });
            }
            if (!Number.isFinite(total) || total < 0) {
                return res.status(400).json({ error: 'total inválido' });
            }
            items.push({ servicio, cantidad, sufijo, precioUnit, total });
        }
        const total = items.reduce((s, i) => s + i.total, 0);
        const created = await prisma.$transaction(async (tx) => tx.cotizacion.create({
            data: {
                creadoPorId: auth.id,
                cliente,
                total,
                items: {
                    create: items.map((i) => ({
                        servicio: i.servicio,
                        cantidad: i.cantidad,
                        sufijo: i.sufijo,
                        precioUnit: i.precioUnit,
                        total: i.total,
                    })),
                },
            },
            include: { items: true },
        }));
        res.status(201).json(created);
    }
    catch (e) {
        console.error('POST /api/cotizaciones', e);
        if (handlePrismaError(e, res))
            return;
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
app.get('/api/cotizaciones', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS']), async (_req, res) => {
    try {
        const rows = await prisma.cotizacion.findMany({
            orderBy: { creadoEn: 'desc' },
            include: {
                items: true,
                creadoPor: { select: { name: true } },
            },
        });
        res.json(rows.map((r) => {
            const { creadoPor, ...rest } = r;
            return {
                ...rest,
                creadoPorNombre: creadoPor.name,
            };
        }));
    }
    catch (e) {
        console.error('GET /api/cotizaciones', e);
        if (handlePrismaError(e, res))
            return;
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
app.get('/api/cotizaciones/:id', auth_1.authenticateToken, (0, auth_1.requireRoles)(['ADMIN', 'VENTAS']), async (req, res) => {
    const id = queryParamToString(req.params.id);
    if (!id)
        return res.status(400).json({ error: 'id inválido' });
    try {
        const row = await prisma.cotizacion.findUnique({
            where: { id },
            include: {
                items: true,
                creadoPor: { select: { name: true } },
            },
        });
        if (!row)
            return res.status(404).json({ error: 'Cotización no encontrada' });
        const { creadoPor, ...rest } = row;
        res.json({
            ...rest,
            creadoPorNombre: creadoPor.name,
        });
    }
    catch (e) {
        console.error('GET /api/cotizaciones/:id', e);
        if (handlePrismaError(e, res))
            return;
        res.status(500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
app.get('/api/admin/backups', auth_1.authenticateToken, auth_1.requireAdmin, async (_req, res) => {
    try {
        const backups = await (0, backupService_1.getBackupList)();
        res.json({ ok: true, backups });
    }
    catch (e) {
        console.error('Error listing backups:', e);
        res.status(500).json({ ok: false, error: 'No se pudo listar backups' });
    }
});
// Crear grupo por HTTP (fuente de verdad para la UI; Socket.IO sigue notificando a otros clientes).
app.post('/api/boards/:boardId/groups', auth_1.authenticateToken, (0, auth_1.requireRoles)(['VENTAS', 'DISENO', 'USER', 'TALLER']), async (req, res) => {
    try {
        const boardId = queryParamToString(req.params.boardId);
        if (!boardId)
            return res.status(400).json({ error: 'boardId inválido' });
        const exists = await prisma.board.findUnique({ where: { id: boardId }, select: { id: true } });
        if (!exists)
            return res.status(404).json({ error: 'Tablero no encontrado' });
        const body = req.body ?? {};
        const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Nuevo grupo';
        const color = typeof body.color === 'string' && body.color ? body.color : '#1d60f5';
        const position = Number.isFinite(Number(body.position)) ? Number(body.position) : 1024;
        const parentGroupId = typeof body.parentGroupId === 'string' && body.parentGroupId.trim()
            ? body.parentGroupId.trim()
            : null;
        const newGroup = await prisma.group.create({
            data: { boardId, name, color, position, parentGroupId },
            include: { items: { orderBy: { position: 'asc' }, include: { columnValues: true } } },
        });
        io.to(boardRoom(boardId)).emit('group_added', newGroup);
        res.status(201).json(newGroup);
    }
    catch (e) {
        console.error('POST /api/boards/:boardId/groups', e);
        res.status(500).json({ error: 'No se pudo crear el grupo' });
    }
});
// FIX 9: middleware global de errores Express (captura next(err) y fallos no manejados en rutas async).
app.use((err, _req, res, _next) => {
    console.error('[Express Error]', err);
    if (err instanceof multer_1.default.MulterError) {
        console.error('[Multer] detalle:', err.code, err.field, err.message);
        if (!res.headersSent)
            res.status(400).json({ error: 'Error al procesar el archivo' });
        return;
    }
    if (err instanceof MulterFileRejectedError) {
        if (!res.headersSent)
            res.status(400).json({ error: 'Error al procesar el archivo' });
        return;
    }
    const status = err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    if (!res.headersSent) {
        res.status(status >= 400 && status < 600 ? status : 500).json({ error: GENERIC_INTERNAL_ERROR });
    }
});
// Socket.io real-time connection handler
io.on('connection', (socket) => {
    socketConnectionCount += 1;
    console.log(JSON.stringify({ level: 'info', msg: 'socket_connected', socketId: socket.id, connectionCount: socketConnectionCount }));
    /** Autenticación ya validada en io.use (FIX 3); leemos identidad del socket. */
    const getSocketAuth = () => {
        const bag = socket.data;
        if (bag?.userId && bag?.role && SOCKET_IO_ALLOWED_ROLES.has(bag.role)) {
            return { userId: bag.userId, role: bag.role };
        }
        return null;
    };
    const denySocketAction = (event, reason) => {
        // Emitimos un error estructurado para permitir UX en frontend (toast/log).
        socket.emit('action_denied', { event, reason });
    };
    // FIX 7: try/catch envuelve el handler completo (evita unhandled rejection en async).
    const withSocketRoles = (event, rolesAllowed, handler) => async (data) => {
        try {
            const auth = getSocketAuth();
            if (!auth)
                return denySocketAction(event, 'unauthenticated');
            if (auth.role !== 'ADMIN' && !rolesAllowed.includes(auth.role)) {
                return denySocketAction(event, 'unauthorized');
            }
            await Promise.resolve(handler(auth, data));
        }
        catch (err) {
            console.error(JSON.stringify({ level: 'error', msg: 'socket_handler_error', event, detail: err instanceof Error ? err.message : String(err) }));
            socket.emit('socket_handler_error', { event, message: 'internal_error' });
        }
    };
    socket.on('join_board', async (data) => {
        try {
            const boardId = typeof data?.boardId === 'string' ? data.boardId : null;
            if (!boardId)
                return;
            const auth = getSocketAuth();
            if (!auth) {
                socket.emit('action_denied', { event: 'join_board', reason: 'unauthenticated' });
                return;
            }
            // SECURITY-ACCEPTED-RISK: join_board sin membresía por usuario; mismo alcance que GET /api/boards/:id (app interna, todos los autenticados).
            // FIX 4: no unir a board:<id> si el tablero no existe (misma política de alcance que GET /api/boards/:id autenticado).
            const board = await prisma.board.findUnique({ where: { id: boardId }, select: { id: true } });
            if (!board) {
                socket.emit('action_denied', { event: 'join_board', reason: 'unauthorized' });
                return;
            }
            socket.join(boardRoom(boardId));
        }
        catch (e) {
            console.error('join_board', e);
            socket.emit('socket_handler_error', { event: 'join_board', message: 'internal_error' });
        }
    });
    socket.on('leave_board', (data) => {
        const boardId = typeof data?.boardId === 'string' ? data.boardId : null;
        if (!boardId)
            return;
        socket.leave(boardRoom(boardId));
    });
    // ── ITEM EVENTS ──────────────────────────────────────────────────────────
    // Miembros del tablero: pueden crear/editar/mover elementos y grupos (ADMIN ya tiene bypass en withSocketRoles).
    const BOARD_EDIT_ROLES = ['VENTAS', 'DISENO', 'USER', 'TALLER'];
    socket.on('update_item_name', withSocketRoles('update_item_name', [...BOARD_EDIT_ROLES], async (_auth, data) => {
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
        }
        catch (e) {
            console.error('Error updating item name:', e);
        }
    }));
    socket.on('add_item', withSocketRoles('add_item', [...BOARD_EDIT_ROLES], async (_auth, data) => {
        try {
            const { groupId, name, position, initialColumnValues } = data;
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: { boardId: true },
            });
            if (!group)
                return;
            const newItem = await prisma.item.create({
                data: { groupId, name, position },
                include: { columnValues: true },
            });
            if (Array.isArray(initialColumnValues) && initialColumnValues.length > 0) {
                for (const cv of initialColumnValues) {
                    if (cv?.columnId && typeof cv.value === 'string') {
                        const valueJson = toValueJson(cv.value);
                        await prisma.columnValue.upsert({
                            where: { itemId_columnId: { itemId: newItem.id, columnId: cv.columnId } },
                            update: { value: cv.value, valueJson: jsonToInput(valueJson) },
                            create: { itemId: newItem.id, columnId: cv.columnId, value: cv.value, valueJson: jsonToInput(valueJson) },
                        });
                    }
                }
                const withValues = await prisma.item.findUnique({
                    where: { id: newItem.id },
                    include: { columnValues: true }
                });
                io.to(boardRoom(group.boardId)).emit('item_added', withValues ?? newItem);
            }
            else {
                io.to(boardRoom(group.boardId)).emit('item_added', newItem);
            }
        }
        catch (e) {
            console.error('Error adding item:', e);
        }
    }));
    socket.on('move_item', withSocketRoles('move_item', [...BOARD_EDIT_ROLES], async (_auth, data) => {
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
            // FIX 12: mismo criterio que el resto de eventos de tablero (io.to incluye al emisor; confirmación servidor).
            io.to(room).emit('item_moved', updated);
        }
        catch (err) {
            console.error('Error moving item:', err);
        }
    }));
    socket.on('delete_item', withSocketRoles('delete_item', ['VENTAS'], async (_auth, data) => {
        try {
            const itemId = typeof data?.itemId === 'string' ? data.itemId : null;
            if (!itemId) {
                console.error('delete_item: itemId inválido', data);
                return;
            }
            const item = await prisma.item.findUnique({
                where: { id: itemId },
                select: {
                    group: { select: { boardId: true } },
                    columnValues: { select: { value: true } },
                },
            });
            const uploadUrls = Array.from(new Set((item?.columnValues ?? []).flatMap(cv => extractUploadUrls(cv.value))));
            await prisma.$transaction([
                prisma.columnValue.deleteMany({ where: { itemId } }),
                prisma.update.deleteMany({ where: { itemId } }),
                prisma.notification.deleteMany({ where: { itemId } }),
                prisma.item.delete({ where: { id: itemId } }),
            ]);
            void Promise.all(uploadUrls.map(url => deletePhysicalFileIfUnreferenced(url, itemId))).catch((err) => console.error('Error borrando archivos (delete_item):', err));
            if (item?.group?.boardId) {
                io.to(boardRoom(item.group.boardId)).emit('item_deleted', { itemId });
            }
            else {
                // FIX 6: sin boardId no hacer broadcast global; solo trazabilidad.
                console.warn(JSON.stringify({ level: 'warn', msg: 'socket_item_deleted_skip_emit', itemId, reason: 'missing_boardId' }));
            }
        }
        catch (e) {
            console.error('Error deleting item:', e);
        }
    }));
    // ── COLUMN VALUE EVENTS ──────────────────────────────────────────────────
    socket.on('update_column_value', withSocketRoles('update_column_value', ['VENTAS', 'DISENO', 'TALLER', 'USER'], async (auth, data) => {
        try {
            const { itemId, columnId, value: rawValue } = data;
            const value = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
            const column = await prisma.boardColumn.findUnique({ where: { id: columnId } });
            if (!column) {
                return;
            }
            // Para auditoría (Registro de actividad): capturar valor previo antes del upsert.
            const prevColumnValue = await prisma.columnValue.findUnique({
                where: { itemId_columnId: { itemId, columnId } },
            });
            const prevValue = prevColumnValue?.value ?? null;
            // FIX 11: optimistic locking si el cliente envía clientColumnValueUpdatedAt (ISO); sin campo, comportamiento anterior.
            const clientCvAt = typeof data?.clientColumnValueUpdatedAt === 'string' ? data.clientColumnValueUpdatedAt.trim() : '';
            if (clientCvAt && prevColumnValue?.updatedAt) {
                const clientMs = Date.parse(clientCvAt);
                const serverMs = prevColumnValue.updatedAt.getTime();
                if (Number.isFinite(clientMs) && clientMs !== serverMs) {
                    socket.emit('column_value_conflict', {
                        itemId,
                        columnId,
                        currentValue: prevColumnValue.value,
                        serverUpdatedAt: prevColumnValue.updatedAt.toISOString(),
                    });
                    return;
                }
            }
            // RBAC por columna (Fase 3+): evitar que roles restrictivos modifiquen columnas sensibles.
            // - ADMIN: bypass ya aplicado en withSocketRoles()
            // - VENTAS/DISENO: pueden editar valores en general, salvo reglas futuras más finas.
            // - TALLER/USER: solo pueden actualizar estados específicos (no pueden asignar personas ni editar campos arbitrarios).
            if (auth.role === 'TALLER' || auth.role === 'USER') {
                // Nunca permitir tocar columnas "person" (evita reasignaciones/abuso de notificaciones).
                if (column.type === 'person') {
                    return denySocketAction('update_column_value', 'unauthorized');
                }
                const title = String(column.title || '').trim();
                const allowedStatusTitles = new Set(['Estado Taller']);
                if (!(column.type === 'status' && allowedStatusTitles.has(title))) {
                    return denySocketAction('update_column_value', 'unauthorized');
                }
            }
            // DISENO: no debe tocar facturación/costos. En Sunday se materializa como columna de facturación.
            if (auth.role === 'DISENO') {
                const title = String(column.title || '').trim();
                if (title === 'Estado Facturación') {
                    return denySocketAction('update_column_value', 'unauthorized');
                }
            }
            const valueJson = toValueJson(value);
            const updated = await prisma.columnValue.upsert({
                where: { itemId_columnId: { itemId, columnId } },
                update: { value, valueJson: jsonToInput(valueJson) },
                create: { itemId, columnId, value, valueJson: jsonToInput(valueJson) },
            });
            io.to(boardRoom(column.boardId)).emit('column_value_updated', updated);
            if (prevValue && prevValue !== value) {
                const prevUrls = extractUploadUrls(prevValue);
                void Promise.all(prevUrls.map(url => deletePhysicalFileIfUnreferenced(url))).catch((err) => console.error('Error borrando archivos huérfanos (update_column_value):', err));
            }
            // ── AUDITORÍA (Registro de actividad) ──────────────────────────────────────────
            // Crear entradas automáticas cuando cambien columnas relevantes.
            // Marcamos el contenido con un prefijo para que el frontend distinga logs vs comentarios manuales.
            const AUDIT_PREFIX = '__audit__:'; // no mostrar tal cual en UI
            const oldV = prevValue ?? '';
            const newV = updated.value ?? '';
            const changed = oldV !== newV;
            const isAuditable = changed &&
                ['status', 'priority', 'person', 'docs', 'excel', 'file', 'billing_docs', 'folio'].includes(column.type);
            if (isAuditable) {
                let auditContent = null;
                // Helpers para parseos seguros.
                const safeJsonParse = (raw) => {
                    if (!raw || typeof raw !== 'string')
                        return null;
                    try {
                        const parsed = JSON.parse(raw);
                        // Algunos valores pueden venir double-encoded como string JSON.
                        if (typeof parsed === 'string') {
                            try {
                                return JSON.parse(parsed);
                            }
                            catch {
                                return parsed;
                            }
                        }
                        return parsed;
                    }
                    catch {
                        return null;
                    }
                };
                const parseOptionId = (raw) => {
                    const p = safeJsonParse(raw);
                    const optionId = p?.optionId;
                    return typeof optionId === 'string' ? optionId : null;
                };
                const parseDocsValue = (raw) => {
                    const p = safeJsonParse(raw);
                    return (p && typeof p === 'object') ? p : {};
                };
                const parseExcelValue = (raw) => {
                    const p = safeJsonParse(raw);
                    if (p && typeof p === 'object') {
                        const out = {};
                        if (typeof p.docId === 'string')
                            out.docId = p.docId;
                        if (typeof p.url === 'string')
                            out.url = p.url;
                        return out;
                    }
                    // fallback: string URL
                    if (typeof raw === 'string' && raw.trim())
                        return { url: raw.trim() };
                    return {};
                };
                const parseBillingDocsValue = (raw) => {
                    const p = safeJsonParse(raw);
                    if (p && typeof p === 'object') {
                        const out = {};
                        if (typeof p.url === 'string')
                            out.url = p.url;
                        if (typeof p.label === 'string')
                            out.label = p.label;
                        return out;
                    }
                    return {};
                };
                // Campo de estados/prioridad: traducir optionId -> label.
                const getOptionLabel = (optionId) => {
                    if (!optionId)
                        return null;
                    try {
                        const settingsRaw = column.settings ?? column.settingsJson;
                        const settings = typeof settingsRaw === 'string' ? JSON.parse(settingsRaw) : settingsRaw;
                        const options = settings?.options;
                        if (!Array.isArray(options))
                            return null;
                        const opt = options.find((o) => o.id === optionId);
                        return opt?.label || null;
                    }
                    catch {
                        return null;
                    }
                };
                const normalizeSimpleValue = (raw) => {
                    const t = (raw ?? '').trim();
                    if (!t)
                        return '';
                    // Si viene como JSON string: "\"ABC\"" => "ABC"
                    try {
                        const parsed = JSON.parse(t);
                        if (typeof parsed === 'string')
                            return parsed.trim();
                        if (typeof parsed === 'number')
                            return String(parsed);
                    }
                    catch { /* ignore */ }
                    // Si viene entre comillas simples del legacy JSON: "ABC" (ya lo intentamos con JSON.parse, pero por si acaso)
                    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2)
                        return t.slice(1, -1);
                    return t;
                };
                if (column.type === 'person') {
                    const prevAssigneeId = oldV.trim();
                    const nextAssigneeId = newV.trim();
                    const prevUser = prevAssigneeId ? await prisma.user.findUnique({ where: { id: prevAssigneeId }, select: { name: true } }) : null;
                    const nextUser = nextAssigneeId ? await prisma.user.findUnique({ where: { id: nextAssigneeId }, select: { name: true } }) : null;
                    if (!prevAssigneeId && nextAssigneeId) {
                        auditContent = `asignó el elemento a ${nextUser?.name ?? nextAssigneeId}`;
                    }
                    else if (prevAssigneeId && !nextAssigneeId) {
                        auditContent = `desasignó el elemento`;
                    }
                    else if (prevAssigneeId && nextAssigneeId && prevAssigneeId !== nextAssigneeId) {
                        auditContent = `reasignó el elemento de ${prevUser?.name ?? prevAssigneeId} a ${nextUser?.name ?? nextAssigneeId}`;
                    }
                }
                else if (column.type === 'status' || column.type === 'priority') {
                    const prevOptionId = parseOptionId(oldV);
                    const nextOptionId = parseOptionId(newV);
                    const prevLabel = getOptionLabel(prevOptionId) ?? prevOptionId ?? '—';
                    const nextLabel = getOptionLabel(nextOptionId) ?? nextOptionId ?? '—';
                    if (prevOptionId !== nextOptionId) {
                        auditContent = `actualizó ${column.title}: de "${prevLabel}" a "${nextLabel}"`;
                    }
                }
                else if (column.type === 'docs') {
                    const prev = parseDocsValue(oldV);
                    const next = parseDocsValue(newV);
                    const keys = [
                        { key: 'levantamientoDocId', label: 'Levantamiento' },
                        { key: 'cotizacionDocId', label: 'Cotización' },
                        { key: 'hojaTrabajoDocId', label: 'Hoja de trabajo' },
                    ];
                    const summaryAfter = keys
                        .map(k => {
                        const v = next?.[k.key];
                        return typeof v === 'string' && v.trim() ? k.label : null;
                    })
                        .filter(Boolean);
                    const summaryBefore = keys
                        .map(k => {
                        const v = prev?.[k.key];
                        return typeof v === 'string' && v.trim() ? k.label : null;
                    })
                        .filter(Boolean);
                    if (summaryBefore.join(', ') !== summaryAfter.join(', ')) {
                        auditContent = `actualizó documentos (${column.title}): ${summaryAfter.length ? summaryAfter.join(', ') : 'sin documentos enlazados'}`;
                    }
                    else {
                        // fallback para URLs legacy cotizacion/levantamiento/hojaTrabajo
                        const prevUrl = typeof prev?.cotizacion === 'string' ? prev.cotizacion : '';
                        const nextUrl = typeof next?.cotizacion === 'string' ? next.cotizacion : '';
                        if (prevUrl !== nextUrl) {
                            auditContent = `actualizó documentos (${column.title})`;
                        }
                    }
                }
                else if (column.type === 'excel') {
                    const prev = parseExcelValue(oldV);
                    const next = parseExcelValue(newV);
                    if ((prev.docId ?? '') !== (next.docId ?? '') || (prev.url ?? '') !== (next.url ?? '')) {
                        const labelAfter = next.docId ? 'Documento enlazado' : next.url ? 'Archivo enlazado' : 'sin archivo';
                        auditContent = `actualizó excel (${column.title}): ${labelAfter}`;
                    }
                }
                else if (column.type === 'file') {
                    const prevHref = oldV.trim();
                    const nextHref = newV.trim();
                    if (prevHref !== nextHref) {
                        auditContent = `actualizó enlace Drive (${column.title})`;
                    }
                }
                else if (column.type === 'billing_docs') {
                    const prev = parseBillingDocsValue(oldV);
                    const next = parseBillingDocsValue(newV);
                    if ((prev.url ?? '') !== (next.url ?? '') || (prev.label ?? '') !== (next.label ?? '')) {
                        const labelAfter = next.label?.trim() || next.url?.trim() || 'Documento actualizado';
                        auditContent = `actualizó documentos de facturación (${column.title}): ${labelAfter}`;
                    }
                }
                else if (column.type === 'folio') {
                    const fieldName = column.title?.trim() || 'Folio';
                    const prevVal = normalizeSimpleValue(oldV);
                    const nextVal = normalizeSimpleValue(newV);
                    if (!prevVal && nextVal) {
                        auditContent = `añadió ${fieldName} "${nextVal}"`;
                    }
                    else if (prevVal && !nextVal) {
                        auditContent = `eliminó ${fieldName} "${prevVal}"`;
                    }
                    else if (prevVal && nextVal && prevVal !== nextVal) {
                        auditContent = `cambió ${fieldName} de "${prevVal}" a "${nextVal}"`;
                    }
                }
                if (auditContent) {
                    const newUpdate = await prisma.update.create({
                        data: { itemId, content: `${AUDIT_PREFIX}${auditContent}`, authorId: auth.userId }
                    });
                    const fullUpdate = await prisma.update.findUnique({
                        where: { id: newUpdate.id },
                        include: { author: { select: { id: true, username: true, name: true, initials: true, color: true } } }
                    });
                    if (fullUpdate) {
                        const { author, ...rest } = fullUpdate;
                        const safeAuthor = author ? (() => {
                            const { password, ...safe } = author;
                            return safe;
                        })() : null;
                        const safeUpdate = { ...rest, author: safeAuthor };
                        // Emitir a autor y a usuarios asignados al ítem.
                        const item = await prisma.item.findUnique({
                            where: { id: itemId },
                            select: {
                                columnValues: {
                                    where: { column: { type: 'person' } },
                                    select: { value: true }
                                }
                            }
                        });
                        const recipientIds = new Set();
                        if (auth.userId)
                            recipientIds.add(auth.userId);
                        item?.columnValues?.forEach((cv) => {
                            const v = typeof cv.value === 'string' ? cv.value.trim() : '';
                            if (v)
                                recipientIds.add(v);
                        });
                        recipientIds.forEach((uid) => io.to(userRoom(uid)).emit('update_added', safeUpdate));
                    }
                }
            }
            // Regla Taller→Facturación: al marcar "colocado" se crea columna "Estado Facturación" si no existe
            // y se setea "Pendiente de facturar". Si el board ya tiene una columna "Estado Facturación" con
            // otra configuración, se usa esa columna (puede haber conflicto de opciones).
            if (column &&
                (column.type === 'status' || column.type === 'priority') &&
                column.title === 'Estado Taller' &&
                typeof value === 'string' &&
                value.trim()) {
                try {
                    const parsed = JSON.parse(value);
                    const optionId = parsed?.optionId;
                    if (optionId === 'colocado') {
                        // Asegurar que exista la columna "Estado Facturación" en el mismo board.
                        // Con unique(boardId,title,type), capturamos P2002 para carreras concurrentes.
                        let billingColumn = null;
                        const billingSettings = {
                            options: [
                                { id: 'pendiente_factura', label: 'Pendiente de facturar', color: '#fdab3d' },
                                { id: 'facturado', label: 'Facturado', color: '#579bfc' },
                                { id: 'cobrado', label: 'Cobrado', color: '#00c875' },
                                { id: 'default', label: '', color: '#c4c4c4' },
                            ],
                        };
                        try {
                            const lastCol = await prisma.boardColumn.findFirst({
                                where: { boardId: column.boardId },
                                orderBy: { position: 'desc' },
                            });
                            const newPosition = (lastCol?.position ?? 0) + 1024;
                            billingColumn = await prisma.boardColumn.create({
                                data: {
                                    boardId: column.boardId,
                                    title: 'Estado Facturación',
                                    type: 'status',
                                    position: newPosition,
                                    settings: JSON.stringify(billingSettings),
                                    settingsJson: billingSettings,
                                },
                            });
                            io.to(boardRoom(column.boardId)).emit('column_added', billingColumn);
                        }
                        catch (createErr) {
                            const code = createErr?.code;
                            if (code === 'P2002') {
                                billingColumn = await prisma.boardColumn.findFirst({
                                    where: {
                                        boardId: column.boardId,
                                        title: 'Estado Facturación',
                                        type: 'status',
                                    },
                                });
                            }
                            else {
                                throw createErr;
                            }
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
                                const billingLegacyValue = JSON.stringify({ optionId: 'pendiente_factura' });
                                const billingValueJson = toValueJson(billingLegacyValue);
                                const billingValue = await prisma.columnValue.create({
                                    data: {
                                        itemId,
                                        columnId: billingColumn.id,
                                        value: billingLegacyValue,
                                        valueJson: jsonToInput(billingValueJson),
                                    },
                                });
                                io.to(boardRoom(column.boardId)).emit('column_value_updated', billingValue);
                            }
                        }
                    }
                }
                catch (err) {
                    // Valor no es JSON válido o no tiene optionId esperado; log para depuración
                    console.warn(JSON.stringify({ level: 'warn', msg: 'taller_facturacion_skip', itemId, columnId, reason: err instanceof Error ? err.message : 'invalid_value' }));
                }
            }
            // Notificar solo asignaciones nuevas a terceros (evita auto-notificación y duplicados sin cambio real).
            if (column?.type === 'person') {
                const prevAssigned = new Set(extractPersonUserIds(prevValue));
                const nextAssigned = extractPersonUserIds(value);
                const newlyAssigned = nextAssigned.filter((uid) => !prevAssigned.has(uid));
                const targets = newlyAssigned.filter((uid) => uid !== auth.userId);
                for (const assignedUserId of targets) {
                    const notif = await prisma.notification.create({
                        data: { userId: assignedUserId, itemId, type: 'assigned', read: false },
                    });
                    io.to(userRoom(assignedUserId)).emit('notification_created', notif);
                    await sendWebPushToUser(assignedUserId, {
                        title: 'Te asignaron un elemento',
                        body: 'Revisa tus notificaciones en Sunday.',
                        url: '/?tab=notifications',
                        tag: `assigned-${itemId}`,
                    });
                }
            }
        }
        catch (e) {
            console.error('Error updating column value:', e);
        }
    }));
    // ── BOARD EVENTS ───────────────────────────────────────────────────────────
    socket.on('rename_board', withSocketRoles('rename_board', ['VENTAS', 'DISENO'], async (_auth, data) => {
        try {
            const { boardId, name } = data;
            const updated = await prisma.board.update({ where: { id: boardId }, data: { name: name.trim() } });
            io.to(boardRoom(boardId)).emit('board_renamed', updated);
        }
        catch (e) {
            console.error('Error renaming board:', e);
        }
    }));
    socket.on('add_board', withSocketRoles('add_board', ['VENTAS'], async (_auth, data) => {
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
            // FIX 5: notificar vía Prisma quién pertenece al workspace (docs/diseños/roles), no fetchSockets global.
            const notifyIds = await getUserIdsForWorkspaceNotification(workspace.id);
            notifyIds.forEach((uid) => io.to(userRoom(uid)).emit('board_added', newBoard));
        }
        catch (e) {
            console.error('Error adding board:', e);
        }
    }));
    // ── GROUP EVENTS ──────────────────────────────────────────────────────────
    socket.on('delete_group', withSocketRoles('delete_group', [...BOARD_EDIT_ROLES], async (_auth, data) => {
        try {
            const { groupId } = data;
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: { boardId: true },
            });
            await prisma.group.delete({ where: { id: groupId } });
            if (group?.boardId) {
                io.to(boardRoom(group.boardId)).emit('group_deleted', { groupId });
            }
            else {
                console.warn(JSON.stringify({ level: 'warn', msg: 'socket_group_deleted_skip_emit', groupId, reason: 'missing_boardId' }));
            }
        }
        catch (e) {
            console.error('Error deleting group:', e);
        }
    }));
    socket.on('add_group', withSocketRoles('add_group', [...BOARD_EDIT_ROLES], async (_auth, data) => {
        try {
            const { boardId, name, color, position, parentGroupId } = data;
            if (!boardId || typeof boardId !== 'string') {
                socket.emit('group_add_failed', { error: 'boardId inválido' });
                return;
            }
            const pos = typeof position === 'number' && Number.isFinite(position) ? position : 1024;
            const newGroup = await prisma.group.create({
                data: {
                    boardId,
                    name: typeof name === 'string' && name.trim() ? name.trim() : 'Nuevo grupo',
                    color: typeof color === 'string' && color ? color : '#1d60f5',
                    position: pos,
                    parentGroupId: parentGroupId || null,
                },
                include: { items: { include: { columnValues: true } } },
            });
            // Asegurar que el cliente que creó el grupo esté en la sala (si join_board llegó tarde o hubo reconnect).
            socket.join(boardRoom(boardId));
            io.to(boardRoom(boardId)).emit('group_added', newGroup);
        }
        catch (e) {
            console.error('Error adding group:', e);
            const msg = e instanceof Error ? e.message : 'No se pudo crear el grupo';
            socket.emit('group_add_failed', { error: msg });
        }
    }));
    socket.on('rename_group', withSocketRoles('rename_group', [...BOARD_EDIT_ROLES], async (_auth, data) => {
        try {
            const { groupId, name, color } = data;
            const updateData = {};
            if (name !== undefined)
                updateData.name = name;
            if (color !== undefined)
                updateData.color = color;
            const updated = await prisma.group.update({ where: { id: groupId }, data: updateData });
            const group = await prisma.group.findUnique({
                where: { id: updated.id },
                select: { boardId: true },
            });
            if (group?.boardId) {
                io.to(boardRoom(group.boardId)).emit('group_renamed', { id: updated.id, name: updated.name, color: updated.color });
            }
            else {
                console.warn(JSON.stringify({
                    level: 'warn',
                    msg: 'socket_group_renamed_skip_emit',
                    groupId: updated.id,
                    reason: 'missing_boardId',
                }));
            }
        }
        catch (e) {
            console.error('Error renaming group:', e);
        }
    }));
    socket.on('move_group', withSocketRoles('move_group', [...BOARD_EDIT_ROLES], async (_auth, data) => {
        try {
            const { groupId, newPosition } = data;
            const updated = await prisma.group.update({ where: { id: groupId }, data: { position: newPosition } });
            const group = await prisma.group.findUnique({
                where: { id: updated.id },
                select: { boardId: true },
            });
            if (group?.boardId) {
                socket.to(boardRoom(group.boardId)).emit('group_moved', updated);
            }
            else {
                socket.broadcast.emit('group_moved', updated);
            }
        }
        catch (e) {
            console.error('Error moving group:', e);
        }
    }));
    socket.on('reorder_groups', withSocketRoles('reorder_groups', [...BOARD_EDIT_ROLES], async (_auth, data) => {
        try {
            const boardId = typeof data?.boardId === 'string' ? data.boardId : '';
            const updates = Array.isArray(data?.updates) ? data.updates : [];
            if (!boardId || updates.length === 0)
                return;
            await prisma.$transaction(updates.map((u) => prisma.group.updateMany({
                where: {
                    id: typeof u?.id === 'string' ? u.id : '',
                    boardId,
                },
                data: {
                    position: Number.isFinite(Number(u?.position)) ? Number(u.position) : 0,
                },
            })));
            const groups = await prisma.group.findMany({
                where: { boardId },
                select: { id: true, position: true },
                orderBy: { position: 'asc' },
            });
            io.to(boardRoom(boardId)).emit('groups_reordered', { boardId, groups });
        }
        catch (e) {
            console.error('Error reordering groups:', e);
        }
    }));
    // ── COLUMN EVENTS ─────────────────────────────────────────────────────────
    socket.on('add_column', withSocketRoles('add_column', ['VENTAS'], async (_auth, data) => {
        try {
            const { boardId, title, type, position, settings } = data;
            const settingsJson = settings && typeof settings === 'string'
                ? JSON.parse(settings)
                : settings;
            const newColumn = await prisma.boardColumn.create({
                data: {
                    boardId,
                    title,
                    type,
                    position,
                    settings: settings || null,
                    settingsJson: jsonToInput(settingsJson ?? undefined),
                }
            });
            io.to(boardRoom(boardId)).emit('column_added', newColumn);
        }
        catch (e) {
            console.error('Error adding column:', e);
        }
    }));
    socket.on('rename_column', withSocketRoles('rename_column', ['VENTAS'], async (_auth, data) => {
        try {
            const { columnId, title } = data;
            const updated = await prisma.boardColumn.update({ where: { id: columnId }, data: { title } });
            const column = await prisma.boardColumn.findUnique({
                where: { id: updated.id },
                select: { boardId: true },
            });
            if (column?.boardId) {
                io.to(boardRoom(column.boardId)).emit('column_renamed', updated);
            }
            else {
                console.warn(JSON.stringify({ level: 'warn', msg: 'socket_column_renamed_skip_emit', columnId: updated.id, reason: 'missing_boardId' }));
            }
        }
        catch (e) {
            console.error('Error renaming column:', e);
        }
    }));
    socket.on('update_column_settings', withSocketRoles('update_column_settings', ['VENTAS'], async (_auth, data) => {
        try {
            const { columnId, settings } = data;
            const parsedSettings = settings && typeof settings === 'string'
                ? JSON.parse(settings)
                : settings;
            const updated = await prisma.boardColumn.update({
                where: { id: columnId },
                data: {
                    settings: settings ?? null,
                    settingsJson: jsonToInput(parsedSettings ?? undefined),
                },
            });
            const column = await prisma.boardColumn.findUnique({
                where: { id: updated.id },
                select: { boardId: true },
            });
            if (column?.boardId) {
                io.to(boardRoom(column.boardId)).emit('column_settings_updated', updated);
            }
            else {
                console.warn(JSON.stringify({ level: 'warn', msg: 'socket_column_settings_skip_emit', columnId: updated.id, reason: 'missing_boardId' }));
            }
        }
        catch (e) {
            console.error('Error updating column settings:', e);
        }
    }));
    socket.on('delete_column', withSocketRoles('delete_column', [], async (_auth, data) => {
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
            }
            else {
                console.warn(JSON.stringify({ level: 'warn', msg: 'socket_column_deleted_skip_emit', columnId, reason: 'missing_boardId' }));
            }
        }
        catch (e) {
            console.error('Error deleting column:', e);
        }
    }));
    // ── UPDATE / COMMENT EVENTS ───────────────────────────────────────────────
    socket.on('add_update', withSocketRoles('add_update', ['VENTAS', 'DISENO', 'TALLER', 'USER'], async (auth, data) => {
        try {
            const { itemId, content } = data;
            const authorId = auth.userId;
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
                        id: true,
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
                if (!fullUpdate)
                    return newUpdate;
                const { author, ...rest } = fullUpdate;
                if (!author)
                    return { ...rest, author: null };
                const { password, ...safeAuthor } = author;
                return { ...rest, author: safeAuthor };
            })();
            // Emitir a autor y a usuarios asignados al ítem (rooms por usuario)
            const recipientIds = new Set();
            if (authorId)
                recipientIds.add(authorId);
            if (item) {
                item.columnValues.forEach((cv) => {
                    const v = cv.value?.trim();
                    if (v)
                        recipientIds.add(v);
                });
            }
            recipientIds.forEach((uid) => io.to(userRoom(uid)).emit('update_added', safeUpdate));
            // Notificaciones Web Push a los usuarios asignados al item (excepto el propio autor)
            if (item && authorId) {
                const assignedUserIds = item.columnValues
                    .map((cv) => cv.value?.trim())
                    .filter((v) => !!v && v !== authorId);
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
                            url: '/?tab=notifications',
                            tag: `comment-${item.id}`,
                        });
                    }
                }
            }
        }
        catch (e) {
            console.error('Error adding update:', e);
        }
    }));
    socket.on('disconnect', () => {
        socketConnectionCount = Math.max(0, socketConnectionCount - 1);
        console.log(JSON.stringify({ level: 'info', msg: 'socket_disconnected', socketId: socket.id, connectionCount: socketConnectionCount }));
    });
});
const PORT = process.env.PORT || 3001;
node_cron_1.default.schedule('0 2 * * *', async () => {
    await (0, backupService_1.runBackup)();
    await (0, backupService_1.cleanOldBackups)();
}, { timezone: 'America/Mexico_City' });
console.log(JSON.stringify({
    level: 'info',
    msg: 'backup_cron_registered',
    schedule: '0 2 * * *',
    timezone: 'America/Mexico_City',
}));
(0, paths_1.ensureUploadDirs)();
httpServer.listen(PORT, () => {
    console.log(`Sunday Server running on port ${PORT}`);
});
