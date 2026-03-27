import React, { useEffect, useState } from 'react';
import { LayoutGrid, Search, BookOpen, PanelsTopLeft, type LucideIcon } from 'lucide-react';
import { useViewport } from '../../hooks/useViewport';

const BANNER_GRADIENT =
  'bg-[radial-gradient(circle_at_20%_20%,rgba(255,74,168,0.42),transparent_55%),radial-gradient(circle_at_80%_15%,rgba(124,58,237,0.28),transparent_58%),radial-gradient(circle_at_60%_85%,rgba(255,177,0,0.22),transparent_55%),linear-gradient(135deg,#ff2f7d,#6d28d9,#ffb100)]';

type QuickAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  iconClass?: string;
  onClick: () => void;
};

export function MobileHomePage({
  userName,
  onOpenKanban,
  onOpenBoardsOverview,
  onOpenDocs,
  onOpenSearch,
}: {
  userName?: string | null;
  onOpenKanban: () => void;
  onOpenBoardsOverview: () => void;
  onOpenDocs: () => void;
  onOpenSearch: () => void;
}) {
  const { isLandscape } = useViewport();
  /** Tablet en portrait (p. ej. iPad): misma cabecera lateral que en landscape. */
  const [wideTabletPortrait, setWideTabletPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 600px) and (max-width: 1024px) and (orientation: portrait)');
    const apply = () => setWideTabletPortrait(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const useSplitHomeLayout = isLandscape || wideTabletPortrait;

  const actions: QuickAction[] = [
    {
      key: 'boards',
      label: 'Tableros',
      icon: PanelsTopLeft,
      iconClass: 'text-monday-blue',
      onClick: onOpenBoardsOverview,
    },
    { key: 'kanban', label: 'Kanban', icon: LayoutGrid, onClick: onOpenKanban },
    {
      key: 'docs',
      label: 'Docs',
      icon: BookOpen,
      iconClass: 'text-monday-subtext',
      onClick: onOpenDocs,
    },
    {
      key: 'search',
      label: 'Buscar',
      icon: Search,
      iconClass: 'text-monday-subtext',
      onClick: onOpenSearch,
    },
  ];

  const tap = () => {
    if (navigator.vibrate) navigator.vibrate(20);
  };

  if (useSplitHomeLayout) {
    return (
      <div className="flex-1 min-h-0 flex flex-row items-stretch overflow-hidden bg-monday-bg">
        {/* Columna izquierda: gradiente a todo el alto (sin redondeo inferior = sin “corte” del fondo) */}
        <div
          className="relative shrink-0 self-stretch min-h-0 w-[min(42vw,300px)] min-w-[168px] max-w-[320px] flex flex-col justify-center overflow-hidden pl-[max(10px,env(safe-area-inset-left))] pr-3 py-4"
        >
          <div className={`absolute inset-0 pointer-events-none ${BANNER_GRADIENT}`} />
          <div className="relative z-10 min-w-0 py-1">
            <h1 className="text-[clamp(1rem,3.2vw,1.35rem)] leading-[1.15] font-semibold tracking-tight text-white">
              Bienvenido
              <span className="mt-1.5 block text-monday-blue font-semibold break-words">
                {userName?.trim() || '—'}
              </span>
            </h1>
          </div>
        </div>

        {/* Columna derecha: acciones en cuadrícula */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col justify-center py-3 pr-[max(10px,env(safe-area-inset-right))] pl-3 pb-[max(8px,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-lg mx-auto min-h-0">
            <div className="text-monday-subtext text-[11px] font-medium tracking-wide mb-0.5">
              Inicio
            </div>
            <div className="text-monday-text text-[17px] font-semibold mb-3">Acciones rápidas</div>
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {actions.map(({ key, label, icon: Icon, iconClass, onClick }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    tap();
                    onClick();
                  }}
                  className="min-h-[52px] rounded-2xl border border-monday-border bg-[var(--monday-surface)] text-monday-text font-semibold text-[13px] flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 transition-colors hover:bg-monday-hover active:scale-[0.99] touch-manipulation shadow-monday-sm"
                >
                  <Icon size={22} className={iconClass ?? 'text-monday-text'} strokeWidth={2} />
                  <span className="leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-monday-bg">
      <div className="shrink-0 px-5 pt-8 pb-14 relative overflow-hidden">
        <div
          className={`absolute left-0 right-0 top-0 bottom-[-22px] pointer-events-none ${BANNER_GRADIENT}`}
        />
        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="absolute -bottom-[6px] left-0 w-full h-[72px]"
          aria-hidden="true"
        >
          <path d="M0,20 C30,24 70,24 100,20 L100,30 L0,30 Z" fill="var(--monday-bg)" />
        </svg>

        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-start justify-between gap-4">
            <h1 className="relative z-10 text-[32px] leading-[1.02] font-semibold tracking-tight text-white">
              Bienvenido
              <br />
              <span className="relative z-10 text-monday-blue block break-words max-w-full sm:max-w-[min(100%,280px)]">
                {userName?.trim() || '—'}
              </span>
            </h1>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center px-5 pb-6">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-monday-subtext text-[12px] font-medium tracking-wide mb-1">Inicio</div>
          <div className="text-monday-text text-[22px] font-semibold mb-5">Acciones rápidas</div>

          <div className="grid gap-3">
            {actions.map(({ key, label, icon: Icon, iconClass, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  tap();
                  onClick();
                }}
                className="w-full min-h-[56px] rounded-3xl border border-monday-border bg-[var(--monday-surface)] text-monday-text font-semibold text-[14px] flex items-center gap-3 px-5 transition-colors hover:bg-monday-hover touch-manipulation"
              >
                <Icon size={20} className={iconClass ?? 'text-monday-text'} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
