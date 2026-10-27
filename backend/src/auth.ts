import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAttachUserFromJwt, createAuthenticateToken } from './httpAuth';

export { requireAuth } from './httpAuth';

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  throw new Error('JWT_SECRET no está definido. Configúralo en .env');
}
const JWT_SECRET: string = _jwtSecret;

// Por defecto 24h; en producción conviene fijar JWT_EXPIRES_IN en .env (p. ej. 8h o 12h).
const JWT_EXPIRES_IN: string | number = process.env.JWT_EXPIRES_IN || '24h';

const BCRYPT_ROUNDS_ENV = process.env.BCRYPT_ROUNDS;
const BCRYPT_ROUNDS =
  BCRYPT_ROUNDS_ENV && !Number.isNaN(Number.parseInt(BCRYPT_ROUNDS_ENV, 10))
    ? Number.parseInt(BCRYPT_ROUNDS_ENV, 10)
    : 12;

const ALLOWED_ROLES = new Set(['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER']);

export type JwtPayload = {
  userId: string;
  role: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

// SECURITY-VERIFIED: almacenamiento de contraseñas con bcrypt (rondas configurables vía BCRYPT_ROUNDS).
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'] });
}

// SECURITY-VERIFIED: JWT firmado (HS256), validación de expiración y de role permitido en payload.
export function verifyJwt(token: string): JwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  if (!payload.userId || typeof payload.role !== 'string' || !ALLOWED_ROLES.has(payload.role)) {
    throw new Error('Token inválido: payload malformado o role no permitido');
  }
  return payload;
}

/** Payload del token de exportación (un solo uso, corta duración). */
export type ExportTokenPayload = { userId: string; docId: string; purpose: 'export' };

/** Firma un token de exportación para que Puppeteer abra /docs/export y cargue el doc. */
export function signExportToken(payload: ExportTokenPayload): string {
  return jwt.sign(
    { ...payload, role: 'USER' },
    JWT_SECRET,
    { expiresIn: '120s' }
  );
}

/** Verifica un token de exportación; lanza si es inválido. */
// SECURITY-VERIFIED: token de exportación PDF de corta duración y propósito acotado (export).
export function verifyExportToken(token: string): ExportTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET) as ExportTokenPayload & { role?: string };
  if (payload.purpose !== 'export' || !payload.userId || !payload.docId) {
    throw new Error('Token de exportación inválido');
  }
  return { userId: payload.userId, docId: payload.docId, purpose: 'export' };
}

const prisma = new PrismaClient();

/**
 * Dependencias reales de los middlewares HTTP. La lógica (401 vs 503) vive en
 * `httpAuth.ts` y es pura para poder probarla sin base de datos.
 */
const httpAuthDeps = {
  verifyToken: (token: string) => verifyJwt(token),
  findUser: (userId: string) => prisma.user.findUnique({ where: { id: userId } }),
};

export const attachUserFromJwt = createAttachUserFromJwt(httpAuthDeps);
export const authenticateToken = createAuthenticateToken(httpAuthDeps);

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (req.authUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  req.user = { ...req.authUser };
  return next();
}

export function requireRoles(rolesAllowed: string[]) {
  const allowed = new Set(rolesAllowed);
  // Defensa: si el middleware se configura mal, fallar de forma explícita.
  if (allowed.size === 0) {
    throw new Error('requireRoles(): rolesAllowed no puede ser vacío');
  }
  // Validar roles para evitar typos silenciosos que abran/corten acceso incorrectamente.
  for (const r of allowed) {
    if (!ALLOWED_ROLES.has(r)) {
      throw new Error(`requireRoles(): rol no permitido en configuración: ${String(r)}`);
    }
  }
  return function requireRolesMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.authUser) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    const role = req.authUser.role;
    // ADMIN siempre tiene acceso total (backend como única fuente de verdad).
    if (role === 'ADMIN') {
      req.user = { ...req.authUser };
      return next();
    }
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    req.user = { ...req.authUser };
    return next();
  };
}

