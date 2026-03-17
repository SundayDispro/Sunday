import React from 'react';
import type { fabric } from 'fabric';

interface LayersPanelProps {
  objects: fabric.Object[];
  activeObject: fabric.Object | null;
  onSelectObject: (obj: fabric.Object | null) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  objects,
  activeObject,
  onSelectObject,
}) => {
  return (
    <div className="bg-monday-sidebarPanel/90 border border-monday-border rounded-2xl p-2 w-56 text-xs text-monday-text flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="font-semibold text-[11px] uppercase tracking-wide text-monday-subtext">
          Capas
        </span>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar space-y-0.5">
        {objects.length === 0 && (
          <p className="text-[11px] text-monday-subtext px-1 py-1">No hay objetos en el lienzo.</p>
        )}
        {[...objects].map((obj, index) => {
          const label = obj.type ?? 'objeto';
          const isActive = obj === activeObject;
          return (
            <button
              key={obj.id ?? index}
              type="button"
              onClick={() => onSelectObject(obj)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left ${
                isActive ? 'bg-monday-blue text-white' : 'hover:bg-monday-hover text-monday-text'
              }`}
            >
              <span className="truncate text-[11px]">
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

