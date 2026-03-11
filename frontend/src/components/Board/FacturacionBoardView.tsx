import React from 'react';
import { Board, Item, BoardColumn, Group, StatusSettings } from '../../types';

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

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
}

export const FacturacionBoardView: React.FC<Props> = ({ board, onRowClick }) => {
  const statusColumns = board.columns.filter(c => c.type === 'status');
  const statusColumnIds = statusColumns.map(c => c.id);

  const approvedRows: { item: Item; group: Group; statusLabel: string }[] = [];
  board.groups.forEach(group => {
    group.items.forEach(item => {
      if (isItemApproved(item, statusColumnIds)) {
        approvedRows.push({
          item,
          group,
          statusLabel: getStatusLabel(item, statusColumns),
        });
      }
    });
  });

  if (approvedRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-monday-subtext flex-1">
        <p className="text-[15px] font-medium text-monday-text">Sin proyectos aprobados</p>
        <p className="text-[13px] mt-1">No hay elementos con estado Aprobado en este tablero.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="border border-monday-border rounded-xl overflow-hidden shadow-monday-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-monday-hover/60 border-b border-monday-border">
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                Proyecto
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
            {approvedRows.map(({ item, group, statusLabel }) => (
              <tr
                key={item.id}
                className="border-b border-monday-border last:border-0 hover:bg-monday-hover/50 transition-colors cursor-pointer"
                onClick={() => onRowClick(item)}
              >
                <td className="px-4 py-3 text-[13px] font-medium text-monday-blue">{item.name}</td>
                <td className="px-4 py-3 text-[13px] text-monday-text">{group.name}</td>
                <td className="px-4 py-3 text-[13px] text-monday-text font-medium">{statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
