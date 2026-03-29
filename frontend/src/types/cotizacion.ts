/** Escala de precio por volumen (misma semántica que Dispro: `l` = umbral mínimo de cantidad). */
export type EscalaPrecio = { l: number; p: number };

export type ServicioTipo = 'area' | 'lineal' | 'unidad';

export type UnidadVariant = 'pzas' | 'horas' | 'millares';

/** Definición de un servicio en el catálogo (precios y reglas de cálculo). */
export type CatalogoServicioDef = {
  escalas: EscalaPrecio[];
  tipo: ServicioTipo;
  /** Solo aplica si `tipo === 'unidad'`. */
  unidadVariant?: UnidadVariant;
  limits: { min: number; max: number; step: number };
};

export type ItemCarrito = {
  id: string;
  servicio: string;
  cant: number;
  sufijo: string;
  precioUnit: number;
  total: number;
  desc: string;
  /** Medidas/cantidad al añadir la línea (para reabrir el formulario al editar). */
  editAncho?: number;
  editAlto?: number;
  editUnidades?: number;
  editAnchoRolloExp?: string;
};

export type CotizacionItemInput = {
  servicio: string;
  cantidad: number;
  sufijo: string;
  precioUnit: number;
  total: number;
};

export type PostCotizacionBody = {
  cliente?: string;
  items: CotizacionItemInput[];
};

export type CotizacionApiItem = {
  id: string;
  cotizacionId: string;
  servicio: string;
  cantidad: number;
  sufijo: string;
  precioUnit: number;
  total: number;
};

export type CotizacionApi = {
  id: string;
  folio: number;
  creadoPorId: string;
  cliente: string | null;
  total: number;
  creadoEn: string;
  pdfUrl: string | null;
  items: CotizacionApiItem[];
};

/** Respuesta de listado GET /api/cotizaciones. */
export type CotizacionListRow = CotizacionApi & {
  creadoPorNombre: string;
};

/** Payload para abrir Docs → cotización con líneas ya armadas (evento `sunday:cotizacion-to-docs`). */
export type CotizacionDocsPrefill = {
  id: string;
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
};
