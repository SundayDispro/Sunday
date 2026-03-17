import React from 'react';
import { LayoutGrid, Calendar, BookOpen, MoreHorizontal } from 'lucide-react';

/** 4 pestañas: Tableros, Calendario, Docs, Más. Bandeja y Notificaciones solo desde el drawer "Más". */
export type BottomNavPage = 'home' | 'calendar' | 'docs' | 'more';

const ALL_ITEMS: { id: BottomNavPage; icon: React.ReactNode; label: string }[] = [
  { id: 'home', icon: <LayoutGrid size={22} strokeWidth={2.25} />, label: 'Tableros' },
  { id: 'calendar', icon: <Calendar size={22} strokeWidth={2.25} />, label: 'Calendario' },
  { id: 'docs', icon: <BookOpen size={22} strokeWidth={2.25} />, label: 'Docs' },
  { id: 'more', icon: <MoreHorizontal size={22} strokeWidth={2.25} />, label: 'Más' },
];

interface BottomNavProps {
  activePage: string;
  onNavigate: (page: BottomNavPage) => void;
  unreadNotifCount?: number;
  /** Si se proporciona, solo se muestran estos ítems (ej. rol TALLER: ['home', 'calendar', 'docs', 'more']) */
  items?: BottomNavPage[];
  /** Si true, el tab "Más" se considera activo cuando el drawer está abierto */
  moreIsActive?: boolean;
  /** Modo horizontal con poca altura: solo iconos, barra más baja para ganar espacio vertical */
  compact?: boolean;
}

export function BottomNav({ activePage, onNavigate, unreadNotifCount = 0, items, compact = false, moreIsActive = false }: BottomNavProps) {
  const list = items
    ? ALL_ITEMS.filter((it) => items.includes(it.id))
    : ALL_ITEMS;

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-white border-t border-monday-border safe-area-pb bottom-nav-touch ${
        compact ? 'bottom-nav-compact' : ''
      }`}
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Navegación principal"
    >
      {list.map(({ id, icon, label }) => {
        const isActive = id === 'more' ? moreIsActive || activePage === 'more' : activePage === id;
        const showNotifBadge = id === 'more' && (unreadNotifCount ?? 0) > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className={`relative flex flex-col items-center justify-center flex-1 py-2 px-1 gap-0.5 transition-colors touch-manipulation ${
              compact ? 'min-h-[44px]' : 'min-h-[56px]'
            } ${isActive ? 'text-monday-blue' : 'text-monday-subtext hover:text-monday-text'}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            title={compact ? label : undefined}
          >
            {icon}
            {showNotifBadge && (
              <span className={`absolute min-w-[14px] h-[14px] px-0.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full ${
                compact ? 'top-0.5 right-1/2 translate-x-3' : 'top-1 right-1/2 translate-x-3'
              }`}>
                {(unreadNotifCount ?? 0) > 99 ? '99+' : unreadNotifCount}
              </span>
            )}
            {!compact && <span className="text-[10px] font-medium truncate max-w-[64px]">{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
