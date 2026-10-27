// ============================================================================
// Sunday 3D Workshop — Boolean Geometry Operations (CSG)
// Real boolean union, subtraction, and intersection using three-bvh-csg
// ============================================================================

import * as THREE from 'three';
import { SUBTRACTION, ADDITION, INTERSECTION, Evaluator, Brush } from 'three-bvh-csg';
import { SceneObject } from './SceneObject.ts';

export type BooleanOperationType = 'union' | 'subtract' | 'intersect';

export interface BooleanResult {
  success: boolean;
  object?: SceneObject;
  error?: string;
}

/**
 * Creates a CSG Brush from a SceneObject, applying its world transformation.
 */
function createBrushFromObject(obj: SceneObject): Brush {
  obj.mesh.updateMatrixWorld(true);
  const brush = new Brush(obj.mesh.geometry.clone());
  brush.position.copy(obj.mesh.position);
  brush.rotation.copy(obj.mesh.rotation);
  brush.scale.copy(obj.mesh.scale);
  brush.updateMatrixWorld(true);
  return brush;
}

/**
 * Performs a boolean operation between two SceneObjects.
 * @param objA Target object
 * @param objB Tool/cutter object
 * @param op 'union' | 'subtract' | 'intersect'
 */
export function performBooleanOperation(
  objA: SceneObject,
  objB: SceneObject,
  op: BooleanOperationType
): BooleanResult {
  try {
    const evaluator = new Evaluator();
    evaluator.useGroups = false;

    const brushA = createBrushFromObject(objA);
    const brushB = createBrushFromObject(objB);

    let operationCode = SUBTRACTION;
    let label = 'Sustracción';

    switch (op) {
      case 'union':
        operationCode = ADDITION;
        label = 'Unión';
        break;
      case 'subtract':
        operationCode = SUBTRACTION;
        label = 'Sustracción';
        break;
      case 'intersect':
        operationCode = INTERSECTION;
        label = 'Intersección';
        break;
    }

    const resultBrush = evaluator.evaluate(brushA, brushB, operationCode);

    if (!resultBrush || !resultBrush.geometry) {
      return {
        success: false,
        error: 'La operación booleana no generó una geometría válida.',
      };
    }

    // Verify vertex count
    const posAttr = resultBrush.geometry.getAttribute('position');
    if (!posAttr || posAttr.count === 0) {
      return {
        success: false,
        error: 'El resultado de la operación booleana está vacío (las mallas no se intersecan o se eliminaron mutuamente).',
      };
    }

    // Recompute normals and bounds
    resultBrush.geometry.computeVertexNormals();
    resultBrush.geometry.computeBoundingBox();

    const name = `${label} (${objA.name} y ${objB.name})`;
    const resultObj = new SceneObject(
      {
        name,
        type: 'boolean',
        material: { ...objA.materialData },
        parameters: {
          operation: op,
          sourceA: objA.id,
          sourceB: objB.id,
        },
      },
      resultBrush.geometry
    );

    return {
      success: true,
      object: resultObj,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Error al ejecutar operación booleana: ${message}`,
    };
  }
}
