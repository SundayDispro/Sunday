import React from 'react';
import type { fabric } from 'fabric';

interface PropertiesPanelProps {
  activeObject: fabric.Object | null;
  onChange: (updater: (obj: fabric.Object) => void) => void;
}

const FONT_FAMILIES = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana'];

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ activeObject, onChange }) => {
  if (!activeObject) {
    return (
      <div className="bg-monday-sidebarPanel/90 border border-monday-border rounded-2xl p-2 w-64 text-xs text-monday-text">
        <p className="text-[11px] text-monday-subtext px-1 py-1">Selecciona un objeto para editar.</p>
      </div>
    );
  }

  const obj = activeObject as fabric.Object & { get: (key: string) => unknown };
  const fill = (obj.get('fill') ?? '#000000') as string;
  const stroke = (obj.get('stroke') ?? '#000000') as string;
  const strokeWidth = (obj.get('strokeWidth') ?? 1) as number;
  const opacity = (obj.get('opacity') ?? 1) as number;
  const type = (obj.type ?? '') as string;
  const isText = type === 'i-text' || type === 'text' || type === 'textbox';
  const fontSize = isText ? ((obj as fabric.IText).get('fontSize') ?? 24) as number : 0;
  const fontFamily = isText ? ((obj as fabric.IText).get('fontFamily') ?? 'Arial') as string : '';

  return (
    <div className="bg-monday-sidebarPanel/90 border border-monday-border rounded-2xl p-3 w-64 text-xs text-monday-text flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[11px] uppercase tracking-wide text-monday-subtext">
          Propiedades
        </span>
        <span className="text-[11px] text-monday-subtext">
          {(type || 'objeto').toString()}
        </span>
      </div>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-monday-subtext">Relleno</span>
        <input
          type="color"
          value={fill}
          onChange={(e) =>
            onChange((o) => {
              (o as fabric.Object & { set: (k: string, v: unknown) => void }).set('fill', e.target.value);
            })
          }
          className="w-16 h-6 rounded border border-monday-border bg-transparent cursor-pointer"
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-monday-subtext">Borde</span>
        <input
          type="color"
          value={stroke}
          onChange={(e) =>
            onChange((o) => {
              (o as fabric.Object & { set: (k: string, v: unknown) => void }).set('stroke', e.target.value);
            })
          }
          className="w-16 h-6 rounded border border-monday-border bg-transparent cursor-pointer"
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
            onChange((o) => {
              const v = Number(e.target.value) || 0;
              (o as fabric.Object & { set: (k: string, v: unknown) => void }).set('strokeWidth', v);
            })
          }
          className="w-20 px-1 py-0.5 rounded border border-monday-border bg-monday-bg text-[11px]"
        />
      </label>

      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-monday-subtext">Opacidad</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) =>
            onChange((o) => {
              const v = Number(e.target.value);
              (o as fabric.Object & { set: (k: string, v: unknown) => void }).set('opacity', v);
            })
          }
          className="w-20"
        />
        <span className="w-8 text-right">{Math.round(opacity * 100)}%</span>
      </label>

      {isText && (
        <>
          <label className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-monday-subtext">Tamaño</span>
            <input
              type="number"
              min={8}
              max={200}
              value={fontSize}
              onChange={(e) =>
                onChange((o) => {
                  const v = Number(e.target.value) || 24;
                  (o as fabric.IText).set('fontSize', v);
                })
              }
              className="w-16 px-1 py-0.5 rounded border border-monday-border bg-monday-bg text-[11px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-monday-subtext">Fuente</span>
            <select
              value={fontFamily}
              onChange={(e) =>
                onChange((o) => {
                  (o as fabric.IText).set('fontFamily', e.target.value);
                })
              }
              className="w-full px-2 py-1 rounded border border-monday-border bg-monday-bg text-[11px]"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
};
