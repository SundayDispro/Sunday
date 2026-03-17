"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.signJwt = signJwt;
exports.verifyJwt = verifyJwt;
exports.attachUserFromJwt = attachUserFromJwt;
exports.authenticateToken = authenticateToken;
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
    throw new Error('JWT_SECRET no está definido. Configúralo en .env');
}
const JWT_SECRET = _jwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS_ENV = process.env.BCRYPT_ROUNDS;
const BCRYPT_ROUNDS = BCRYPT_ROUNDS_ENV && !Number.isNaN(Number.parseInt(BCRYPT_ROUNDS_ENV, 10))
    ? Number.parseInt(BCRYPT_ROUNDS_ENV, 10)
    : 12;
const ALLOWED_ROLES = new Set(['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER']);
async function hashPassword(plain) {
    return bcrypt_1.default.hash(plain, BCRYPT_ROUNDS);
}
async function verifyPassword(plain, hash) {
    if (!hash)
        return false;
    try {
        return await bcrypt_1.default.compare(plain, hash);
    }
    catch {
        return false;
    }
}
function signJwt(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyJwt(token) {
    const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
    if (!payload.userId || typeof payload.role !== 'string' || !ALLOWED_ROLES.has(payload.role)) {
        throw new Error('Token inválido: payload malformado o role no permitido');
    }
    return payload;
}
const prisma = new client_1.PrismaClient();
async function attachUserFromJwt(req, _res, next) {
    const auth = req.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token)
        return next();
    try {
        const payload = verifyJwt(token);
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user)
            return next();
        req.authUser = {
            id: user.id,
            role: user.role,
            username: user.username,
            name: user.name,
        };
        req.user = { ...req.authUser };
    }
    catch {
        // Silenciar errores de token; simplemente no adjuntamos usuario
    }
    next();
}
// Middleware estilo "authenticateToken" que fuerza presencia de un JWT válido
function authenticateToken(req, res, next) {
    // Si attachUserFromJwt ya resolvió el usuario, solo validamos
    if (req.authUser) {
        req.user = { ...req.authUser };
        return next();
    }
    const auth = req.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    try {
        const payload = verifyJwt(token);
        prisma.user
            .findUnique({ where: { id: payload.userId } })
            .then((user) => {
            if (!user) {
                return res.status(401).json({ error: 'No autenticado' });
            }
            req.authUser = {
                id: user.id,
                role: user.role,
                username: user.username,
                name: user.name,
            };
            req.user = { ...req.authUser };
            return next();
        })
            .catch(() => res.status(401).json({ error: 'No autenticado' }));
    }
    catch {
        return res.status(401).json({ error: 'No autenticado' });
    }
}
function requireAuth(req, res, next) {
    if (!req.authUser) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    req.user = { ...req.authUser };
    return next();
}
function requireAdmin(req, res, next) {
    if (!req.authUser) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    if (req.authUser.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Solo administradores' });
    }
    req.user = { ...req.authUser };
    return next();
}
