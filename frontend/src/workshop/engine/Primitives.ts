// ============================================================================
// Sunday 3D Workshop — 3D Geometry Primitives
// Dimensions in millimeters (mm)
// ============================================================================

import * as THREE from 'three';
import type { PrimitiveType } from '../types.ts';

/**
 * Creates a Box BufferGeometry centered at origin.
 * @param width mm (X)
 * @param height mm (Y)
 * @param depth mm (Z)
 */
export function createBoxGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const w = Math.max(0.1, width);
  const h = Math.max(0.1, height);
  const d = Math.max(0.1, depth);
  return new THREE.BoxGeometry(w, h, d);
}

/**
 * Creates a Sphere BufferGeometry.
 * @param radius mm
 * @param segments radial and height segments
 */
export function createSphereGeometry(radius: number, segments = 32): THREE.BufferGeometry {
  const r = Math.max(0.1, radius);
  return new THREE.SphereGeometry(r, segments, Math.round(segments / 2));
}

/**
 * Creates a Cylinder BufferGeometry.
 * @param radiusTop mm
 * @param radiusBottom mm
 * @param height mm (Y)
 * @param radialSegments
 */
export function createCylinderGeometry(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 32
): THREE.BufferGeometry {
  const rt = Math.max(0, radiusTop);
  const rb = Math.max(0, radiusBottom);
  const h = Math.max(0.1, height);
  return new THREE.CylinderGeometry(rt, rb, h, radialSegments);
}

/**
 * Creates a Cone BufferGeometry.
 * @param radius mm
 * @param height mm
 * @param radialSegments
 */
export function createConeGeometry(radius: number, height: number, radialSegments = 32): THREE.BufferGeometry {
  const r = Math.max(0.1, radius);
  const h = Math.max(0.1, height);
  return new THREE.ConeGeometry(r, h, radialSegments);
}

/**
 * Creates a Wedge (Right Triangular Prism) BufferGeometry.
 * Cross-section in the XY plane is a right triangle with base = width, height = height.
 * Extruded along Z by depth.
 * @param width mm (X)
 * @param height mm (Y)
 * @param depth mm (Z)
 */
export function createWedgeGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const w = Math.max(0.1, width);
  const h = Math.max(0.1, height);
  const d = Math.max(0.1, depth);

  // Right triangle in 2D
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: d,
    bevelEnabled: false,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.center(); // Center at origin
  return geom;
}

/**
 * Creates a Torus BufferGeometry.
 * @param radius mm (center of torus to center of tube)
 * @param tubeRadius mm
 * @param radialSegments
 * @param tubularSegments
 */
export function createTorusGeometry(
  radius: number,
  tubeRadius: number,
  radialSegments = 16,
  tubularSegments = 32
): THREE.BufferGeometry {
  const r = Math.max(0.2, radius);
  const tr = Math.max(0.1, tubeRadius);
  return new THREE.TorusGeometry(r, tr, radialSegments, tubularSegments);
}

/**
 * Default geometry generator given a PrimitiveType and parameters dictionary.
 */
export function generatePrimitiveGeometry(
  type: PrimitiveType,
  parameters: Record<string, number | string | boolean> = {}
): THREE.BufferGeometry {
  switch (type) {
    case 'box': {
      const width = Number(parameters.width ?? 50);
      const height = Number(parameters.height ?? 50);
      const depth = Number(parameters.depth ?? 50);
      return createBoxGeometry(width, height, depth);
    }
    case 'sphere': {
      const radius = Number(parameters.radius ?? 25);
      const segments = Number(parameters.segments ?? 32);
      return createSphereGeometry(radius, segments);
    }
    case 'cylinder': {
      const radiusTop = Number(parameters.radiusTop ?? 20);
      const radiusBottom = Number(parameters.radiusBottom ?? 20);
      const height = Number(parameters.height ?? 60);
      const segments = Number(parameters.segments ?? 32);
      return createCylinderGeometry(radiusTop, radiusBottom, height, segments);
    }
    case 'cone': {
      const radius = Number(parameters.radius ?? 25);
      const height = Number(parameters.height ?? 50);
      const segments = Number(parameters.segments ?? 32);
      return createConeGeometry(radius, height, segments);
    }
    case 'wedge': {
      const width = Number(parameters.width ?? 50);
      const height = Number(parameters.height ?? 50);
      const depth = Number(parameters.depth ?? 50);
      return createWedgeGeometry(width, height, depth);
    }
    case 'torus': {
      const radius = Number(parameters.radius ?? 30);
      const tube = Number(parameters.tube ?? 10);
      return createTorusGeometry(radius, tube);
    }
    default:
      return createBoxGeometry(20, 20, 20);
  }
}
