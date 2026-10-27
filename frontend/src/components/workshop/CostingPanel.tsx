// ============================================================================
// Sunday 3D Workshop — Costing & Final Quotation Panel
// Transparent line items, direct costs, labor, machine time, markup & margin
// ============================================================================

import React, { useState } from 'react';
import { DollarSign, FileText, CheckCircle, Calculator } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { calculateCostBreakdown, applyMarkupToCost } from '../../workshop/manufacturing/CostingEngine';

export function CostingPanel() {
  const { scene, projectName } = useWorkshop();

  const [laborHours, setLaborHours] = useState(2.5);
  const [machineHours, setMachineHours] = useState(4.0);
  const [markupPercent, setMarkupPercent] = useState(40); // 40% markup

  const allObjects = scene.getAllObjects();

  // Approximate materials from scene objects
  let totalVolumeCm3 = 0;
  allObjects.forEach((obj) => {
    const dim = obj.getDimensions();
    // Approximate volume of object in cm³
    totalVolumeCm3 += (dim.width * dim.height * dim.depth) / 1000;
  });

  const breakdown = calculateCostBreakdown({
    materials: [
      {
        description: 'Filamento de impresión 3D / Resina',
        quantity: Math.max(0.1, Math.round((totalVolumeCm3 * 0.2 * 1.25) / 10) / 100), // kg estimate (20% infill, PLA 1.25g/cm³)
        unit: 'kg',
        unitCost: 380, // MXN/kg
        category: 'materiales',
      },
    ],
    components: [
      {
        description: 'Módulos LED y Cableado',
        quantity: 1,
        unit: 'lote',
        unitCost: 150,
        category: 'electronica',
      },
      {
        description: 'Tornillería y Adhesivo de montaje',
        quantity: 1,
        unit: 'lote',
        unitCost: 65,
        category: 'hardware',
      },
    ],
    laborHours,
    laborRatePerHour: 120, // MXN/hr
    machineHours,
    machineRatePerHour: 45, // MXN/hr
    overheadPercent: 10,
    markupPercent,
    currency: 'MXN',
  });

  const handlePrintQuotation = () => {
    window.print();
  };

  return (
    <div className="w-80 border-l border-monday-border bg-monday-surface p-4 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto space-y-4">
      <div className="flex items-center gap-2 border-b border-monday-border pb-2.5">
        <DollarSign size={18} className="text-emerald-600" />
        <span className="font-semibold text-[13px] uppercase tracking-wider">
          Costos y Cotización
        </span>
      </div>

      {/* Primary KPI Card */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-3 rounded-monday">
        <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider mb-1">
          Precio de Venta Sugerido
        </div>
        <div className="text-[22px] font-bold text-emerald-700">
          ${breakdown.sellingPrice.toFixed(2)} {breakdown.currency}
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-800 pt-1 border-t border-emerald-200/60">
          <span>Margen Bruto: <strong>{breakdown.grossMargin.toFixed(1)}%</strong></span>
          <span>Utilidad: <strong>${breakdown.grossProfit.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* Labor & Machine Inputs */}
      <div className="space-y-2.5 bg-monday-bg p-3 rounded-monday border border-monday-border">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
          Tiempos y Margen Comercial
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-monday-subtext">Mano de obra (horas):</span>
          <input
            type="number"
            step="0.5"
            min="0"
            value={laborHours}
            onChange={(e) => setLaborHours(parseFloat(e.target.value) || 0)}
            className="w-16 px-1.5 py-0.5 border border-monday-border rounded bg-white text-right text-[12px]"
          />
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-monday-subtext">Tiempo de máquina (hrs):</span>
          <input
            type="number"
            step="0.5"
            min="0"
            value={machineHours}
            onChange={(e) => setMachineHours(parseFloat(e.target.value) || 0)}
            className="w-16 px-1.5 py-0.5 border border-monday-border rounded bg-white text-right text-[12px]"
          />
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-monday-subtext">Margen de ganancia (%):</span>
          <input
            type="number"
            step="5"
            min="0"
            max="300"
            value={markupPercent}
            onChange={(e) => setMarkupPercent(parseFloat(e.target.value) || 0)}
            className="w-16 px-1.5 py-0.5 border border-monday-border rounded bg-white text-right text-[12px]"
          />
        </div>
      </div>

      {/* Line Items Breakdown */}
      <div>
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
          Desglose de Costos Directos
        </div>

        <div className="space-y-1.5 text-[12px]">
          {breakdown.lineItems.map((item, idx) => (
            <div key={idx} className="flex justify-between py-1 border-b border-monday-border/60">
              <span className="text-monday-text truncate pr-2" title={item.description}>
                {item.description}
              </span>
              <span className="font-medium shrink-0">
                ${item.total.toFixed(2)}
              </span>
            </div>
          ))}

          <div className="flex justify-between py-1 font-semibold text-monday-text pt-2">
            <span>Costo Directo Total:</span>
            <span>${breakdown.totalDirectCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 text-monday-subtext text-[11px]">
            <span>Gastos Operativos (Overhead):</span>
            <span>${breakdown.overheadCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 font-bold text-[13px] border-t border-monday-border pt-1">
            <span>Costo Total:</span>
            <span>${breakdown.totalCost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Print / Export Quotation Button */}
      <button
        onClick={handlePrintQuotation}
        className="w-full py-2 bg-emerald-600 text-white rounded-monday font-medium hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <FileText size={15} />
        <span>Imprimir Cotización Formal</span>
      </button>
    </div>
  );
}
