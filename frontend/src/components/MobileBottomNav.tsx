import React from 'react';
import { Home, Bell, Inbox, Calendar, Menu } from 'lucide-react';

export type MobileBottomTab = 'home' | 'notifications' | 'inbox' | 'calendar' | 'more';

const TABS: Array<{
  id: MobileBottomTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'home', label: 'Inicio', icon: <Home size={22} strokeWidth={2.25} /> },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell size={22} strokeWidth={2.25} /> },
  { id: 'inbox', label: 'Bandeja', icon: <Inbox size={22} strokeWidth={2.25} /> },
  { id: 'calendar', label: 'Calendario', icon: <Calendar size={22} strokeWidth={2.25} /> },
  { id: 'more', label: 'Más', icon: <Menu size={22} strokeWidth={2.25} /> },
];

export function MobileBottomNav({
  activeTab,
  onNavigate,
  compact = false,
  unreadNotifCount = 0,
  recentUnreadNotif = false,
}: {
  activeTab: MobileBottomTab;
  onNavigate: (tab: MobileBottomTab) => void;
  compact?: boolean;
  unreadNotifCount?: number;
  recentUnreadNotif?: boolean;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className={[
        'fixed bottom-0 left-0 right-0 z-40',
        'safe-area-pb',
        // Optimizado para 60fps: sin backdrop-blur
        'bg-[var(--monday-surface)]',
        'border-t border-monday-border',
        'shadow-sm',
      ].join(' ')}
      style={{ 
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        willChange: 'transform'
      }}
    >
      <div className="mx-auto w-full max-w-md px-2">
        <div className="flex items-center justify-between">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (navigator.vibrate && activeTab !== t.id) navigator.vibrate(15);
                  onNavigate(t.id);
                }}
                className={[
                  'relative flex-1',
                  'flex flex-col items-center justify-center',
                  compact ? 'min-h-[48px] py-2' : 'min-h-[64px] py-2.5',
                  'touch-manipulation select-none',
                  'transition-colors active:scale-[0.985]',
                  isActive ? 'text-monday-text' : 'text-monday-subtext hover:text-monday-text',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
                aria-label={t.label}
              >
                <span className="relative flex items-center justify-center w-11 h-11">
                  <span
                    className={[
                      'absolute inset-0 rounded-2xl',
                      'transition-opacity transition-transform',
                      isActive ? 'opacity-100' : 'opacity-0',
                      isActive ? 'scale-100' : 'scale-90',
                      'bg-monday-pill',
                      'border border-monday-border',
                    ].join(' ')}
                    aria-hidden
                  />
                  <span className="relative">{t.icon}</span>
                  {t.id === 'notifications' && unreadNotifCount > 0 && (
                    <>
                      {recentUnreadNotif && (
                        <span
                          className="absolute top-0 left-0 -mt-0.5 -ml-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[var(--monday-surface)]"
                          aria-hidden
                        />
                      )}
                      <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                        {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                      </span>
                    </>
                  )}
                </span>
                {!compact && (
                  <span className="relative mt-0.5 text-[10px] font-medium tracking-wide">
                    {t.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

