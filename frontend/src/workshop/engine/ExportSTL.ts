// ============================================================================
// Sunday 3D Workshop — Production Exports (STL, OBJ) & Mesh Validation
// Units: millimeters (mm)
// ============================================================================

import * as THREE from 'three';
import { SceneObject } from './SceneObject.ts';

export interface MeshValidationReport {
  valid: boolean;
  triangleCount: number;
  vertexCount: number;
  hasDegenerateTriangles: boolean;
  degenerateCount: number;
  dimensions: { width: number; height: number; depth: number };
  errors: string[];
  warnings: string[];
}

/**
 * Validates a BufferGeometry for common manufacturing/slicing defects.
 */
export function validateGeometry(geom: THREE.BufferGeometry): MeshValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const posAttr = geom.getAttribute('position');
  if (!posAttr || posAttr.count === 0) {
    errors.push('La geometría no tiene vértices.');
    return {
      valid: false,
      triangleCount: 0,
      vertexCount: 0,
      hasDegenerateTriangles: false,
      degenerateCount: 0,
      dimensions: { width: 0, height: 0, depth: 0 },
      errors,
      warnings,
    };
  }

  geom.computeBoundingBox();
  const box = geom.boundingBox ?? new THREE.Box3();
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.x < 0.1 || size.y < 0.1 || size.z < 0.1) {
    warnings.push('La pieza tiene una dimensión muy delgada (< 0.1 mm), lo que puede causar fallos de impresión 3D.');
  }

  // Count triangles
  const vertexCount = posAttr.count;
  const triangleCount = geom.index ? geom.index.count / 3 : vertexCount / 3;

  let degenerateCount = 0;
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();

  for (let i = 0; i < triangleCount; i++) {
    let iA = i * 3;
    let iB = i * 3 + 1;
    let iC = i * 3 + 2;

    if (geom.index) {
      iA = geom.index.getX(iA);
      iB = geom.index.getX(iB);
      iC = geom.index.getX(iC);
    }

    pA.fromBufferAttribute(posAttr, iA);
    pB.fromBufferAttribute(posAttr, iB);
    pC.fromBufferAttribute(posAttr, iC);

    // Degenerate triangle check (area == 0 or duplicate vertices)
    const ab = pB.clone().sub(pA);
    const ac = pC.clone().sub(pA);
    const cross = ab.cross(ac);
    const area = cross.length() * 0.5;

    if (area < 1e-7 || isNaN(area)) {
      degenerateCount++;
    }
  }

  if (degenerateCount > 0) {
    warnings.push(`Se detectaron ${degenerateCount} triángulos degenerados (área cero).`);
  }

  return {
    valid: errors.length === 0,
    triangleCount,
    vertexCount,
    hasDegenerateTriangles: degenerateCount > 0,
    degenerateCount,
    dimensions: { width: size.x, height: size.y, depth: size.z },
    errors,
    warnings,
  };
}

/**
 * Exports one or more SceneObjects to Binary STL format (ArrayBuffer).
 * Coordinates are in millimeters (mm).
 */
