// ============================================================================
// Sunday 3D Workshop — 3D Text & Lettering Geometry
// Dimensions in millimeters (mm)
// ============================================================================

import * as THREE from 'three';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export interface Text3DGeometryOptions {
  size: number;            // mm (letter height)
  depth: number;           // mm (extrusion depth)
  curveSegments?: number;  // smoothness
  bevelEnabled?: boolean;
  bevelThickness?: number; // mm
  bevelSize?: number;      // mm
  bevelOffset?: number;
  bevelSegments?: number;
}

// Built-in basic vector font representation (helvetiker regular subset)
// Ensures 3D text generation works instantly offline without requiring network font fetch
import defaultFontJson from './defaultFont.json';

let cachedDefaultFont: Font | null = null;

export function getDefaultFont(): Font {
  if (!cachedDefaultFont) {
    const loader = new FontLoader();
    cachedDefaultFont = loader.parse(defaultFontJson);
  }
  return cachedDefaultFont;
}

/**
 * Generates 3D extruded text geometry from a font.
 */
export function create3DTextGeometry(
  text: string,
  font: Font,
  options: Text3DGeometryOptions
): THREE.BufferGeometry {
  const safeText = text.trim() || 'A';
  const size = Math.max(1, options.size);
  const depth = Math.max(0.5, options.depth);

  const geom = new TextGeometry(safeText, {
    font,
    size,
    depth,
    curveSegments: options.curveSegments ?? 8,
    bevelEnabled: options.bevelEnabled ?? false,
    bevelThickness: options.bevelThickness ?? 1,
    bevelSize: options.bevelSize ?? 0.5,
    bevelOffset: options.bevelOffset ?? 0,
    bevelSegments: options.bevelSegments ?? 3,
  });

  geom.computeBoundingBox();
  geom.center(); // Center text around origin
  return geom;
}

/**
 * Measures text width and height given font and size.
 */
export function measureTextDimensions(
  text: string,
  font: Font,
  size: number,
  depth = 10
): { width: number; height: number; depth: number } {
  const geom = create3DTextGeometry(text, font, { size, depth });
  geom.computeBoundingBox();
  const box = geom.boundingBox ?? new THREE.Box3();
  const dim = new THREE.Vector3();
  box.getSize(dim);
  geom.dispose();
  return {
    width: dim.x,
    height: dim.y,
    depth: dim.z,
  };
}
