import React, { useRef, useState, useEffect } from 'react';
import { Board, Item } from '../../types';
import { useUser } from '../../store/UserContext';

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
  const { users } = useUser();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const looksTechnical = (value: string) => {
    const v = value.trim();
    if (!v) return false;
    if (uuidRegex.test(v)) return true;
    if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) return true;
    return false;
  };
  const safeDisplayValue = (item: Item, columnId: string, type: string) => {
    const raw = item.columnValues.find((cv) => cv.columnId === columnId)?.value?.trim() ?? '';
    if (!raw) return null;
    if (type === 'person') {
      try {
        const parsed = JSON.parse(raw);
        const ids = Array.isArray(parsed) ? parsed : [raw];
        const names = ids
          .map((id: string) => users.find((u) => u.id === id)?.name || users.find((u) => u.id === id)?.username)
          .filter(Boolean) as string[];
        return names.length ? names.join(', ') : 'Asignado';
      } catch {
        const name = users.find((u) => u.id === raw)?.name || users.find((u) => u.id === raw)?.username;
        return name || 'Asignado';
      }
    }
    if (type === 'date') {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (type === 'file' || type === 'docs' || type === 'excel' || type === 'billing_docs') return 'Documento vinculado';
    if (looksTechnical(raw)) return null;
    return raw.replace(/^"|"$/g, '');
  };
  const getContrastText = (hexColor: string) => {
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return '#ffffff';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.62 ? '#111827' : '#ffffff';
  };

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
            style={{ background: `linear-gradient(135deg, ${statusCol.color}, ${statusCol.color}D9)` }}
          >
            <div className="text-sm font-medium px-3 sm:px-4 py-2 rounded-t-md min-h-[44px] flex items-center justify-between" style={{ color: getContrastText(statusCol.color) }}>
              <span>{statusCol.label} / {statusCol.items.length}</span>
              <span className="text-[11px] rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
                {Math.round((statusCol.items.length / Math.max(1, board.groups.reduce((acc, g) => acc + g.items.length, 0))) * 100)}%
              </span>
            </div>
            {isMobile && (
              <div className="h-1 flex justify-center bg-white/20">
                <div className={`w-8 rounded-full transition-colors ${activeColumnIndex === idx ? 'bg-white' : 'bg-white/40'}`} />
              </div>
            )}
          </div>

          {/* Card List Container */}
          <div className="bg-monday-bg/70 flex-1 min-h-0 p-2 rounded-b-md border border-monday-border flex flex-col gap-2 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch">
            {statusCol.items.map(item => (
              <div 
                key={item.id} 
                onClick={() => onRowClick(item)}
                className="p-4 rounded-xl shadow-sm border border-monday-border cursor-pointer hover:shadow-md hover:border-monday-blue/40 transition group bg-[var(--monday-surface)]"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="font-semibold text-monday-text text-sm line-clamp-2">{item.name}</div>
                  <span className="h-2.5 w-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: statusCol.color }} />
                </div>
                {/* Render column previews slightly faded */}
                <div className="flex flex-col gap-2">
                  {board.columns.filter((c) => c.type !== 'status').map((col) => {
                     const val = safeDisplayValue(item, col.id, col.type);
                     if (!val) return null;
                     return (
                       <div key={col.id} className="flex items-center text-xs gap-2">
                         <span className="text-monday-subtext w-24 truncate">{col.title}</span>
                         <span className="text-monday-text truncate flex-1 font-medium">{val}</span>
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
