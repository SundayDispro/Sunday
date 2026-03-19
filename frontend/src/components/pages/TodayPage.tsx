import React, { useMemo } from 'react';
import { useUser } from '../../store/UserContext';
import { Search, LayoutGrid, Inbox, BookOpen } from 'lucide-react';

interface TodayPageProps {
  onGoSearch: () => void;
  onGoKanban: () => void;
  onGoInbox: () => void;
  onGoDocs: () => void;
}

const WELCOME_MESSAGES = [
  'Listo para avanzar un proyecto hoy.',
  'Un buen día para cerrar tareas pendientes.',
  'Organiza tu día en segundos.',
  'Da el siguiente paso en tu trabajo.',
  'Todo empieza con una pequeña acción.',
];

export const TodayPage: React.FC<TodayPageProps> = ({ onGoSearch, onGoKanban, onGoInbox, onGoDocs }) => {
  const { currentUser } = useUser();
  const firstName = currentUser?.name?.split(' ')[0] ?? currentUser?.name ?? 'Allí';
  const welcome = useMemo(
    () => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)],
    []
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg">
      <header className="shrink-0 border-b border-monday-border bg-white px-4 py-3">
        <p className="text-[13px] text-monday-subtext mb-0.5">Hola,</p>
        <h1 className="text-[20px] font-semibold text-monday-text leading-tight truncate">
          {firstName}
        </h1>
        <p className="text-[12px] text-monday-subtext mt-1">
          {welcome}
        </p>
      </header>

      <div className="shrink-0 bg-transparent px-4 pt-3 pb-1">
        <div className="w-full flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-monday-border shadow-monday-sm">
          <Search size={16} className="text-monday-subtext shrink-0" />
          <input
            type="search"
            placeholder="Buscar tableros, elementos o docs..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-monday-text placeholder:text-monday-subtext"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onGoSearch();
              }
            }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-touch px-4 pb-4 space-y-2">
        <button
          type="button"
          onClick={onGoKanban}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white border border-monday-border hover:border-monday-blue/40 hover:shadow-monday-sm active:scale-[0.995] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
            <LayoutGrid size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-monday-text truncate">Kanban</p>
            <p className="text-[11px] text-monday-subtext">
              Vista de columnas para ver el estado de tu trabajo.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onGoInbox}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white border border-monday-border hover:border-monday-blue/40 hover:shadow-monday-sm active:scale-[0.995] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
            <Inbox size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-monday-text truncate">Bandeja</p>
            <p className="text-[11px] text-monday-subtext">
              Actividad reciente y notificaciones importantes.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onGoDocs}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white border border-monday-border hover:border-monday-blue/40 hover:shadow-monday-sm active:scale-[0.995] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
            <BookOpen size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-monday-text truncate">Docs</p>
            <p className="text-[11px] text-monday-subtext">
              Acceso rápido a tus documentos y hojas.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};

