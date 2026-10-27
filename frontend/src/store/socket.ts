import { io, Socket } from 'socket.io-client';
import { notifyGlobalToast } from '../toastGlobal';
import { expireSession } from '../api';

function getSocketToken(): string | null {
  try {
    return localStorage.getItem('sunday_token');
  } catch {
    return null;
  }
}

function isLocalDevHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  // LAN típica
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

function getSocketServerUrl(): string | undefined {
  const devProxyTarget = (import.meta.env.VITE_DEV_PROXY_TARGET as string | undefined)?.trim();
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  // Si estamos en desarrollo y usamos proxy remoto de Vite, el socket debe ir por mismo origen
  // para evitar CORS/WS cross-origin en equipos cliente.
  if (import.meta.env.DEV && devProxyTarget) return undefined;
  if (fromEnv) return fromEnv;
  // Desarrollo en localhost/LAN: conexión directa a :3001. Evita fallos del proxy WebSocket de Vite en Windows.
  // Cloudflare Quick Tunnel (*.trycloudflare.com) u otro host público: mismo origen → Vite proxya /socket.io a 3001.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    if (isLocalDevHostname(window.location.hostname)) {
      const port = (import.meta.env.VITE_DEV_BACKEND_PORT as string | undefined) || '3001';
      return `${window.location.protocol}//${window.location.hostname}:${port}`;
    }
    return undefined;
  }
  // Producción sin VITE_API_URL: mismo origen (p. ej. Nginx sirve estático y proxya /socket.io).
  return undefined;
}

export const socket: Socket = io(getSocketServerUrl(), {
  // FIX 3: sin JWT el servidor rechaza el handshake; no reconectar en bucle en pantalla de login.
  autoConnect: typeof window !== 'undefined' && !!getSocketToken(),
  // Token fresco en cada conexión/reconexión (evita handshake sin JWT si el módulo cargó antes de localStorage).
  auth: (cb) => {
    cb({ token: getSocketToken() });
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  // P1 — Móvil/VPN: nunca abandonar la reconexión. Con `Infinity` el cliente sigue
  // intentando mientras la PWA esté abierta (antes moría a los ~40 s y la sesión
  // quedaba sin tiempo real hasta recargar). El `connect_error` de auth es el único
  // caso que corta los reintentos (ver manejador más abajo).
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  // Backoff exponencial acotado a 10 s + jitter del 50 % (anti-thundering herd:
  // evita que los 6 PCs + VPN reintenten sincronizados al volver la red).
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
  // Fallo rápido: 45 s de espera ciega ante un túnel muerto no son accionables.
  // Mejor fallar en 12 s y dejar que el backoff reintente.
  timeout: 12000,
  // Si el WebSocket falla al conectar (típico con Cloudflare Tunnel o VPN restrictiva),
  // probar los siguientes transportes de la lista en lugar de abortar.
  tryAllTransports: true,
});

/** Tras login, reconectar el socket para que el handshake lleve el nuevo JWT y el servidor una al room user:<userId>. */
export function reconnectSocketWithAuth(): void {
  // Con `auth` en forma de callback, cada connect vuelve a leer el token de localStorage.
  socket.disconnect();
  socket.connect();
}

/**
 * P0 — Resincronización tras reconectar.
 *
 * Registra `cb` para que se ejecute en el evento `connect`, pero SOLO cuando
 * `socket.recovered === false`. Es decir: si el servidor pudo reproducir los
 * paquetes perdidos (connectionStateRecovery) no hace falta refetch; si no pudo
 * (caída de más de 2 minutos, reinicio del backend, sesión descartada), el
 * consumidor debe recargar el estado desde la API REST para no quedarse con una
 * vista obsoleta.
 *
 * Devuelve una función de limpieza para usar en el `return` de un `useEffect`
 * (patrón ya usado en BoardContainer: `socket.off(evento, fn)` nombrado).
 */
export function onSocketResync(cb: () => void): () => void {
  const handleConnect = () => {
    if (!socket.recovered) cb();
  };
  socket.on('connect', handleConnect);
  return () => {
    socket.off('connect', handleConnect);
  };
}

/**
 * P0 — Cola intermedia de escrituras de celda.
 *
 * Socket.IO bufferiza los `emit` hechos en desconexión y los reproduce al
 * reconectar, lo que puede reenviar valores intermedios obsoletos (p. ej. cinco
 * `update_column_value` de la misma celda mientras el usuario editaba offline).
 * Para evitarlo interceptamos la escritura ANTES de que entre en ese buffer.
 *
 * Clave = `${itemId}:${columnId}` → la última escritura por celda gana.
 */
const pendingCellWrites = new Map<
  string,
  { event: string; payload: { itemId: string; columnId: string; value: unknown } }
>();

/** Vacía la cola emitiendo un único evento por celda (última escritura). */
function flushPendingCellWrites(): void {
  if (pendingCellWrites.size === 0) return;
  // Snapshot + clear antes de emitir: si un emit dispara otra escritura, no se re-encola encima.
  const pendientes = [...pendingCellWrites.values()];
  pendingCellWrites.clear();
  for (const { event, payload } of pendientes) {
    socket.emit(event, payload);
  }
}

/**
 * Descarta las escrituras encoladas sin emitirlas.
 *
 * Debe llamarse al cerrar sesión: la cola vive en el módulo, no en el usuario, y
 * si se conservara, tras un login distinto en el mismo navegador esas escrituras
 * se enviarían con la identidad del nuevo usuario (el backend las aplicaría como
 * si fueran suyas).
 */
export function clearPendingCellWrites(): void {
  pendingCellWrites.clear();
}

/**
 * Emite `update_column_value` con protección contra desconexión.
 *
 * - Conectado → emite de inmediato.
 * - Desconectado → guarda en `pendingCellWrites` (una entrada por celda) y
 *   devuelve `false` para que la UI pueda avisar al usuario.
 *
 * Los renderers de celda deben usar esta función en lugar de
 * `socket.emit('update_column_value', …)` directo.
 */
export function emitCellValue(payload: {
  itemId: string;
  columnId: string;
  value: unknown;
}): boolean {
  if (!socket.connected) {
    pendingCellWrites.set(`${payload.itemId}:${payload.columnId}`, {
      event: 'update_column_value',
      payload,
    });
    return false;
  }
  socket.emit('update_column_value', payload);
  return true;
}

/**
 * Al conectar: re-armar la reconexión automática y vaciar la cola de celdas.
 *
 * El re-armado es necesario porque un `connect_error: unauthorized` la desactiva
 * (ver manejador). Tras un login nuevo en la misma sesión de SPA, el socket debe
 * volver a reintentar si se cae la red.
 */
function onSocketConnect(): void {
  socket.io.opts.reconnection = true;
  flushPendingCellWrites();
}

socket.on('connect', onSocketConnect);

/**
 * P1 — Error de conexión.
 *
 * `unauthorized` significa que el servidor rechazó el handshake JWT (token
 * caducado, usuario borrado o rol inválido). Reintentar es inútil y consume
 * batería/red, así que se corta la reconexión y se delega en `expireSession()`,
 * el mismo flujo que usa `apiFetch` ante un 401.
 *
 * Cualquier otro error (red, túnel, CORS) se ignora a propósito: el backoff
 * infinito con jitter se encarga de reintentar.
 */
socket.on('connect_error', (err: Error) => {
  if (err.message !== 'unauthorized') return;

  socket.io.opts.reconnection = false;
  // La cola pertenece a la sesión que acaba de morir: no debe sobrevivir al login.
  clearPendingCellWrites();
  expireSession('session_expired');
});

/**
 * P1 — Ciclo de vida del navegador.
 *
 * iOS Safari y Android congelan o matan el WebSocket cuando la PWA pasa a
 * segundo plano, y el backoff puede quedar esperando segundos de más. Al volver
 * al primer plano o al recuperar red llamamos a `socket.connect()`: eso fuerza
 * un intento inmediato y cancela el backoff pendiente.
 *
 * Se ignora si el navegador está sin red (`navigator.onLine === false`) para no
 * gastar intentos inútiles; el evento `online` hará el trabajo cuando vuelva.
 */
function reconectarSiHaceFalta(): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (socket.connected) return;
  socket.connect();
}

