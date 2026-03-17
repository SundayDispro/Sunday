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

  const getLeftPercent = (d: Date) => {
    const t = d.getTime();
    const range = maxDate.getTime() - minDate.getTime();
    if (range <= 0) return 0;
    return ((t - minDate.getTime()) / range) * 100;
  };

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
      <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0">
        <div className="mb-4">
          <h3 className="text-[13px] font-semibold text-monday-text">Timeline por &quot;{dateColumn.title}&quot;</h3>
          <p className="text-[12px] text-monday-subtext mt-0.5">
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
              className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm flex items-center justify-between gap-3 min-h-[48px] touch-manipulation active:bg-monday-hover/30"
            >
              <span className="font-medium text-monday-text text-[14px] truncate flex-1 min-w-0">{item.name}</span>
              <span className="text-[12px] text-monday-subtext shrink-0">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0">
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-monday-text">Timeline por &quot;{dateColumn.title}&quot;</h3>
        <p className="text-[12px] text-monday-subtext mt-0.5">
          {itemsWithDate.length} elemento(s) · {minDate.toLocaleDateString()} – {maxDate.toLocaleDateString()}
        </p>
      </div>
      <div className="relative border border-monday-border rounded-xl overflow-hidden bg-monday-hover/20 min-h-[120px]">
        <div className="absolute inset-0 flex" style={{ paddingLeft: '4%', paddingRight: '4%' }}>
          {itemsWithDate.map(({ item, group, date, dateStr }) => (
            <div
              key={item.id}
              className="absolute top-4 h-10 flex items-center gap-2 px-2 rounded-md bg-monday-blue/90 text-white shadow-monday-sm hover:bg-monday-blue min-w-[140px] max-w-[220px]"
              style={{
                left: `${getLeftPercent(date)}%`,
                transform: 'translateX(-50%)',
                zIndex: 1,
              }}
            >
              <button
                type="button"
                className="truncate text-left flex-1 text-[12px] font-medium hover:underline"
                onClick={() => onRowClick(item)}
              >
                {item.name}
              </button>
              <span className="text-[11px] opacity-90 shrink-0" title={dateStr}>
                {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
        <div className="h-16 border-t border-monday-border flex items-end justify-between px-2 text-[10px] text-monday-subtext">
          <span>{minDate.toLocaleDateString()}</span>
          <span>{maxDate.toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};
