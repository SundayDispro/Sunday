/**
 * Base URL del backend.
 * - Desarrollo: vacío = mismo origen (Vite hace proxy de /api y /uploads a 3001).
 *   Así funciona desde PC (localhost:5173) y desde móvil (192.168.x.x:5173).
 * - Si VITE_API_URL está definido, se usa (útil para producción o backend en otra máquina).
 * - Producción sin VITE_API_URL: cadena vacía (mismo origen).
 */
function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!raw) return '';

  // Safety: avoid shipping a localhost backend URL to remote clients.
  try {
    const u = new URL(raw);
    const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    const runningOnRemoteHost =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
    if (isLocalhost && runningOnRemoteHost) return '';
  } catch {
    // Ignore invalid URLs and fallback to same-origin.
    return '';
  }

  return raw;
}

export const API_BASE: string = resolveApiBase();

/** URL completa al backend: `/api/...` con mismo origen, o `origen/api/...` si hay `VITE_API_URL`. */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) return p;
  return `${API_BASE.replace(/\/$/, '')}${p}`;
}

/** SECURITY-ACCEPTED-RISK: token en localStorage; ver comentario en UserContext.tsx (red privada / Tailscale). */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('sunday_token');
  } catch {
    return null;
  }
}

export function buildAuthHeaders(base: HeadersInit = {}): HeadersInit {
  const token = getAuthToken();
  if (!token) return base;
  return {
    ...base,
    Authorization: `Bearer ${token}`,
  };
}

import { notifyGlobalToast } from './toastGlobal';
import { shouldExpireSession } from './apiSession';

export type ApiFetchInit = RequestInit & { silent?: boolean };

/**
 * Parsea la respuesta de fetch de forma segura:
 * - No llama a .json() en respuestas vacías (p. ej. 204).
 * - En errores (!res.ok), si Content-Type no es JSON usa el texto recibido
 *   para no lanzar "Unexpected token '<'" al parsear HTML.
 */
export async function parseResponse<T = unknown>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (res.status === 204 || !text.trim()) return null;

  const contentType = res.headers.get('Content-Type') ?? '';
  const isJson = contentType.includes('application/json');

  let parsed: unknown = null;
  if (isJson) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(text.slice(0, 200) || 'Error del servidor');
      throw new Error('La respuesta del servidor no es JSON válido.');
    }
  }

  if (!res.ok) {
    if (parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed && typeof (parsed as { error?: string }).error === 'string') {
      throw new Error((parsed as { error: string }).error);
    }
    throw new Error(text.slice(0, 200) || 'Error del servidor');
  }

  return parsed as T;
}

export function clearAuthStorage(): void {
  try {
    localStorage.removeItem('sunday_token');
    localStorage.removeItem('sunday_user');
  } catch {
    // ignore
  }
}

/**
 * Cierre de sesión centralizado por expiración/invalidez del JWT.
 *
 * Lo consumen los dos caminos que hoy pueden detectar el problema:
 * - `apiFetch`, cuando el backend responde 401 con el mismo token de la petición.
 * - `store/socket.ts`, cuando el handshake de Socket.IO se rechaza con `unauthorized`.
 *
 * Pasos (idénticos a los que antes estaban duplicados en cada sitio):
 * 1. Guarda el motivo en `sessionStorage` para que el Login muestre el mensaje.
 * 2. Emite `session-expired` para que la UI (App.tsx) marque el JWT como expirado.
 * 3. Limpia el almacenamiento local y redirige a `/`.
 *
 * `isExpired` se deduce del `exp` del JWT que sigue en `localStorage`:
 * - Token con `exp` ya vencido → `true` → margen de 250 ms para que el banner de
 *   sesión expirada llegue a pintarse antes de la recarga completa.
 * - Token aún vivo (401/`unauthorized` por permisos o por usuario borrado, no
 *   por caducidad) → `false` → redirección inmediata.
 * - Sin token o con un JWT no decodificable (p. ej. una segunda llamada después
 *   de que otra ruta ya limpió el almacenamiento) → `true` por defecto: si no se
 *   puede demostrar que el token seguía vivo, se asume expirado y se aplica el
 *   margen de 250 ms.
 */
