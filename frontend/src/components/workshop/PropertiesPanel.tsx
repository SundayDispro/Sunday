// ============================================================================
// Sunday 3D Workshop — Properties Inspector Panel
// Edit transform, material, and geometric parameters (mm)
// ============================================================================

import React from 'react';
import { useWorkshop } from './WorkshopContext';

export function PropertiesPanel() {
  const { activeObject, scene, dispatch } = useWorkshop();

  if (!activeObject) {
    const allObjects = scene.getAllObjects();
    return (
      <div className="w-80 border-l border-monday-border bg-monday-surface p-4 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto">
        <div className="font-semibold text-monday-text text-[12px] uppercase tracking-wider mb-3">
          Resumen de Escena
        </div>
        <div className="bg-monday-bg p-3 rounded-monday space-y-2 text-[12px]">
          <div className="flex justify-between">
            <span className="text-monday-subtext">Total de objetos:</span>
            <span className="font-medium">{allObjects.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-monday-subtext">Unidades de trabajo:</span>
            <span className="font-medium">Milímetros (mm)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-monday-subtext">Moneda activa:</span>
            <span className="font-medium">MXN ($)</span>
          </div>
        </div>
        <div className="mt-6 text-center text-monday-subtext text-[12px] italic">
          Selecciona un objeto en el visor o en la jerarquía para editar sus propiedades y dimensiones.
        </div>
      </div>
    );
  }

  const pos = activeObject.getPosition();
  const rot = activeObject.getRotation();
  const scale = activeObject.getScale();
  const dim = activeObject.getDimensions();

  const handlePositionChange = (axis: 'x' | 'y' | 'z', val: number) => {
    activeObject.setPosition({ [axis]: val });
    dispatch({ type: 'SET_DIRTY', payload: true });
  };

  const handleRotationChange = (axis: 'x' | 'y' | 'z', deg: number) => {
    const rad = (deg * Math.PI) / 180;
    activeObject.setRotation({ [axis]: rad });
    dispatch({ type: 'SET_DIRTY', payload: true });
  };

  const handleScaleChange = (axis: 'x' | 'y' | 'z', val: number) => {
    activeObject.setScale({ [axis]: Math.max(0.01, val) });
    dispatch({ type: 'SET_DIRTY', payload: true });
  };

  const handleColorChange = (hex: string) => {
    activeObject.updateMaterial({ color: hex });
    dispatch({ type: 'SET_DIRTY', payload: true });
  };

  const handleOpacityChange = (opacity: number) => {
    activeObject.updateMaterial({ opacity });
    dispatch({ type: 'SET_DIRTY', payload: true });
  };

  const handleWireframeToggle = (wireframe: boolean) => {
    activeObject.updateMaterial({ wireframe });
    dispatch({ type: 'SET_DIRTY', payload: true });
  };

  return (
    <div className="w-80 border-l border-monday-border bg-monday-surface p-3.5 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <input
            type="text"
            value={activeObject.name}
            onChange={(e) => {
              activeObject.name = e.target.value;
              dispatch({ type: 'SET_DIRTY', payload: true });
            }}
            className="font-semibold text-[14px] text-monday-text bg-transparent border-b border-transparent hover:border-monday-border focus:border-monday-blue outline-none px-1"
          />
          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-50 text-monday-blue border border-blue-200">
            {activeObject.type}
          </span>
        </div>
      </div>

      {/* Dimensions (Read-only computed mm) */}
      <div className="bg-monday-bg p-2.5 rounded-monday border border-monday-border">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-1.5">
          Dimensiones (mm)
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-monday-surface p-1.5 rounded border border-monday-border">
            <span className="text-[10px] text-monday-subtext block">Ancho (X)</span>
            <span className="font-semibold text-[12px]">{dim.width.toFixed(1)}</span>
          </div>
          <div className="bg-monday-surface p-1.5 rounded border border-monday-border">
            <span className="text-[10px] text-monday-subtext block">Alto (Y)</span>
            <span className="font-semibold text-[12px]">{dim.height.toFixed(1)}</span>
          </div>
          <div className="bg-monday-surface p-1.5 rounded border border-monday-border">
            <span className="text-[10px] text-monday-subtext block">Prof (Z)</span>
            <span className="font-semibold text-[12px]">{dim.depth.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Position */}
      <div>
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-1.5">
          Posición (mm)
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center rounded border border-monday-border bg-monday-surface overflow-hidden">
              <span className="bg-monday-bg px-2 py-1 text-[11px] font-bold text-monday-subtext uppercase border-r border-monday-border">
                {axis}
              </span>
              <input
                type="number"
                step="1"
                value={Math.round(pos[axis] * 10) / 10}
                onChange={(e) => handlePositionChange(axis, parseFloat(e.target.value) || 0)}
                className="w-full px-1.5 py-1 text-[12px] text-right outline-none bg-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rotation */}
      <div>
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-1.5">
          Rotación (grados)
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center rounded border border-monday-border bg-monday-surface overflow-hidden">
              <span className="bg-monday-bg px-2 py-1 text-[11px] font-bold text-monday-subtext uppercase border-r border-monday-border">
                {axis}
              </span>
              <input
                type="number"
                step="5"
                value={Math.round((rot[axis] * 180) / Math.PI)}
                onChange={(e) => handleRotationChange(axis, parseFloat(e.target.value) || 0)}
                className="w-full px-1.5 py-1 text-[12px] text-right outline-none bg-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Scale */}
      <div>
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-1.5">
          Escala
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center rounded border border-monday-border bg-monday-surface overflow-hidden">
              <span className="bg-monday-bg px-2 py-1 text-[11px] font-bold text-monday-subtext uppercase border-r border-monday-border">
                {axis}
              </span>
              <input
                type="number"
                step="0.1"
                value={Math.round(scale[axis] * 100) / 100}
                onChange={(e) => handleScaleChange(axis, parseFloat(e.target.value) || 1)}
                className="w-full px-1.5 py-1 text-[12px] text-right outline-none bg-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Material & Appearance */}
      <div className="border-t border-monday-border pt-3">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
          Material y Color
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-monday-subtext">Color:</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={activeObject.materialData.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-monday-border p-0"
              />
              <span className="text-[11px] font-mono text-monday-text">
                {activeObject.materialData.color}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[12px] text-monday-subtext">Opacidad:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={activeObject.materialData.opacity}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
              className="w-32 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[12px] text-monday-subtext">Modo Malla (Wireframe):</span>
            <input
              type="checkbox"
              checked={activeObject.materialData.wireframe}
              onChange={(e) => handleWireframeToggle(e.target.checked)}
              className="rounded text-monday-blue cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
