import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  throw new Error('JWT_SECRET no está definido. Configúralo en .env');
}
const JWT_SECRET: string = _jwtSecret;

const JWT_EXPIRES_IN: string | number = process.env.JWT_EXPIRES_IN || '7d';

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
export function verifyExportToken(token: string): ExportTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET) as ExportTokenPayload & { role?: string };
  if (payload.purpose !== 'export' || !payload.userId || !payload.docId) {
    throw new Error('Token de exportación inválido');
  }
  return { userId: payload.userId, docId: payload.docId, purpose: 'export' };
}

/** Devuelve docId si el token es de exportación (solo decodifica, no verifica). Usar tras authenticateToken. */
export function getExportDocIdFromToken(token: string): string | null {
  try {
    const payload = jwt.decode(token) as (ExportTokenPayload & { purpose?: string }) | null;
    return payload?.purpose === 'export' && payload?.docId ? payload.docId : null;
  } catch {
    return null;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: {
      id: string;
      role: string;
      username: string;
      name: string;
    };
    // Alias genérico para compatibilidad con middlewares que usan req.user
    user?: {
      id: string;
      role: string;
      username: string;
      name: string;
    };
  }
}

const prisma = new PrismaClient();

export async function attachUserFromJwt(req: Request, _res: Response, next: NextFunction) {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) return next();
  try {
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return next();
    req.authUser = {
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
    };
    req.user = { ...req.authUser };
  } catch {
    // Silenciar errores de token; simplemente no adjuntamos usuario
  }
  next();
}

// Middleware estilo "authenticateToken" que fuerza presencia de un JWT válido
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
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
  } catch {
    return res.status(401).json({ error: 'No autenticado' });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.user = { ...req.authUser };
  return next();
}

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

