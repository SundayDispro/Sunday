/**
 * P1 — Clasificación y reintento de errores de conexión de Socket.IO.
 *
 * Vive fuera de `socket.ts` para poder probarse sin navegador: no importa
 * `socket.io-client`, no toca `window` y no depende de temporizadores reales.
 *
 * Contexto importante sobre socket.io-client 4.x: cuando el servidor rechaza el
 * handshake de un namespace (`connect_error` con un `Error` de middleware), el
 * cliente llama `socket.destroy()`. Eso desuscribe el socket del manager y deja
 * `skipReconnect = true`, así que `reconnectionAttempts: Infinity` NO aplica:
 * ese backoff solo cubre fallos de transporte. Por eso `server_error` necesita
 * un reintento propio; cualquier otro mensaje se deja al comportamiento nativo.
 *
 * Distinguimos tres familias:
 *
 * - `auth` (`unauthorized`): token inválido/caducado o usuario sin permisos.
 *   Reintentar es inútil: se cierra la sesión y se descarta la cola.
 * - `infra` (`server_error`): PostgreSQL caído, timeout, reinicio del backend.
 *   No se toca el JWT ni `pendingCellWrites`; se reintenta con el mismo backoff
 *   exponencial + jitter que usa el manager.
 * - `unknown`: cualquier otro mensaje. No se inicia el programador propio: se
 *   deja actuar al comportamiento nativo del manager (backoff de transporte) o,
 *   si fue un rechazo de namespace sin código conocido, al estado nativo del
 *   cliente. No duplicamos temporizadores ni inventamos reintentos.
 */

export type ConnectionErrorKind = 'auth' | 'infra' | 'unknown';

export type ConnectErrorAction = 'expire_session' | 'retry' | 'ignore';

/** Debe coincidir exactamente con `SOCKET_AUTH_ERROR` del backend. */
export const AUTH_ERROR_MESSAGE = 'unauthorized';

/** Debe coincidir exactamente con `SOCKET_INFRA_ERROR` del backend. */
export const INFRA_ERROR_MESSAGE = 'server_error';

export function classifyConnectError(message: unknown): ConnectionErrorKind {
  if (message === AUTH_ERROR_MESSAGE) return 'auth';
  if (message === INFRA_ERROR_MESSAGE) return 'infra';
  return 'unknown';
}

export function decideConnectErrorAction(kind: ConnectionErrorKind): ConnectErrorAction {
  if (kind === 'auth') return 'expire_session';
  // `server_error` no cubre el backoff automático del manager: único reintento propio.
  if (kind === 'infra') return 'retry';
  // Cualquier otro mensaje: ni sesión ni scheduler propio; comportamiento nativo.
  return 'ignore';
}

export type ConnectErrorEffects = {
  /** Cierre por sesión inválida: el único camino que debe limpiar el JWT y la cola. */
  expireSession: () => void;
  /** Reintento propio con backoff (rechazo de namespace). */
  scheduleRetry: () => void;
};

/**
 * Punto único de decisión ante un `connect_error`. Devuelve la acción aplicada
 * para que el llamador pueda registrar el caso sin repetir la clasificación.
 */
export function handleConnectError(
  message: unknown,
  effects: ConnectErrorEffects
): ConnectErrorAction {
  const action = decideConnectErrorAction(classifyConnectError(message));
  if (action === 'expire_session') effects.expireSession();
  else if (action === 'retry') effects.scheduleRetry();
  return action;
}

export type ConnectivityReactionState = {
  /** Socket al que se aplicaría el intento (solo se usan APIs públicas). */
  socket: { connected: boolean; active: boolean; connect: () => void };
  /** Hay un reintento propio esperando su backoff. */
  retryPending: boolean;
  /** Existe un JWT en localStorage; sin él el handshake sería rechazado. */
  hasToken: boolean;
  /** `navigator.onLine !== false`. */
  online: boolean;
};

