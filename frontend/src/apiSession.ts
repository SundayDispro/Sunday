/**
 * Política de sesión del cliente ante respuestas HTTP.
 *
 * Vive fuera de `api.ts` para poder probarse sin navegador (`api.ts` usa
 * `import.meta.env` y `window`). `apiFetch` usa estas funciones como única
 * fuente de verdad.
 *
 * Reglas:
 * - `401` con el mismo token de la petición → sesión inválida/expirada: expirar.
 * - `503` → el backend o la base de datos están temporalmente caídos. NO se
 *   toca el JWT, NO se limpia la cola offline y NO se redirige al login.
 * - `500`/`502`/`504`/errores de red → tampoco expiran la sesión: no son una
 *   prueba de que el token haya dejado de ser válido.
 * - `403` → problema de permisos, no de sesión.
 *
 * Un `401` solo expira si esta petición llevaba token y localStorage sigue
 * teniendo exactamente ese token. Evita que un 401 tardío de una petición
 * antigua cierre una sesión nueva (login reciente en otra pestaña).
 */

export type ApiFailureKind = 'auth' | 'service_unavailable' | 'forbidden' | 'other';

export function classifyApiFailure(status: number): ApiFailureKind {
  if (status === 401) return 'auth';
  if (status === 503) return 'service_unavailable';
  if (status === 403) return 'forbidden';
  return 'other';
}

/** `true` solo para un 401 genuino de la sesión actual. */
export function shouldExpireSession(
  status: number,
  tokenUsedForRequest: string | null,
  tokenNow: string | null
): boolean {
  return (
    classifyApiFailure(status) === 'auth' &&
    Boolean(tokenUsedForRequest) &&
    tokenNow === tokenUsedForRequest
  );
}

export function isServiceUnavailable(status: number): boolean {
  return status === 503;
}
