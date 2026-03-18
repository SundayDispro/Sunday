/**
 * Base URL del backend.
 * - Desarrollo: vacío = mismo origen (Vite hace proxy de /api y /uploads a 3001).
 *   Así funciona desde PC (localhost:5173) y desde móvil (192.168.x.x:5173).
 * - Si VITE_API_URL está definido, se usa (útil para producción o backend en otra máquina).
 * - Producción sin VITE_API_URL: cadena vacía (mismo origen).
 */
export const API_BASE: string = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string)
  : '';

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
 * - Si recibe 401/403, guarda razón en sessionStorage, limpia sesión local y redirige al login.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headersWithAuth = buildAuthHeaders(init.headers ?? {});
  const res = await fetch(input, { ...init, headers: headersWithAuth });

  // Solo forzar logout/redirección si había un token de sesión válido.
  // Si no hay token (pantalla de login), dejamos que el caller maneje el 401.
  const token = getAuthToken();
  if (token && (res.status === 401 || res.status === 403)) {
    // UX consistente: el Login mostrará un mensaje claro si la sesión expiró.
    try {
      sessionStorage.setItem('logout_reason', 'session_expired');
    } catch {/* ignore */}

    const expMs = decodeJwtExpMs(token);
    const isExpired = expMs != null ? expMs <= Date.now() : true;

    // Provisional: avisar a la UI para que muestre banner/modal antes del redirect.
    try {
      window.dispatchEvent(
        new CustomEvent('session-expired', {
          detail: { reason: 'session_expired', isExpired },
        })
      );
    } catch {/* ignore */}

    clearAuthStorage();
    try {
      const delayMs = isExpired ? 250 : 0;
      setTimeout(() => {
        try { window.location.href = '/'; } catch {/* ignore */}
      }, delayMs);
    } catch {
      // ignore en entornos sin window
    }
  }

  return res;
}
