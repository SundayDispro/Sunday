import React from 'react';
import type { fabric } from 'fabric';

interface PropertiesPanelProps {
  activeObject: fabric.Object | null;
  onChange: (updater: (obj: fabric.Object) => void) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ activeObject, onChange }) => {
  if (!activeObject) {
    return (
      <div className="bg-monday-sidebarPanel/90 border border-monday-border rounded-2xl p-2 w-64 text-xs text-monday-text">
        <p className="text-[11px] text-monday-subtext px-1 py-1">Selecciona un objeto para editar.</p>
      </div>
    );
  }

  const fill = (activeObject as any).get('fill') ?? '#000000';
  const stroke = (activeObject as any).get('stroke') ?? '#000000';
  const strokeWidth = (activeObject as any).get('strokeWidth') ?? 1;

  return (
    <div className="bg-monday-sidebarPanel/90 border border-monday-border rounded-2xl p-3 w-64 text-xs text-monday-text flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[11px] uppercase tracking-wide text-monday-subtext">
          Propiedades
        </span>
        <span className="text-[11px] text-monday-subtext">
          {(activeObject.type ?? 'objeto').toString()}
        </span>
      </div>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-monday-subtext">Relleno</span>
        <input
          type="color"
          value={fill}
          onChange={(e) =>
            onChange((obj) => {
              (obj as any).set('fill', e.target.value);
            })
          }
          className="w-16 h-6 rounded border border-monday-border bg-transparent"
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-monday-subtext">Borde</span>
        <input
          type="color"
          value={stroke}
          onChange={(e) =>
            onChange((obj) => {
              (obj as any).set('stroke', e.target.value);
            })
          }
          className="w-16 h-6 rounded border border-monday-border bg-transparent"
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-monday-subtext">Grosor</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={strokeWidth}
          onChange={(e) =>
            onChange((obj) => {
              const v = Number(e.target.value) || 0;
              (obj as any).set('strokeWidth', v);
            })
          }
          className="w-20 px-1 py-0.5 rounded border border-monday-border bg-monday-bg text-[11px]"
        />
      </label>
    </div>
  );
};

