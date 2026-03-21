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
  const method = (init.method ?? 'GET').toUpperCase();
  const isReadRequest = method === 'GET' || method === 'HEAD';
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isApiRequest = /\/api(\/|$)/.test(rawUrl);
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

  // En móviles (especialmente iOS en modo standalone) forzamos bypass de caché HTTP
  // para lecturas API y evitamos respuestas antiguas aun con SW actualizado.
  const headersWithAuth = buildAuthHeaders(init.headers ?? {});
  const requestHeaders: HeadersInit = isReadRequest
    ? {
        ...headersWithAuth,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      }
    : headersWithAuth;

  let requestInput: RequestInfo | URL = input;
  if (isReadRequest && isApiRequest) {
    try {
      const parsedUrl = new URL(rawUrl, runtimeOrigin);
      if (!parsedUrl.searchParams.has('_ts')) {
        parsedUrl.searchParams.set('_ts', String(Date.now()));
      }
      requestInput = parsedUrl.toString();
    } catch {
      // Si no podemos parsear URL, seguimos sin busting param.
    }
  }
  const requestInit: RequestInit = {
    ...init,
    headers: requestHeaders,
    ...(isReadRequest ? { cache: 'no-store' as RequestCache } : {}),
  };

  const shouldRetryApiResponse = (res: Response): boolean => {
    if (!isApiRequest || !isReadRequest) return false;
    // 401/403 es el mismo resultado en cualquier host; no reintentar en :3001 (evita ruido en red y consola).
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return false;
      return true;
    }
    const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
    // Si una ruta /api devuelve HTML, normalmente estamos pegando al host equivocado.
    return contentType.includes('text/html');
  };

  const buildFallbackApiUrls = (): string[] => {
    if (typeof window === 'undefined') return [];
    let parsed: URL;
    try {
      parsed = new URL(typeof requestInput === 'string' ? requestInput : requestInput.toString(), runtimeOrigin);
    } catch {
      return [];
    }
    const apiPath = `${parsed.pathname}${parsed.search}`;
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const candidates = [
      `${protocol}//${hostname}:3001${apiPath}`,
      `http://${hostname}:3001${apiPath}`,
      `https://${hostname}:3001${apiPath}`,
    ];
    const primary = parsed.toString();
    return [...new Set(candidates)].filter((url) => url !== primary);
  };

  let res: Response | null = null;
  try {
    res = await fetch(requestInput, requestInit);
  } catch (primaryError) {
    if (!(isApiRequest && isReadRequest)) throw primaryError;
    let lastError: unknown = primaryError;
    const fallbackUrls = buildFallbackApiUrls();
    for (const fallbackUrl of fallbackUrls) {
      try {
        res = await fetch(fallbackUrl, requestInit);
        requestInput = fallbackUrl;
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!res) throw lastError;
  }

  if (!res) {
    throw new Error('No se obtuvo respuesta de red');
  }

  if (shouldRetryApiResponse(res)) {
    const fallbackUrls = buildFallbackApiUrls();
    for (const fallbackUrl of fallbackUrls) {
      try {
        const fallbackRes = await fetch(fallbackUrl, requestInit);
        if (!shouldRetryApiResponse(fallbackRes)) {
          res = fallbackRes;
          requestInput = fallbackUrl;
          break;
        }
        res = fallbackRes;
      } catch {
        // Probar siguiente fallback
      }
    }
  }

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
