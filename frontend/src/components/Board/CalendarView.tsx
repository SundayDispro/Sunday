import React, { useMemo, useState } from 'react';
import { Board, Item, BoardColumn } from '../../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function parseDateValue(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function getItemDates(item: Item, dateColumn: BoardColumn | undefined, timelineColumn: BoardColumn | undefined): { start: Date; end?: Date } | null {
  if (dateColumn) {
    const cv = item.columnValues.find(v => v.columnId === dateColumn.id);
    const d = parseDateValue(cv?.value);
    if (d) return { start: d };
  }
  if (timelineColumn) {
    const cv = item.columnValues.find(v => v.columnId === timelineColumn.id);
    if (!cv?.value) return null;
    try {
      const parsed = JSON.parse(cv.value);
      const start = parsed.start ? new Date(parsed.start) : null;
      const end = parsed.end ? new Date(parsed.end) : null;
      if (start && !isNaN(start.getTime())) return { start, end: end && !isNaN(end.getTime()) ? end : undefined };
    } catch {
      const d = parseDateValue(cv.value);
      if (d) return { start: d };
    }
  }
  return null;
}

function getProductionLabel(item: Item, col: BoardColumn | undefined): string {
  if (!col) return '';
  const cv = item.columnValues.find(v => v.columnId === col.id);
  if (!cv?.value) return '';
  try {
    const parsed = JSON.parse(cv.value);
    if (parsed.start) {
      const d = new Date(parsed.start);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    }
  } catch {
    const d = new Date(cv.value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }
  return '';
}

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  /** Vista taller: usa columnas "Fecha de colocación" y "Tiempo de producción" */
  isTallerView?: boolean;
}

const COLOCACION_TITLE = 'Fecha de colocación';
const PRODUCCION_TITLE = 'Tiempo de producción';

export const CalendarView: React.FC<Props> = ({ board, onRowClick, isTallerView }) => {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const dateColumn = useMemo(() => {
    if (isTallerView) {
      const byTitle = board.columns.find(c => c.title === COLOCACION_TITLE && (c.type === 'date' || c.type === 'timeline'));
      if (byTitle) return byTitle;
    }
    return board.columns.find(c => c.type === 'date');
  }, [board.columns, isTallerView]);

  const timelineColumn = useMemo(() => {
    if (isTallerView) {
      const colocacion = board.columns.find(c => c.title === COLOCACION_TITLE && c.type === 'timeline');
      const produccion = board.columns.find(c => c.title === PRODUCCION_TITLE && (c.type === 'date' || c.type === 'timeline'));
      if (colocacion) return colocacion;
      if (produccion) return produccion;
    }
    return board.columns.find(c => c.type === 'timeline');
  }, [board.columns, isTallerView]);

  const productionColumn = useMemo(() => {
    if (!isTallerView) return undefined;
    return board.columns.find(c => c.title === PRODUCCION_TITLE && (c.type === 'date' || c.type === 'timeline'));
  }, [board.columns, isTallerView]);

  const itemsWithDates = useMemo(() => {
    const result: { item: Item; start: Date; end?: Date; groupName: string; productionLabel?: string }[] = [];
    board.groups.forEach(group => {
      group.items.forEach(item => {
        const dates = getItemDates(item, dateColumn, timelineColumn);
        if (dates) {
          result.push({
            item,
            start: dates.start,
            end: dates.end,
            groupName: group.name,
            productionLabel: isTallerView && productionColumn ? getProductionLabel(item, productionColumn) : undefined,
          });
        }
      });
    });
    return result;
  }, [board, dateColumn, timelineColumn, isTallerView, productionColumn]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const itemsByDay = useMemo(() => {
    const map: Record<string, { item: Item; groupName: string; productionLabel?: string }[]> = {};
    itemsWithDates.forEach(({ item, start, end, groupName, productionLabel }) => {
      const startKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
      const endDate = end || start;
      const cur = new Date(start);
      while (cur <= endDate) {
        const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
        if (!map[key]) map[key] = [];
        map[key].push({ item, groupName, productionLabel });
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [itemsWithDates]);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-monday-border shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-[16px] font-semibold text-monday-text min-w-[180px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 gap-px bg-monday-border rounded-lg overflow-hidden border border-monday-border">
          {WEEKDAYS.map(day => (
            <div
              key={day}
              className="bg-monday-hover/50 px-2 py-1.5 text-[11px] font-semibold text-monday-subtext uppercase"
            >
              {day}
            </div>
          ))}
          {days.map((day, idx) => {
            const key = day === null ? `e-${idx}` : `${year}-${month}-${day}`;
            const dayItems = day !== null ? itemsByDay[key] ?? [] : [];
            return (
              <div
                key={key}
                className="min-h-[80px] bg-white p-1.5 flex flex-col gap-1"
              >
                {day !== null && (
                  <>
                    <span className="text-[12px] text-monday-subtext font-medium">{day}</span>
                    {dayItems.map(({ item, productionLabel }) => (
                      <button
                        key={item.id}
                        onClick={() => onRowClick(item)}
                        className="text-left px-2 py-1 rounded bg-monday-blue/10 hover:bg-monday-blue/20 text-monday-text text-[12px] truncate border-l-2 border-monday-blue w-full"
                        title={productionLabel ? `Producción: ${productionLabel}` : undefined}
                      >
                        <span className="block truncate">{item.name}</span>
                        {productionLabel && (
                          <span className="block text-[10px] text-monday-subtext truncate">Prod: {productionLabel}</span>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
