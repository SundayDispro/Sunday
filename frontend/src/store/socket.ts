import { io, Socket } from 'socket.io-client';

function getSocketToken(): string | null {
  try {
    return localStorage.getItem('sunday_token');
  } catch {
    return null;
  }
}

// Mismo origen (undefined) para que Vite haga proxy de /socket.io al backend.
// Así funciona desde PC y desde móvil en la red (192.168.x.x:5173).
// Si VITE_API_URL está definido, Socket.IO conecta a esa URL.
const SOCKET_URL: string | undefined = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string)
  : undefined;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: true,
  auth: { token: getSocketToken() },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 45000,
});

/** Tras login, reconectar el socket para que el handshake lleve el nuevo JWT y el servidor una al room user:<userId>. */
export function reconnectSocketWithAuth(): void {
  socket.auth = { token: getSocketToken() };
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
