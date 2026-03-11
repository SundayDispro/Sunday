import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { FileSpreadsheet, ExternalLink, Upload, Loader2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as Dialog from '@radix-ui/react-dialog';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

function buildFullUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? `${API_BASE || ''}${path}` : `${API_BASE || ''}/${path}`;
}

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const ExcelCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const url = (value?.value ?? '').trim();

  const openExcelInSheetView = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    setSheetOpen(true);
    setSheetLoading(true);
    setSheetError(null);
    try {
      const fullUrl = buildFullUrl(url);
      const res = await fetch(fullUrl);
      if (!res.ok) throw new Error(`Error ${res.status} al cargar el archivo`);
      const ab = await res.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        setSheetData([]);
        return;
      }
      const ws = wb.Sheets[firstSheetName];
      const data: string[][] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
      setSheetData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading Excel', err);
      setSheetError(err instanceof Error ? err.message : 'No se pudo cargar el archivo.');
      setSheetData([]);
    } finally {
      setSheetLoading(false);
    }
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
    <>
      <div
        className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors"
        onClick={url ? openExcelInSheetView : (e) => { e.stopPropagation(); }}
      >
        <FileSpreadsheet size={16} className="text-[#217346] shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col">
          {url ? (
            <>
              <span className="text-[13px] text-monday-blue truncate">{fileName}</span>
              <span className="text-[11px] text-monday-subtext truncate">Clic para ver en hoja</span>
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

      <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border w-[90vw] max-w-4xl max-h-[85vh] flex flex-col z-[201]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-monday-border shrink-0">
              <h2 className="text-[16px] font-semibold text-monday-text truncate">
                {fileName || 'Hoja de cálculo'}
              </h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-monday-bg/30">
              {sheetLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-monday-blue" />
                </div>
              )}
              {sheetError && (
                <p className="text-red-600 text-[13px] py-4">{sheetError}</p>
              )}
              {!sheetLoading && !sheetError && sheetData.length > 0 && (
                <div className="overflow-auto rounded-lg border border-monday-border bg-white">
                  <table className="border-collapse text-left min-w-full">
                    <tbody>
                      {sheetData.map((row, r) => (
                        <tr key={r}>
                          {Array.isArray(row) ? row.map((cell, c) => (
                            <td key={c} className="border border-monday-border px-2 py-1.5 text-[13px] text-monday-text">
                              {cell != null ? String(cell) : ''}
                            </td>
                          )) : (
                            <td className="border border-monday-border px-2 py-1.5 text-[13px]">{String(row)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!sheetLoading && !sheetError && sheetData.length === 0 && (
                <p className="text-monday-subtext text-[13px] py-4">La hoja está vacía.</p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
