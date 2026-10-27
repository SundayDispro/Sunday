// ============================================================================
// Sunday 3D Workshop — SVG Parser & 3D Extrusion
// Extrudes vector paths into solid 3D geometry in millimeters (mm)
// ============================================================================

import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

export interface SVGValidationResult {
  valid: boolean;
  error?: string;
  sanitizedSvg?: string;
}

export interface SVGExtrusionOptions {
  depth: number;          // mm (extrusion thickness)
  scale?: number;         // scale multiplier
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelSegments?: number;
}

/**
 * Validates and sanitizes SVG input string.
 * Rejects malicious script tags, foreign entities, and empty content.
 */
export function validateSVG(svgText: string): SVGValidationResult {
  if (!svgText || typeof svgText !== 'string') {
    return { valid: false, error: 'El archivo SVG está vacío o no es una cadena válida.' };
  }

  // Check for dangerous scripts or event handlers
  if (/<script[\s>]/i.test(svgText) || /on\w+\s*=/i.test(svgText) || /javascript:/i.test(svgText)) {
    return { valid: false, error: 'El archivo SVG contiene scripts no permitidos por seguridad.' };
  }

  // Check for XML external entity declarations
  if (/<!ENTITY/i.test(svgText) || /<!DOCTYPE/i.test(svgText)) {
    return { valid: false, error: 'El archivo SVG contiene definiciones DTD/ENTITY no permitidas.' };
  }

  // Check if it contains basic SVG tag
  if (!/<svg[\s>]/i.test(svgText)) {
    return { valid: false, error: 'El contenido no contiene una etiqueta <svg> válida.' };
  }

  return { valid: true, sanitizedSvg: svgText };
}

/**
 * Parses an SVG string and generates an extruded 3D BufferGeometry.
 */
export function extrudeSVG(
  svgContent: string,
  options: SVGExtrusionOptions
): { geometry: THREE.BufferGeometry | null; error?: string } {
  const validation = validateSVG(svgContent);
  if (!validation.valid || !validation.sanitizedSvg) {
    return { geometry: null, error: validation.error };
  }

  try {
    const loader = new SVGLoader();
    const svgData = loader.parse(validation.sanitizedSvg);

    if (!svgData.paths || svgData.paths.length === 0) {
      return { geometry: null, error: 'No se encontraron trazos ni rutas vectoriales en el SVG.' };
    }

    const shapes: THREE.Shape[] = [];
    svgData.paths.forEach((path) => {
      const generatedShapes = SVGLoader.createShapes(path);
      shapes.push(...generatedShapes);
    });

    if (shapes.length === 0) {
      return { geometry: null, error: 'No se pudieron generar formas cerradas a partir de las rutas SVG.' };
    }

    const depth = Math.max(0.5, options.depth);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: options.bevelEnabled ?? false,
      bevelThickness: options.bevelThickness ?? 1,
      bevelSize: options.bevelSize ?? 0.5,
      bevelSegments: options.bevelSegments ?? 3,
    };

    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);

    // SVG coordinate space is Y-down; flip Y to match 3D coordinate space (Y-up)
    geometry.scale(1, -1, 1);

    // Apply scale if specified
    if (options.scale && options.scale !== 1) {
      geometry.scale(options.scale, options.scale, options.scale);
    }

    geometry.center(); // Center at origin
    geometry.computeVertexNormals();

    return { geometry };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { geometry: null, error: `Error al procesar el archivo SVG: ${msg}` };
  }
}
