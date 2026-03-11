import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { FileSpreadsheet, ExternalLink, Upload, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const ExcelCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const [uploading, setUploading] = useState(false);
  const url = (value?.value ?? '').trim();

  const openExcel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    const href = url.startsWith('/') ? API_BASE + url : (url.startsWith('http') ? url : 'https://' + url);
    window.open(href, '_blank', 'noopener');
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || `Error al subir archivo (${res.status})`);
      }
      socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: data.url });
    } catch (err) {
      console.error('Error uploading excel', err);
      alert('No se pudo subir el archivo de Excel.');
    } finally {
      setUploading(false);
    }
  };

  const fileName = url ? url.split('/').pop() || 'Archivo' : '';

  return (
    <div
      className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors"
      onClick={url ? openExcel : (e) => { e.stopPropagation(); }}
    >
      <FileSpreadsheet size={16} className="text-[#217346] shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col">
        {url ? (
          <>
            <span className="text-[13px] text-monday-blue truncate">{fileName}</span>
            <span className="text-[11px] text-monday-subtext truncate">Clic para abrir</span>
          </>
        ) : (
          <span className="text-[12px] text-monday-subtext">Sin archivo de Excel</span>
        )}
      </div>
      <label
        className="flex items-center gap-1 text-[11px] text-monday-blue cursor-pointer shrink-0 px-1.5 py-0.5 rounded hover:bg-monday-hover"
        onClick={e => e.stopPropagation()}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        Subir
      </label>
      {url && <ExternalLink size={12} className="text-monday-subtext shrink-0" />}
    </div>
  );
};