/**
 * Decide si una señal de recuperación de conectividad (`online`,
 * `visibilitychange`, `pageshow`) debe iniciar un intento inmediato.
 *
 * Por qué no basta con `!socket.connected`:
 *
 * - `socket.active` es API pública de socket.io-client (`!!this.subs`): está en
 *   `true` mientras el socket sigue suscrito al manager, es decir, durante un
 *   handshake de namespace en curso o mientras el manager reconecta el
 *   transporte. En 4.8.3, llamar `connect()` en ese estado vuelve a enviar el
 *   paquete CONNECT del namespace (ver `socketClientRetry.test.ts`), por lo que
 *   una ráfaga de eventos duplicaría el handshake.
 * - Un reintento programado por `server_error` ya representa el siguiente
 *   intento permitido. Adelantarlo con cada evento permitiría eludir el backoff
 *   indefinidamente mientras el servidor siga caído.
 *
 * Devuelve `true` únicamente si inició una conexión.
 */
export function reconnectOnConnectivityRecovery(
  state: ConnectivityReactionState
): boolean {
  if (!state.online) return false;
  // Sin token (logout o sesión expirada) el servidor respondería `unauthorized`.
  if (!state.hasToken) return false;
  if (state.socket.connected) return false;
  // Handshake en curso o reconexión nativa del manager: no interferir.
  if (state.socket.active) return false;
  // Respetar el backoff propio ya programado.
  if (state.retryPending) return false;

  state.socket.connect();
  return true;
}

export type BackoffOptions = {
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  randomizationFactor?: number;
};

/**
 * Réplica exacta de `Backoff#duration()` de `backo2` (el que usa
 * socket.io-client): `min * 2^intento`, jitter simétrico del ±factor y tope en
 * `reconnectionDelayMax`. `random` es inyectable para que el test sea determinista.
 */
export function computeRetryDelay(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random
): number {
  // socket.io usa `opts.reconnectionDelay || 1000` (un 0 explícito cae al default).
  const min = options.reconnectionDelay || 1000;
  const max = options.reconnectionDelayMax || 10000;
  const factor = options.randomizationFactor ?? 0.5;
  const jitter = factor > 0 && factor <= 1 ? factor : 0;

  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const base = min * Math.pow(2, safeAttempt);

  if (!jitter) return Math.min(base, max) | 0;

  const rand = random();
  const deviation = Math.floor(rand * jitter * base);
  // La señal se deduce del mismo `rand` (comportamiento de backo2): no añade
  // una segunda llamada a Math.random por intento.
  const jittered = (Math.floor(rand * 10) & 1) === 0 ? base - deviation : base + deviation;
  return Math.min(jittered, max) | 0;
}

export type RetryScheduler = {
  /** Programa un intento si no hay ya uno pendiente. Idempotente. */
  schedule: () => void;
  /** Cancela el temporizador pendiente sin tocar el contador de intentos. */
  cancel: () => void;
  /** Cancela y vuelve al primer escalón del backoff. */
  reset: () => void;
  /** Número de intentos programados desde el último `reset`. */
  attempts: () => number;
  isPending: () => boolean;
};

export type RetrySchedulerOptions = {
  attempt: () => void;
  backoff?: BackoffOptions;
  random?: () => number;
  setTimeoutFn?: (callback: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

/**
 * Programador con UN solo temporizador pendiente. Las llamadas repetidas a
 * `schedule()` (varios `connect_error` seguidos, `online` + `visibilitychange`,
 * etc.) no crean temporizadores en paralelo ni disparan intentos inmediatos.
 */
export function createRetryScheduler(options: RetrySchedulerOptions): RetryScheduler {
  const setTimeoutFn =
    options.setTimeoutFn ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const clearTimeoutFn =
    options.clearTimeoutFn ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let timer: unknown = null;
  let attemptCount = 0;

  const cancel = (): void => {
    if (timer == null) return;
    clearTimeoutFn(timer);
    timer = null;
  };

  const schedule = (): void => {
    if (timer != null) return;
    const delay = computeRetryDelay(attemptCount, options.backoff, options.random);
    attemptCount += 1;
    timer = setTimeoutFn(() => {
      // Limpiar antes de intentar: si el intento vuelve a fallar y llama a
      // `schedule()`, debe poder crear el siguiente temporizador.
      timer = null;
      options.attempt();
    }, delay);
  };

  const reset = (): void => {
    cancel();
    attemptCount = 0;
  };

  return {
    schedule,
    cancel,
    reset,
    attempts: () => attemptCount,
    isPending: () => timer != null,
  };
}