export function expireSession(reason: string = 'session_expired'): void {
  const token = getAuthToken();
  const expMs = token ? decodeJwtExpMs(token) : null;
  const isExpired = expMs != null ? expMs <= Date.now() : true;

  try {
    sessionStorage.setItem('logout_reason', reason);
  } catch {
    // ignore (almacenamiento bloqueado)
  }

  try {
    window.dispatchEvent(
      new CustomEvent('session-expired', {
        detail: { reason, isExpired },
      })
    );
  } catch {
    // ignore en entornos sin window
  }

  clearAuthStorage();

  try {
    const delayMs = isExpired ? 250 : 0;
    setTimeout(() => {
      try {
        window.location.href = '/';
      } catch {
        // ignore en entornos sin window
      }
    }, delayMs);
  } catch {
    // ignore en entornos sin window
  }
}

function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadBase64Url = parts[1];
    const base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64 + padding);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    const expSec =
      typeof payload.exp === 'number'
        ? payload.exp
        : typeof payload.exp === 'string'
          ? Number(payload.exp)
          : NaN;
    if (!Number.isFinite(expSec)) return null;
    return expSec * 1000;
  } catch {
    return null;
  }
}

/**
 * Wrapper de fetch que:
 * - Añade automáticamente el header Authorization: Bearer <token> si existe.
 * - Si recibe 401 con el mismo token que se usó en la petición, guarda razón en sessionStorage,
 *   limpia sesión local y redirige al login.
 * - 403: no cierra sesión; muestra toast con el mensaje del servidor o texto genérico de permisos
 *   (salvo `silent: true`).
 * - 503 (backend o base de datos temporalmente no disponible): NO cierra sesión, NO borra el
 *   JWT y NO redirige al login. Un fallo de infraestructura no invalida el token; se muestra el
 *   error y el usuario puede reintentar. Lo mismo aplica a 500/502/504 y errores de red.
 * - Si entre el envío y la respuesta cambió el token (p. ej. login nuevo tras un 401 tardío de otra petición),
 *   no limpia la sesión actual.
 */
async function extractErrorMessage(res: Response): Promise<string> {
  let msg = 'Error al procesar la solicitud';
  try {
    const ct = res.headers.get('Content-Type') ?? '';
    const clone = res.clone();
    if (ct.includes('application/json')) {
      const j = (await clone.json()) as Record<string, unknown>;
      if (j && typeof j === 'object') {
        if (typeof j.error === 'string') msg = j.error;
        else if (typeof j.message === 'string') msg = j.message;
      }
    } else {
      const t = await clone.text();
      if (t?.trim()) msg = t.slice(0, 200);
    }
  } catch {
    /* ignore */
  }
  return msg;
}

export async function apiFetch(input: RequestInfo | URL, init: ApiFetchInit = {}): Promise<Response> {
  const { silent, ...rest } = init;
  const tokenUsedForRequest = getAuthToken();
  let res: Response;
  try {
    const headersWithAuth = buildAuthHeaders(rest.headers ?? {});
    res = await fetch(input, { ...rest, headers: headersWithAuth });
  } catch (e) {
    if (!silent && e instanceof TypeError) {
      notifyGlobalToast({ message: 'Sin conexión. Revisa tu red o VPN.', variant: 'error' });
    }
    throw e;
  }

  const tokenNow = getAuthToken();
  // Solo forzar logout si esta petición llevaba token y el almacenamiento sigue siendo el mismo.
  // Evita: PATCH offline tras logout (sin Bearer) que responde 401 cuando ya hay otro JWT en localStorage.
  // Un 503/500/502/504 (infraestructura) nunca expira la sesión: ver apiSession.ts.
  if (shouldExpireSession(res.status, tokenUsedForRequest, tokenNow)) {
    // Flujo único de sesión expirada: motivo + evento global + limpieza + redirect.
    expireSession('session_expired');
  }

  if (!silent && res.status === 403) {
    const msg = await extractErrorMessage(res);
    notifyGlobalToast({
      message: msg.trim() ? msg : 'No tienes permiso para esta acción.',
      variant: 'error',
    });
  }

  if (
    !silent &&
    !res.ok &&
    res.status !== 401 &&
    res.status !== 403
  ) {
    const msg = await extractErrorMessage(res);
    notifyGlobalToast({ message: msg, variant: 'error' });
  }

  return res;
}
