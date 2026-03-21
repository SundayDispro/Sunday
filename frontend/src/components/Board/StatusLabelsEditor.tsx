import React, { useState, useEffect } from 'react';
import { BoardColumn, StatusOption } from '../../types';
import * as Dialog from '@radix-ui/react-dialog';
import { socket } from '../../store/socket';
import { Plus, Trash2 } from 'lucide-react';
import { GROUP_PALETTE } from './GroupColorPicker';

interface Props {
  column: BoardColumn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StatusLabelsEditor: React.FC<Props> = ({ column, open, onOpenChange }) => {
  const [options, setOptions] = useState<StatusOption[]>([]);

  useEffect(() => {
    if (open && column.settings) {
      try {
        const parsed = JSON.parse(column.settings);
        const opts = Array.isArray(parsed?.options) ? parsed.options : [];
        setOptions(opts.length ? opts : [{ id: 'default', label: '', color: '#c4c4c4' }]);
      } catch {
        setOptions([{ id: 'default', label: '', color: '#c4c4c4' }]);
      }
    }
  }, [open, column.settings]);

  const updateOption = (index: number, patch: Partial<StatusOption>) => {
    setOptions(prev => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const addOption = () => {
    const id = 'opt_' + Date.now();
    setOptions(prev => [...prev, { id, label: 'Nueva', color: GROUP_PALETTE[0] ?? '#00c875' }]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 1) return;
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const payload = JSON.stringify({ options });
    socket.emit('update_column_settings', { columnId: column.id, settings: payload });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200] fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-4 w-[360px] max-w-[90vw] z-[201] zoom-in"
          onClick={e => e.stopPropagation()}
        >
          <Dialog.Title className="text-[14px] font-semibold text-monday-text mb-3">
            Etiquetas de {column.title}
          </Dialog.Title>
          <Dialog.Description className="text-[12px] text-monday-subtext mb-3">
            Añade, edita o elimina etiquetas. Puedes cambiar el nombre y el color.
          </Dialog.Description>
          <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto custom-scrollbar mb-4">
            {options.map((opt, index) => (
              <div
                key={opt.id}
                className="flex items-center gap-2 p-2 rounded-lg border border-monday-border bg-monday-hover/30"
              >
                <input
                  type="color"
                  value={opt.color}
                  onChange={e => updateOption(index, { color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-monday-border shrink-0"
                  title="Color"
                />
                <input
                  type="text"
                  value={opt.label}
                  onChange={e => updateOption(index, { label: e.target.value })}
                  placeholder="Nombre de la etiqueta"
                  className="flex-1 min-w-0 text-[13px] text-monday-text border border-monday-border rounded px-2 py-1.5 outline-none focus:border-monday-blue"
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={options.length <= 1}
                  className="p-1.5 rounded-lg text-monday-subtext hover:text-monday-red hover:bg-red-50 disabled:opacity-40 disabled:pointer-events-none"
                  title="Eliminar etiqueta"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-[13px] text-monday-blue font-medium hover:underline"
            >
              <Plus size={14} />
              Agregar etiqueta
            </button>
            <span className="text-[11px] text-monday-subtext">Colores rápidos:</span>
            <div className="flex flex-wrap gap-1">
              {GROUP_PALETTE.map(color => (
                <button
                  key={color}
                  type="button"
                  className="w-5 h-5 rounded border border-monday-border hover:ring-2 hover:ring-monday-blue/50 transition-shadow shrink-0"
                  style={{ backgroundColor: color }}
                  title={color}
                  onClick={() => setOptions(prev => [...prev, { id: 'opt_' + Date.now(), label: 'Nueva', color }])}
                />
              ))}
            </div>
          </div>
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
              onClick={handleSave}
              className="px-3 py-1.5 text-[13px] font-medium text-white bg-monday-blue rounded-lg"
            >
              Guardar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
