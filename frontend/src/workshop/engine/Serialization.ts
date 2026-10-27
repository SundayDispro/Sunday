// ============================================================================
// Sunday 3D Workshop — Project Serialization & Deserialization
// Native format preserving complete scene, parameters, catalog & quotations
// ============================================================================

import type { ProjectData } from '../types.ts';
import { SceneManager } from './Scene.ts';

export const CURRENT_PROJECT_VERSION = '1.0.0';

export interface SerializationResult {
  json: string;
  data: ProjectData;
}

export interface DeserializationResult {
  success: boolean;
  data?: ProjectData;
  error?: string;
}

/**
 * Serializes the current workshop state into a ProjectData object and JSON string.
 */
export function serializeProject(
  scene: SceneManager,
  projectName = 'Proyecto 3D',
  additionalData?: Partial<ProjectData>
): SerializationResult {
  const now = new Date().toISOString();
  const sceneData = scene.toData();

  const data: ProjectData = {
    version: CURRENT_PROJECT_VERSION,
    name: projectName,
    createdAt: additionalData?.createdAt ?? now,
    updatedAt: now,
    scene: sceneData,
    parameters: additionalData?.parameters ?? [],
    catalog: additionalData?.catalog ?? { materials: [], components: [] },
    quotations: additionalData?.quotations ?? [],
  };

  const json = JSON.stringify(data, null, 2);
  return { json, data };
}

/**
 * Deserializes and validates a ProjectData JSON string.
 */
export function deserializeProject(jsonText: string): DeserializationResult {
  if (!jsonText || typeof jsonText !== 'string') {
    return { success: false, error: 'El archivo de proyecto está vacío.' };
  }

  try {
    const parsed = JSON.parse(jsonText);

    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'Formato de archivo inválido (no es un objeto JSON).' };
    }

    if (!parsed.scene || !Array.isArray(parsed.scene.objects)) {
      return { success: false, error: 'El archivo no contiene una escena 3D válida.' };
    }

    // Version validation / migration
    const version = parsed.version || '1.0.0';

    const projectData: ProjectData = {
      version,
      name: typeof parsed.name === 'string' ? parsed.name : 'Proyecto 3D',
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      scene: {
        objects: parsed.scene.objects.map((o: any) => ({
          id: o.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'obj_' + Math.random().toString(36).slice(2, 9)),
          name: o.name || 'Objeto',
          type: o.type || 'box',
          position: o.position || { x: 0, y: 0, z: 0 },
          rotation: o.rotation || { x: 0, y: 0, z: 0 },
          scale: o.scale || { x: 1, y: 1, z: 1 },
          material: o.material || { color: '#0073ea', opacity: 1, wireframe: false },
          visible: o.visible !== false,
          locked: !!o.locked,
          selected: !!o.selected,
          parentId: o.parentId || null,
          childrenIds: Array.isArray(o.childrenIds) ? o.childrenIds : [],
          parameters: o.parameters || {},
          metadata: o.metadata || {},
        })),
        selectedIds: Array.isArray(parsed.scene.selectedIds) ? parsed.scene.selectedIds : [],
        settings: parsed.scene.settings || {
          backgroundColor: '#f5f6f8',
          gridVisible: true,
          gridSize: 10,
          snapEnabled: true,
        },
      },
      parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
      catalog: parsed.catalog || { materials: [], components: [] },
      quotations: Array.isArray(parsed.quotations) ? parsed.quotations : [],
    };

    return { success: true, data: projectData };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Error al leer el archivo de proyecto: ${msg}` };
  }
}
