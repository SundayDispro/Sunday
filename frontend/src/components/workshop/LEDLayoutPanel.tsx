// ============================================================================
// Sunday 3D Workshop — LED Layout & Electrical Calculation Panel
// Grid placement, circuit grouping, consumption and PSU sizing
// ============================================================================

import React, { useState } from 'react';
import { Zap, AlertTriangle, CheckCircle, Cpu } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { calculateLEDLayout } from '../../workshop/parametric/LEDLayout';
import { DEFAULT_LED_MODULES, DEFAULT_POWER_SUPPLIES } from '../../workshop/manufacturing/ComponentCatalog';
import { recommendPowerSupply } from '../../workshop/manufacturing/PowerSupplyCalc';
import { SceneObject } from '../../workshop/engine/SceneObject';
import { createBoxGeometry } from '../../workshop/engine/Primitives';

export function LEDLayoutPanel() {
  const { scene, dispatch } = useWorkshop();

  const [selectedModuleId, setSelectedModuleId] = useState(DEFAULT_LED_MODULES[0].id);
  const [areaWidth, setAreaWidth] = useState(600); // mm
  const [areaHeight, setAreaHeight] = useState(200); // mm
  const [spacingX, setSpacingX] = useState(60);     // mm
  const [spacingY, setSpacingY] = useState(60);     // mm
  const [minEdgeDistance, setMinEdgeDistance] = useState(25); // mm
  const [voltage, setVoltage] = useState(12);       // Volts

  const selectedModule = DEFAULT_LED_MODULES.find((m) => m.id === selectedModuleId) || DEFAULT_LED_MODULES[0];

  const layoutResult = calculateLEDLayout({
    areaWidth,
    areaHeight,
    moduleType: selectedModule,
    spacingX,
    spacingY,
    voltage,
    minEdgeDistance,
    mountingClearance: 2,
  });

  // Calculate PSU recommendation
  const psuRecommendation = recommendPowerSupply(
    {
      totalWatts: layoutResult.totalPower,
      totalAmps: layoutResult.totalCurrent,
      voltage,
    },
    DEFAULT_POWER_SUPPLIES,
    20 // 20% margin
  );

  const handlePlaceInScene = () => {
    if (layoutResult.modules.length === 0) return;

    const group = scene.createPrimitive('group', `Distribución LED (${layoutResult.totalCount} módulos)`);

    layoutResult.modules.forEach((mod, idx) => {
      const geom = createBoxGeometry(selectedModule.width, selectedModule.height, selectedModule.depth);
      const modObj = new SceneObject(
        {
          name: `Módulo LED ${idx + 1}`,
          type: 'box',
          position: mod.position,
          material: {
            color: '#ffcc00', // Yellow LED color
            opacity: 1,
            wireframe: false,
          },
          parentId: group.id,
        },
        geom
      );
      scene.addObject(modObj);
      group.childrenIds.push(modObj.id);
    });

    scene.select(group.id, false);
    dispatch({ type: 'SET_DIRTY', payload: true });
    alert(`¡${layoutResult.totalCount} módulos LED colocados en la escena 3D!`);
  };

  return (
    <div className="w-80 border-l border-monday-border bg-monday-surface p-4 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto space-y-4">
      <div className="flex items-center gap-2 border-b border-monday-border pb-2.5">
        <Zap size={18} className="text-amber-500" />
        <span className="font-semibold text-[13px] uppercase tracking-wider">
          Distribución LED y Consumo
        </span>
      </div>

      {/* Module Selection */}
      <div>
        <label className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider block mb-1">
          Módulo LED
        </label>
        <select
          value={selectedModuleId}
          onChange={(e) => setSelectedModuleId(e.target.value)}
          className="w-full px-2 py-1.5 rounded-monday border border-monday-border bg-monday-bg text-[12px] outline-none"
        >
          {DEFAULT_LED_MODULES.map((mod) => (
            <option key={mod.id} value={mod.id}>
              {mod.name} ({mod.power}W - {mod.voltage}V)
            </option>
          ))}
        </select>
        <div className="mt-1 text-[11px] text-monday-subtext flex justify-between">
          <span>Dimensiones: {selectedModule.width}x{selectedModule.height} mm</span>
          <span>Precio: ${selectedModule.price} MXN</span>
        </div>
      </div>

      {/* Area & Spacing Config */}
      <div className="space-y-2.5 bg-monday-bg p-3 rounded-monday border border-monday-border">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
          Área de Montaje y Separación (mm)
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-monday-subtext block">Ancho Área</label>
            <input
              type="number"
              step="10"
              value={areaWidth}
              onChange={(e) => setAreaWidth(Number(e.target.value))}
              className="w-full px-2 py-1 border border-monday-border rounded bg-white text-[12px]"
            />
          </div>
          <div>
            <label className="text-[10px] text-monday-subtext block">Alto Área</label>
            <input
              type="number"
              step="10"
              value={areaHeight}
              onChange={(e) => setAreaHeight(Number(e.target.value))}
              className="w-full px-2 py-1 border border-monday-border rounded bg-white text-[12px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-monday-subtext block">Paso Horizontal</label>
            <input
              type="number"
              step="5"
              value={spacingX}
              onChange={(e) => setSpacingX(Number(e.target.value))}
              className="w-full px-2 py-1 border border-monday-border rounded bg-white text-[12px]"
            />
          </div>
          <div>
            <label className="text-[10px] text-monday-subtext block">Paso Vertical</label>
            <input
              type="number"
              step="5"
              value={spacingY}
              onChange={(e) => setSpacingY(Number(e.target.value))}
              className="w-full px-2 py-1 border border-monday-border rounded bg-white text-[12px]"
            />
          </div>
        </div>
      </div>

      {/* Electrical Summary */}
      <div className="bg-amber-50 border border-amber-200 p-3 rounded-monday space-y-1.5 text-[12px]">
        <div className="font-semibold text-amber-800 flex items-center gap-1.5">
          <Zap size={14} />
          <span>Cálculo Eléctrico Estimado</span>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-900">Total módulos requeridos:</span>
          <strong>{layoutResult.totalCount} uds</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-900">Consumo nominal de carga:</span>
          <strong>{layoutResult.totalPower.toFixed(1)} W</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-900">Corriente a {voltage}V:</span>
          <strong>{layoutResult.totalCurrent.toFixed(2)} A</strong>
        </div>
        <div className="flex justify-between border-t border-amber-200 pt-1">
          <span className="text-amber-900">Ramas en paralelo:</span>
          <strong>{layoutResult.circuits.length} ramas</strong>
        </div>
      </div>

      {/* Power Supply Recommendation */}
      <div className="bg-blue-50 border border-blue-200 p-3 rounded-monday space-y-1 text-[12px]">
        <div className="font-semibold text-monday-blue flex items-center gap-1">
          <Cpu size={14} />
          <span>Fuente de Poder Recomendada (+20%)</span>
        </div>
        {psuRecommendation.recommended ? (
          <div>
            <div className="font-medium text-monday-text">
              {psuRecommendation.recommended.name}
            </div>
            <div className="text-[11px] text-monday-subtext">
              Capacidad: {psuRecommendation.recommended.wattage}W ({psuRecommendation.recommended.outputCurrent}A a {psuRecommendation.recommended.outputVoltage}V)
            </div>
          </div>
        ) : (
          <div className="text-red-600 text-[11px]">
            La carga supera las fuentes de poder estándar disponibles en catálogo.
          </div>
        )}
      </div>

      {/* Warnings */}
      {layoutResult.warnings.map((w, idx) => (
        <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50/50 p-2 rounded border border-amber-100">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{w}</span>
        </div>
      ))}

      {/* Action Button */}
      <button
        onClick={handlePlaceInScene}
        disabled={layoutResult.modules.length === 0}
        className="w-full py-2 bg-amber-500 text-white rounded-monday font-medium hover:bg-amber-600 transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <Zap size={15} />
        <span>Colocar Módulos en 3D</span>
      </button>
    </div>
  );
}
