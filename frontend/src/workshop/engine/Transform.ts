// ============================================================================
// Sunday 3D Workshop — Transform, Alignment, and Distribution Utilities
// All dimensions and positions in millimeters
// ============================================================================

import type { BoundingBox, Vec3 } from '../types.ts';
import { SceneObject } from './SceneObject.ts';
import { snapToGrid } from './Units.ts';

export type Axis = 'x' | 'y' | 'z';
export type AlignmentMode = 'min' | 'center' | 'max';

/**
 * Calculates the combined bounding box of a collection of SceneObjects in mm.
 */
export function getCombinedBoundingBox(objects: SceneObject[]): BoundingBox {
  if (objects.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  objects.forEach((obj) => {
    const bb = obj.getBoundingBox();
    minX = Math.min(minX, bb.min.x);
    minY = Math.min(minY, bb.min.y);
    minZ = Math.min(minZ, bb.min.z);
    maxX = Math.max(maxX, bb.max.x);
    maxY = Math.max(maxY, bb.max.y);
    maxZ = Math.max(maxZ, bb.max.z);
  });

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * Move object by delta vector (in mm).
 */
export function translateObject(obj: SceneObject, delta: Vec3, gridSnap = 0): void {
  const current = obj.getPosition();
  let nextX = current.x + delta.x;
  let nextY = current.y + delta.y;
  let nextZ = current.z + delta.z;

  if (gridSnap > 0) {
    nextX = snapToGrid(nextX, gridSnap);
    nextY = snapToGrid(nextY, gridSnap);
    nextZ = snapToGrid(nextZ, gridSnap);
  }

  obj.setPosition({ x: nextX, y: nextY, z: nextZ });
}

/**
 * Align multiple objects along a specified axis.
 * @param objects Objects to align (minimum 2)
 * @param axis 'x' | 'y' | 'z'
 * @param mode 'min' (left/bottom/front), 'center', 'max' (right/top/back)
 */
export function alignObjects(objects: SceneObject[], axis: Axis, mode: AlignmentMode): void {
  if (objects.length < 2) return;

  const combined = getCombinedBoundingBox(objects);
  let targetVal = 0;

  if (mode === 'min') {
    targetVal = combined.min[axis];
  } else if (mode === 'max') {
    targetVal = combined.max[axis];
  } else {
    targetVal = (combined.min[axis] + combined.max[axis]) / 2;
  }

  objects.forEach((obj) => {
    const bb = obj.getBoundingBox();
    const currentPos = obj.getPosition();

    let offset = 0;
    if (mode === 'min') {
      offset = targetVal - bb.min[axis];
    } else if (mode === 'max') {
      offset = targetVal - bb.max[axis];
    } else {
      const center = (bb.min[axis] + bb.max[axis]) / 2;
      offset = targetVal - center;
    }

    const updatedPos = { ...currentPos };
    updatedPos[axis] += offset;
    obj.setPosition(updatedPos);
  });
}

/**
 * Distribute objects evenly along a specified axis between the two outermost objects.
 * Requires at least 3 objects.
 */
export function distributeObjects(objects: SceneObject[], axis: Axis): void {
  if (objects.length < 3) return;

  // Sort objects by their center along the chosen axis
  const sorted = [...objects].sort((a, b) => {
    const bbA = a.getBoundingBox();
    const bbB = b.getBoundingBox();
    const centerA = (bbA.min[axis] + bbA.max[axis]) / 2;
    const centerB = (bbB.min[axis] + bbB.max[axis]) / 2;
    return centerA - centerB;
  });

  const firstObj = sorted[0];
  const lastObj = sorted[sorted.length - 1];

  const firstCenter = (firstObj.getBoundingBox().min[axis] + firstObj.getBoundingBox().max[axis]) / 2;
  const lastCenter = (lastObj.getBoundingBox().min[axis] + lastObj.getBoundingBox().max[axis]) / 2;

  const totalDistance = lastCenter - firstCenter;
  const step = totalDistance / (sorted.length - 1);

  sorted.forEach((obj, index) => {
    if (index === 0 || index === sorted.length - 1) return; // Keep endpoints fixed

    const targetCenter = firstCenter + step * index;
    const bb = obj.getBoundingBox();
    const currentCenter = (bb.min[axis] + bb.max[axis]) / 2;
    const delta = targetCenter - currentCenter;

    const currentPos = obj.getPosition();
    const updatedPos = { ...currentPos };
    updatedPos[axis] += delta;
    obj.setPosition(updatedPos);
  });
}

/**
 * Sets uniform scale factor while preserving aspect ratio.
 */
export function setUniformScale(obj: SceneObject, factor: number): void {
  const safe = Math.max(0.001, factor);
  obj.setScale({ x: safe, y: safe, z: safe });
}
