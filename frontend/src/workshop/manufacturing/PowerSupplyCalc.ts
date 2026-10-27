// ============================================================================
// Sunday 3D Workshop — Power Supply Calculator
// Pure calculation module — no Three.js dependency.
// ============================================================================

import type {
  LEDModuleData,
  PowerSupplyData,
  PowerLoadSummary,
  PSURecommendation,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Load calculation
// ---------------------------------------------------------------------------

/**
 * Sum the total electrical load for a set of LED modules and their quantities.
 */
export function calculateTotalLoad(
  modules: LEDModuleData[],
  quantities: number[],
): PowerLoadSummary {
  if (modules.length !== quantities.length) {
    throw new Error('modules and quantities arrays must have the same length.');
  }

  let totalWatts = 0;
  let totalAmps = 0;
  let voltage = 0;

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const qty = quantities[i];
    if (qty < 0) throw new Error(`Quantity at index ${i} cannot be negative.`);

    totalWatts += mod.power * qty;
    totalAmps += mod.current * qty;

    // All modules in a system should share the same voltage.
    if (voltage === 0) {
      voltage = mod.voltage;
    } else if (mod.voltage !== voltage) {
      throw new Error(
        `Voltage mismatch: module "${mod.name}" is ${mod.voltage}V but system is ${voltage}V.`,
      );
    }
  }

  return {
    totalWatts: Math.round(totalWatts * 1000) / 1000,
    totalAmps: Math.round(totalAmps * 1000) / 1000,
    voltage,
  };
}

// ---------------------------------------------------------------------------
// Engineering margin
// ---------------------------------------------------------------------------

/**
 * Adjusted load with the engineering margin applied.
 * `adjustedWatts` / `adjustedAmps` are aliases of `totalWatts` / `totalAmps`.
 */
export interface AdjustedPowerLoad extends PowerLoadSummary {
  adjustedWatts: number;
  adjustedAmps: number;
}

/**
 * Apply an engineering safety margin to a load.
 * @param load          Raw load summary.
 * @param marginPercent Safety margin in percent (default 20 %).
 * @returns Adjusted load with margin applied.
 */
export function applyEngineeringMargin(
  load: PowerLoadSummary,
  marginPercent = 20,
): AdjustedPowerLoad {
  if (marginPercent < 0) throw new Error('Margin percent cannot be negative.');
  const factor = 1 + marginPercent / 100;
  const totalWatts = Math.round(load.totalWatts * factor * 1000) / 1000;
  const totalAmps = Math.round(load.totalAmps * factor * 1000) / 1000;
  return {
    totalWatts,
    totalAmps,
    voltage: load.voltage,
    adjustedWatts: totalWatts,
    adjustedAmps: totalAmps,
  };
}

// ---------------------------------------------------------------------------
// PSU recommendation
// ---------------------------------------------------------------------------

/**
 * Select the best-fit power supply for the given load from the catalog.
 *
 * Selection strategy:
 * 1. Filter PSUs that match the required voltage.
 * 2. Filter those whose wattage ≥ adjusted load watts AND current ≥ adjusted amps.
 * 3. Sort ascending by wattage (pick smallest that fits).
 * 4. Return recommended (first) and alternatives (rest).
 */
export function recommendPowerSupply(
  load: PowerLoadSummary,
  catalog: PowerSupplyData[],
  marginPercent = 20,
): PSURecommendation {
  const warnings: string[] = [];

  if (load.totalWatts === 0) {
    return { recommended: null, alternatives: [], warnings: ['No load specified.'] };
  }

  // Size the PSU against the load plus the requested engineering margin.
  const adjustedLoad = applyEngineeringMargin(load, marginPercent);

  // Filter by voltage
  const voltageMatch = catalog.filter((p) => p.outputVoltage === load.voltage);
  if (voltageMatch.length === 0) {
    warnings.push(
      `No power supplies found for ${load.voltage}V in the catalog.`,
    );
    return { recommended: null, alternatives: [], warnings };
  }

  // Filter by capacity
  const capable = voltageMatch
    .filter(
      (p) =>
        p.wattage >= adjustedLoad.totalWatts &&
        p.outputCurrent >= adjustedLoad.totalAmps,
    )
    .sort((a, b) => a.wattage - b.wattage);

  if (capable.length === 0) {
    const largest = [...voltageMatch].sort((a, b) => b.wattage - a.wattage)[0];
    warnings.push(
      `No single PSU can handle ${adjustedLoad.totalWatts.toFixed(1)}W / ${adjustedLoad.totalAmps.toFixed(2)}A ` +
        `(including a ${marginPercent}% margin). ` +
        `Largest available is ${largest.name} (${largest.wattage}W / ${largest.outputCurrent}A). ` +
        `Consider using multiple power supplies.`,
    );
    return { recommended: null, alternatives: voltageMatch, warnings };
  }

  const [recommended, ...alternatives] = capable;

  // Warn if load is >80 % of recommended PSU
  const utilization = (adjustedLoad.totalWatts / recommended.wattage) * 100;
  if (utilization > 80) {
    warnings.push(
      `Utilization is ${utilization.toFixed(1)}% of ${recommended.name}. ` +
        `Consider the next size up for better longevity.`,
    );
  }

  return { recommended, alternatives, warnings };
}

// ---------------------------------------------------------------------------
// Compatibility checks
// ---------------------------------------------------------------------------

/**
 * Check whether all modules are compatible with the PSU voltage.
 */
export function checkVoltageCompatibility(
  modules: LEDModuleData[],
  psu: PowerSupplyData,
): { compatible: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let compatible = true;

  for (const mod of modules) {
    if (mod.voltage !== psu.outputVoltage) {
      compatible = false;
      warnings.push(
        `Module "${mod.name}" requires ${mod.voltage}V but PSU outputs ${psu.outputVoltage}V.`,
      );
    }
  }

  return { compatible, warnings };
}

/**
 * Check whether the PSU is overloaded by the given load.
 */
export function checkOverload(
  psu: PowerSupplyData,
  load: PowerLoadSummary,
): { overloaded: boolean; utilizationPercent: number; warning: string } {
  const utilizationWatts = (load.totalWatts / psu.wattage) * 100;
  const utilizationAmps = (load.totalAmps / psu.outputCurrent) * 100;
  const utilization = Math.max(utilizationWatts, utilizationAmps);

  const overloaded = utilization > 100;
  let warning = '';

  if (overloaded) {
    warning = `PSU "${psu.name}" is overloaded at ${utilization.toFixed(1)}% utilization. ` +
      `Load: ${load.totalWatts.toFixed(1)}W / ${load.totalAmps.toFixed(2)}A, ` +
      `PSU capacity: ${psu.wattage}W / ${psu.outputCurrent}A.`;
  } else if (utilization > 80) {
    warning = `PSU "${psu.name}" is at ${utilization.toFixed(1)}% utilization. ` +
      `Consider a larger PSU for safety margin.`;
  }

  return {
    overloaded,
    utilizationPercent: Math.round(utilization * 100) / 100,
    warning,
  };
}
