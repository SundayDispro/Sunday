import React, { useEffect, useState } from 'react';
import { Inbox, FileText } from 'lucide-react';
import { Item, Board } from '../../types';
import { useUser } from '../../store/UserContext';

export const InboxPage: React.FC<{ onItemClick?: (item: Item) => void }> = ({ onItemClick }) => {
  const { currentUser } = useUser();
  const [board, setBoard] = useState<Board | null>(null);
  const [assignedItems, setAssignedItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch('http://localhost:3001/api/boards/first')
      .then(r => r.json())
      .then((data: Board | null) => {
        if (!data?.id) return setBoard(null);
        setBoard(data);
        const personColumns = data.columns.filter(c => c.type === 'person');
        const items: Item[] = [];
        data.groups.forEach(g => {
          g.items.forEach(item => {
            const assignedToMe = personColumns.some(col => {
              const cv = item.columnValues.find(v => v.columnId === col.id);
              return cv?.value === currentUser?.id;
            });
            if (assignedToMe) items.push(item);
          });
        });
        setAssignedItems(items);
      })
      .catch(() => setBoard(null));
  }, [currentUser?.id]);

  if (!board) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-8">
        <div className="w-10 h-10 border-2 border-monday-blue border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[14px]">Cargando bandeja...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <Inbox size={22} className="text-monday-blue" />
          Bandeja de entrada
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1">
          Tareas asignadas a ti ({assignedItems.length})
        </p>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {assignedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4">
              <Inbox size={28} className="opacity-60" />
            </div>
            <p className="text-[15px] font-medium text-monday-text">Sin tareas asignadas</p>
            <p className="text-[13px] mt-1">Las tareas en las que te asignen aparecerán aquí.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {assignedItems.map(item => {
              const group = board.groups.find(g => g.id === item.groupId);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onItemClick?.(item)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-monday bg-white border border-monday-border hover:border-monday-blue/40 hover:bg-blue-50/50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-monday-hover flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-monday-subtext" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-monday-text truncate">{item.name}</p>
                      <p className="text-[12px] text-monday-subtext">
                        {group?.name ?? 'Sin grupo'}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
