/**
 * Base URL del backend.
 * - Desarrollo: usa VITE_API_URL si está definido, o cae a localhost:3001.
 * - Producción: si VITE_API_URL no está seteado se usa cadena vacía (mismo origen),
 *   ya que el backend sirve el frontend estático directamente.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string)
  : import.meta.env.DEV
  ? 'http://localhost:3001'
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
