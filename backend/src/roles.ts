/**
 * Middlewares de rol.
 *
 * Se mantiene sin imports internos (igual que `httpAuth.ts`) para poder
 * ejecutarse con `node --test` y type stripping. `auth.ts` los re-exporta,
 * así que los consumidores existentes no cambian.
 */
import type { Request, Response, NextFunction } from 'express';

/** Roles válidos del sistema (mismos valores que el payload del JWT). */
export const ALLOWED_ROLES = new Set(['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER']);

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