export function exportToBinarySTL(objects: SceneObject[]): ArrayBuffer {
  // Collect all triangles from all objects
  interface Triangle {
    normal: THREE.Vector3;
    a: THREE.Vector3;
    b: THREE.Vector3;
    c: THREE.Vector3;
  }

  const triangles: Triangle[] = [];

  objects.forEach((obj) => {
    if (!obj.visible) return;

    obj.mesh.updateMatrixWorld(true);
    const geom = obj.mesh.geometry.clone();
    geom.applyMatrix4(obj.mesh.matrixWorld);

    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;

    const normal = new THREE.Vector3();
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();

    const triCount = geom.index ? geom.index.count / 3 : posAttr.count / 3;

    for (let i = 0; i < triCount; i++) {
      let iA = i * 3;
      let iB = i * 3 + 1;
      let iC = i * 3 + 2;

      if (geom.index) {
        iA = geom.index.getX(iA);
        iB = geom.index.getX(iB);
        iC = geom.index.getX(iC);
      }

      pA.fromBufferAttribute(posAttr, iA);
      pB.fromBufferAttribute(posAttr, iB);
      pC.fromBufferAttribute(posAttr, iC);

      const cb = pC.clone().sub(pB);
      const ab = pA.clone().sub(pB);
      normal.copy(cb.cross(ab).normalize());

      triangles.push({
        normal: normal.clone(),
        a: pA.clone(),
        b: pB.clone(),
        c: pC.clone(),
      });
    }

    geom.dispose();
  });

  // Binary STL Structure:
  // 80 bytes header
  // 4 bytes uint32 (number of triangles)
  // Each triangle: 50 bytes (3*float32 normal, 3*float32 vertex1, 3*float32 vertex2, 3*float32 vertex3, uint16 attr)
  const bufferLength = 84 + triangles.length * 50;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const dataView = new DataView(arrayBuffer);

  // Write header
  const header = 'Sunday 3D Workshop STL Export (mm)';
  for (let i = 0; i < 80; i++) {
    dataView.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Write triangle count
  dataView.setUint32(80, triangles.length, true); // Little endian

  let offset = 84;
  triangles.forEach((tri) => {
    // Normal
    dataView.setFloat32(offset, tri.normal.x, true);
    dataView.setFloat32(offset + 4, tri.normal.y, true);
    dataView.setFloat32(offset + 8, tri.normal.z, true);

    // Vertex 1
    dataView.setFloat32(offset + 12, tri.a.x, true);
    dataView.setFloat32(offset + 16, tri.a.y, true);
    dataView.setFloat32(offset + 20, tri.a.z, true);

    // Vertex 2
    dataView.setFloat32(offset + 24, tri.b.x, true);
    dataView.setFloat32(offset + 28, tri.b.y, true);
    dataView.setFloat32(offset + 32, tri.b.z, true);

    // Vertex 3
    dataView.setFloat32(offset + 36, tri.c.x, true);
    dataView.setFloat32(offset + 40, tri.c.y, true);
    dataView.setFloat32(offset + 44, tri.c.z, true);

    // Attribute byte count
    dataView.setUint16(offset + 48, 0, true);

    offset += 50;
  });

  return arrayBuffer;
}

/**
 * Exports one or more SceneObjects to ASCII Wavefront OBJ format.
 */
export function exportToOBJ(objects: SceneObject[]): string {
  let output = '# Sunday 3D Workshop OBJ Export\n# Units: mm\n\n';
  let vertexOffset = 1;

  objects.forEach((obj, objIdx) => {
    if (!obj.visible) return;

    output += `o ${obj.name.replace(/\s+/g, '_')}_${objIdx + 1}\n`;

    obj.mesh.updateMatrixWorld(true);
    const geom = obj.mesh.geometry.clone();
    geom.applyMatrix4(obj.mesh.matrixWorld);

    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;

    // Vertices
    for (let i = 0; i < posAttr.count; i++) {
      output += `v ${posAttr.getX(i).toFixed(4)} ${posAttr.getY(i).toFixed(4)} ${posAttr.getZ(i).toFixed(4)}\n`;
    }

    // Faces
    const triCount = geom.index ? geom.index.count / 3 : posAttr.count / 3;
    for (let i = 0; i < triCount; i++) {
      let iA = i * 3;
      let iB = i * 3 + 1;
      let iC = i * 3 + 2;

      if (geom.index) {
        iA = geom.index.getX(iA);
        iB = geom.index.getX(iB);
        iC = geom.index.getX(iC);
      }

      output += `f ${vertexOffset + iA} ${vertexOffset + iB} ${vertexOffset + iC}\n`;
    }

    vertexOffset += posAttr.count;
    geom.dispose();
    output += '\n';
  });

  return output;
}
