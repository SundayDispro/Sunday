import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { FileSpreadsheet, ExternalLink } from 'lucide-react';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const ExcelCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const [editing, setEditing] = useState(false);
  const url = (value?.value ?? '').trim();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(false);
    const input = (e.target as HTMLFormElement).querySelector('input');
    const v = input?.value?.trim() ?? '';
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: v });
  };

  const openExcel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    const href = url.startsWith('http') ? url : 'https://' + url;
    window.open(href, '_blank', 'noopener');
  };

  if (editing) {
    return (
      <form onSubmit={save} className="w-full h-full min-h-[38px] flex items-center gap-1 px-2" onClick={e => e.stopPropagation()}>
        <input
          type="url"
          autoFocus
          defaultValue={url}
          placeholder="https://... (enlace al Excel)"
          className="flex-1 min-w-0 text-[12px] border border-monday-blue rounded px-1.5 py-0.5 outline-none"
        />
        <button type="submit" className="text-[11px] text-monday-blue font-medium shrink-0">Guardar</button>
      </form>
    );
  }

  return (
    <div
      className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors"
      onClick={url ? openExcel : (e) => { e.stopPropagation(); setEditing(true); }}
    >
      <FileSpreadsheet size={16} className="text-[#217346] shrink-0" />
      {url ? (
        <>
          <span className="text-[13px] text-monday-blue truncate flex-1">Abrir Excel</span>
          <ExternalLink size={12} className="text-monday-subtext shrink-0" />
        </>
      ) : (
        <span className="text-[12px] text-monday-subtext">Agregar enlace</span>
      )}
    </div>
  );
};
