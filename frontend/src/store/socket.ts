import { io, Socket } from 'socket.io-client';

function getSocketToken(): string | null {
  try {
    return localStorage.getItem('sunday_token');
  } catch {
    return null;
  }
}

function getSocketServerUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // Desarrollo: conexión directa a :3001 (mismo host que la página). Evita fallos del proxy WebSocket de Vite en Windows y simplifica el handshake.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const port = (import.meta.env.VITE_DEV_BACKEND_PORT as string | undefined) || '3001';
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  // Producción sin VITE_API_URL: mismo origen (p. ej. Nginx sirve estático y proxya /socket.io).
  return undefined;
}

export const socket: Socket = io(getSocketServerUrl(), {
  autoConnect: true,
  // Token fresco en cada conexión/reconexión (evita handshake sin JWT si el módulo cargó antes de localStorage).
  auth: (cb) => {
    cb({ token: getSocketToken() });
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 45000,
});

/** Tras login, reconectar el socket para que el handshake lleve el nuevo JWT y el servidor una al room user:<userId>. */
export function reconnectSocketWithAuth(): void {
  // Con `auth` en forma de callback, cada connect vuelve a leer el token de localStorage.
  socket.disconnect();
  socket.connect();
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
