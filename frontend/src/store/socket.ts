import { io } from 'socket.io-client';

// En desarrollo usa localhost (o VITE_API_URL si está seteado).
// En producción (build), si VITE_API_URL está vacío el frontend se sirve desde
// el mismo origen que el backend, por lo que Socket.IO conecta al mismo host.
const SOCKET_URL: string | undefined = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string)
  : import.meta.env.DEV
  ? 'http://localhost:3001'
  : undefined;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
