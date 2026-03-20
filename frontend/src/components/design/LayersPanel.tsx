import React from 'react';
import { Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import type * as fabric from 'fabric';

interface LayersPanelProps {
  objects: fabric.Object[];
  activeObject: fabric.Object | null;
  onSelectObject: (obj: fabric.Object | null) => void;
  onDelete?: (obj: fabric.Object) => void;
  onDuplicate?: (obj: fabric.Object) => void;
  onBringFront?: (obj: fabric.Object) => void;
  onSendBack?: (obj: fabric.Object) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  objects,
  activeObject,
  onSelectObject,
  onDelete,
  onDuplicate,
  onBringFront,
  onSendBack,
}) => {
  const list = [...objects].reverse();

  return (
    <div className="bg-monday-sidebarPanel/90 border border-monday-border rounded-2xl p-2 w-56 text-xs text-monday-text flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="font-semibold text-[11px] uppercase tracking-wide text-monday-subtext">
          Capas
        </span>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar space-y-0.5 min-h-0">
        {list.length === 0 && (
          <p className="text-[11px] text-monday-subtext px-1 py-1">No hay objetos en el lienzo.</p>
        )}
        {list.map((obj, index) => {
          const label = (obj.type ?? 'objeto').toString();
          const isActive = obj === activeObject;
          const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
          return (
            <div
              key={(obj as unknown as { name?: string }).name ?? `${obj.type ?? 'obj'}-${index}`}
              className={`group flex items-center gap-1 rounded-lg ${
                isActive ? 'bg-monday-blue text-white' : 'hover:bg-monday-hover text-monday-text'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectObject(obj)}
                className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left"
              >
                <span className="truncate text-[11px]">{displayLabel}</span>
              </button>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {onBringFront && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBringFront(obj);
                    }}
                    className="p-1 rounded hover:bg-white/20"
                    title="Traer al frente"
                  >
                    <ArrowUp size={12} />
                  </button>
                )}
                {onSendBack && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendBack(obj);
                    }}
                    className="p-1 rounded hover:bg-white/20"
                    title="Enviar al fondo"
                  >
                    <ArrowDown size={12} />
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(obj);
                    }}
                    className="p-1 rounded hover:bg-white/20"
                    title="Duplicar"
                  >
                    <Copy size={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(obj);
                    }}
                    className="p-1 rounded hover:bg-red-500/80"
                    title="Eliminar"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
