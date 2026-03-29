import type { CatalogoServicioDef, EscalaPrecio, ItemCarrito, ServicioTipo, UnidadVariant } from '../types/cotizacion';

const LIM_AREA = { min: 0.1, max: 20, step: 0.01 };
const LIM_LINEAL = { min: 0.1, max: 100, step: 0.1 };
const LIM_UNIT_DEFAULT = { min: 1, max: 1000, step: 1 };
const LIM_TABLOIDE = { min: 1, max: 1000, step: 1 };
const LIM_PLANCHADO = { min: 1, max: 500, step: 1 };
const LIM_MILLARES = { min: 1, max: 20, step: 1 };
const LIM_DISENO = { min: 1, max: 30, step: 1 };

/**
 * Mismo contenido económico y nombres que `CotizadorModule.jsx` (Dispro OS).
 * Cada servicio declara `tipo` y variantes de unidad sin heurísticas por string.
 */
export const CATEGORIAS: Record<string, Record<string, CatalogoServicioDef>> = {
  'Impresión Gran Formato': {
    'Lona impresa': { escalas: [{ l: 0, p: 100 }], tipo: 'area', limits: LIM_AREA },
    'Vinil impreso': {
      escalas: [
        { l: 25, p: 120 },
        { l: 10, p: 130 },
        { l: 5, p: 140 },
        { l: 0, p: 150 },
      ],
      tipo: 'area',
      limits: LIM_AREA,
    },
    'Vinil transparente': {
      escalas: [
        { l: 25, p: 120 },
        { l: 10, p: 130 },
        { l: 5, p: 140 },
        { l: 0, p: 150 },
      ],
      tipo: 'area',
      limits: LIM_AREA,
    },
    Microperforado: {
      escalas: [
        { l: 25, p: 100 },
        { l: 10, p: 140 },
        { l: 5, p: 160 },
        { l: 0, p: 180 },
      ],
      tipo: 'area',
      limits: LIM_AREA,
    },
    'DTF UV impreso': { escalas: [{ l: 0, p: 300 }], tipo: 'lineal', limits: LIM_LINEAL },
    'DTF Textil': { escalas: [{ l: 0, p: 350 }], tipo: 'lineal', limits: LIM_LINEAL },
  },
  'Corte de Vinil': {
    'Corte sencillo': { escalas: [{ l: 0, p: 50 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Corte a detalle': { escalas: [{ l: 0, p: 100 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Transfer (por metro)': { escalas: [{ l: 0, p: 30 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Depilado sencillo': { escalas: [{ l: 0, p: 30 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Depilado a detalle': { escalas: [{ l: 0, p: 50 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Textil - Corte sencillo': { escalas: [{ l: 0, p: 200 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Textil - Corte a detalle': { escalas: [{ l: 0, p: 300 }], tipo: 'lineal', limits: LIM_LINEAL },
    'Planchado (por pieza)': {
      escalas: [{ l: 0, p: 25 }],
      tipo: 'unidad',
      unidadVariant: 'pzas',
      limits: LIM_PLANCHADO,
    },
  },
  'Imprenta y Servicios': {
    'Tabloide impreso': {
      escalas: [{ l: 0, p: 10 }],
      tipo: 'unidad',
      unidadVariant: 'pzas',
      limits: LIM_TABLOIDE,
    },
    'Volantes (millar)': {
      escalas: [{ l: 0, p: 650 }],
      tipo: 'unidad',
      unidadVariant: 'millares',
      limits: LIM_MILLARES,
    },
    'Tarjetas (millar)': {
      escalas: [{ l: 0, p: 450 }],
      tipo: 'unidad',
      unidadVariant: 'millares',
      limits: LIM_MILLARES,
    },
    'Bordado (millar puntadas)': {
      escalas: [{ l: 0, p: 5 }],
      tipo: 'unidad',
      unidadVariant: 'millares',
      limits: LIM_MILLARES,
    },
    'Diseño (por hora)': {
      escalas: [{ l: 0, p: 250 }],
      tipo: 'unidad',
      unidadVariant: 'horas',
      limits: LIM_DISENO,
    },
  },
};

export type AnchoRolloOption = { val: string; label: string };

/** Anchos de rollo disponibles según el material (misma lógica que Dispro). */
export function getAnchosRolloExp(servicioNombre: string): AnchoRolloOption[] {
  const s = servicioNombre.toLowerCase();
  if (s.includes('lona') || s.includes('microperforado')) {
    return [
      { val: '1.20', label: '1.20 m' },
      { val: '2.50', label: '2.50 m' },
      { val: '3.20', label: '3.20 m' },
    ];
  }
  if (s.includes('vinil')) {
    return [
      { val: '1.27', label: '1.27 m' },
      { val: '1.52', label: '1.52 m' },
    ];
  }
  return [{ val: '1.20', label: '1.20 m' }];
}

/** Busca la definición de un servicio por nombre en todas las categorías. */
export function findServicioDef(servicioNombre: string): CatalogoServicioDef | null {
  for (const cat of Object.values(CATEGORIAS)) {
    const def = cat[servicioNombre];
    if (def) return def;
  }
  return null;
}

function getEscalasForNombre(mat: string): EscalaPrecio[] | null {
  const def = findServicioDef(mat);
  return def?.escalas ?? null;
}

/** Precio unitario según cantidad y escalas (misma lógica que Dispro). */
export function getPrecioUnitario(material: string, qty: number): number {
  if (!material) return 0;
  const escalas = getEscalasForNombre(material);
  if (!escalas?.length) return 0;
  for (const esc of escalas) {
    if (qty >= esc.l) return esc.p;
  }
  return escalas[escalas.length - 1].p;
}

/** Etiqueta de precio para la tarjeta de servicio. */
export function getPrecioLabel(material: string): string {
  if (!material) return '';
  const escalas = getEscalasForNombre(material);
  if (!escalas?.length) return '';
  if (escalas.length === 1) return `$${escalas[0].p}`;
  const min = escalas[escalas.length - 1].p;
  const max = escalas[0].p;
  return `desde $${max}`;
}

/** Límites de controles para el servicio seleccionado. */
export function getLimits(def: CatalogoServicioDef): { min: number; max: number; step: number } {
  return def.limits;
}

function sufijoForUnidad(variant: UnidadVariant | undefined): string {
  if (variant === 'horas') return 'horas';
  if (variant === 'millares') return 'millares';
  return 'pzas';
}

export type CalculoCantidadResult = {
  cant: number;
  sufijo: string;
  numLienzos?: number;
  areaLabel: string;
};

export type CalculoInputs = {
  ancho: number;
  alto: number;
  unidades: number;
  anchoRolloExp: number;
};

/**
 * Calcula cantidad facturable y sufijo (m², m, pzas, horas, millares) como en Dispro.
 */
export function calcularCantidad(def: CatalogoServicioDef, inputs: CalculoInputs): CalculoCantidadResult {
  const { ancho: w, alto: h, unidades: u, anchoRolloExp: aRollo } = inputs;

  if (def.tipo === 'unidad') {
    const cant = Math.max(0, Math.round(u));
    const suf = sufijoForUnidad(def.unidadVariant);
    return { cant, sufijo: suf, areaLabel: 'Cantidad Requerida' };
  }

  if (def.tipo === 'lineal') {
    const cant = Math.ceil(Math.max(w, h));
    return { cant, sufijo: 'm', areaLabel: 'Metros Lineales' };
  }

  const numLienzos = Math.ceil(w / aRollo);
  const cant = Math.ceil(numLienzos * aRollo * h);
  return {
    cant,
    sufijo: 'm²',
    numLienzos,
    areaLabel: 'Área Calculada',
  };
}

/** Vista previa de empalmes (costuras entre lienzos) para impresión por área / gran formato. */
export type GranFormatoLayout = {
  anchoM: number;
  altoM: number;
  anchoRolloM: number;
  /** Cantidad de lienzos a lo ancho (ceil(ancho / anchoRollo)). */
  numLienzos: number;
  /** Empalmes verticales entre lienzos (0 si cabe en un solo lienzo). */
  empalmesVerticales: number;
  /** Posición X en metros de cada empalme (entre lienzo i e i+1). */
  empalmeXM: number[];
  /** Ancho en metros de cada tramo (último puede ser retazo < ancho de rollo). */
  anchosPanelesM: number[];
};

/**
 * Calcula lienzos y empalmes según el mismo criterio que el área facturable (tiras de ancho de rollo × alto).
 */
export function computeGranFormatoLayout(anchoM: number, altoM: number, anchoRolloM: number): GranFormatoLayout {
  const w = Math.max(0, anchoM);
  const h = Math.max(0, altoM);
  const roll = Math.max(0.01, anchoRolloM);
  const numLienzos = w > 0 ? Math.ceil(w / roll) : 0;
  const empalmesVerticales = Math.max(0, numLienzos - 1);
  const empalmeXM: number[] = [];
  const anchosPanelesM: number[] = [];
  for (let i = 0; i < numLienzos; i++) {
    const left = i * roll;
    const right = Math.min((i + 1) * roll, w);
    if (left >= w - 1e-9) break;
    anchosPanelesM.push(Math.max(0, right - left));
  }
  for (let i = 1; i < numLienzos; i++) {
    const x = i * roll;
    if (x < w - 1e-9) empalmeXM.push(x);
  }
  return {
    anchoM: w,
    altoM: h,
    anchoRolloM: roll,
    numLienzos,
    empalmesVerticales,
    empalmeXM,
    anchosPanelesM,
  };
}

/** Ajusta un valor numérico a los límites del servicio. */
export function clampToLimits(value: number, limits: { min: number; max: number; step: number }): number {
  const v = Math.min(limits.max, Math.max(limits.min, value));
  if (limits.step >= 1) return Math.round(v);
  const steps = Math.round((v - limits.min) / limits.step);
  const snapped = limits.min + steps * limits.step;
  const clamped = Math.min(limits.max, Math.max(limits.min, snapped));
  const inv = 1 / limits.step;
  if (Number.isFinite(inv) && inv > 0 && Math.abs(inv - Math.round(inv)) < 1e-9) {
    return Math.round(clamped * inv) / inv;
  }
  return Math.round(clamped * 1000) / 1000;
}

/** Descripción de línea en carrito: dimensiones o cantidad con sufijo. */
export function descripcionLineaCarrito(
  def: CatalogoServicioDef,
  calc: CalculoCantidadResult,
  ancho: number,
  alto: number,
): string {
  if (def.tipo === 'unidad') {
    return `${calc.cant} ${calc.sufijo}`;
  }
  return `${ancho}m × ${alto}m`;
}

/** Suma del carrito. */
export function totalCarrito(cart: ItemCarrito[]): number {
  return cart.reduce((s, i) => s + i.total, 0);
}
