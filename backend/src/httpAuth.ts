/**
 * Middleware HTTP de identidad y clasificación de fallos de base de datos.
 *
 * Se mantiene en un único módulo sin imports internos para poder ejecutarse con
 * `node --test` (type stripping) además de compilarse a CommonJS. La lógica es
 * pura: recibe `verifyToken`/`findUser` inyectados, así que las pruebas no
 * necesitan JWT_SECRET, Prisma ni una base de datos real.
 *
 * Regla:
 * - Token ausente/inválido/caducado → `401` (lo decide el middleware/ruta).
 * - Usuario inexistente o rol sin permiso → `401`/`403` (autorización existente).
 * - BD no disponible o error transitorio → `503`.
 * - Error de BD no clasificable como transitorio → `500` (nunca 401).
 *
 * Los códigos de Prisma se analizan explícitamente. No se convierten todos los
 * `P####` en indisponibilidad: los códigos de datos/validación (p. ej. `P2002`)
 * son fallos internos, no una invitación a reintentar indefinidamente.
 */
import type { NextFunction, Request, Response } from 'express';

export const SERVICE_UNAVAILABLE_MESSAGE =
  'Servicio temporalmente no disponible. Inténtalo de nuevo en unos segundos.';

export const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor';

export type AuthFailureKind = 'unavailable' | 'internal';
export type AuthFailureStatus = 503 | 500;

/**
 * Contrato de log cerrado: solo identidad mínima y códigos públicos.
 * NUNCA incluye mensaje, stack, SQL, token, cadena de conexión ni credenciales.
 */
export type AuthInfraLog = {
  event: 'http_auth_infra_error';
  userId: string | null;
  errorName: string;
  kind: AuthFailureKind;
  prismaCode?: string;
  networkCode?: string;
};

/**
 * Códigos de Prisma que indican que la base de datos no está disponible o que
 * la operación es reintentable. No incluye códigos de datos/restricciones.
 */
const UNAVAILABLE_PRISMA_CODES = new Set([
  'P1000', // autenticación contra el servidor de BD falló (configuración)
  'P1001', // no se puede alcanzar el servidor de BD
  'P1002', // timeout al conectar con el servidor de BD
  'P1003', // la base de datos no existe (configuración)
  'P1008', // timeout de operación
  'P1010', // acceso denegado por el servidor de BD (configuración)
  'P1017', // el servidor cerró la conexión
  'P2024', // timeout esperando una conexión del pool
  'P2034', // conflicto de escritura/deadlock: reintentable
]);

/** Errores de red/SO que Prisma puede propagar sin envolver en un código P####. */
const UNAVAILABLE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
]);

/** Códigos de error internos de Prisma con forma pública `P` + 4 dígitos. */
const PRISMA_CODE_RE = /^P\d{4}$/;
const MAX_ERROR_NAME_LENGTH = 80;

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/** Prisma expone `code` en errores conocidos y `errorCode` en initialization errors. */
function readErrorCode(err: unknown): string | undefined {
  return readStringProperty(err, 'code') ?? readStringProperty(err, 'errorCode');
}

function readErrorName(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error';
  if (err && typeof err === 'object') {
    const name = readStringProperty(err, 'name');
    if (name) return name;
    return 'Error';
  }
  return typeof err === 'string' ? 'Error' : typeof err;
}

/**
 * Evita inyección de saltos de línea o contenido arbitrario en los logs.
 * El nombre de un error no aporta datos del usuario, pero se sanea igualmente.
 */
function sanitizeErrorName(raw: string): string {
  const safe = raw.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, MAX_ERROR_NAME_LENGTH);
  return safe || 'Error';
}

export type DatabaseFailureClassification = {
  kind: AuthFailureKind;
  status: AuthFailureStatus;
};

/**
 * Clasifica un fallo al consultar el usuario. La ambigüedad se resuelve hacia
 * `500` (fallo interno) y nunca hacia `401`: un error desconocido no demuestra
 * que el token sea inválido, y `500` tampoco dispara el logout del cliente.
 */
export function classifyDatabaseFailure(err: unknown): DatabaseFailureClassification {
  const code = readErrorCode(err);

  if (code && UNAVAILABLE_PRISMA_CODES.has(code)) {
    return { kind: 'unavailable', status: 503 };
  }
  if (code && UNAVAILABLE_NETWORK_CODES.has(code)) {
    return { kind: 'unavailable', status: 503 };
  }

  const name = readErrorName(err);
  // `PrismaClientInitializationError`: no se pudo inicializar el cliente/engine.
  // `PrismaClientRustPanicError`: el engine terminó de forma anormal.
  if (name === 'PrismaClientInitializationError' || name === 'PrismaClientRustPanicError') {
    return { kind: 'unavailable', status: 503 };
  }

  return { kind: 'internal', status: 500 };
}

