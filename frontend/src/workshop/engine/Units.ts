// ============================================================================
// Sunday 3D Workshop — Unit Conversion & Grid Snapping
// Default unit: millimeters (mm)
// ============================================================================

/**
 * Supported length units.
 */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

/**
 * Conversion factors FROM the given unit TO millimeters.
 */
const TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

/**
 * Predefined grid sizes in mm.
 */
export const GRID_SIZES: readonly number[] = [1, 5, 10, 25, 50, 100];

/**
 * Unit display labels.
 */
export const UNIT_LABELS: Record<LengthUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft',
};

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a value from one unit to another.
 */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  const mm = value * TO_MM[from];
  return mm / TO_MM[to];
}

/**
 * Convert to millimeters from any supported unit.
 */
export function toMM(value: number, from: LengthUnit): number {
  return value * TO_MM[from];
}

/**
 * Convert from millimeters to any supported unit.
 */
export function fromMM(valueMM: number, to: LengthUnit): number {
  return valueMM / TO_MM[to];
}

// ---------------------------------------------------------------------------
// Grid snapping
// ---------------------------------------------------------------------------

/**
 * Snap a value (in mm) to the nearest grid increment.
 * @param value   Value in mm.
 * @param gridSize Grid spacing in mm (must be > 0).
 * @returns Snapped value in mm.
 */
export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a value only if it's close enough (within half a grid cell).
 * Useful for "soft" snapping during drag operations.
 */
export function snapToGridThreshold(value: number, gridSize: number, threshold?: number): number {
  if (gridSize <= 0) return value;
  const snapped = snapToGrid(value, gridSize);
  const maxDist = threshold ?? gridSize * 0.5;
  return Math.abs(value - snapped) <= maxDist ? snapped : value;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a value (in mm) for display in the given unit with suffix.
 * @param valueMM     Value in millimeters.
 * @param displayUnit Unit to display in.
 * @param decimals    Number of decimal places (default 2).
 */
export function formatLength(valueMM: number, displayUnit: LengthUnit = 'mm', decimals = 2): string {
  const converted = fromMM(valueMM, displayUnit);
  return `${converted.toFixed(decimals)} ${UNIT_LABELS[displayUnit]}`;
}

/**
 * Format a monetary value with the given currency code.
 * Uses 2-decimal precision with half-up rounding.
 */
export function formatMoney(value: number, currency = 'MXN'): string {
  const rounded = roundMoney(value);
  return `$${rounded.toFixed(2)} ${currency}`;
}

/**
 * Round a monetary value to 2 decimal places (round half-up).
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
