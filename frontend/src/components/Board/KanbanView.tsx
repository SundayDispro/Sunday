import React from 'react';
import { Board, Item } from '../../types';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
}

export const KanbanView: React.FC<Props> = ({ board, onRowClick }) => {
  // In a Monday board Kanban, columns usually map to statuses. 
  // For the sake of this feature mirroring the provided screenshots where columns are "En curso", "Listo", "Detenido" etc.
  
  // Find the 'Status' column to group items by it.
  const statusColumn = board.columns.find(c => c.type === 'status');
  console.log("kanban board", board);

  // Hardcoded statuses based on Monday defaults for now
  const statuses = [
    { label: 'En curso', color: '#fdab3d' },
    { label: 'Listo', color: '#00c875' },
    { label: 'Detenido', color: '#e2445c' },
    { label: 'Vacío', color: '#c4c4c4'}
  ];

  // Group items by status
  const itemsByStatus = statuses.map(status => {
    let itemsForStatus: Item[] = [];
    board.groups.forEach(group => {
      group.items.forEach(item => {
        let val = item.columnValues.find(cv => cv.columnId === statusColumn?.id)?.value;
        if (!val && status.label === 'Vacío') itemsForStatus.push(item);
        if (val === status.label) itemsForStatus.push(item);
      });
    });
    return { ...status, items: itemsForStatus };
  });

  return (
    <div className="flex h-full w-full bg-gray-50/50 p-6 overflow-x-auto gap-4 custom-scrollbar">
      {itemsByStatus.map(statusCol => (
        <div key={statusCol.label} className="flex-shrink-0 w-[280px] flex flex-col">
          {/* Column Header */}
          <div style={{ backgroundColor: statusCol.color }} className="text-white text-sm font-medium px-4 py-2 rounded-t-md">
            {statusCol.label} / {statusCol.items.length}
          </div>
          
          {/* Card List Container */}
          <div className="bg-monday-bg flex-1 p-2 rounded-b-md border border-gray-200 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
            {statusCol.items.map(item => (
              <div 
                key={item.id} 
                onClick={() => onRowClick(item)}
                className="bg-white p-4 rounded-md shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition group"
              >
                <div className="font-medium text-monday-text text-sm mb-4">{item.name}</div>
                {/* Render column previews slightly faded */}
                <div className="flex flex-col gap-2">
                  {board.columns.filter(c => c.type !== 'status').map(col => {
                     const val = item.columnValues.find(cv => cv.columnId === col.id)?.value;
                     if (!val) return null;
                     return (
                       <div key={col.id} className="flex items-center text-xs">
                         <span className="text-gray-400 w-24 truncate">{col.title}</span>
                         <span className="text-monday-text truncate flex-1">{val}</span>
                       </div>
                     )
                  })}
                </div>
              </div>
            ))}
            
            {statusCol.items.length === 0 && (
              <div className="p-4 text-center text-sm text-gray-400">Sin tareas</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
