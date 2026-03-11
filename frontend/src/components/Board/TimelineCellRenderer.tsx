import React, { useState, useEffect } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { Clock } from 'lucide-react';

interface TimelineValue {
  start?: string;
  end?: string;
}

function parseTimelineValue(value: string | undefined): TimelineValue {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return {
      start: parsed.start ?? '',
      end: parsed.end ?? '',
    };
  } catch {
    return {};
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const TimelineCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const [editing, setEditing] = useState(false);
  const parsed = parseTimelineValue(value?.value);
  const [start, setStart] = useState(toInputValue(parsed.start));
  const [end, setEnd] = useState(toInputValue(parsed.end));

  useEffect(() => {
    if (editing) {
      setStart(toInputValue(parsed.start));
      setEnd(toInputValue(parsed.end));
    }
  }, [editing, parsed.start, parsed.end]);

  const save = () => {
    setEditing(false);
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    const payload = JSON.stringify({
      start: startDate && !isNaN(startDate.getTime()) ? startDate.toISOString() : undefined,
      end: endDate && !isNaN(endDate.getTime()) ? endDate.toISOString() : undefined,
    });
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
  };

  const displayStart = formatDate(parsed.start);
  const displayEnd = formatDate(parsed.end);
  const label = displayStart
    ? displayEnd && displayEnd !== displayStart
      ? `${displayStart} – ${displayEnd}`
      : displayStart
    : '— —';

  if (editing) {
    return (
      <div className="w-full h-full min-h-[38px] flex items-center gap-2 px-2" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <label className="text-[10px] text-monday-subtext">Inicio</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full text-[12px] border border-monday-blue rounded px-1 py-0.5 outline-none"
          />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <label className="text-[10px] text-monday-subtext">Fin</label>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full text-[12px] border border-monday-blue rounded px-1 py-0.5 outline-none"
          />
        </div>
        <button type="button" onClick={save} className="text-[11px] text-monday-blue font-medium shrink-0 self-end">OK</button>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full min-h-[38px] flex items-center justify-center px-2 cursor-pointer hover:bg-monday-hover transition-colors"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
    >
      <div className="w-full max-w-full flex items-center gap-1.5">
        <Clock size={14} className="text-monday-subtext shrink-0" />
        <span className="text-[12px] text-monday-text truncate" title={label}>
          {label}
        </span>
      </div>
    </div>
  );
};
