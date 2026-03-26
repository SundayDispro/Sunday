import React, { useEffect, useState } from 'react';
import { socket } from '../store/socket';

/**
 * Punto verde/rojo de conexión en tiempo real (Socket.IO).
 * Útil en VPN/LAN para saber si los cambios llegarán al servidor.
 */
export function SocketConnectionIndicator({ className = '' }: { className?: string }) {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const label = connected ? 'EN LÍNEA' : 'SIN CONEXIÓN';

  return (
    <span
      className={`inline-flex flex-row items-center justify-center gap-1 px-2.5 py-1.5 max-w-full min-w-0 ${className}`}
      title={connected ? 'Conectado en tiempo real' : 'Sin conexión en tiempo real — reintentando…'}
    >
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}
        aria-hidden
      />
      <span className="text-[7px] sm:text-[8px] font-medium text-white/65 uppercase tracking-wide whitespace-nowrap leading-none">
        {label}
      </span>
    </span>
  );
}
