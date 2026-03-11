import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { Board, Item, BoardColumn, Group, StatusSettings } from '../../types';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

function getStatusLabel(item: Item, statusColumns: BoardColumn[]): string {
  for (const col of statusColumns) {
    const cv = item.columnValues.find(v => v.columnId === col.id);
    if (!cv?.value) continue;
    try {
      const parsed = JSON.parse(cv.value);
      const optionId = parsed.optionId;
      const settings: StatusSettings = col.settings ? JSON.parse(col.settings) : { options: [] };
      const opt = settings.options.find(o => o.id === optionId);
      if (opt) return opt.label || optionId;
      return optionId;
    } catch {
      return cv.value;
    }
  }
  return '—';
}

function isItemApproved(item: Item, statusColumnIds: string[]): boolean {
  return statusColumnIds.some(cid => {
    const cv = item.columnValues.find(v => v.columnId === cid);
    if (!cv?.value) return false;
    try {
      const p = JSON.parse(cv.value);
      return p.optionId === 'aprobado';
    } catch {
      return false;
    }
  });
}

interface FacturacionPageProps {
  boards: Board[];
  onOpenItem?: (item: Item, boardId: string) => void;
}

export const FacturacionPage: React.FC<FacturacionPageProps> = ({ boards, onOpenItem }) => {
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [fullBoard, setFullBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedBoardId) {
      setFullBoard(null);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/api/boards/${selectedBoardId}`)
      .then(r => r.json())
      .then((data: Board) => {
        setFullBoard(data);
      })
      .catch(err => {
        console.error('Error fetching board:', err);
        setFullBoard(null);
      })
      .finally(() => setLoading(false));
  }, [selectedBoardId]);

  const statusColumns = fullBoard?.columns.filter(c => c.type === 'status') ?? [];
  const statusColumnIds = statusColumns.map(c => c.id);

  const approvedRows: { item: Item; group: Group; boardName: string; statusLabel: string }[] = [];
  if (fullBoard) {
    fullBoard.groups.forEach(group => {
      group.items.forEach(item => {
        if (isItemApproved(item, statusColumnIds)) {
          approvedRows.push({
            item,
            group,
            boardName: fullBoard.name,
            statusLabel: getStatusLabel(item, statusColumns),
          });
        }
      });
    });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <Receipt size={22} className="text-monday-blue" />
          Facturación
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1">
          Proyectos aprobados para facturación
        </p>
        <div className="mt-4">
          <label className="text-[12px] font-semibold text-monday-subtext block mb-1">Tablero</label>
          <select
            value={selectedBoardId ?? ''}
            onChange={e => setSelectedBoardId(e.target.value || null)}
            className="px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-monday-blue min-w-[200px]"
          >
            <option value="">Seleccionar tablero...</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !fullBoard ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <Receipt size={48} className="opacity-50 mb-4" />
            <p className="text-[15px] font-medium text-monday-text">Selecciona un tablero</p>
            <p className="text-[13px] mt-1">Verás aquí los proyectos con estado Aprobado.</p>
          </div>
        ) : approvedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <Receipt size={48} className="opacity-50 mb-4" />
            <p className="text-[15px] font-medium text-monday-text">Sin proyectos aprobados</p>
            <p className="text-[13px] mt-1">No hay elementos con estado Aprobado en este tablero.</p>
          </div>
        ) : (
          <div className="border border-monday-border rounded-xl overflow-hidden shadow-monday-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-monday-hover/60 border-b border-monday-border">
                  <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                    Proyecto
                  </th>
                  <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                    Tablero
                  </th>
                  <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                    Grupo
                  </th>
                  <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                    Estatus
                  </th>
                </tr>
              </thead>
              <tbody>
                {approvedRows.map(({ item, group, boardName, statusLabel }) => (
                  <tr
                    key={item.id}
                    className="border-b border-monday-border last:border-0 hover:bg-monday-hover/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {onOpenItem ? (
                        <button
                          type="button"
                          onClick={() => onOpenItem(item, fullBoard!.id)}
                          className="text-[13px] font-medium text-monday-blue hover:underline text-left"
                        >
                          {item.name}
                        </button>
                      ) : (
                        <span className="text-[13px] text-monday-text">{item.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-monday-text">{boardName}</td>
                    <td className="px-4 py-3 text-[13px] text-monday-text">{group.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-monday-text font-medium">{statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
