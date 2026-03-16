import React from 'react';
import { Home, Calendar, ClipboardList, Bell, MoreHorizontal } from 'lucide-react';

export type BottomNavPage = 'home' | 'calendar' | 'miTrabajo' | 'notifications' | 'more';

const ALL_ITEMS: { id: BottomNavPage; icon: React.ReactNode; label: string }[] = [
  { id: 'home', icon: <Home size={22} strokeWidth={2.25} />, label: 'Inicio' },
  { id: 'calendar', icon: <Calendar size={22} strokeWidth={2.25} />, label: 'Calendario' },
  { id: 'miTrabajo', icon: <ClipboardList size={22} strokeWidth={2.25} />, label: 'Mi trabajo' },
  { id: 'notifications', icon: <Bell size={22} strokeWidth={2.25} />, label: 'Notificaciones' },
  { id: 'more', icon: <MoreHorizontal size={22} strokeWidth={2.25} />, label: 'Más' },
];

interface BottomNavProps {
  activePage: string;
  onNavigate: (page: BottomNavPage) => void;
  unreadNotifCount?: number;
  /** Si se proporciona, solo se muestran estos ítems (ej. rol TALLER: ['home', 'board', 'more']) */
  items?: BottomNavPage[];
}

export function BottomNav({ activePage, onNavigate, unreadNotifCount = 0, items }: BottomNavProps) {
  const list = items
    ? ALL_ITEMS.filter((it) => items.includes(it.id))
    : ALL_ITEMS;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-white border-t border-monday-border safe-area-pb bottom-nav-touch"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Navegación principal"
    >
      {list.map(({ id, icon, label }) => {
        const isActive = id === 'more' ? activePage === 'more' : activePage === id;
        const showNotifBadge = id === 'notifications' && (unreadNotifCount ?? 0) > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className={`relative flex flex-col items-center justify-center min-h-[56px] flex-1 py-2 px-1 gap-0.5 transition-colors touch-manipulation ${
              isActive ? 'text-monday-blue' : 'text-monday-subtext hover:text-monday-text'
            }`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            {icon}
            {showNotifBadge && (
              <span className="absolute top-1 right-1/2 translate-x-3 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                {(unreadNotifCount ?? 0) > 99 ? '99+' : unreadNotifCount}
              </span>
            )}
            <span className="text-[10px] font-medium truncate max-w-[64px]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
