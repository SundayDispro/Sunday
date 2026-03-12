import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { Calendar } from 'lucide-react';
import { useUser } from '../../store/UserContext';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

function formatDisplayDate(value: string | undefined): string {
  if (!value?.trim()) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  // Usar UTC para que la fecha elegida (ej. 12) se muestre igual; si no, en zonas al oeste de UTC se vería el día anterior
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('es', { month: 'short', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export const DateCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const { currentUser } = useUser();
  const isTaller = currentUser?.role === 'TALLER';
  const [open, setOpen] = useState(false);
  const raw = value?.value ?? '';
  const display = formatDisplayDate(raw);
  // Aceptar tanto YYYY-MM-DD como ISO; para el input siempre usar los primeros 10 caracteres
  const inputValue = raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: '' });
      setOpen(false);
      return;
    }
    // Guardar como YYYY-MM-DD para evitar desfase por zona horaria (medianoche UTC → día anterior en otras zonas)
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: v });
    setOpen(false);
  };

  // Para TALLER la fecha es solo lectura (sin editor ni popover)
  if (isTaller) {
    return (
      <div className="w-full h-full min-h-[42px] flex items-center justify-center px-2">
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
      </div>
    );
  }

  return (
    <div
      className="w-full h-full min-h-[42px] flex items-center justify-center cursor-pointer hover:bg-monday-hover transition-colors px-2"
      onClick={e => {
        e.stopPropagation();
        setOpen(true);
      }}
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
