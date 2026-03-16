import { io } from 'socket.io-client';

// Mismo origen (undefined) para que Vite haga proxy de /socket.io al backend.
// Así funciona desde PC y desde móvil en la red (192.168.x.x:5173).
// Si VITE_API_URL está definido, Socket.IO conecta a esa URL.
const SOCKET_URL: string | undefined = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string)
  : undefined;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 45000,
});
