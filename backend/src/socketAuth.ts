/**
 * Resolución de identidad para el handshake de Socket.IO.
 *
 * El middleware de `index.ts` tenía un único `try/catch` que convertía
 * CUALQUIER excepción (incluida una caída de PostgreSQL) en `unauthorized`.
 * Como el cliente interpreta `unauthorized` como sesión inválida y cierra la
 * sesión, un hipo de base de datos deslogueaba a todo el equipo.
 *
 * Aquí separamos las dos fases para que el cliente reciba una señal distinta:
 *
 * - Fase de token  → token ausente, firma inválida, caducado o payload no
 *   aceptable: es autenticación y se responde `SOCKET_AUTH_ERROR`.
 * - Fase de usuario → usuario borrado o rol sin acceso: se rechaza igual que
 *   antes, también como `SOCKET_AUTH_ERROR` (mismas reglas de seguridad).
 * - Fallo inesperado de la consulta (Prisma/PostgreSQL caído, timeout, reinicio
 *   del backend) → `SOCKET_INFRA_ERROR`. NUNCA `unauthorized`, para que el
 *   cliente no borre el JWT ni la cola de escrituras.
 *
 * El módulo es puro a propósito (dependencias inyectadas, sin importar Prisma
 * ni Socket.IO) para poder cubrir los cuatro escenarios con `node --test` sin
 * base de datos.
 */

/** Rechazo de autenticación/autorización: reintentar con el mismo token es inútil. */
export const SOCKET_AUTH_ERROR = 'unauthorized';

/** Error temporal del servidor: el cliente debe reintentar con backoff. */
export const SOCKET_INFRA_ERROR = 'server_error';
// Ambos literales viajan en `Error#message` y el cliente los compara de forma
// exacta en `frontend/src/store/socketRetry.ts` (AUTH_ERROR_MESSAGE /
// INFRA_ERROR_MESSAGE). Si cambian aquí, deben cambiar allí.

export type SocketIdentityUser = {
  id: string;
  role: string;
};

export type SocketIdentityDeps = {
  verifyToken: (token: string) => { userId: string; role: string };
  findUser: (userId: string) => Promise<SocketIdentityUser | null>;
  allowedRoles: ReadonlySet<string>;
};

/**
 * Detalle apto para logs. Contrato cerrado: identidad mínima + clasificación.
 * NUNCA incluye mensaje, stack, SQL, cadena de conexión, token ni credenciales.
 */
export type InfraErrorDetails = {
  /** Usuario del JWT que falló al consultarse; `null` si aún no se conoce. */
  userId: string | null;
  errorName: string;
  /** Solo códigos públicos de Prisma (`P1001`, `P2002`…); cualquier otro se omite. */
  prismaCode?: string;
};

export type SocketIdentityResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; error: typeof SOCKET_AUTH_ERROR }
  | { ok: false; error: typeof SOCKET_INFRA_ERROR; infra: InfraErrorDetails };

/**
 * Los códigos de error públicos de Prisma son `P` + 4 dígitos. Cualquier otro
 * valor (`ECONNREFUSED`, códigos internos de otras librerías) no se registra.
 */
const PRISMA_ERROR_CODE = /^P\d{4}$/;

function readPrismaCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && PRISMA_ERROR_CODE.test(code) ? code : undefined;
}

export function describeInfraError(err: unknown, userId: string | null): InfraErrorDetails {
  const errorName =
    err instanceof Error ? err.name : typeof err === 'string' ? 'Error' : typeof err;
  const prismaCode = readPrismaCode(err);

  return {
    userId,
    errorName,
    ...(prismaCode ? { prismaCode } : {}),
  };
}

/** Literal único del evento de infraestructura del handshake. */
export const SOCKET_INFRA_LOG_EVENT = 'socket_handshake_infra_error';

/**
 * Objeto de log completo. Se emite como ÚNICO argumento de `console.error` para
 * que el evento y sus metadatos no se mezclen con texto libre. Contrato cerrado:
 * `event`, `userId`, `errorName` y, opcionalmente, `prismaCode`.
 */
export type InfraErrorLog = {
  event: typeof SOCKET_INFRA_LOG_EVENT;
} & InfraErrorDetails;

export function buildInfraErrorLog(details: InfraErrorDetails): InfraErrorLog {
  return { event: SOCKET_INFRA_LOG_EVENT, ...details };
}

