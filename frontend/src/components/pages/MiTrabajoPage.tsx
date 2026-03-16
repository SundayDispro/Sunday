import React, { useState } from 'react';
import { LayoutGrid, ClipboardList, Star } from 'lucide-react';
import { Workspace as WorkspaceType, Board, Item } from '../../types';
import BoardContainer from '../Board/BoardContainer';

type TabId = 'elementos' | 'tableros' | 'siguiendo';

interface MiTrabajoPageProps {
  workspace: WorkspaceType | null;
  workspaces: WorkspaceType[];
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  onRowClick: (item: Item) => void;
}

export const MiTrabajoPage: React.FC<MiTrabajoPageProps> = ({
  workspace,
  workspaces,
  boards,
  activeBoardId,
  onSelectBoard,
  onRowClick,
}) => {
  const [tab, setTab] = useState<TabId>('elementos');

  const tabs = [
    { id: 'elementos' as TabId, label: 'Elementos listos', icon: ClipboardList },
    { id: 'tableros' as TabId, label: 'Tableros', icon: LayoutGrid },
    { id: 'siguiendo' as TabId, label: 'Siguiendo', icon: Star },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg">
      <div className="shrink-0 border-b border-monday-border bg-white">
        <div className="flex gap-1 p-2 border-b border-monday-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'elementos' && (
          <div className="grid grid-cols-3 gap-2 p-3">
            <div className="rounded-xl border border-monday-border bg-monday-pill/50 p-3 text-center">
              <span className="text-[20px] font-bold text-monday-text block">0</span>
              <span className="text-[11px] font-medium text-monday-subtext uppercase tracking-tight">Hoy</span>
            </div>
            <div className="rounded-xl border border-monday-border bg-monday-pill/50 p-3 text-center">
              <span className="text-[20px] font-bold text-monday-text block">0</span>
              <span className="text-[11px] font-medium text-monday-subtext uppercase tracking-tight">Fechas pasadas</span>
            </div>
            <div className="rounded-xl border border-monday-border bg-monday-pill/50 p-3 text-center">
              <span className="text-[20px] font-bold text-monday-text block">0</span>
              <span className="text-[11px] font-medium text-monday-subtext uppercase tracking-tight">Esta semana</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar scroll-touch">
        {tab === 'elementos' && (
          <>
            {!activeBoardId ? (
              <div className="p-4">
                <p className="text-[13px] text-monday-subtext mb-3">Selecciona un tablero para ver los elementos asignados a ti.</p>
                <ul className="space-y-2">
                  {boards.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => onSelectBoard(b.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-monday-hover text-left transition-colors border border-monday-border bg-white"
                      >
                        <div className="w-10 h-10 rounded-lg bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
                          <LayoutGrid size={20} />
                        </div>
                        <span className="text-[15px] font-semibold text-monday-text">{b.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {boards.length === 0 && (
                  <p className="text-[13px] text-monday-subtext">No hay tableros en este espacio.</p>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col min-h-0">
                <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-monday-border bg-white">
                  <button
                    type="button"
                    onClick={() => onSelectBoard(null)}
                    className="text-[12px] text-monday-subtext hover:text-monday-blue"
                  >
                    ← Cambiar tablero
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <BoardContainer boardId={activeBoardId} onRowClick={onRowClick} viewMode="miTrabajo" />
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'tableros' && (
          <div className="p-4">
            <ul className="space-y-2">
              {boards.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onSelectBoard(b.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors border ${
                      activeBoardId === b.id ? 'border-monday-blue bg-monday-blue/10' : 'border-monday-border bg-white hover:bg-monday-hover'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
                      <LayoutGrid size={20} />
                    </div>
                    <span className="text-[15px] font-semibold text-monday-text">{b.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {boards.length === 0 && (
              <p className="text-[13px] text-monday-subtext">No hay tableros en este espacio.</p>
            )}
          </div>
        )}

        {tab === 'siguiendo' && (
          <div className="p-6 text-center text-monday-subtext">
            <Star size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-[14px]">Siguiendo elementos o tableros estará disponible en futuras actualizaciones.</p>
          </div>
        )}
      </div>
    </div>
  );
};
