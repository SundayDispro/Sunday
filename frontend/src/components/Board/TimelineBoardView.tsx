import React, { useMemo } from 'react';
import { Board, Item, Group, BoardColumn } from '../../types';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  isMobile?: boolean;
  isLandscapeShort?: boolean;
}

interface ItemWithDate {
  item: Item;
  group: Group;
  date: Date;
  dateStr: string;
  columnTitle: string;
}

export const TimelineBoardView: React.FC<Props> = ({ board, onRowClick, isMobile = false }) => {
  const { itemsWithDate, dateColumn } = useMemo(() => {
    const dateCol = board.columns.find(c => c.type === 'date') as BoardColumn | undefined;
    if (!dateCol) return { itemsWithDate: [] as ItemWithDate[], dateColumn: null as BoardColumn | null };

    const list: ItemWithDate[] = [];
    board.groups.forEach(group => {
      group.items.forEach(item => {
        const cv = item.columnValues.find(v => v.columnId === dateCol.id);
        if (!cv?.value?.trim()) return;
        const d = new Date(cv.value);
        if (isNaN(d.getTime())) return;
        list.push({
          item,
          group,
          date: d,
          dateStr: cv.value,
          columnTitle: dateCol.title,
        });
      });
    });
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { itemsWithDate: list, dateColumn: dateCol };
  }, [board]);

  const { minDate, maxDate } = useMemo(() => {
    if (itemsWithDate.length === 0) return { minDate: new Date(), maxDate: new Date() };
    const min = new Date(Math.min(...itemsWithDate.map(i => i.date.getTime())));
    const max = new Date(Math.max(...itemsWithDate.map(i => i.date.getTime())));
    min.setHours(0, 0, 0, 0);
    max.setHours(23, 59, 59, 999);
    return { minDate: min, maxDate: max };
  }, [itemsWithDate]);

  const totalDays = useMemo(() => {
    const diff = maxDate.getTime() - minDate.getTime();
    return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }, [minDate, maxDate]);

  const weeks = useMemo(() => {
    if (itemsWithDate.length === 0) return [] as { label: string; count: number }[];
    const map = new Map<string, number>();
    itemsWithDate.forEach(({ date }) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + mondayOffset);
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, count]) => ({
        label: new Date(k).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
        count,
      }));
  }, [itemsWithDate]);

  if (!dateColumn) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-monday-subtext text-[13px]">
        <p>Añade una columna de tipo Fecha (por ejemplo Vencimiento) para ver la vista Timeline.</p>
      </div>
    );
  }

  if (itemsWithDate.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-monday-subtext text-[13px]">
        <p>No hay elementos con fecha en la columna &quot;{dateColumn.title}&quot;.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0 bg-gradient-to-b from-monday-bg to-monday-hover/20">
        <div className="mb-4 bg-[var(--monday-surface)] rounded-xl border border-monday-border p-4">
          <h3 className="text-[13px] font-semibold text-monday-text">Timeline · {dateColumn.title}</h3>
          <p className="text-[12px] text-monday-subtext mt-1">
            {itemsWithDate.length} elemento(s) · {minDate.toLocaleDateString()} – {maxDate.toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {itemsWithDate.map(({ item, group, date }) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(item)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(item); } }}
              className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm flex items-center justify-between gap-3 min-h-[48px] touch-manipulation active:bg-monday-hover/30 border-l-4"
              style={{ borderLeftColor: group.color || '#579bfc' }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-monday-text text-[14px] truncate">{item.name}</p>
                <p className="text-[11px] text-monday-subtext truncate">{group.name}</p>
              </div>
              <span className="text-[12px] text-monday-subtext shrink-0">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0 bg-gradient-to-b from-monday-bg to-monday-hover/20">
      <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] uppercase tracking-wide text-monday-subtext">Periodo</p>
          <p className="text-[13px] font-semibold text-monday-text mt-1">{minDate.toLocaleDateString()} - {maxDate.toLocaleDateString()}</p>
        </div>
        <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] uppercase tracking-wide text-monday-subtext">Elementos</p>
          <p className="text-[26px] leading-none font-bold text-monday-text mt-1">{itemsWithDate.length}</p>
        </div>
        <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] uppercase tracking-wide text-monday-subtext">Duración</p>
          <p className="text-[26px] leading-none font-bold text-monday-text mt-1">{totalDays} días</p>
        </div>
      </div>

      <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm mb-4">
        <h3 className="text-[13px] font-semibold text-monday-text mb-3">Carga semanal</h3>
        <div className="flex items-end gap-2 h-24">
          {weeks.map((w) => (
            <div key={w.label} className="flex-1 min-w-0">
              <div className="w-full rounded-t-md bg-gradient-to-t from-monday-blue to-cyan-400" style={{ height: `${Math.max(8, (w.count / Math.max(1, Math.max(...weeks.map((x) => x.count)))) * 100)}%` }} />
              <p className="text-[10px] text-monday-subtext mt-1 truncate">{w.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-5 shadow-monday-sm">
        <h3 className="text-[13px] font-semibold text-monday-text mb-4">Línea de tiempo detallada</h3>
        <div className="relative">
          <div className="absolute top-0 bottom-0 left-4 w-px bg-monday-border" />
          <div className="space-y-3">
            {itemsWithDate.map(({ item, group, date }) => (
              <div key={item.id} className="relative pl-10">
                <span className="absolute left-[11px] top-5 h-2.5 w-2.5 rounded-full border-2 border-[var(--monday-surface)]" style={{ backgroundColor: group.color || '#579bfc' }} />
                <button
                  type="button"
                  onClick={() => onRowClick(item)}
                  className="w-full text-left rounded-xl border border-monday-border p-3 transition bg-[var(--monday-surface)] hover:bg-monday-hover/35"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-monday-text truncate">{item.name}</p>
                    <span className="text-[11px] text-monday-subtext shrink-0">
                      {date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-monday-subtext mt-1">{group.name}</p>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
