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
