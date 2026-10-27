// ============================================================================
// Sunday 3D Workshop — Costing Engine
// All money in MXN (configurable). 2-decimal precision, round half-up.
// ============================================================================

import type {
  CostBreakdown,
  CostCategory,
  CostingConfig,
  LineItem,
  ProjectManufacturing,
  QuotationData,
} from '../types.ts';
import { roundMoney } from '../engine/Units.ts';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_COSTING_CONFIG: CostingConfig = {
  laborRatePerHour: 150,    // MXN/hr
  machineRatePerHour: 50,   // MXN/hr (3D printer, CNC)
  overheadPercent: 15,
  markupPercent: 40,
  wastePercent: 5,
  currency: 'MXN',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLineItem(
  description: string,
  quantity: number,
  unit: string,
  unitCost: number,
  category: CostCategory,
): LineItem {
  return {
    description,
    quantity,
    unit,
    unitCost: roundMoney(unitCost),
    total: roundMoney(quantity * unitCost),
    category,
  };
}

function emptySubtotals(): Record<CostCategory, number> {
  return {
    materials: 0,
    electronics: 0,
    hardware: 0,
    labor: 0,
    machineTime: 0,
    electricity: 0,
    waste: 0,
    packaging: 0,
    other: 0,
  };
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a full cost breakdown from project manufacturing data.
 */
export function calculateCost(
  project: ProjectManufacturing,
  config: CostingConfig = DEFAULT_COSTING_CONFIG,
): CostBreakdown {
  const lineItems: LineItem[] = [];
  const subtotals = emptySubtotals();

  // Materials
  for (const item of project.materialItems) {
    const li = buildLineItem(item.description, item.quantity, item.unit, item.unitCost, 'materials');
    lineItems.push(li);
    subtotals.materials = roundMoney(subtotals.materials + li.total);
  }

  // Electronics
  for (const item of project.electronicsItems) {
    const li = buildLineItem(item.description, item.quantity, item.unit, item.unitCost, 'electronics');
    lineItems.push(li);
    subtotals.electronics = roundMoney(subtotals.electronics + li.total);
  }

  // Hardware
  for (const item of project.hardwareItems) {
    const li = buildLineItem(item.description, item.quantity, item.unit, item.unitCost, 'hardware');
    lineItems.push(li);
    subtotals.hardware = roundMoney(subtotals.hardware + li.total);
  }

  // Labor
  if (project.laborHours > 0) {
    const li = buildLineItem(
      'Mano de obra',
      project.laborHours,
      'hr',
      config.laborRatePerHour,
      'labor',
    );
    lineItems.push(li);
    subtotals.labor = roundMoney(li.total);
  }

  // Machine time
  if (project.machineHours > 0) {
    const li = buildLineItem(
      'Tiempo de máquina',
      project.machineHours,
      'hr',
      config.machineRatePerHour,
      'machineTime',
    );
    lineItems.push(li);
    subtotals.machineTime = roundMoney(li.total);
  }

  // Electricity
  if (project.electricityKwh > 0) {
    const li = buildLineItem(
      'Electricidad',
      project.electricityKwh,
      'kWh',
      project.electricityRate,
      'electricity',
    );
    lineItems.push(li);
    subtotals.electricity = roundMoney(li.total);
  }

  // Packaging
  if (project.packagingCost > 0) {
    const li = buildLineItem('Empaque', 1, 'lote', project.packagingCost, 'packaging');
    lineItems.push(li);
    subtotals.packaging = roundMoney(li.total);
  }

  // Waste surcharge (applies only to materials)
  if (config.wastePercent > 0 && subtotals.materials > 0) {
    const wasteAmount = roundMoney(subtotals.materials * (config.wastePercent / 100));
    const li = buildLineItem(
      `Desperdicio de material (${config.wastePercent}%)`,
      1,
      'lote',
      wasteAmount,
      'waste',
    );
    lineItems.push(li);
    subtotals.waste = roundMoney(wasteAmount);
  }

  // Total direct cost
  const totalDirectCost = roundMoney(
    Object.values(subtotals).reduce((sum, v) => sum + v, 0),
  );

  // Overhead
  const overheadAmount = roundMoney(totalDirectCost * (config.overheadPercent / 100));
  const totalCost = roundMoney(totalDirectCost + overheadAmount);

  // Markup → selling price
  // Markup is applied ON TOP of cost: sellingPrice = cost × (1 + markup%)
  const sellingPrice = applyMarkup(totalCost, config.markupPercent);
  const grossProfit = roundMoney(sellingPrice - totalCost);
  const marginPercent = calculateMargin(totalCost, sellingPrice);

  return {
    lineItems,
    subtotals,
    totalDirectCost,
    overheadPercent: config.overheadPercent,
    overheadAmount,
    totalCost,
    markupPercent: config.markupPercent,
    sellingPrice,
    grossProfit,
    marginPercent,
    currency: config.currency,
  };
}

// ---------------------------------------------------------------------------
// High-level input adapter (used by the Costing panel and domain tests)
// ---------------------------------------------------------------------------

export interface CostingInputLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  /** Free-form category label from the UI (e.g. "electronica", "hardware"). */
  category?: string;
}

export interface CostBreakdownInput {
  materials: CostingInputLine[];
  components: CostingInputLine[];
  laborHours: number;
  laborRatePerHour: number;
  machineHours: number;
  machineRatePerHour: number;
  overheadPercent: number;
  markupPercent: number;
  currency?: string;
}

/**
 * Breakdown returned by `calculateCostBreakdown`.
 * `overheadCost` and `grossMargin` are aliases kept for UI/test compatibility
 * with the canonical `overheadAmount` and `marginPercent` fields.
 */
export interface CostBreakdownSummary extends CostBreakdown {
  overheadCost: number;
  grossMargin: number;
}

/**
 * Calculate a cost breakdown from the simplified panel input.
 * This adapter feeds the canonical `calculateCost` engine; it does not
 * duplicate or bypass its calculations.
 */
export function calculateCostBreakdown(input: CostBreakdownInput): CostBreakdownSummary {
  const electronicsItems: ProjectManufacturing['electronicsItems'] = [];
  const hardwareItems: ProjectManufacturing['hardwareItems'] = [];

  for (const item of input.components) {
    const line = {
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
    };
    if (item.category === 'electronica' || item.category === 'electronics') {
      electronicsItems.push(line);
    } else {
      hardwareItems.push(line);
    }
  }

  const project: ProjectManufacturing = {
    materialItems: input.materials.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
    })),
    electronicsItems,
    hardwareItems,
    laborHours: input.laborHours,
    machineHours: input.machineHours,
    electricityKwh: 0,
    electricityRate: 0,
    packagingCost: 0,
  };

  const config: CostingConfig = {
    laborRatePerHour: input.laborRatePerHour,
    machineRatePerHour: input.machineRatePerHour,
    overheadPercent: input.overheadPercent,
    markupPercent: input.markupPercent,
    wastePercent: 0,
    currency: input.currency ?? 'MXN',
  };

  const breakdown = calculateCost(project, config);

  return {
    ...breakdown,
    overheadCost: breakdown.overheadAmount,
    grossMargin: breakdown.marginPercent,
  };
}

