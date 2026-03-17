import React, { useRef, useState, useEffect } from 'react';
import { Board, Item } from '../../types';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  /** En móvil: scroll horizontal con anclaje por columna (cada columna ~ancho pantalla). */
  isMobile?: boolean;
  /** Landscape con poca altura: columnas un poco más estrechas para mostrar "peek" de la siguiente. */
  isLandscapeShort?: boolean;
}

interface KanbanStatus {
  id: string;
  label: string;
  color: string;
}

export const KanbanView: React.FC<Props> = ({ board, onRowClick, isMobile = false, isLandscapeShort = false }) => {
  // In a Monday board Kanban, columns usually map to statuses. 
  // For the sake of this feature mirroring the provided screenshots where columns are "En curso", "Listo", "Detenido" etc.
  
  const statusColumn = board.columns.find((c) => c.type === 'status');
  const settings: { options?: { id: string; label: string; color?: string }[] } =
    statusColumn?.settings
      ? (() => {
          try {
            return JSON.parse(statusColumn.settings) as { options?: { id: string; label: string; color?: string }[] };
          } catch {
            return { options: [] };
          }
        })()
      : { options: [] };
  const options = settings.options || [];

  const statuses: KanbanStatus[] =
    options.length > 0
      ? options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          color: opt.color || '#c4c4c4',
        }))
      : [
          { id: 'default', label: 'Sin estado', color: '#c4c4c4' },
          { id: 'en-curso', label: 'En curso', color: '#fdab3d' },
          { id: 'listo', label: 'Listo', color: '#00c875' },
          { id: 'detenido', label: 'Detenido', color: '#e2445c' },
        ];

  const itemsByStatus = statuses.map((status: KanbanStatus) => {
    const itemsForStatus: Item[] = [];
    board.groups.forEach((group) => {
      group.items.forEach((item: Item) => {
        const rawValue = item.columnValues.find((v) => v.columnId === statusColumn?.id)?.value;
        let optionId: string | null = null;
        if (rawValue) {
          try {
            const parsed = JSON.parse(rawValue) as { optionId?: string };
            optionId = parsed.optionId ?? null;
          } catch {
            optionId = rawValue;
          }
        }
        if ((!optionId && status.id === 'default') || optionId === status.id) {
          itemsForStatus.push(item);
        }
      });
    });
    return { ...status, items: itemsForStatus };
  });

  const mobileColumnWidth = isLandscapeShort ? '78vw' : '85vw';
  const mobileColumnMin = isLandscapeShort ? '78vw' : '85vw';

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isMobile || itemsByStatus.length === 0) return;
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = columnRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index !== -1) {
            const ratio = entry.intersectionRatio;
            if (ratio >= 0.5) setActiveColumnIndex(index);
          }
        });
      },
      { root: container, rootMargin: '0px', threshold: [0.25, 0.5, 0.75] }
    );
    columnRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile, itemsByStatus.length]);

  return (
    <div
      ref={scrollRef}
      className={`flex h-full w-full bg-monday-bg gap-4 custom-scrollbar scroll-touch ${
        isMobile
          ? `overflow-x-auto overflow-y-hidden snap-x snap-mandatory ${isLandscapeShort ? 'p-2 gap-3' : 'p-3 sm:p-4'}`
          : 'p-4 sm:p-6 overflow-x-auto overflow-y-hidden'
      }`}
      style={isMobile ? { WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' } : undefined}
    >
      {itemsByStatus.map((statusCol, idx) => (
        <div
          key={statusCol.label}
          ref={(el) => { columnRefs.current[idx] = el; }}
          className={`flex flex-col min-h-0 flex-shrink-0 ${
            isMobile ? 'snap-start max-w-[calc(100vw-1rem)]' : 'w-[260px] sm:w-[280px]'
          }`}
          style={isMobile ? { width: mobileColumnWidth, minWidth: mobileColumnMin } : undefined}
        >
          {/* Column Header: sticky al hacer scroll vertical dentro de la columna; indicador de columna actual en móvil */}
          <div
            className={`shrink-0 sticky top-0 z-10 ${isMobile && activeColumnIndex === idx ? 'ring-2 ring-monday-blue ring-inset' : ''}`}
            style={{ backgroundColor: statusCol.color }}
          >
            <div className="text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-t-md min-h-[44px] flex items-center justify-between">
              <span>{statusCol.label} / {statusCol.items.length}</span>
            </div>
            {isMobile && (
              <div className="h-1 flex justify-center bg-white/20">
                <div className={`w-8 rounded-full transition-colors ${activeColumnIndex === idx ? 'bg-white' : 'bg-white/40'}`} />
              </div>
            )}
          </div>

          {/* Card List Container */}
          <div className="bg-monday-bg flex-1 min-h-0 p-2 rounded-b-md border border-monday-border flex flex-col gap-2 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch">
            {statusCol.items.map(item => (
              <div 
                key={item.id} 
                onClick={() => onRowClick(item)}
                className="bg-white p-4 rounded-md shadow-sm border border-monday-border cursor-pointer hover:shadow-md transition group"
              >
                <div className="font-medium text-monday-text text-sm mb-4">{item.name}</div>
                {/* Render column previews slightly faded */}
                <div className="flex flex-col gap-2">
                  {board.columns.filter((c) => c.type !== 'status').map((col) => {
                     const val = item.columnValues.find((cv) => cv.columnId === col.id)?.value;
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
