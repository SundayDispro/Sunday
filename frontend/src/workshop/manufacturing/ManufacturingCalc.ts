// ============================================================================
// Sunday 3D Workshop — Manufacturing Calculations
// Geometric analysis for manufacturing estimation.
// Input: geometry data in mm. Output: cm³, cm², grams, hours, etc.
// ============================================================================

// ---------------------------------------------------------------------------
// Volume calculation (from triangle mesh)
// ---------------------------------------------------------------------------

/**
 * Calculate volume of a closed triangle mesh using the divergence theorem.
 * The input is a flat Float32Array of vertex positions (x,y,z triples)
 * and an optional index array. If no indices, assumes non-indexed triangles.
 *
 * @param positions  Float32Array of vertex positions (x,y,z) in mm.
 * @param indices    Optional Uint32Array / Uint16Array of triangle indices.
 * @returns Volume in mm³ (always positive).
 */
export function calculateVolumeFromMesh(
  positions: Float32Array,
  indices?: Uint32Array | Uint16Array,
): number {
  let volume = 0;

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      volume += signedTetraVolume(
        positions[i0], positions[i0 + 1], positions[i0 + 2],
        positions[i1], positions[i1 + 1], positions[i1 + 2],
        positions[i2], positions[i2 + 1], positions[i2 + 2],
      );
    }
  } else {
    for (let i = 0; i < positions.length; i += 9) {
      volume += signedTetraVolume(
        positions[i], positions[i + 1], positions[i + 2],
        positions[i + 3], positions[i + 4], positions[i + 5],
        positions[i + 6], positions[i + 7], positions[i + 8],
      );
    }
  }

  return Math.abs(volume);
}

/**
 * Signed volume of the tetrahedron formed by a triangle and the origin.
 */
function signedTetraVolume(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
): number {
  return (
    (x0 * (y1 * z2 - y2 * z1) +
     x1 * (y2 * z0 - y0 * z2) +
     x2 * (y0 * z1 - y1 * z0)) / 6
  );
}

/**
 * Convert mm³ to cm³.
 */
export function mm3ToCm3(mm3: number): number {
  return mm3 / 1000;
}

/**
 * Calculate volume in cm³ from a mesh in mm.
 */
export function calculateVolume(
  positions: Float32Array,
  indices?: Uint32Array | Uint16Array,
): number {
  return mm3ToCm3(calculateVolumeFromMesh(positions, indices));
}

// ---------------------------------------------------------------------------
// Primitive volume helpers (dimensions in mm, result in cm³)
// ---------------------------------------------------------------------------

/** Volume of a rectangular box. */
export function calculateBoxVolume(widthMM: number, heightMM: number, depthMM: number): number {
  return mm3ToCm3(widthMM * heightMM * depthMM);
}

/** Volume of a cylinder (radius and height in mm). */
export function calculateCylinderVolume(radiusMM: number, heightMM: number): number {
  return mm3ToCm3(Math.PI * radiusMM * radiusMM * heightMM);
}

/** Volume of a sphere (radius in mm). */
export function calculateSphereVolume(radiusMM: number): number {
  return mm3ToCm3((4 / 3) * Math.PI * radiusMM ** 3);
}

// ---------------------------------------------------------------------------
// Surface area
// ---------------------------------------------------------------------------

/**
 * Calculate total surface area of a triangle mesh.
 * @returns Surface area in mm².
 */
export function calculateSurfaceAreaFromMesh(
  positions: Float32Array,
  indices?: Uint32Array | Uint16Array,
): number {
  let area = 0;

  const triangleArea = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ): number => {
    // Cross product of (B-A) × (C-A), magnitude / 2
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
  };

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      area += triangleArea(
        positions[i0], positions[i0 + 1], positions[i0 + 2],
        positions[i1], positions[i1 + 1], positions[i1 + 2],
        positions[i2], positions[i2 + 1], positions[i2 + 2],
      );
    }
  } else {
    for (let i = 0; i < positions.length; i += 9) {
      area += triangleArea(
        positions[i], positions[i + 1], positions[i + 2],
        positions[i + 3], positions[i + 4], positions[i + 5],
        positions[i + 6], positions[i + 7], positions[i + 8],
      );
    }
  }

  return area;
}