if (typeof window !== 'undefined') {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconectarSiHaceFalta();
    });
  }
  window.addEventListener('online', reconectarSiHaceFalta);
  window.addEventListener('pageshow', reconectarSiHaceFalta);
}

/**
 * Aviso al usuario de que una escritura quedó en cola por falta de conexión.
 *
 * Throttle de 6 s para que editar varias celdas seguidas sin red no genere una
 * avalancha de toasts. Usa `notifyGlobalToast` (mismo puente sin React que
 * `api.ts`) para no acoplar el store al contexto de Toast.
 */
const AVISO_COLA_THROTTLE_MS = 6000;
let ultimoAvisoColaMs = 0;

export function notificarEscrituraEnCola(): void {
  const ahora = Date.now();
  if (ahora - ultimoAvisoColaMs < AVISO_COLA_THROTTLE_MS) return;
  ultimoAvisoColaMs = ahora;
  notifyGlobalToast({
    message: 'Sin conexión: el cambio se enviará al reconectar.',
    variant: 'warning',
  });
}

const MOVE_ITEM_DEBOUNCE_MS = 120;
let moveItemTimeout: ReturnType<typeof setTimeout> | null = null;
let lastMoveItemPayload: { itemId: string; newGroupId: string; newPosition: number } | null = null;

/** Emisión de move_item con debounce para evitar avalancha en drag rápido (Fase 3). */
export function emitMoveItem(payload: { itemId: string; newGroupId: string; newPosition: number }): void {
  lastMoveItemPayload = payload;
  if (moveItemTimeout != null) clearTimeout(moveItemTimeout);
  moveItemTimeout = setTimeout(() => {
    moveItemTimeout = null;
    if (lastMoveItemPayload) {
      socket.emit('move_item', lastMoveItemPayload);
      lastMoveItemPayload = null;
    }
  }, MOVE_ITEM_DEBOUNCE_MS);
}
