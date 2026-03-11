import React, { useState, useEffect, useRef } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { useUser } from '../../store/UserContext';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, ChevronDown, ExternalLink, Upload, Loader2 } from 'lucide-react';

// En desarrollo Vite hace proxy de /api y /uploads al backend (3001); usar '' para mismo origen
const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

interface DocsValue {
  cotizacion?: string;
  hojaTrabajo?: string;
  levantamiento?: string;
}

function parseDocsValue(value: string | undefined): DocsValue {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return {
      cotizacion: parsed.cotizacion ?? '',
      hojaTrabajo: parsed.hojaTrabajo ?? '',
      levantamiento: parsed.levantamiento ?? '',
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

export const DocsCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const { currentUser } = useUser();
  const isTaller = currentUser?.role === 'TALLER';

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const parsed = parseDocsValue(value?.value);
  const [cotizacion, setCotizacion] = useState(parsed.cotizacion ?? '');
  const [hojaTrabajo, setHojaTrabajo] = useState(parsed.hojaTrabajo ?? '');
  const [levantamiento, setLevantamiento] = useState(parsed.levantamiento ?? '');
  const [uploading, setUploading] = useState<'cotizacion' | 'hoja' | 'levantamiento' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const cotizacionFileRef = useRef<HTMLInputElement>(null);
  const hojaFileRef = useRef<HTMLInputElement>(null);
  const levantamientoFileRef = useRef<HTMLInputElement>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const hasAny = !!(parsed.cotizacion?.trim() || parsed.hojaTrabajo?.trim() || parsed.levantamiento?.trim());
  const hasHoja = !!parsed.hojaTrabajo?.trim();

  useEffect(() => {
    if (editOpen) {
      setCotizacion(parsed.cotizacion ?? '');
      setHojaTrabajo(parsed.hojaTrabajo ?? '');
      setLevantamiento(parsed.levantamiento ?? '');
    }
  }, [editOpen, parsed.cotizacion, parsed.hojaTrabajo, parsed.levantamiento]);

  const save = () => {
    setEditOpen(false);
    const payload = JSON.stringify({
      cotizacion: cotizacion.trim() || undefined,
      hojaTrabajo: hojaTrabajo.trim() || undefined,
      levantamiento: levantamiento.trim() || undefined,
    });
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
  };

  const openUrl = (url: string) => {
    const href = url.startsWith('/') ? API_BASE + url : url.startsWith('http') ? url : 'https://' + url;
    setViewerUrl(href);
  };

  const openEditDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setUploadError(null);
    setTimeout(() => setEditOpen(true), 0);
  };

  const handleUpload = async (field: 'cotizacion' | 'hoja' | 'levantamiento', file: File) => {
    setUploadError(null);
    setUploading(field);
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
        data = { error: res.status === 404 ? 'Servidor no disponible. ¿Está corriendo el backend en el puerto 3001?' : `Error del servidor (${res.status})` };
      }
      if (!res.ok) {
        throw new Error(data.error || `Error al subir (${res.status})`);
      }
      if (field === 'cotizacion') setCotizacion(data.url ?? '');
      else if (field === 'hoja') setHojaTrabajo(data.url ?? '');
      else setLevantamiento(data.url ?? '');
      if (cotizacionFileRef.current && field === 'cotizacion') cotizacionFileRef.current.value = '';
      if (hojaFileRef.current && field === 'hoja') hojaFileRef.current.value = '';
      if (levantamientoFileRef.current && field === 'levantamiento') levantamientoFileRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
      const isNetwork = msg === 'Failed to fetch' || msg.includes('NetworkError');
      setUploadError(isNetwork ? 'No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 3001).' : msg);
    } finally {
      setUploading(null);
    }
  };

  const isUploadUrl = (url: string) => url.trim().startsWith('/uploads/');
  const previewUrl = (url: string) => (url.trim().startsWith('/') ? API_BASE + url : url);
  const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf');

  return (
    <>
      {/* Popover sin modal evita que el foco quede atrapado y que el cierre sea errático */}
      <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors text-left"
            onPointerDown={e => e.stopPropagation()}
          >
            <FileText size={16} className="text-[#4285f4] shrink-0" />
            <span className="text-[13px] text-monday-text truncate flex-1">
              {isTaller
                ? (hasHoja ? 'Hoja de trabajo' : 'Sin hoja de trabajo')
                : hasAny
                  ? 'Cotización / Hoja de trabajo / Levantamiento'
                  : 'Sin documentos'}
            </span>
            <ChevronDown size={14} className="text-monday-subtext shrink-0" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border w-56 p-2 fade-in"
            sideOffset={5}
            align="start"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[11px] font-semibold text-monday-subtext mb-2 px-1 uppercase tracking-wider">
              {isTaller ? 'Hoja de trabajo' : 'Documentos'}
            </div>
            {!isTaller && parsed.cotizacion?.trim() && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  openUrl(parsed.cotizacion!);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-left text-[13px] text-monday-text"
              >
                <FileText size={14} />
                Cotización
                <ExternalLink size={12} className="ml-auto text-monday-subtext" />
              </button>
            )}
            {parsed.hojaTrabajo?.trim() && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  openUrl(parsed.hojaTrabajo!);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-left text-[13px] text-monday-text"
              >
                <FileText size={14} />
                Hoja de trabajo
                <ExternalLink size={12} className="ml-auto text-monday-subtext" />
              </button>
            )}
            {!isTaller && parsed.levantamiento?.trim() && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  openUrl(parsed.levantamiento!);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-left text-[13px] text-monday-text"
              >
                <FileText size={14} />
                Levantamiento
                <ExternalLink size={12} className="ml-auto text-monday-subtext" />
              </button>
            )}
            {!parsed.hojaTrabajo?.trim() && !isTaller && !parsed.cotizacion?.trim() && !parsed.levantamiento?.trim() && (
              <p className="text-[12px] text-monday-subtext px-2 py-1">Sin documentos. Agrega desde el botón de abajo.</p>
            )}
            {isTaller && !parsed.hojaTrabajo?.trim() && (
              <p className="text-[12px] text-monday-subtext px-2 py-1">Sin hoja de trabajo.</p>
            )}
            {!isTaller && (
              <button
                type="button"
                onClick={openEditDialog}
                className="w-full mt-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[12px] text-monday-blue font-medium"
              >
                {hasAny ? 'Editar documentos' : 'Agregar documentos'}
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Dialog en portal (body) evita recorte por overflow de la tabla y problemas de z-index */}
      <Dialog.Root open={editOpen} onOpenChange={setEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200] fade-in" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-4 w-[360px] max-w-[90vw] z-[201] zoom-in"
          >
            <Dialog.Title className="text-[14px] font-semibold text-monday-text mb-3">
              Documentos (JPG o PDF)
            </Dialog.Title>

            {/* Cotización */}
            <label className="block text-[12px] text-monday-subtext mb-1">Cotización</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                ref={cotizacionFileRef}
                type="file"
                accept="image/jpeg,image/jpg,application/pdf"
                className="hidden"
                id="docs-cotizacion-file"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload('cotizacion', f);
                }}
              />
              <label
                htmlFor="docs-cotizacion-file"
                className="inline-flex items-center gap-1.5 text-[12px] text-monday-blue font-medium cursor-pointer hover:underline"
              >
                {uploading === 'cotizacion' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Subir archivo JPG/PDF
              </label>
            </div>
            {cotizacion.trim() && isUploadUrl(cotizacion) && !isPdf(cotizacion) && (
              <div className="mb-3 rounded-lg overflow-hidden border border-monday-border bg-monday-hover/30">
                <img src={previewUrl(cotizacion)} alt="Vista previa cotización" className="max-h-24 w-full object-contain" />
              </div>
            )}

            {/* Hoja de trabajo */}
            <label className="block text-[12px] text-monday-subtext mb-1">Hoja de trabajo</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                ref={hojaFileRef}
                type="file"
                accept="image/jpeg,image/jpg,application/pdf"
                className="hidden"
                id="docs-hoja-file"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload('hoja', f);
                }}
              />
              <label
                htmlFor="docs-hoja-file"
                className="inline-flex items-center gap-1.5 text-[12px] text-monday-blue font-medium cursor-pointer hover:underline"
              >
                {uploading === 'hoja' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Subir archivo JPG/PDF
              </label>
            </div>
            {hojaTrabajo.trim() && isUploadUrl(hojaTrabajo) && !isPdf(hojaTrabajo) && (
              <div className="mb-3 rounded-lg overflow-hidden border border-monday-border bg-monday-hover/30">
                <img src={previewUrl(hojaTrabajo)} alt="Vista previa hoja de trabajo" className="max-h-24 w-full object-contain" />
              </div>
            )}

            {/* Levantamiento */}
            <label className="block text-[12px] text-monday-subtext mb-1">Levantamiento</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                ref={levantamientoFileRef}
                type="file"
                accept="image/jpeg,image/jpg,application/pdf"
                className="hidden"
                id="docs-levantamiento-file"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload('levantamiento', f);
                }}
              />
              <label
                htmlFor="docs-levantamiento-file"
                className="inline-flex items-center gap-1.5 text-[12px] text-monday-blue font-medium cursor-pointer hover:underline"
              >
                {uploading === 'levantamiento' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Subir archivo JPG/PDF
              </label>
            </div>
            {levantamiento.trim() && isUploadUrl(levantamiento) && !isPdf(levantamiento) && (
              <div className="mb-3 rounded-lg overflow-hidden border border-monday-border bg-monday-hover/30">
                <img src={previewUrl(levantamiento)} alt="Vista previa levantamiento" className="max-h-24 w-full object-contain" />
              </div>
            )}

            {uploadError && (
              <p className="text-[12px] text-red-600 mb-2" role="alert">{uploadError}</p>
            )}
            <div className="flex justify-end gap-2">
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
                className="px-3 py-1.5 text-[13px] font-medium text-white bg-monday-blue rounded-lg"
              >
                Guardar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!viewerUrl} onOpenChange={open => { if (!open) setViewerUrl(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[210] fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border w-[80vw] h-[80vh] max-w-[1200px] z-[211] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-monday-border">
              <span className="text-[13px] font-medium text-monday-text">Vista de documento</span>
              <button
                type="button"
                onClick={() => setViewerUrl(null)}
                className="text-monday-subtext hover:text-monday-text text-[13px]"
              >
                Cerrar
              </button>
            </div>
            {viewerUrl && (
              <iframe
                src={viewerUrl}
                title="Vista de documento"
                className="w-full h-full"
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
