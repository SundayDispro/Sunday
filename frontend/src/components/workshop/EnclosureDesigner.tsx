// ============================================================================
// Sunday 3D Workshop — Enclosure Parametric Designer
// Creates custom electronic/mechanical enclosures with walls, lids & cutouts
// ============================================================================

import React, { useState } from 'react';
import { Box, Layers, CheckCircle } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { calculateEnclosure, createEnclosureGeometry } from '../../workshop/parametric/EnclosureGenerator';
import { SceneObject } from '../../workshop/engine/SceneObject';
import { createBoxGeometry } from '../../workshop/engine/Primitives';

export function EnclosureDesigner() {
  const { scene, dispatch } = useWorkshop();

  const [length, setLength] = useState(120); // mm (X)
  const [width, setWidth] = useState(80);    // mm (Y)
  const [height, setHeight] = useState(40);  // mm (Z)
  const [wallThickness, setWallThickness] = useState(2.4);
  const [floorThickness, setFloorThickness] = useState(2.4);
  const [lidEnabled, setLidEnabled] = useState(true);
  const [lidThickness, setLidThickness] = useState(2.4);

  const parts = calculateEnclosure({
    length,
    width,
    height,
    wallThickness,
    floorThickness,
    openFaces: ['top'],
    lidEnabled,
    lidThickness,
    holes: [],
    cableOpenings: [],
  });

  const handleGenerateInScene = () => {
    const group = scene.createPrimitive('group', `Carcasa ${length}x${width}x${height}mm`);

    // Base body geometry
    const bodyGeom = createEnclosureGeometry({
      length,
      width,
      height,
      wallThickness,
      floorThickness,
      openFaces: ['top'],
      lidEnabled,
      lidThickness,
      holes: [],
      cableOpenings: [],
    });

    const bodyObj = new SceneObject(
      {
        name: `Cuerpo Carcasa (${length}x${width}x${height}mm)`,
        type: 'box',
        position: { x: 0, y: height / 2, z: 0 },
        material: { color: '#333333', opacity: 1, wireframe: false },
        parentId: group.id,
      },
      bodyGeom
    );
    scene.addObject(bodyObj);
    group.childrenIds.push(bodyObj.id);

    // Lid geometry
    if (lidEnabled && parts.lid) {
      const lidGeom = createBoxGeometry(parts.lid.width, parts.lid.thickness, parts.lid.depth);
      const lidObj = new SceneObject(
        {
          name: `Tapa Superior (${parts.lid.width}x${parts.lid.depth}mm)`,
          type: 'box',
          position: { x: 0, y: height + parts.lid.thickness / 2 + 10, z: 0 }, // Raised slightly for exploded view
          material: { color: '#0073ea', opacity: 0.9, wireframe: false },
          parentId: group.id,
        },
        lidGeom
      );
      scene.addObject(lidObj);
      group.childrenIds.push(lidObj.id);
    }

    scene.select(group.id, false);
    dispatch({ type: 'SET_DIRTY', payload: true });
    alert(`¡Carcasa de ${length}x${width}x${height} mm generada en la escena 3D!`);
  };

  return (
    <div className="w-80 border-l border-monday-border bg-monday-surface p-4 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto space-y-4">
      <div className="flex items-center gap-2 border-b border-monday-border pb-2.5">
        <Box size={18} className="text-monday-blue" />
        <span className="font-semibold text-[13px] uppercase tracking-wider">
          Generador de Carcasas
        </span>
      </div>

      {/* Exterior Dimensions */}
      <div className="space-y-2.5 bg-monday-bg p-3 rounded-monday border border-monday-border">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
          Dimensiones Exteriores (mm)
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-monday-subtext">Largo (X):</span>
            <span className="font-semibold">{length} mm</span>
          </div>
          <input
            type="range"
            min="30"
            max="400"
            step="5"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-monday-subtext">Ancho (Y):</span>
            <span className="font-semibold">{width} mm</span>
          </div>
          <input
            type="range"
            min="30"
            max="400"
            step="5"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-monday-subtext">Altura (Z):</span>
            <span className="font-semibold">{height} mm</span>
          </div>
          <input
            type="range"
            min="15"
            max="250"
            step="5"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>
      </div>

      {/* Thickness & Lid */}
      <div className="space-y-2.5">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
          Espesores y Tapa
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-monday-subtext">Espesor de pared:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.2"
              min="1"
              max="10"
              value={wallThickness}
              onChange={(e) => setWallThickness(parseFloat(e.target.value) || 2)}
              className="w-16 px-1.5 py-0.5 border border-monday-border rounded bg-white text-right text-[12px]"
            />
            <span className="text-monday-subtext">mm</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-monday-subtext">Espesor del fondo:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.2"
              min="1"
              max="10"
              value={floorThickness}
              onChange={(e) => setFloorThickness(parseFloat(e.target.value) || 2)}
              className="w-16 px-1.5 py-0.5 border border-monday-border rounded bg-white text-right text-[12px]"
            />
            <span className="text-monday-subtext">mm</span>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-[12px] pt-1">
          <input
            type="checkbox"
            checked={lidEnabled}
            onChange={(e) => setLidEnabled(e.target.checked)}
            className="rounded text-monday-blue"
          />
          <span className="font-medium">Incluir Tapa Superior</span>
        </label>
      </div>

      {/* Internal Volume Summary */}
      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-monday space-y-1.5 text-[12px] text-monday-text">
        <div className="font-semibold text-emerald-700 flex items-center gap-1">
          <CheckCircle size={14} />
          <span>Cavidad Interior Útil</span>
        </div>
        <div>
          Espacio útil: <strong>{(length - 2 * wallThickness).toFixed(1)} x {(width - 2 * wallThickness).toFixed(1)} x {(height - floorThickness).toFixed(1)} mm</strong>
        </div>
        <div>
          Volumen útil: <strong>{(parts.interiorVolume / 1000).toFixed(1)} cm³</strong>
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerateInScene}
        className="w-full py-2 bg-monday-blue text-white rounded-monday font-medium hover:bg-blue-600 transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <Layers size={15} />
        <span>Generar Carcasa en 3D</span>
      </button>
    </div>
  );
}
