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
      <div className="shrink-0 px-5 pt-5 pb-2">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-monday-subtext text-[13px] font-medium">
            Bienvenido
          </div>
          <div className="text-monday-text text-[26px] leading-[1.05] font-semibold tracking-tight truncate">
            {userName?.trim() || '—'}
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
              onClick={onOpenKanban}
              className="w-full min-h-[56px] rounded-3xl border border-monday-border bg-white text-monday-text font-semibold text-[14px] flex items-center gap-3 px-5 transition-colors hover:bg-monday-hover"
            >
              <LayoutGrid size={20} />
              Kanban
            </button>

            <button
              type="button"
              onClick={onOpenMentions}
              className="w-full min-h-[56px] rounded-3xl border border-monday-border bg-white text-monday-text font-semibold text-[14px] flex items-center gap-3 px-5 transition-colors hover:bg-monday-hover"
            >
              <AtSign size={20} className="text-monday-subtext" />
              Menciones
            </button>

            <button
              type="button"
              onClick={onOpenSearch}
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