/**
 * Convert mm² to cm².
 */
export function mm2ToCm2(mm2: number): number {
  return mm2 / 100;
}

/**
 * Calculate surface area in cm² from a mesh in mm.
 */
export function calculateSurfaceArea(
  positions: Float32Array,
  indices?: Uint32Array | Uint16Array,
): number {
  return mm2ToCm2(calculateSurfaceAreaFromMesh(positions, indices));
}

// ---------------------------------------------------------------------------
// Mass
// ---------------------------------------------------------------------------

/**
 * Calculate mass from volume and density.
 * @param volumeCm3 Volume in cm³.
 * @param densityGPerCm3 Density in g/cm³.
 * @returns Mass in grams.
 */
export function calculateMass(volumeCm3: number, densityGPerCm3: number): number {
  return volumeCm3 * densityGPerCm3;
}

// ---------------------------------------------------------------------------
// 3D print material estimate
// ---------------------------------------------------------------------------

/**
 * Estimate the mass of filament for an FDM 3D print.
 *
 * This is an APPROXIMATION. Actual usage depends on slicer settings,
 * support material, geometry complexity, etc.
 *
 * @param volumeCm3    Object volume in cm³.
 * @param infillPercent Infill percentage (0–100).
 * @param wallCount     Number of perimeter walls (typically 2–4).
 * @param wallThicknessMM Wall line width in mm (default 0.4 for standard nozzle).
 * @param densityGPerCm3  Filament density in g/cm³ (default 1.24 for PLA).
 * @returns Estimated filament mass in grams (labeled as approximation).
 */
export function estimate3DPrintMaterial(
  volumeCm3: number,
  infillPercent: number,
  wallCount = 3,
  wallThicknessMM = 0.4,
  densityGPerCm3 = 1.24,
): number {
  // Simplified model:
  // - Outer shell = wallCount × wallThickness forms a shell volume
  // - Interior gets infill percentage
  // - Real slicers do this per-layer; we approximate from total volume
  //
  // Assume shell takes roughly (wallCount * 0.4mm / avgDimension) fraction of volume
  // For simplicity, we estimate shell fraction as min(1, wallCount * wallThicknessMM * 0.1)
  // This is a rough heuristic.

  const shellFraction = Math.min(1, wallCount * wallThicknessMM * 0.005);
  const shellVolume = volumeCm3 * shellFraction;
  const interiorVolume = volumeCm3 * (1 - shellFraction);
  const infillVolume = interiorVolume * (infillPercent / 100);
  const totalFilamentVolume = shellVolume + infillVolume;

  return totalFilamentVolume * densityGPerCm3;
}

/**
 * Convenience wrapper for the common UI/test estimate: mass in grams for a
 * given volume, infill percentage and material density.
 */
export function estimate3DPrintFilamentGrams(
  volumeCm3: number,
  infillPercent: number,
  densityGPerCm3 = 1.24,
): number {
  return estimate3DPrintMaterial(volumeCm3, infillPercent, 3, 0.4, densityGPerCm3);
}

// ---------------------------------------------------------------------------
// Sheet usage estimate
// ---------------------------------------------------------------------------

/**
 * Estimate sheet material usage using bounding-box packing (not optimized nesting).
 *
 * @param parts Array of { width, height } (in mm) representing parts to cut.
 * @param sheetWidth  Sheet width in mm.
 * @param sheetHeight Sheet height in mm.
 * @returns { sheetsNeeded, wastePercent }
 */
