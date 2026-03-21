import React from 'react';
import { Home, FolderOpen, Plus } from 'lucide-react';

export type WordShellTab = 'inicio' | 'crear' | 'explorar';

type Props = {
  active: WordShellTab;
  onChange: (tab: WordShellTab) => void;
};

/**
 * Barra inferior flotante estilo Word para iOS (pastilla oscura, iconos + etiquetas).
 */
export function MobileDocsShell({ active, onChange }: Props) {
  const tabs: { id: WordShellTab; label: string; icon: typeof Home; center?: boolean }[] = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'crear', label: 'Crear', icon: Plus, center: true },
    { id: 'explorar', label: 'Explorar', icon: FolderOpen },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-end justify-center pointer-events-none"
      style={{ paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 12px))' }}
      aria-label="Navegación de documentos"
    >
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-[28px] bg-zinc-900/92 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45)] px-1.5 py-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          if (t.center) {
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className="flex flex-col items-center justify-center min-w-[72px] -mt-5 px-1"
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className={[
                    'w-14 h-14 rounded-full flex items-center justify-center shadow-lg border transition-colors',
                    isActive
                      ? 'bg-[#2b7fff] border-[#4a8fff] text-white'
                      : 'bg-zinc-700 border-zinc-600 text-zinc-200',
                  ].join(' ')}
                >
                  <Icon size={28} strokeWidth={2.2} />
                </span>
                <span
                  className={[
                    'mt-1 text-[11px] font-semibold',
                    isActive ? 'text-[#5aa3ff]' : 'text-zinc-400',
                  ].join(' ')}
                >
                  {t.label}
                </span>
              </button>
            );
          }
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={[
                'flex flex-col items-center justify-center min-w-[64px] py-1 px-2 rounded-2xl transition-colors',
                isActive ? 'bg-white/10' : 'hover:bg-white/5',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                size={22}
                strokeWidth={2}
                className={isActive ? 'text-white' : 'text-zinc-400'}
              />
              <span
                className={[
                  'mt-0.5 text-[10px] font-medium',
                  isActive ? 'text-white' : 'text-zinc-500',
                ].join(' ')}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
