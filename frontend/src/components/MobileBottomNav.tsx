import React from 'react';
import { Home, Calendar, FileText } from 'lucide-react';

export type MobileBottomTab = 'home' | 'calendar' | 'docs';

const TABS: Array<{
  id: MobileBottomTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'home', label: 'Inicio', icon: <Home size={22} strokeWidth={2.25} /> },
  { id: 'calendar', label: 'Calendario', icon: <Calendar size={22} strokeWidth={2.25} /> },
  { id: 'docs', label: 'Docs', icon: <FileText size={22} strokeWidth={2.25} /> },
];

export function MobileBottomNav({
  activeTab,
  onNavigate,
  compact = false,
}: {
  activeTab: MobileBottomTab;
  onNavigate: (tab: MobileBottomTab) => void;
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className={[
        'fixed bottom-0 left-0 right-0 z-40',
        'safe-area-pb',
        // Liquid glass
        'bg-white backdrop-blur-xl',
        'border-t border-monday-border',
        'shadow-monday-lg',
      ].join(' ')}
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto w-full max-w-md px-2">
        <div className="flex items-center justify-between">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onNavigate(t.id)}
                className={[
                  'relative flex-1',
                  'flex flex-col items-center justify-center',
                  compact ? 'min-h-[48px] py-2' : 'min-h-[64px] py-2.5',
                  'touch-manipulation select-none',
                  'transition-colors',
                  isActive ? 'text-monday-text' : 'text-monday-subtext hover:text-monday-text',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="relative flex items-center justify-center w-11 h-11">
                  <span
                    className={[
                      'absolute inset-0 rounded-2xl',
                      'transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                      'bg-monday-pill',
                      'border border-monday-border',
                    ].join(' ')}
                    aria-hidden
                  />
                  <span className="relative">{t.icon}</span>
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

