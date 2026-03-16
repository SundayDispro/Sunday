import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido. Configúralo en .env');
}

const JWT_EXPIRES_IN: string | number = process.env.JWT_EXPIRES_IN || '7d';

const BCRYPT_ROUNDS_ENV = process.env.BCRYPT_ROUNDS;
const BCRYPT_ROUNDS =
  BCRYPT_ROUNDS_ENV && !Number.isNaN(Number.parseInt(BCRYPT_ROUNDS_ENV, 10))
    ? Number.parseInt(BCRYPT_ROUNDS_ENV, 10)
    : 12;

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
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

