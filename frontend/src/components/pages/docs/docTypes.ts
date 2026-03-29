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

/** Estructura inicial de content para cotización. Fecha vacía: el usuario la escribe manualmente. */
export const COTIZACION_INITIAL = {
  cliente: 'DISPRO',
  fecha: '00/00/0000',
  vigencia: '00/00/0000',
  descripcion_corta: 'Breve descripción',
  elemento: 'Elemento / concepto',
  items: [{ descripcion: 'Concepto', cantidad: '1', precio: '0', total: '0' }],
  subtotal: '00.00',
  iva: '00.00',
  total: 'Total : $00,000.00',
  notas: 'Esta cotización no incluye I.V.A.',
};

/** Estructura inicial de content para levantamiento. Fecha vacía: el usuario la escribe manualmente. */
export const LEVANTAMIENTO_INITIAL = {
  proyecto: 'Proyecto',
  fecha: '00/00/0000',
  direccion: 'Dirección',
  descripcion: 'Descripción detallada del proyecto',
  observaciones: 'Descripción detallada del proyecto',
};

/** Estructura inicial de content para hoja de trabajo. Fecha vacía: el usuario la escribe manualmente. */
export const HOJA_TRABAJO_INITIAL = {
  titulo: 'Título',
  fecha: '00/00/0000',
  item: 'Breve descripción',
  descripcion: 'Descripción detallada del proyecto',
  observaciones: 'Descripción detallada del proyecto',
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
      // Hoja nueva: 5 filas x 6 columnas por defecto
      return {
        table: Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => '')),
      };
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

/** Mezcla el contenido inicial del tipo con defaults guardados en el master (API). */
export function mergeInitialPdfContentWithMasterDefaults(
  type: DocType,
  masterDefaults?: Record<string, unknown> | null
): Record<string, unknown> {
  const initial = getInitialContentForType(type) as Record<string, unknown>;
  if (!masterDefaults || typeof masterDefaults !== 'object' || Array.isArray(masterDefaults)) {
    return { ...initial };
  }
  return { ...initial, ...masterDefaults };
}

/** Líneas del cotizador → contenido inicial del doc PDF “cotización” (tabla y totales). */
export function buildCotizacionContentFromCartPrefill(prefill: {
  cliente: string;
  folio?: number;
  total: number;
  creadoEn?: string;
  items: Array<{
    servicio: string;
    cant: number;
    sufijo: string;
    precioUnit: number;
    total: number;
    desc: string;
  }>;
}): Record<string, unknown> {
  const fecha = prefill.creadoEn
    ? new Date(prefill.creadoEn).toLocaleDateString('es-MX')
    : new Date().toLocaleDateString('es-MX');
  const itemsRows = prefill.items.map((i) => ({
    descripcion: [i.servicio, i.desc].filter((s) => s && s.trim()).join(' · '),
    cantidad: `${i.cant} ${i.sufijo}`,
    precio: String(i.precioUnit),
    total: i.total.toFixed(2),
  }));
  const subtotal = prefill.items.reduce((s, i) => s + i.total, 0);
  const base = { ...COTIZACION_INITIAL };
  return {
    ...base,
    cliente: prefill.cliente.trim() || base.cliente,
    fecha,
    folio: prefill.folio != null ? String(prefill.folio) : '',
    descripcion_corta:
      prefill.folio != null ? `Cotización express #${prefill.folio}` : 'Cotización express (cotizador)',
    elemento: prefill.folio != null ? `Cotización #${prefill.folio}` : 'Cotización express',
    items: itemsRows,
    subtotal: subtotal.toFixed(2),
    iva: '00.00',
    total: `Total : ${prefill.total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`,
    notas:
      prefill.folio != null
        ? `Folio ${prefill.folio} registrado en Sunday. Revisa totales antes de enviar al cliente.`
        : 'Generado desde el cotizador Sunday.',
  } as Record<string, unknown>;
}
