import React from 'react';
import { Board, Item } from '../../types';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
}

export const KanbanView: React.FC<Props> = ({ board, onRowClick }) => {
  // In a Monday board Kanban, columns usually map to statuses. 
  // For the sake of this feature mirroring the provided screenshots where columns are "En curso", "Listo", "Detenido" etc.
  
  const statusColumn = board.columns.find(c => c.type === 'status');
  const settings = statusColumn?.settings ? (() => { try { return JSON.parse(statusColumn.settings); } catch { return { options: [] }; } })() : { options: [] };
  const options = settings.options || [];

  const statuses = options.length > 0
    ? options.map((opt: { id: string; label: string; color?: string }) => ({ id: opt.id, label: opt.label, color: opt.color || '#c4c4c4' }))
    : [
        { id: 'default', label: 'Sin estado', color: '#c4c4c4' },
        { id: 'en-curso', label: 'En curso', color: '#fdab3d' },
        { id: 'listo', label: 'Listo', color: '#00c875' },
        { id: 'detenido', label: 'Detenido', color: '#e2445c' },
      ];

  const itemsByStatus = statuses.map(status => {
    const itemsForStatus: Item[] = [];
    board.groups.forEach(group => {
      group.items.forEach(item => {
        const cv = item.columnValues.find(v => v.columnId === statusColumn?.id)?.value;
        let optionId: string | null = null;
        if (cv) {
          try {
            const parsed = JSON.parse(cv);
            optionId = parsed.optionId ?? null;
          } catch {
            optionId = cv;
          }
        }
        if ((!optionId && status.id === 'default') || optionId === status.id) {
          itemsForStatus.push(item);
        }
      });
    });
    return { ...status, items: itemsForStatus };
  });

  return (
    <div className="flex h-full w-full bg-monday-bg p-6 overflow-x-auto gap-4 custom-scrollbar">
      {itemsByStatus.map(statusCol => (
        <div key={statusCol.label} className="flex-shrink-0 w-[280px] flex flex-col">
          {/* Column Header */}
          <div style={{ backgroundColor: statusCol.color }} className="text-white text-sm font-medium px-4 py-2 rounded-t-md">
            {statusCol.label} / {statusCol.items.length}
          </div>
          
          {/* Card List Container */}
          <div className="bg-monday-bg flex-1 p-2 rounded-b-md border border-monday-border flex flex-col gap-2 overflow-y-auto custom-scrollbar">
            {statusCol.items.map(item => (
              <div 
                key={item.id} 
                onClick={() => onRowClick(item)}
                className="bg-white p-4 rounded-md shadow-sm border border-monday-border cursor-pointer hover:shadow-md transition group"
              >
                <div className="font-medium text-monday-text text-sm mb-4">{item.name}</div>
                {/* Render column previews slightly faded */}
                <div className="flex flex-col gap-2">
                  {board.columns.filter(c => c.type !== 'status').map(col => {
                     const val = item.columnValues.find(cv => cv.columnId === col.id)?.value;
                     if (!val) return null;
                     return (
                       <div key={col.id} className="flex items-center text-xs">
                         <span className="text-monday-subtext w-24 truncate">{col.title}</span>
                         <span className="text-monday-text truncate flex-1">{val}</span>
                       </div>
                     )
                  })}
                </div>
              </div>
            ))}
            
            {statusCol.items.length === 0 && (
              <div className="p-4 text-center text-sm text-monday-subtext">Sin tareas</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
