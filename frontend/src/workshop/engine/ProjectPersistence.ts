// ============================================================================
// Sunday 3D Workshop — Project persistence helpers
//
// Funciones puras (sin DOM ni `api.ts`) para poder probarlas con `node --test`.
// No inventan datos: solo envían `sceneData` (que ya incluye los parámetros de
// cada objeto) y, si el llamador realmente dispone de él, `catalogData`.
// ============================================================================

import type { SceneData } from '../types.ts';

export interface ProjectSaveRequestInput {
  projectId: string | null;
  workspaceId: string;
  name: string;
  sceneData: SceneData;
  /**
   * El módulo actual no comparte el catálogo de `MaterialsPanel` con el flujo
   * de guardado. Si no se pasa, el campo se omite para no sobrescribir un
   * `catalogData` ya persistido con un objeto vacío.
   */
  catalogData?: unknown;
}

export interface ProjectSaveRequest {
  method: 'POST' | 'PUT';
  path: string;
  body: Record<string, unknown>;
}

export function buildProjectSaveRequest(input: ProjectSaveRequestInput): ProjectSaveRequest {
  const projectId = input.projectId?.trim() || null;
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    workspaceId: input.workspaceId,
    sceneData: input.sceneData,
  };

  if (input.catalogData !== undefined) {
    body.catalogData = input.catalogData;
  }

  return {
    method: projectId ? 'PUT' : 'POST',
    path: projectId
      ? `/api/workshop/projects/${encodeURIComponent(projectId)}`
      : '/api/workshop/projects',
    body,
  };
}

export interface SaveFailure {
  status: number | null;
  message: string;
  sessionExpired: boolean;
  permissionDenied: boolean;
  retryable: boolean;
}

const NOT_SAVED = 'El proyecto no se guardó.';

function readServerDetail(serverError?: string | null): string {
  return typeof serverError === 'string' ? serverError.trim() : '';
}

/**
 * Traduce el resultado de un guardado remoto fallido a un mensaje honesto.
 * Ningún estado HTTP se presenta como guardado local ni como éxito.
 */
export function describeSaveFailure(
  status: number | null,
  serverError?: string | null
): SaveFailure {
  const detail = readServerDetail(serverError);

  if (status === null) {
    return {
      status,
      message: detail
        ? `${NOT_SAVED} ${detail}`
        : `${NOT_SAVED} No se pudo conectar con el servidor.`,
      sessionExpired: false,
      permissionDenied: false,
      retryable: true,
    };
  }

  if (status === 401) {
    return {
      status,
      message: `${NOT_SAVED} Tu sesión no es válida o expiró.`,
      sessionExpired: true,
      permissionDenied: false,
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      status,
      message: `${NOT_SAVED} No tienes permiso para guardar en este espacio de trabajo.`,
      sessionExpired: false,
      permissionDenied: true,
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      status,
      message: `${NOT_SAVED} El proyecto o el espacio de trabajo ya no existe.`,
      sessionExpired: false,
      permissionDenied: false,
      retryable: false,
    };
  }

  if (status === 409) {
    return {
      status,
      message: `${NOT_SAVED} El proyecto entró en conflicto. Recarga e inténtalo de nuevo.`,
      sessionExpired: false,
      permissionDenied: false,
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      status,
      message: `${NOT_SAVED} Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.`,
      sessionExpired: false,
      permissionDenied: false,
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      status,
      message: `${NOT_SAVED} El servidor no pudo completar la operación. Inténtalo de nuevo.`,
      sessionExpired: false,
      permissionDenied: false,
      retryable: true,
    };
  }

  return {
    status,
    message: detail
      ? `${NOT_SAVED} ${detail}`
      : `${NOT_SAVED} Error del servidor (${status}).`,
    sessionExpired: false,
    permissionDenied: false,
    retryable: false,
  };
}

/**
 * Extrae la escena restaurable de la respuesta de `GET /projects/:id`.
 * Devuelve null si el payload no tiene la forma mínima que `SceneManager`
 * necesita (`sceneData.objects` como array), en lugar de vaciar la escena
 * actual con datos inválidos.
 */
export function extractProjectScene(project: unknown): SceneData | null {
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null;

  const scene = (project as { sceneData?: unknown }).sceneData;
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return null;

  const objects = (scene as { objects?: unknown }).objects;
  if (!Array.isArray(objects)) return null;

  return scene as SceneData;
}
