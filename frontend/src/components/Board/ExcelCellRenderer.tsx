import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { FileSpreadsheet, Upload, Loader2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as Dialog from '@radix-ui/react-dialog';
import { useToast } from '../Toast';

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

function parseExcelValue(raw: string | undefined): { url?: string; docId?: string } {
  const s = (raw ?? '').trim();
  if (!s) return {};
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as { docId?: string; url?: string };
      return { docId: parsed.docId, url: parsed.url };
    } catch {
      return { url: s };
    }
  }
  return { url: s };
}

export const ExcelCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const { url, docId } = parseExcelValue(value?.value);

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
      const data: { error?: string; url?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        const backendMsg =
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : res.status === 404
            ? 'Servidor no disponible. ¿Está corriendo el backend en el puerto 3001?'
            : `Error al subir archivo (${res.status}).`;
        throw new Error(backendMsg);
      }
      socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: data.url });
    } catch (err) {
      console.error('Error uploading excel', err);
      const msg = err instanceof Error ? err.message : 'No se pudo subir el archivo de Excel.';
      const isNetwork =
        msg === 'Failed to fetch' ||
        msg.includes('NetworkError') ||
        msg.toLowerCase().includes('failed to fetch');
      toast(
        isNetwork
          ? 'No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 3001).'
          : msg,
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  const fileName = url ? url.split('/').pop() || 'Archivo' : '';

  const openCreateSheetFromBoard = (e: React.MouseEvent) => {
    e.stopPropagation();
    const boardId = column.boardId ?? '';
    if (!boardId) return;
    window.dispatchEvent(
      new CustomEvent('sunday:create-doc-from-board', {
        detail: { type: 'sheet', boardId, itemId: item.id, columnId: column.id },
      })
    );
  };

  const openLinkedSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!docId) return;
    window.dispatchEvent(new CustomEvent('sunday:open-doc', { detail: { docId } }));
  };

  return (
    <>
      <div
        className="w-full h-full min-h-[38px] flex flex-col items-center justify-center gap-1 px-2 py-1"
      >
        <div
          className="w-full flex items-center justify-center gap-1 rounded min-h-[28px]"
        >
          {docId ? (
            <button
              type="button"
              onClick={openLinkedSheet}
              className="flex-1 flex items-center justify-center gap-1 cursor-pointer hover:bg-monday-hover transition-colors rounded py-1 text-monday-blue font-medium text-[12px]"
              title="Abrir hoja vinculada"
            >
              <FileSpreadsheet size={16} className="text-[#217346] shrink-0" />
              Abrir hoja
            </button>
          ) : (
            <div
              className="flex items-center justify-center gap-1 cursor-pointer hover:bg-monday-hover transition-colors rounded flex-1 min-h-[28px]"
              onClick={url ? openExcelInSheetView : (e) => { e.stopPropagation(); }}
              title={url ? `${fileName} — Clic para ver en hoja` : 'Subir archivo Excel'}
            >
              <FileSpreadsheet size={16} className="text-[#217346] shrink-0" />
            </div>
          )}
          <label
            className="flex items-center text-monday-blue cursor-pointer shrink-0 p-0.5 rounded hover:bg-monday-hover"
            onClick={e => e.stopPropagation()}
            title="Subir archivo"
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
          </label>
        </div>
        {!docId && (
          <button
            type="button"
            onClick={openCreateSheetFromBoard}
            className="text-[11px] text-monday-blue hover:underline font-medium w-full text-center py-0.5 rounded hover:bg-monday-hover transition-colors"
            title="Crear documento de Excel (hoja) y abrir en Documentos"
          >
            Crear hoja
          </button>
        )}
        {docId && (
          <button
            type="button"
            onClick={openCreateSheetFromBoard}
            className="text-[10px] text-monday-subtext hover:underline w-full text-center py-0.5 rounded hover:bg-monday-hover transition-colors"
            title="Crear otra hoja"
          >
            Crear otra hoja
          </button>
        )}
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
