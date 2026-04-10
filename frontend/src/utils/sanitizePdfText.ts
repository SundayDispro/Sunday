/**
 * Mitiga caracteres de control / inyección en cadenas pasadas a jsPDF (auditoría npm / uso de texto de usuario).
 */
export function sanitizePdfText(input: string, maxLen = 10000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen);
}