export function estimateSheetUsage(
  parts: { width: number; height: number }[],
  sheetWidth: number,
  sheetHeight: number,
): { sheetsNeeded: number; wastePercent: number; totalPartArea: number; totalSheetArea: number } {
  if (parts.length === 0) {
    return { sheetsNeeded: 0, wastePercent: 0, totalPartArea: 0, totalSheetArea: 0 };
  }

  const sheetArea = sheetWidth * sheetHeight;
  let totalPartArea = 0;

  for (const part of parts) {
    totalPartArea += part.width * part.height;
  }

  // Simple estimate: ceiling of total part area / sheet area, minimum 1
  const sheetsNeeded = Math.max(1, Math.ceil(totalPartArea / sheetArea));
  const totalSheetArea = sheetsNeeded * sheetArea;
  const wastePercent =
    totalSheetArea > 0
      ? Math.round(((totalSheetArea - totalPartArea) / totalSheetArea) * 10000) / 100
      : 0;

  return { sheetsNeeded, wastePercent, totalPartArea, totalSheetArea };
}

// ---------------------------------------------------------------------------
// Print time estimate
// ---------------------------------------------------------------------------

/**
 * Estimate FDM 3D print time.
 *
 * This is a ROUGH APPROXIMATION. Real print time depends on geometry,
 * travel moves, acceleration, retraction, support, etc.
 *
 * @param volumeCm3   Object volume in cm³.
 * @param layerHeight Layer height in mm (default 0.2).
 * @param speedMmPerSec Print speed in mm/s (default 50).
 * @returns Estimated time in hours.
 */
export function estimatePrintTime(
  volumeCm3: number,
  layerHeight = 0.2,
  speedMmPerSec = 50,
): number {
  // Convert volume to mm³
  const volumeMm3 = volumeCm3 * 1000;

  // Approximate: each layer is a thin slice of nozzle-width (0.4mm) × layerHeight
  // extruded length per layer ≈ volumeMm3 / (0.4 * layerHeight) / numLayers
  // total extrusion length = volumeMm3 / (0.4 * layerHeight)
  const nozzleWidth = 0.4;
  const extrusionLength = volumeMm3 / (nozzleWidth * layerHeight);

  // Time = distance / speed  (in seconds) → convert to hours
  const timeSeconds = extrusionLength / speedMmPerSec;

  // Add ~20% for travel, retraction, layer changes
  const adjustedTime = timeSeconds * 1.2;

  return adjustedTime / 3600;
}

// ---------------------------------------------------------------------------
// Adhesive & wire length
// ---------------------------------------------------------------------------

/**
 * Calculate adhesive length needed for a perimeter.
 * @param perimeterMM Perimeter in mm.
 * @returns Length in meters.
 */
export function calculateAdhesiveLength(perimeterMM: number): number {
  return perimeterMM / 1000;
}

/**
 * Estimate wire length for connecting LED modules.
 * Adds inter-module distances plus a 15% slack factor.
 *
 * @param modulePositions Array of { x, y } positions in mm.
 * @param circuitGroupSizes How many modules per circuit string.
 * @returns Total wire length in meters.
 */
export function calculateWireLength(
  modulePositions: { x: number; y: number }[],
  circuitGroupSizes: number[] = [],
): number {
  if (modulePositions.length <= 1) return 0;

  let totalMM = 0;

  if (circuitGroupSizes.length === 0) {
    // All modules in one circuit — simple sum of inter-module distances
    for (let i = 1; i < modulePositions.length; i++) {
      const dx = modulePositions[i].x - modulePositions[i - 1].x;
      const dy = modulePositions[i].y - modulePositions[i - 1].y;
      totalMM += Math.sqrt(dx * dx + dy * dy);
    }
  } else {
    // Respect circuit groups
    let offset = 0;
    for (const size of circuitGroupSizes) {
      for (let i = 1; i < size && offset + i < modulePositions.length; i++) {
        const dx = modulePositions[offset + i].x - modulePositions[offset + i - 1].x;
        const dy = modulePositions[offset + i].y - modulePositions[offset + i - 1].y;
        totalMM += Math.sqrt(dx * dx + dy * dy);
      }
      offset += size;
    }
  }

  // Add 15% slack
  totalMM *= 1.15;

  return totalMM / 1000;
}
