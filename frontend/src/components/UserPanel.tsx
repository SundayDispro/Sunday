import React from 'react';
import { useUser } from '../store/UserContext';
import { UserStatus } from '../types';
import { LogOut, Circle, CircleDot, CircleOff, LayoutGrid, Settings } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';

const STATUS_OPTIONS: { value: UserStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'available', label: 'Disponible', icon: <Circle size={14} className="text-green-500 fill-green-500" /> },
  { value: 'busy', label: 'Ocupado', icon: <CircleDot size={14} className="text-amber-500 fill-amber-500" /> },
  { value: 'offline', label: 'Offline', icon: <CircleOff size={14} className="text-monday-subtext" /> },
];

interface UserPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  boardsCount?: number;
  workspaceName?: string;
  onOpenAdmin?: () => void;
}

export const UserPanel: React.FC<UserPanelProps> = ({
  open,
  onOpenChange,
  trigger,
  boardsCount = 0,
  workspaceName = 'Workspace',
  onOpenAdmin,
}) => {
  const { currentUser, logout, setUserStatus } = useUser();
  const status = (currentUser?.status || 'offline') as UserStatus;

  if (!currentUser) return null;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[60] w-72 bg-white rounded-xl shadow-monday-lg border border-monday-border p-0 overflow-hidden"
          sideOffset={8}
          side="top"
          align="end"
        >
          {/* Header con avatar y nombre */}
          <div className="p-4 border-b border-monday-border bg-monday-bg/30">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm shrink-0"
                style={{ backgroundColor: currentUser.color }}
              >
                {currentUser.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-monday-text truncate">{currentUser.name}</p>
                <p className="text-[12px] text-monday-subtext truncate">@{currentUser.username}</p>
              </div>
            </div>
          </div>

          {/* Estado */}
          <div className="p-3 border-b border-monday-border">
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">Estado</p>
            <div className="flex flex-col gap-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setUserStatus(opt.value);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors text-left ${
                    status === opt.value
                      ? 'bg-monday-blue/15 text-monday-blue font-medium'
                      : 'text-monday-text hover:bg-monday-hover'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resumen de proyectos */}
          <div className="p-3 border-b border-monday-border">
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">Proyectos</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-monday-bg/50">
              <LayoutGrid size={16} className="text-monday-blue shrink-0" />
              <span className="text-[13px] text-monday-text">
                {boardsCount} tablero{boardsCount !== 1 ? 's' : ''} en {workspaceName}
              </span>
            </div>
          </div>

          {/* Admin (solo si es ADMIN) y Cerrar sesión */}
          <div className="p-2">
            {currentUser.role === 'ADMIN' && onOpenAdmin && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onOpenAdmin();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-monday-text hover:bg-monday-hover transition-colors"
              >
                <Settings size={16} className="text-monday-subtext shrink-0" />
                Gestión de usuarios
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} className="shrink-0" />
              Cerrar sesión
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
