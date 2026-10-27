// ============================================================================
// Sunday 3D Workshop — Practical LED Layout Generator
// Grid distribution, usable-area constraints, circuit grouping & consumption
// ============================================================================

import type { LEDLayoutConfig, LEDLayoutResult, LEDPlacement, LEDCircuit } from '../types.ts';

/**
 * Calculates a practical LED module layout inside a defined mounting area.
 */
export function calculateLEDLayout(config: LEDLayoutConfig): LEDLayoutResult {
  const warnings: string[] = [];

  const areaW = Math.max(0, config.areaWidth);
  const areaH = Math.max(0, config.areaHeight);
  const edgeDist = Math.max(0, config.minEdgeDistance);

  // Usable area after edge margins
  const usableWidth = Math.max(0, areaW - 2 * edgeDist);
  const usableHeight = Math.max(0, areaH - 2 * edgeDist);

  const modW = config.moduleType.width;
  const modH = config.moduleType.height;
  const spacingX = Math.max(10, config.spacingX);
  const spacingY = Math.max(10, config.spacingY);

  if (usableWidth < modW || usableHeight < modH) {
    warnings.push('El área disponible es menor que las dimensiones de un solo módulo LED.');
    return {
      modules: [],
      totalCount: 0,
      totalPower: 0,
      totalCurrent: 0,
      circuits: [],
      warnings,
    };
  }

  // Calculate number of columns and rows that fit
  const cols = Math.max(1, Math.floor((usableWidth + spacingX - modW) / spacingX));
  const rows = Math.max(1, Math.floor((usableHeight + spacingY - modH) / spacingY));

  const totalCount = cols * rows;

  // Actual spacing distributed evenly
  const actualStepX = cols > 1 ? (usableWidth - modW) / (cols - 1) : 0;
  const actualStepY = rows > 1 ? (usableHeight - modH) / (rows - 1) : 0;

  const startX = -areaW / 2 + edgeDist + modW / 2;
  const startY = -areaH / 2 + edgeDist + modH / 2;

  const modules: LEDPlacement[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      modules.push({
        moduleId: config.moduleType.id,
        position: {
          x: startX + c * actualStepX,
          y: startY + r * actualStepY,
          z: config.mountingClearance + config.moduleType.depth / 2,
        },
        orientation: 'horizontal',
      });
    }
  }

  // Electrical load calculations
  const totalPower = Math.round(totalCount * config.moduleType.power * 100) / 100; // Watts
  const totalCurrent =
    config.voltage > 0 ? Math.round((totalPower / config.voltage) * 100) / 100 : 0; // Amps

  // Group into circuits (e.g., maximum 20-25 modules per chain to prevent voltage drop)
  const maxModulesPerCircuit = 20;
  const circuits: LEDCircuit[] = [];
  const numCircuits = Math.ceil(totalCount / maxModulesPerCircuit);

  for (let i = 0; i < numCircuits; i++) {
    const circuitModules = modules.slice(i * maxModulesPerCircuit, (i + 1) * maxModulesPerCircuit);
    const circuitPower = Math.round(circuitModules.length * config.moduleType.power * 100) / 100;
    const circuitCurrent =
      config.voltage > 0 ? Math.round((circuitPower / config.voltage) * 100) / 100 : 0;

    circuits.push({
      id: `circuito_${i + 1}`,
      modules: circuitModules,
      totalPower: circuitPower,
      totalCurrent: circuitCurrent,
      connection: 'parallel',
    });
  }

  if (numCircuits > 1) {
    warnings.push(
      `Para evitar caída de voltaje, conecte los módulos en ${numCircuits} ramas en paralelo de máximo ${maxModulesPerCircuit} módulos cada una.`
    );
  }

  return {
    modules,
    totalCount,
    totalPower,
    totalCurrent,
    circuits,
    warnings,
  };
}