export function buildAuthInfraLog(
  err: unknown,
  userId: string | null,
  kind: AuthFailureKind
): AuthInfraLog {
  const code = readErrorCode(err);
  const prismaCode = code && PRISMA_CODE_RE.test(code) ? code : undefined;
  const networkCode = code && UNAVAILABLE_NETWORK_CODES.has(code) ? code : undefined;

  return {
    event: 'http_auth_infra_error',
    userId,
    errorName: sanitizeErrorName(readErrorName(err)),
    kind,
    ...(prismaCode ? { prismaCode } : {}),
    ...(networkCode ? { networkCode } : {}),
  };
}

/**
 * Error tipado que el handler global de Express reconoce para responder 503/500
 * con un cuerpo genérico. `message` es deliberadamente genérico: el detalle real
 * nunca se serializa al cliente.
 */
export class AuthServiceError extends Error {
  readonly status: AuthFailureStatus;
  readonly kind: AuthFailureKind;
  readonly log: AuthInfraLog;

  constructor(status: AuthFailureStatus, kind: AuthFailureKind, log: AuthInfraLog) {
    super(status === 503 ? SERVICE_UNAVAILABLE_MESSAGE : INTERNAL_ERROR_MESSAGE);
    this.name = 'AuthServiceError';
    this.status = status;
    this.kind = kind;
    this.log = log;
  }
}

export function isAuthServiceError(err: unknown): err is AuthServiceError {
  return err instanceof AuthServiceError;
}

export function toAuthServiceError(err: unknown, userId: string | null): AuthServiceError {
  const { kind, status } = classifyDatabaseFailure(err);
  return new AuthServiceError(status, kind, buildAuthInfraLog(err, userId, kind));
}

export function authServiceErrorResponse(err: AuthServiceError): {
  status: AuthFailureStatus;
  body: { error: string };
} {
  return {
    status: err.status,
    body: { error: err.status === 503 ? SERVICE_UNAVAILABLE_MESSAGE : INTERNAL_ERROR_MESSAGE },
  };
}

export type HttpAuthUser = {
  id: string;
  role: string;
  username: string;
  name: string;
};

export type HttpAuthTokenPayload = {
  userId: string;
  role?: string;
};

export type HttpAuthDeps = {
  verifyToken: (token: string) => HttpAuthTokenPayload;
  findUser: (userId: string) => Promise<HttpAuthUser | null>;
};

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

export function extractBearerToken(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function attachUser(req: Request, user: HttpAuthUser): void {
  req.authUser = {
    id: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
  };
  req.user = { ...req.authUser };
}

/**
 * Adjunta `req.authUser` cuando el JWT es válido y el usuario existe.
 * - Token ausente o inválido → sigue sin usuario (401 lo decide la ruta).
 * - BD no disponible → `next(AuthServiceError)` → 503.
 */
export function createAttachUserFromJwt(deps: HttpAuthDeps) {
  return async function attachUserFromJwt(
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    const token = extractBearerToken(req.get('Authorization') || '');
    if (!token) return next();

    let payload: HttpAuthTokenPayload;
    try {
      payload = deps.verifyToken(token);
    } catch {
      // Firma, expiración o payload inválido: autenticación, no infraestructura.
      return next();
    }

    try {
      const user = await deps.findUser(payload.userId);
      // Usuario borrado: sin usuario. La ruta protegida responderá 401.
      if (!user) return next();
      attachUser(req, user);
      return next();
    } catch (err) {
      // No se traga el error ni se simula un usuario anónimo.
      next(toAuthServiceError(err, payload.userId));
    }
  };
}

/**
 * Fuerza un JWT válido. Conserva el atajo cuando `attachUserFromJwt` ya resolvió
 * la identidad. Si tiene que consultar la BD por su cuenta, distingue 401 de 503.
 */
export function createAuthenticateToken(deps: HttpAuthDeps) {
  return async function authenticateToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (req.authUser) {
      req.user = { ...req.authUser };
      return next();
    }

    const token = extractBearerToken(req.get('Authorization') || '');
    if (!token) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    let payload: HttpAuthTokenPayload;
    try {
      payload = deps.verifyToken(token);
    } catch {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    try {
      const user = await deps.findUser(payload.userId);
      if (!user) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      attachUser(req, user);
      next();
    } catch (err) {
      next(toAuthServiceError(err, payload.userId));
    }
  };
}

/**
 * Exige que `attachUserFromJwt` haya resuelto la identidad. No consulta la BD,
 * por lo que un fallo de infraestructura nunca llega aquí: el attach ya lo
 * convirtió en 503 antes de entrar a la ruta.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  req.user = { ...req.authUser };
  next();
}
