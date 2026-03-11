import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { Calendar } from 'lucide-react';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

function formatDisplayDate(value: string | undefined): string {
  if (!value?.trim()) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const day = d.getDate();
  const month = d.toLocaleDateString('es', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export const DateCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const [open, setOpen] = useState(false);
  const raw = value?.value ?? '';
  const display = formatDisplayDate(raw);
  const inputValue = raw ? raw.slice(0, 10) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: '' });
      setOpen(false);
      return;
    }
    const date = new Date(v);
    if (!isNaN(date.getTime())) {
      socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: date.toISOString() });
      setOpen(false);
    }
  };

  return (
    <div
      className="w-full h-full min-h-[42px] flex items-center justify-center cursor-pointer hover:bg-monday-hover transition-colors px-2"
      onClick={e => { e.stopPropagation(); setOpen(true); }}
    >
      {open ? (
        <input
          type="date"
          autoFocus
          value={inputValue}
          onChange={handleChange}
          onBlur={() => setOpen(false)}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-[140px] text-[13px] text-monday-text border border-monday-blue rounded outline-none px-1.5 py-0.5"
        />
      ) : (
        <span className="text-[13px] text-monday-text flex items-center gap-1.5">
          {display ? (
            <>
              <Calendar size={14} className="text-monday-subtext shrink-0" />
              {display}
            </>
          ) : (
            <span className="text-monday-subtext text-[12px]">— —</span>
          )}
        </span>
      )}
    </div>
  );
};