/**
 * Resuelve la identidad del socket sin confundir autenticación con caídas de
 * infraestructura. No lanza: el resultado siempre es explícito.
 */
export async function resolveSocketIdentity(
  token: string,
  deps: SocketIdentityDeps
): Promise<SocketIdentityResult> {
  // El middleware ya recorta, pero la función no confía en el llamador: un token
  // en blanco es ausencia de token, no un JWT que merezca consultar Prisma.
  const normalizedToken = token.trim();
  if (!normalizedToken) return { ok: false, error: SOCKET_AUTH_ERROR };

  let payload: { userId: string; role: string };
  try {
    payload = deps.verifyToken(normalizedToken);
  } catch {
    // Token ilegible, manipulado o caducado. También payload con rol no permitido
    // (verifyJwt lanza en ese caso): sigue siendo autenticación, no infraestructura.
    return { ok: false, error: SOCKET_AUTH_ERROR };
  }

  let user: SocketIdentityUser | null;
  try {
    user = await deps.findUser(payload.userId);
  } catch (err) {
    // Prisma/PostgreSQL no disponible, timeout, reinicio del backend…: infraestructura.
    // Solo se registra el id ya verificado del JWT y el código público de Prisma.
    return { ok: false, error: SOCKET_INFRA_ERROR, infra: describeInfraError(err, payload.userId) };
  }

  // Usuario borrado, rol retirado o sin acceso: se rechaza igual que antes.
  if (!user || !deps.allowedRoles.has(user.role)) {
    return { ok: false, error: SOCKET_AUTH_ERROR };
  }

  return { ok: true, userId: user.id, role: user.role };
}

export type SocketAuthMiddlewareSocket = {
  handshake: { auth?: unknown };
  data?: unknown;
  join: (room: string) => void | Promise<void>;
};

export type SocketAuthMiddlewareNext = (err?: Error) => void;

export type SocketAuthMiddlewareDeps = SocketIdentityDeps & {
  /** Room del usuario; se inyecta para no duplicar la convención `user:<id>`. */
  roomForUser: (userId: string) => string;
  /** Registro del detalle de infraestructura (contrato cerrado). */
  logInfraError: (details: InfraErrorDetails) => void;
};

/**
 * Callback real de `io.use()`, extraído para poder probarlo con un socket y
 * dependencias controladas sin importar Prisma ni Socket.IO.
 *
 * `socket.join()` puede devolver una promesa: se espera DENTRO del try/catch
 * para que un rechazo asíncrono se traduzca en `server_error` y nunca en
 * `unauthorized` (que el cliente interpretaría como sesión expirada).
 */
export function createSocketAuthMiddleware(
  deps: SocketAuthMiddlewareDeps
): (socket: SocketAuthMiddlewareSocket, next: SocketAuthMiddlewareNext) => Promise<void> {
  return async (socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const tokenMaybe = auth?.token;
    const token = typeof tokenMaybe === 'string' ? tokenMaybe.trim() : '';

    let result: SocketIdentityResult;
    try {
      result = await resolveSocketIdentity(token, {
        verifyToken: deps.verifyToken,
        findUser: deps.findUser,
        allowedRoles: deps.allowedRoles,
      });
    } catch (err) {
      // Defensa en profundidad: aquí aún no hay identidad verificada.
      deps.logInfraError(describeInfraError(err, null));
      next(new Error(SOCKET_INFRA_ERROR));
      return;
    }

    if (!result.ok) {
      if (result.error === SOCKET_INFRA_ERROR) {
        deps.logInfraError(result.infra);
        next(new Error(SOCKET_INFRA_ERROR));
        return;
      }
      next(new Error(SOCKET_AUTH_ERROR));
      return;
    }

    const bag = (socket.data as Record<string, unknown> | null | undefined) ?? {};
    Object.assign(bag, { userId: result.userId, role: result.role });
    socket.data = bag;

    try {
      await socket.join(deps.roomForUser(result.userId));
    } catch (err) {
      // Sin `await`, un rechazo de la promesa no llegaría a este catch.
      deps.logInfraError(describeInfraError(err, result.userId));
      next(new Error(SOCKET_INFRA_ERROR));
      return;
    }

    next();
  };
}
