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

/**
 * Wrapper de fetch que:
 * - Añade automáticamente el header Authorization: Bearer <token> si existe.
 * - Si recibe 401/403, limpia sesión local y redirige al login.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headersWithAuth = buildAuthHeaders(init.headers ?? {});
  const res = await fetch(input, { ...init, headers: headersWithAuth });

  if (res.status === 401 || res.status === 403) {
    clearAuthStorage();
    try {
      // Forzar re-login; ajusta la ruta si usas otra para login
      window.location.href = '/';
    } catch {
      // ignore en entornos sin window
    }
  }

  return res;
}
