/**
 * Configuración de campos por tipo de plantilla PDF.
 * Posiciones por defecto en 0-1 (origen arriba-izquierda), derivadas de backend/templatePdfGenerator TEMPLATE_FIELD_POSITIONS.
 * A4: 595x842 pts -> x% = x/595, y% = 1 - y/842
 */
export type PdfDocType = 'cotizacion' | 'levantamiento' | 'hoja_trabajo';

export interface FieldDef {
  key: string;
  label: string;
  /** Posición por defecto (0-1), esquina superior izquierda del cuadro */
  defaultX: number;
  defaultY: number;
  /** Tamaño del cuadro en fracción de página (0-1) */
  width: number;
  height: number;
  /** Tipo de input */
  inputType?: 'text' | 'date' | 'textarea';
}

const A4_W = 595;
const A4_H = 842;
function pct(xPts: number, yPts: number) {
  return { x: xPts / A4_W, y: 1 - yPts / A4_H };
}

export const PDF_FIELDS: Record<PdfDocType, FieldDef[]> = {
  cotizacion: [
    { key: 'cliente', label: 'Cliente', ...pct(80, 700), width: 0.35, height: 0.04, inputType: 'text' },
    { key: 'fecha', label: 'Fecha', ...pct(450, 700), width: 0.2, height: 0.04, inputType: 'date' },
    { key: 'vigencia', label: 'Vigencia', ...pct(80, 670), width: 0.5, height: 0.04, inputType: 'text' },
    { key: 'subtotal', label: 'Subtotal', ...pct(400, 200), width: 0.15, height: 0.04, inputType: 'text' },
    { key: 'iva', label: 'IVA', ...pct(400, 180), width: 0.15, height: 0.04, inputType: 'text' },
    { key: 'total', label: 'Total', ...pct(400, 160), width: 0.15, height: 0.04, inputType: 'text' },
    { key: 'notas', label: 'Notas', ...pct(80, 130), width: 0.75, height: 0.12, inputType: 'textarea' },
  ],
  levantamiento: [
    { key: 'proyecto', label: 'Proyecto', ...pct(80, 700), width: 0.35, height: 0.04, inputType: 'text' },
    { key: 'fecha', label: 'Fecha', ...pct(450, 700), width: 0.2, height: 0.04, inputType: 'date' },
    { key: 'direccion', label: 'Dirección', ...pct(80, 660), width: 0.75, height: 0.04, inputType: 'text' },
    { key: 'descripcion', label: 'Descripción', ...pct(80, 600), width: 0.75, height: 0.15, inputType: 'textarea' },
    { key: 'observaciones', label: 'Observaciones', ...pct(80, 400), width: 0.75, height: 0.2, inputType: 'textarea' },
  ],
  hoja_trabajo: [
    { key: 'titulo', label: 'Título', ...pct(80, 700), width: 0.35, height: 0.04, inputType: 'text' },
    { key: 'fecha', label: 'Fecha', ...pct(450, 700), width: 0.2, height: 0.04, inputType: 'date' },
    { key: 'item', label: 'Ítem / Referencia', ...pct(80, 660), width: 0.5, height: 0.04, inputType: 'text' },
    { key: 'descripcion', label: 'Descripción', ...pct(80, 600), width: 0.75, height: 0.15, inputType: 'textarea' },
    { key: 'observaciones', label: 'Observaciones', ...pct(80, 400), width: 0.75, height: 0.2, inputType: 'textarea' },
  ],
};

export interface FieldPositionState {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export function getFieldPositions(
  value: Record<string, unknown>,
  docType: PdfDocType
): Record<string, FieldPositionState> {
  const raw = value.fieldPositions;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, FieldPositionState> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'object' && typeof (v as { x?: number }).x === 'number' && typeof (v as { y?: number }).y === 'number') {
        out[k] = { x: (v as { x: number }).x, y: (v as { y: number }).y };
      }
    }
    return out;
  }
  return {};
}

export function getPositionForField(
  fieldKey: string,
  value: Record<string, unknown>,
  docType: PdfDocType,
  fieldDef: FieldDef
): { x: number; y: number; width: number; height: number } {
  const positions = getFieldPositions(value, docType);
  const pos = positions[fieldKey];
  return {
    x: pos?.x ?? fieldDef.defaultX,
    y: pos?.y ?? fieldDef.defaultY,
    width: fieldDef.width,
    height: fieldDef.height,
  };
}
