import React from 'react';
import { LayoutGrid, Search, AtSign } from 'lucide-react';

export function MobileHomePage({
  userName,
  onOpenKanban,
  onOpenMentions,
  onOpenSearch,
}: {
  userName?: string | null;
  onOpenKanban: () => void;
  onOpenMentions: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-monday-bg">
      <div className="shrink-0 px-5 pt-8 pb-14 relative overflow-hidden">
        {/* Banner de cabecera (estilo ventana de login) */}
        <div
          className="absolute left-0 right-0 top-0 bottom-[-22px] pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(255,74,168,0.42),transparent_55%),radial-gradient(circle_at_80%_15%,rgba(124,58,237,0.28),transparent_58%),radial-gradient(circle_at_60%_85%,rgba(255,177,0,0.22),transparent_55%),linear-gradient(135deg,#ff2f7d,#6d28d9,#ffb100)]"
        />
        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="absolute -bottom-[6px] left-0 w-full h-[72px]"
          aria-hidden="true"
        >
          {/* Cierre más recto (menos curvo) para un look más limpio */}
          <path d="M0,20 C30,24 70,24 100,20 L100,30 L0,30 Z" fill="var(--monday-bg)" />
        </svg>

        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-start justify-between gap-4">
            <h1 className="relative z-10 text-[32px] leading-[1.02] font-semibold tracking-tight text-white">
              Bienvenido
              <br />
              <span className="relative z-10 text-monday-blue truncate block max-w-[230px]">
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
            <button
              type="button"
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(20);
                onOpenKanban();
              }}
              className="w-full min-h-[56px] rounded-3xl border border-monday-border bg-white text-monday-text font-semibold text-[14px] flex items-center gap-3 px-5 transition-colors hover:bg-monday-hover"
            >
              <LayoutGrid size={20} />
              Kanban
            </button>

            <button
              type="button"
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(20);
                onOpenMentions();
              }}
              className="w-full min-h-[56px] rounded-3xl border border-monday-border bg-white text-monday-text font-semibold text-[14px] flex items-center gap-3 px-5 transition-colors hover:bg-monday-hover"
            >
              <AtSign size={20} className="text-monday-subtext" />
              Menciones
            </button>

            <button
              type="button"
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(20);
                onOpenSearch();
              }}
              className="w-full min-h-[56px] rounded-3xl border border-monday-border bg-white text-monday-text font-semibold text-[14px] flex items-center gap-3 px-5 transition-colors hover:bg-monday-hover"
            >
              <Search size={20} className="text-monday-subtext" />
              Buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

