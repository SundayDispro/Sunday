import React, { useState, useRef, useEffect } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { useUser } from '../../store/UserContext';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, ChevronDown, ExternalLink, Upload, Loader2, Trash2, FilePenLine } from 'lucide-react';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

interface BillingDocsValue {
  url?: string;
  label?: string;
}

function parseBillingDocsValue(value: string | undefined): BillingDocsValue {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return {
      url: parsed.url ?? '',
      label: parsed.label ?? '',
    };
  } catch {
    return {};
  }
}

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const BillingDocsCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const { currentUser } = useUser();
  const isAdminOrVentas = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const parsed = parseBillingDocsValue(value?.value);
  const [url, setUrl] = useState(parsed.url ?? '');
  const [label, setLabel] = useState(parsed.label ?? 'Documento de facturación');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const hasDoc = !!parsed.url?.trim();

  useEffect(() => {
    if (editOpen) {
      setUrl(parsed.url ?? '');
      setLabel(parsed.label ?? 'Documento de facturación');
    }
  }, [editOpen, parsed.url, parsed.label]);

  const save = () => {
    setEditOpen(false);
    const payload = JSON.stringify({
      url: url.trim() || undefined,
      label: label.trim() || undefined,
    });
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
  };

  const openDocs = () => {
    const detail = { type: 'text' as const, boardId: column.boardId, itemId: item.id };
    window.dispatchEvent(new CustomEvent('sunday:create-doc-from-board', { detail }));
  };

  const openUrl = (target: string) => {
    const href = target.startsWith('/')
      ? API_BASE + target
      : target.startsWith('http')
      ? target
      : 'https://' + target;
    window.open(href, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const handleUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const text = await res.text();
      let data: { error?: string; url?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {
          error:
            res.status === 404
              ? 'Servidor no disponible. ¿Está corriendo el backend en el puerto 3001?'
              : `Error del servidor (${res.status})`,
        };
      }
      if (!res.ok) {
        throw new Error(data.error || `Error al subir (${res.status})`);
      }
      setUrl(data.url ?? '');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir el archivo';
      const isNetwork = msg === 'Failed to fetch' || msg.includes('NetworkError');
      setUploadError(
        isNetwork
          ? 'No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 3001).'
          : msg
      );
    } finally {
      setUploading(false);
    }
  };

  const clearDoc = () => {
    setUrl('');
    const payload = JSON.stringify({
      url: undefined,
      label: label.trim() || undefined,
    });
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors text-left"
            onPointerDown={e => e.stopPropagation()}
          >
            <FileText size={16} className="text-[#f97316] shrink-0" />
            <span className="text-[13px] text-monday-text truncate flex-1">
              {hasDoc ? label || 'Documento de facturación' : 'Sin documentos de facturación'}
            </span>
            <ChevronDown size={14} className="text-monday-subtext shrink-0" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border w-64 p-2 fade-in"
            sideOffset={5}
            align="start"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[11px] font-semibold text-monday-subtext mb-2 px-1 uppercase tracking-wider">
              Documentos de facturación
            </div>
            {hasDoc ? (
              <div className="flex items-center gap-1 mb-2">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    openUrl(parsed.url!);
                  }}
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-left text-[13px] text-monday-text"
                >
                  <FileText size={14} />
                  <span className="truncate">{label || 'Documento de facturación'}</span>
                  <ExternalLink size={12} className="ml-auto text-monday-subtext" />
                </button>
                {isAdminOrVentas && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      clearDoc();
                    }}
                    className="p-1.5 rounded-lg text-monday-subtext hover:text-monday-red hover:bg-red-50"
                    title="Eliminar archivo"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-monday-subtext px-2 py-1">
                Sin documentos. Agrega desde el botón de abajo.
              </p>
            )}
            {isAdminOrVentas && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  setUploadError(null);
                  setTimeout(() => setEditOpen(true), 0);
                }}
                className="w-full mt-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[12px] text-monday-blue font-medium"
              >
                {hasDoc ? 'Editar documento' : 'Agregar documento'}
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Dialog.Root open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200] fade-in" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-4 w-[360px] max-w-[90vw] z-[201] zoom-in"
          >
            <Dialog.Title className="text-[14px] font-semibold text-monday-text mb-3">
              Documentos de facturación (JPG o PDF)
            </Dialog.Title>

            <label className="block text-[12px] text-monday-subtext mb-1">Etiqueta</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full px-3 py-2 mb-3 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text placeholder:text-monday-subtext outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
              placeholder="Ej. Factura 001"
            />

            <label className="block text-[12px] text-monday-subtext mb-1">Archivo</label>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={openDocs}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#4285f4] text-white text-[12px] shadow-sm hover:bg-[#3367d6]"
                title="Crear documento en Google Docs"
              >
                <FilePenLine size={14} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/jpg,application/pdf"
                className="hidden"
                id={`billing-docs-file-${item.id}-${column.id}`}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <label
                htmlFor={`billing-docs-file-${item.id}-${column.id}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-monday-blue font-medium cursor-pointer hover:underline"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              </label>
            </div>

            {uploadError && (
              <p className="text-[12px] text-red-600 mb-2" role="alert">
                {uploadError}
              </p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg"
                >
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={save}
                className="px-3 py-1.5 text-[13px] font-medium text-white bg-monday-blue rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={uploading}
              >
                Guardar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

