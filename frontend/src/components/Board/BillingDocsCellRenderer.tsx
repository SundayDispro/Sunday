import React, { useState, useRef, useEffect } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { useUser } from '../../store/UserContext';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, ChevronDown, ExternalLink, Upload, Loader2, Trash2, FilePenLine, Plus } from 'lucide-react';
import { apiFetch } from '../../api';
import { compressImage } from '../../utils/imageCompression';
import {
  parseBillingDocsEntries,
  serializeBillingDocsEntries,
  type BillingDocEntry,
} from '../../utils/billingDocsParse';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const parsedList = parseBillingDocsEntries(value?.value);
  const [docs, setDocs] = useState<BillingDocEntry[]>(parsedList);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDocs(parseBillingDocsEntries(value?.value));
  }, [value?.value]);

  useEffect(() => {
    if (editOpen && editingIndex !== null && docs[editingIndex]) {
      setDraftLabel(docs[editingIndex].label);
      setDraftUrl(docs[editingIndex].url);
    } else if (editOpen && editingIndex === null) {
      setDraftLabel('');
      setDraftUrl('');
    }
  }, [editOpen, editingIndex, docs]);

  const persist = (next: BillingDocEntry[]) => {
    const payload = serializeBillingDocsEntries(next);
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
    setDocs(next);
  };

  const addNewDoc = () => {
    setUploadError(null);
    setEditingIndex(null);
    setDraftLabel('');
    setDraftUrl('');
    setEditOpen(true);
  };

  const openEditAt = (index: number) => {
    setUploadError(null);
    setEditingIndex(index);
    setEditOpen(true);
  };

  const removeAt = (index: number) => {
    const next = docs.filter((_, i) => i !== index);
    persist(next);
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

  const openDocs = () => {
    const detail = { type: 'text' as const, boardId: column.boardId, itemId: item.id };
    window.dispatchEvent(new CustomEvent('sunday:create-doc-from-board', { detail }));
  };

  const handleUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    if (!/^image\/jpe?g$|^application\/pdf$/i.test(file.type)) {
      setUploadError('Tipo de archivo no permitido. Solo se aceptan JPG o PDF.');
      setUploading(false);
      return;
    }

    const fileToUpload = await compressImage(file);

    const formData = new FormData();
    formData.append('file', fileToUpload);
    try {
      const res = await apiFetch(`${API_BASE}/api/upload`, {
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
      setDraftUrl(data.url);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir el archivo';
      const isNetwork =
        msg === 'Failed to fetch' ||
        msg.includes('NetworkError') ||
        msg.toLowerCase().includes('failed to fetch');
      setUploadError(
        isNetwork
          ? 'No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 3001).'
          : msg
      );
    } finally {
      setUploading(false);
    }
  };

  const appendNewFromDialog = () => {
    const label = draftLabel.trim() || 'Documento de facturación';
    const url = draftUrl.trim();
    if (!url) {
      setUploadError('Sube un archivo o indica una URL.');
      return;
    }
    let next: BillingDocEntry[];
    if (editingIndex !== null && editingIndex >= 0 && editingIndex < docs.length) {
      next = docs.map((d, i) => (i === editingIndex ? { ...d, label, url } : d));
    } else {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `d-${Date.now()}`;
      next = [...docs, { id, url, label }];
    }
    persist(next);
    setEditOpen(false);
    setEditingIndex(null);
  };

  const hasAny = docs.length > 0;
  const summary =
    docs.length === 0
      ? 'Sin documentos de facturación'
      : docs.length === 1
      ? docs[0].label || 'Documento'
      : `${docs.length} documentos`;

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
            <span className="text-[13px] text-monday-text truncate flex-1">{summary}</span>
            <ChevronDown size={14} className="text-monday-subtext shrink-0" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border w-72 p-2 fade-in max-h-[min(320px,70vh)] overflow-y-auto"
            sideOffset={5}
            align="start"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[11px] font-semibold text-monday-subtext mb-2 px-1 uppercase tracking-wider">
              Documentos de facturación
            </div>
            {!hasAny ? (
              <p className="text-[12px] text-monday-subtext px-2 py-1">Sin documentos. Añade uno con el botón de abajo.</p>
            ) : (
              <ul className="space-y-1 mb-2">
                {docs.map((d, i) => (
                  <li key={d.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openUrl(d.url);
                      }}
                      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-left text-[13px] text-monday-text min-w-0"
                    >
                      <FileText size={14} className="shrink-0" />
                      <span className="truncate">{d.label || 'Documento'}</span>
                      <ExternalLink size={12} className="ml-auto text-monday-subtext shrink-0" />
                    </button>
                    {isAdminOrVentas && (
                      <>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg text-monday-subtext hover:text-monday-blue hover:bg-monday-hover"
                          title="Editar"
                          onClick={e => {
                            e.stopPropagation();
                            setOpen(false);
                            setTimeout(() => openEditAt(i), 0);
                          }}
                        >
                          <FilePenLine size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            removeAt(i);
                          }}
                          className="p-1.5 rounded-lg text-monday-subtext hover:text-monday-red hover:bg-red-50"
                          title="Quitar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isAdminOrVentas && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  setTimeout(() => addNewDoc(), 0);
                }}
                className="w-full mt-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg hover:bg-monday-hover text-[12px] text-monday-blue font-medium border border-dashed border-monday-border"
              >
                <Plus size={14} />
                Añadir documento
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Dialog.Root open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingIndex(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200] fade-in" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-4 w-[360px] max-w-[90vw] z-[201] zoom-in"
          >
            <Dialog.Title className="text-[14px] font-semibold text-monday-text mb-3">
              {editingIndex !== null ? 'Editar documento' : 'Añadir documento'} (JPG o PDF)
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Etiqueta y archivo o enlace para facturación.
            </Dialog.Description>

            <label className="block text-[12px] text-monday-subtext mb-1">Etiqueta</label>
            <input
              type="text"
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              className="w-full px-3 py-2 mb-3 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text placeholder:text-monday-subtext outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
              placeholder="Ej. Factura 001"
            />

            <label className="block text-[12px] text-monday-subtext mb-1">Archivo o enlace</label>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={openDocs}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#4285f4] text-white text-[12px] shadow-sm hover:bg-[#3367d6]"
                title="Crear documento"
              >
                <FilePenLine size={14} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/jpg,application/pdf"
                className="hidden"
                id={`billing-docs-file-${item.id}-${column.id}-${editingIndex ?? 'new'}`}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <label
                htmlFor={`billing-docs-file-${item.id}-${column.id}-${editingIndex ?? 'new'}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-monday-blue font-medium cursor-pointer hover:underline"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Subir
              </label>
            </div>
            <input
              type="url"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="O pega URL (/uploads/... o https://)"
              className="w-full px-3 py-2 mb-2 text-[13px] border border-monday-border rounded-lg"
            />

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
                onClick={appendNewFromDialog}
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
