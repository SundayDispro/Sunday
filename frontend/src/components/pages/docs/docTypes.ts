import type { DocType } from '../../../types';

export const DOC_TYPE_OPTIONS: { id: DocType; label: string; title: string }[] = [
  { id: 'text', label: 'Documento de texto', title: 'Nuevo doc' },
  { id: 'sheet', label: 'Hoja', title: 'Nueva hoja' },
  { id: 'cotizacion', label: 'Crear cotización', title: 'Cotización' },
  { id: 'levantamiento', label: 'Levantamiento', title: 'Levantamiento' },
  { id: 'hoja_trabajo', label: 'Hoja de trabajo', title: 'Hoja de trabajo' },
];

export function getDocTypeLabel(type: DocType): string {
  const opt = DOC_TYPE_OPTIONS.find(o => o.id === type);
  return opt?.label ?? type;
}

export function getDocTypeTitle(type: DocType): string {
  const opt = DOC_TYPE_OPTIONS.find(o => o.id === type);
  return opt?.title ?? 'Documento';
}

/** Estructura inicial de content para cotización */
export const COTIZACION_INITIAL = {
  cliente: '',
  fecha: new Date().toISOString().slice(0, 10),
  vigencia: '',
  items: [{ descripcion: '', cantidad: '', precio: '', total: '' }],
  subtotal: '',
  iva: '',
  total: '',
  notas: '',
};

/** Estructura inicial de content para levantamiento */
export const LEVANTAMIENTO_INITIAL = {
  proyecto: '',
  fecha: new Date().toISOString().slice(0, 10),
  direccion: '',
  descripcion: '',
  observaciones: '',
};

/** Estructura inicial de content para hoja de trabajo */
export const HOJA_TRABAJO_INITIAL = {
  titulo: '',
  fecha: new Date().toISOString().slice(0, 10),
  item: '',
  descripcion: '',
  observaciones: '',
};

export const PDF_DOC_TYPES: DocType[] = ['cotizacion', 'levantamiento', 'hoja_trabajo'];

export function isPdfDocType(type: DocType): type is 'cotizacion' | 'levantamiento' | 'hoja_trabajo' {
  return PDF_DOC_TYPES.includes(type);
}

export function getInitialContentForType(type: DocType): Record<string, unknown> {
  switch (type) {
    case 'text':
      return { text: '' };
    case 'sheet':
      return { table: [['']] };
    case 'cotizacion':
      return COTIZACION_INITIAL as unknown as Record<string, unknown>;
    case 'levantamiento':
      return LEVANTAMIENTO_INITIAL as unknown as Record<string, unknown>;
    case 'hoja_trabajo':
      return HOJA_TRABAJO_INITIAL as unknown as Record<string, unknown>;
    default:
      return { text: '' };
  }
}
