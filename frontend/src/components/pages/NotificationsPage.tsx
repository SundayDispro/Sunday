import React from 'react';
import { Bell } from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <Bell size={22} className="text-monday-blue" />
          Notificaciones
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1">
          Actualizaciones y menciones
        </p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-monday-subtext">
        <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4">
          <Bell size={28} className="opacity-60" />
        </div>
        <p className="text-[15px] font-medium text-monday-text">Sin notificaciones nuevas</p>
        <p className="text-[13px] mt-1">Aquí aparecerán las notificaciones de tus tableros.</p>
      </div>
    </div>
  );
};
