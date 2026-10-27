import { io, Socket } from 'socket.io-client';
import { notifyGlobalToast } from '../toastGlobal';
import { expireSession } from '../api';
import {
  createRetryScheduler,
  handleConnectError,
  reconnectOnConnectivityRecovery,
} from './socketRetry';

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

/**
 * P1 — Reintento propio para rechazos de namespace (`connect_error` de middleware).
 *
 * El backoff del manager no cubre este caso: al recibir un CONNECT_ERROR de
 * namespace, socket.io-client destruye el socket y marca `skipReconnect = true`.
 * Este programador usa exactamente los mismos parámetros que el manager
 * (`reconnectionDelay`, `reconnectionDelayMax`, `randomizationFactor`) y mantiene
 * un único temporizador pendiente.
 */
const socketRetry = createRetryScheduler({
  attempt: () => {
    // Si el usuario cerró sesión mientras esperábamos, no reconectamos: sin token
    // el servidor respondería `unauthorized` y dispararíamos un falso logout.
    if (!getSocketToken()) return;
    socket.connect();
  },
  backoff: {
    // Getters del Manager: devuelven los valores ya normalizados (incluye defaults).
    reconnectionDelay: socket.io.reconnectionDelay(),
    reconnectionDelayMax: socket.io.reconnectionDelayMax(),
    randomizationFactor: socket.io.randomizationFactor(),
  },
});

/** Tras login, reconectar el socket para que el handshake lleve el nuevo JWT y el servidor una al room user:<userId>. */
export function reconnectSocketWithAuth(): void {
  // Login explícito del usuario: se reinicia el backoff (no arrastra intentos previos).
  socketRetry.reset();
  // Reactivar el backoff del manager si un rechazo de auth lo había desactivado:
  // `connect()` limpia `skipReconnect`, pero no restaura `_reconnection`.
  socket.io.reconnection(true);
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
 * Descarta las escrituras encoladas sin emitirlas y cancela el reintento propio.
 *
 * Debe llamarse al cerrar sesión: la cola vive en el módulo, no en el usuario, y
 * si se conservara, tras un login distinto en el mismo navegador esas escrituras
 * se enviarían con la identidad del nuevo usuario (el backend las aplicaría como
 * si fueran suyas).
 *
 * La cancelación es necesaria porque `socket.disconnect()` solo emite el evento
 * `disconnect` (que también cancela) si el socket estaba conectado; tras un
 * `server_error` el socket ya fue destruido y el temporizador quedaría huérfano
 * hasta dispararse. Sin token el intento no conectaría, pero no debe quedar vivo.
 */
export function clearPendingCellWrites(): void {
  pendingCellWrites.clear();
  socketRetry.cancel();
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
 * Al conectar: reactivar la reconexión del manager, reiniciar el backoff propio
 * y vaciar la cola de celdas.
 *
 * Tras `connect()`, `Manager.open()` limpia `skipReconnect`, pero la bandera
 * `_reconnection` pudo quedar en `false` por un rechazo de auth anterior. Se
 * restaura aquí (y en `reconnectSocketWithAuth`) para que un futuro fallo de
 * transporte vuelva a tener backoff automático.
 */
function onSocketConnect(): void {
  socket.io.reconnection(true);
  socketRetry.reset();
  flushPendingCellWrites();
}

socket.on('connect', onSocketConnect);

/**
 * P1 — Error de conexión.
 *
 * - `unauthorized` (token inválido/caducado o usuario sin permisos): reintentar
 *   es inútil y consume batería/red. Se corta la reconexión, se descarta la cola
 *   (pertenece a la sesión que acaba de morir) y se delega en `expireSession()`,
 *   el mismo flujo que usa `apiFetch` ante un 401.
 * - `server_error` (PostgreSQL caído, timeout, reinicio del backend): NO es una
 *   sesión expirada. No se borra el JWT ni la cola; se programa un reintento con
 *   el backoff del manager, porque su reconexión automática no cubre este caso.
 * - Cualquier otro mensaje: no se inicia el programador propio. Se deja que se
 *   aplique el comportamiento nativo del manager (fallo de transporte) o el
 *   estado nativo del cliente (rechazo de namespace sin código conocido).
 */
socket.on('connect_error', (err: Error) => {
  const action = handleConnectError(err?.message, {
    expireSession: () => {
      socket.io.reconnection(false);
      socketRetry.cancel();
      clearPendingCellWrites();
      expireSession('session_expired');
    },
    scheduleRetry: () => {
      socketRetry.schedule();
    },
  });

  if (action === 'retry') {
    // Sin datos del error en el log: el mensaje del servidor ya es genérico.
    console.warn('[socket] Error temporal del servidor en el handshake; reintento programado.');
  }
});

/**
 * Logout explícito (`socket.disconnect()`): cancelar cualquier reintento pendiente
 * para no reconectar en la pantalla de login. El evento `connect` posterior
 * vuelve a reiniciar el backoff desde el primer escalón.
 */
socket.on('disconnect', (reason: string) => {
  if (reason === 'io client disconnect') socketRetry.cancel();
});

/**
 * P1 — Ciclo de vida del navegador.
 *
 * iOS Safari y Android congelan o matan el WebSocket cuando la PWA pasa a
 * segundo plano. Al volver al primer plano o al recuperar red se puede forzar
 * un intento inmediato, pero SOLO si no hay ya un handshake en curso ni un
 * reintento de `server_error` programado: de lo contrario una ráfaga de
 * `online`/`visibilitychange`/`pageshow` duplicaría el CONNECT del namespace o
 * adelantaría indefinidamente el backoff. La decisión vive en
 * `reconnectOnConnectivityRecovery()` para poder probarla sin navegador.
 */
function reconectarSiHaceFalta(): void {
  if (typeof window === 'undefined') return;
  reconnectOnConnectivityRecovery({
    socket,
    retryPending: socketRetry.isPending(),
    hasToken: !!getSocketToken(),
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
  });
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
