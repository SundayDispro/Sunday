import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import * as Popover from '@radix-ui/react-popover';
import { Paperclip, ExternalLink, Pencil } from 'lucide-react';
import { useUser } from '../../store/UserContext';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const FileCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const { currentUser } = useUser();
  const isTaller = currentUser?.role === 'TALLER';

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.value ?? '');

  const url = (value?.value ?? '').trim();

  const save = () => {
    setEditing(false);
    setOpen(false);
    const v = draft.trim();
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: v });
  };

  const openInNewTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    const href = url.startsWith('http') ? url : 'https://' + url;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  // Para TALLER: solo lectura. Puede abrir el enlace de Drive pero no editarlo.
  if (isTaller) {
    return (
      <div
        className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors"
        onClick={e => {
          if (!url) {
            e.stopPropagation();
            return;
          }
          openInNewTab(e);
        }}
      >
        <Paperclip size={16} className="text-monday-subtext shrink-0" />
        {url ? (
          <span className="text-[13px] text-monday-text truncate flex-1">Enlace Drive</span>
        ) : (
          <span className="text-[13px] text-monday-subtext truncate flex-1">Sin enlace</span>
        )}
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <div
          className="w-full h-full min-h-[38px] flex items-center gap-2 px-2 cursor-pointer hover:bg-monday-hover transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <Paperclip size={16} className="text-monday-subtext shrink-0" />
          {url ? (
            <span className="text-[13px] text-monday-text truncate flex-1">Enlace Drive</span>
          ) : (
            <span className="text-[13px] text-monday-subtext truncate flex-1">Pegar enlace</span>
          )}
        </div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border w-72 p-3 fade-in"
          sideOffset={5}
          align="start"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-[11px] font-semibold text-monday-subtext mb-2 px-1 uppercase tracking-wider">
            Archivos / Drive
          </div>
          {editing ? (
            <div className="space-y-2">
              <input
                autoFocus
                type="url"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full px-2.5 py-1.5 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  className="px-2.5 py-1.5 text-[13px] font-medium text-white bg-monday-blue rounded-lg"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(url);
                  }}
                  className="px-2.5 py-1.5 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {url ? (
                <button
                  type="button"
                  onClick={openInNewTab}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-left text-[13px] text-monday-text"
                >
                  <ExternalLink size={14} className="text-monday-blue shrink-0" />
                  Abrir Drive
                </button>
              ) : (
                <p className="text-[12px] text-monday-subtext px-1 py-1">
                  Sin enlace. Agrega una URL de Google Drive.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setDraft(url);
                }}
                className="w-full mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[12px] text-monday-blue font-medium"
              >
                <Pencil size={14} />
                {url ? 'Editar enlace' : 'Pegar enlace'}
              </button>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
