import React, { useState, useEffect } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, ChevronDown, ExternalLink } from 'lucide-react';

interface DocsValue {
  cotizacion?: string;
  hojaTrabajo?: string;
}

function parseDocsValue(value: string | undefined): DocsValue {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return {
      cotizacion: parsed.cotizacion ?? '',
      hojaTrabajo: parsed.hojaTrabajo ?? '',
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
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const parsed = parseDocsValue(value?.value);
  const [cotizacion, setCotizacion] = useState(parsed.cotizacion ?? '');
  const [hojaTrabajo, setHojaTrabajo] = useState(parsed.hojaTrabajo ?? '');

  const hasAny = !!(parsed.cotizacion?.trim() || parsed.hojaTrabajo?.trim());

  useEffect(() => {
    if (editOpen) {
      setCotizacion(parsed.cotizacion ?? '');
      setHojaTrabajo(parsed.hojaTrabajo ?? '');
    }
  }, [editOpen, parsed.cotizacion, parsed.hojaTrabajo]);

  const save = () => {
    setEditOpen(false);
    const payload = JSON.stringify({
      cotizacion: cotizacion.trim() || undefined,
      hojaTrabajo: hojaTrabajo.trim() || undefined,
    });
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
  };

  const openUrl = (url: string) => {
    const href = url.startsWith('http') ? url : 'https://' + url;
    window.open(href, '_blank', 'noopener');
  };

  const openEditDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    // Defer opening dialog so Popover can close first (avoids focus/pointer conflicts)
    setTimeout(() => setEditOpen(true), 0);
  };

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
              {hasAny ? 'Cotización / Hoja de trabajo' : 'Sin enlaces'}
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
              Documentos
            </div>
            {parsed.cotizacion?.trim() && (
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
            {!parsed.cotizacion?.trim() && !parsed.hojaTrabajo?.trim() && (
              <p className="text-[12px] text-monday-subtext px-2 py-1">Sin enlaces. Agrega desde el botón de abajo.</p>
            )}
            <button
              type="button"
              onClick={openEditDialog}
              className="w-full mt-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[12px] text-monday-blue font-medium"
            >
              {hasAny ? 'Editar enlaces' : 'Agregar enlaces'}
            </button>
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
              Enlaces de documentación
            </Dialog.Title>
            <label className="block text-[12px] text-monday-subtext mb-1">Cotización (URL)</label>
            <input
              type="url"
              value={cotizacion}
              onChange={e => setCotizacion(e.target.value)}
              placeholder="https://..."
              className="w-full text-[13px] border border-monday-border rounded-lg px-2 py-1.5 mb-3 outline-none focus:ring-2 focus:ring-monday-blue"
            />
            <label className="block text-[12px] text-monday-subtext mb-1">Hoja de trabajo (URL)</label>
            <input
              type="url"
              value={hojaTrabajo}
              onChange={e => setHojaTrabajo(e.target.value)}
              placeholder="https://..."
              className="w-full text-[13px] border border-monday-border rounded-lg px-2 py-1.5 mb-4 outline-none focus:ring-2 focus:ring-monday-blue"
            />
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
    </>
  );
};
