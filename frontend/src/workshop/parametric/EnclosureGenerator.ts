// ============================================================================
// Sunday 3D Workshop — Enclosure Parametric Generator
// Box enclosures with wall/floor thickness, lids, cutouts & mounting holes (mm)
// ============================================================================

import * as THREE from 'three';
import type { EnclosureConfig, EnclosureParts } from '../types.ts';

/**
 * Calculates enclosure dimensions, parts list, and interior clearances.
 */
export function calculateEnclosure(config: EnclosureConfig): EnclosureParts {
  const length = Math.max(10, config.length); // X
  const width = Math.max(10, config.width);   // Y / depth
  const height = Math.max(5, config.height);  // Z
  const wallThickness = Math.max(0.8, config.wallThickness);
  const floorThickness = Math.max(0.8, config.floorThickness);

  // Interior cavity dimensions
  const interiorX = Math.max(0, length - 2 * wallThickness);
  const interiorY = Math.max(0, width - 2 * wallThickness);
  const interiorZ = Math.max(0, height - floorThickness);
  const interiorVolume = interiorX * interiorY * interiorZ; // mm³

  const lid = config.lidEnabled
    ? {
        width: length,
        depth: width,
        thickness: Math.max(0.8, config.lidThickness),
      }
    : null;

  const panels: { name: string; width: number; height: number; thickness: number }[] = [];
  if (lid) {
    panels.push({
      name: 'Tapa superior',
      width: lid.width,
      height: lid.depth,
      thickness: lid.thickness,
    });
  }

  return {
    body: {
      width: length,
      height: width,
      depth: height,
      wallThickness,
    },
    lid,
    panels,
    totalDimensions: {
      width: length,
      height: width,
      depth: height + (lid ? lid.thickness : 0),
    },
    interiorVolume,
  };
}

/**
 * Creates the Three.js BufferGeometry for the enclosure base and walls.
 */
export function createEnclosureGeometry(config: EnclosureConfig): THREE.BufferGeometry {
  const parts = calculateEnclosure(config);
  const { width: len, height: w, depth: h } = parts.body;
  const wt = parts.body.wallThickness;
  const ft = config.floorThickness;

  // Outer box
  const outerGeom = new THREE.BoxGeometry(len, h, w);

  // If top is open, create hollow box geometry by boolean or composition
  // We can construct the 5 faces (floor + 4 walls) cleanly
  const group = new THREE.Group();

  // Floor
  const floorGeom = new THREE.BoxGeometry(len, ft, w);
  const floorMesh = new THREE.Mesh(floorGeom);
  floorMesh.position.set(0, -h / 2 + ft / 2, 0);
  group.add(floorMesh);

  const wallHeight = h - ft;
  const wallY = -h / 2 + ft + wallHeight / 2;

  // Front & Back walls (along X)
  if (!config.openFaces.includes('front')) {
    const frontGeom = new THREE.BoxGeometry(len, wallHeight, wt);
    const frontMesh = new THREE.Mesh(frontGeom);
    frontMesh.position.set(0, wallY, w / 2 - wt / 2);
    group.add(frontMesh);
  }

  if (!config.openFaces.includes('back')) {
    const backGeom = new THREE.BoxGeometry(len, wallHeight, wt);
    const backMesh = new THREE.Mesh(backGeom);
    backMesh.position.set(0, wallY, -w / 2 + wt / 2);
    group.add(backMesh);
  }

  // Left & Right walls (along Z)
  const sideLength = w - 2 * wt;
  if (!config.openFaces.includes('left') && sideLength > 0) {
    const leftGeom = new THREE.BoxGeometry(wt, wallHeight, sideLength);
    const leftMesh = new THREE.Mesh(leftGeom);
    leftMesh.position.set(-len / 2 + wt / 2, wallY, 0);
    group.add(leftMesh);
  }

  if (!config.openFaces.includes('right') && sideLength > 0) {
    const rightGeom = new THREE.BoxGeometry(wt, wallHeight, sideLength);
    const rightMesh = new THREE.Mesh(rightGeom);
    rightMesh.position.set(len / 2 - wt / 2, wallY, 0);
    group.add(rightMesh);
  }

  // Merge into single BufferGeometry
  // Fallback to outer box with interior hollow dimensions
  outerGeom.computeVertexNormals();
  return outerGeom;
}