// ---------------------------------------------------------------------------
// Markup & margin (these are distinct!)
// ---------------------------------------------------------------------------

/**
 * Apply markup percentage to cost to get selling price.
 * Markup is based on COST: sellingPrice = cost × (1 + markupPercent / 100).
 */
export function applyMarkup(cost: number, markupPercent: number): number {
  return roundMoney(cost * (1 + markupPercent / 100));
}

/**
 * Calculate gross margin percentage.
 * Margin is based on SELLING PRICE: margin = (price − cost) / price × 100.
 */
export function calculateMargin(cost: number, sellingPrice: number): number {
  if (sellingPrice === 0) return 0;
  return Math.round(((sellingPrice - cost) / sellingPrice) * 10000) / 100;
}

/** Alias for `applyMarkup` using the panel/test terminology. */
export function applyMarkupToCost(cost: number, markupPercent: number): number {
  return applyMarkup(cost, markupPercent);
}

/** Alias for `calculateMargin` using the panel/test terminology. */
export function calculateMarginFromPrice(cost: number, sellingPrice: number): number {
  return calculateMargin(cost, sellingPrice);
}

/**
 * Calculate selling price from cost and desired margin.
 * price = cost / (1 − margin% / 100).
 */
export function priceFromMargin(cost: number, marginPercent: number): number {
  if (marginPercent >= 100) throw new Error('Margin cannot be 100% or greater.');
  return roundMoney(cost / (1 - marginPercent / 100));
}

// ---------------------------------------------------------------------------
// Quotation generation
// ---------------------------------------------------------------------------

/**
 * Generate a quotation object from a cost breakdown.
 */
export function generateQuotation(
  projectName: string,
  breakdown: CostBreakdown,
  notes = '',
  validDays = 15,
): QuotationData {
  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + validDays);

  return {
    id: crypto.randomUUID(),
    projectName,
    date: now.toISOString(),
    lineItems: breakdown.lineItems.map((li) => ({ ...li })),
    subtotals: { ...breakdown.subtotals },
    totalCost: breakdown.totalCost,
    sellingPrice: breakdown.sellingPrice,
    currency: breakdown.currency,
    notes,
    validUntil: validUntil.toISOString(),
  };
}
