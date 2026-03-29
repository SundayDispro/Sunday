import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Pencil,
  Trash2,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Package,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { API_BASE, buildAuthHeaders } from '../../api';
import { useToast } from '../Toast';
import { useUser } from '../../store/UserContext';
import type {
  CatalogoServicioDef,
  CotizacionApi,
  CotizacionDocsPrefill,
  CotizacionItemInput,
  ItemCarrito,
} from '../../types/cotizacion';
import {
  CATEGORIAS,
  calcularCantidad,
  clampToLimits,
  computeGranFormatoLayout,
  descripcionLineaCarrito,
  findServicioDef,
  getAnchosRolloExp,
  getLimits,
  getPrecioLabel,
  getPrecioUnitario,
  totalCarrito,
  type GranFormatoLayout,
} from '../../lib/cotizador';

const CATEGORIA_KEYS = Object.keys(CATEGORIAS) as string[];

const INPUT =
  'w-full px-3 py-2.5 rounded-monday border border-monday-border bg-white text-[14px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue/35 focus:border-monday-blue transition-shadow';

function selectNumericInputOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

function etiquetaTipo(t: CatalogoServicioDef['tipo']): string {
  switch (t) {
    case 'area':
      return 'm²';
    case 'lineal':
      return 'Lineal';
    case 'unidad':
      return 'Unidad';
    default: {
      const _x: never = t;
      return _x;
    }
  }
}

/** Cotas del esquema en metros (hasta 2 decimales, sin ceros de más). */
function cotaMStr(meters: number): string {
  const v = Math.round(meters * 100) / 100;
  return `${parseFloat(v.toFixed(2))} m`;
}

function cotaNumeroStr(meters: number): string {
  const v = Math.round(meters * 100) / 100;
  return String(parseFloat(v.toFixed(2)));
}

/** Plano tipo cotas: pieza solo contorno, cotas en blanco sobre fondo oscuro; medidas en metros. */
function GranFormatoVistaPrevia({ layout }: { layout: GranFormatoLayout }) {
  const { anchoM, altoM, anchoRolloM, numLienzos, empalmesVerticales, anchosPanelesM } = layout;
  if (anchoM <= 0 || altoM <= 0) {
    return (
      <p className="text-[12px] text-monday-subtext leading-relaxed">
        Indica ancho y alto mayores a 0 para ver el esquema de lienzos y empalmes.
      </p>
    );
  }

  const pieceStroke = '#f8fafc';
  /** Líneas de cota: discretas; texto un poco más claro que la unidad. */
  const dimLine = 'rgba(210, 212, 222, 0.82)';
  const dimText = 'rgba(236, 237, 242, 0.95)';
  const dimUnitFill = 'rgba(165, 170, 188, 0.9)';
  const W = anchoM;
  const H = altoM;
  const base = Math.max(W, H, 0.08);
  const nPanels = Math.max(1, anchosPanelesM.length);
  const minPw = Math.min(...anchosPanelesM);
  /** Lienzo muy alargado: más aire vertical en el viewBox para que al escalar a ancho útil el SVG gane altura en px. */
  const aspectRatio = W / Math.max(H, 1e-6);
  const padAspect =
    aspectRatio > 2.2 ? base * 0.08 * Math.min(3.2, (aspectRatio - 2.2) / 1.8) : 0;
  const leftPad = base * 0.28;
  const topPad = base * 0.26 + padAspect * 0.55;
  const bottomPad =
    base * 0.38 +
    (nPanels > 5 ? base * 0.045 * (nPanels - 5) : 0) +
    padAspect * 0.65;
  const rightPad = base * 0.12;
  const dimGap = base * 0.065;
  const stroke = Math.max(base * 0.0014, 0.0004);
  const dimStroke = Math.max(stroke * 0.75, base * 0.001);
  const strokePiece = stroke * 1.9;
  /** Tipografía integrada: peso 400, número + unidad "m" en tamaño reducido. */
  const fontMain = base * 0.038;
  const fontSmall = base * 0.028;
  /** Muchos tramos estrechos: reduce etiquetas inferiores para evitar solapamiento. */
  const bottomFontMul = Math.min(
    1,
    Math.max(0.4, 4.8 / nPanels, (minPw / W) * nPanels * 0.55),
  );
  const fontSmallPanel = fontSmall * bottomFontMul;
  /** Flechas de cota muy pequeñas (triángulos discretos). */
  const ahMax = base * 0.0078;
  const aw = base * 0.0046;
  const ahTop = Math.min(ahMax, Math.max(stroke * 2, W / 2 - stroke * 3));
  const ahLeft = Math.min(ahMax, Math.max(stroke * 2, H / 2 - stroke * 3));
  const ox = leftPad;
  const oy = topPad;

  const vbW = leftPad + W + rightPad;
  const vbH = topPad + H + bottomPad;

  let xAcc = ox;
  const panelRects = anchosPanelesM.map((pw, i) => {
    const r = { x: xAcc, w: pw, i };
    xAcc += pw;
    return r;
  });

  const ext = dimGap * 0.42;
  const topDimY = oy - dimGap * 1.2;
  const leftDimX = ox - dimGap * 1.22;
  /** Línea de cota inferior por tramo (como el ejemplo: debajo de la pieza). */
  const bottomDimLineY = oy + H + ext * 0.55;
  const bottomLabelY =
    bottomDimLineY + dimGap * 0.52 + fontSmallPanel * 0.45;

  return (
    <div className="rounded-monday border border-monday-border bg-white p-3 shadow-monday-sm">
      <p className="text-[10px] font-semibold text-monday-subtext uppercase tracking-wider mb-1">
        Esquema — vista superior
      </p>
      <p className="text-[10px] text-monday-subtext mb-3 leading-snug">
        Cotas en metros; líneas verticales = empalmes entre avances de {cotaMStr(anchoRolloM)} de ancho útil de
        material.
      </p>

      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full h-auto min-h-[260px] max-h-[min(78vh,620px)] rounded-md border border-white/15 bg-[#0c1222] shadow-inner"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* Fondo del área de dibujo (azul muy oscuro; la pieza es solo contorno) */}
        <rect x={0} y={0} width={vbW} height={vbH} fill="#0c1222" rx={base * 0.012} />

        {/* Empalmes interiores (solo trazo, sin relleno) */}
        {empalmesVerticales > 0 &&
          layout.empalmeXM.map((xm) => (
            <line
              key={xm}
              x1={ox + xm}
              y1={oy}
              x2={ox + xm}
              y2={oy + H}
              stroke={pieceStroke}
              strokeWidth={strokePiece}
            />
          ))}

        {/* Contorno exterior de la pieza (hueco) */}
        <rect x={ox} y={oy} width={W} height={H} fill="none" stroke={pieceStroke} strokeWidth={strokePiece} />

        {/* —— Cota ancho total (arriba): extensiones + línea + flechas hacia dentro —— */}
        <line x1={ox} y1={oy - ext} x2={ox} y2={oy} stroke={dimLine} strokeWidth={dimStroke} />
        <line x1={ox + W} y1={oy - ext} x2={ox + W} y2={oy} stroke={dimLine} strokeWidth={dimStroke} />
        <line
          x1={ox + ahTop}
          y1={topDimY}
          x2={ox + W - ahTop}
          y2={topDimY}
          stroke={dimLine}
          strokeWidth={dimStroke}
        />
        <polygon
          points={`${ox},${topDimY} ${ox + ahTop},${topDimY - aw} ${ox + ahTop},${topDimY + aw}`}
          fill={dimLine}
        />
        <polygon
          points={`${ox + W},${topDimY} ${ox + W - ahTop},${topDimY - aw} ${ox + W - ahTop},${topDimY + aw}`}
          fill={dimLine}
        />
        <text
          x={ox + W / 2}
          y={topDimY - fontMain * 0.28}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <tspan fill={dimText} fontSize={fontMain} fontWeight={400}>
            {cotaNumeroStr(W)}
          </tspan>
          <tspan fill={dimUnitFill} fontSize={fontMain * 0.58} fontWeight={400} dy="0.14em">
            {' '}
            m
          </tspan>
        </text>

        {/* —— Cota alto (izquierda) —— */}
        <line x1={leftDimX} y1={oy} x2={ox} y2={oy} stroke={dimLine} strokeWidth={dimStroke} />
        <line x1={leftDimX} y1={oy + H} x2={ox} y2={oy + H} stroke={dimLine} strokeWidth={dimStroke} />
        <line
          x1={leftDimX}
          y1={oy + ahLeft}
          x2={leftDimX}
          y2={oy + H - ahLeft}
          stroke={dimLine}
          strokeWidth={dimStroke}
        />
        <polygon
          points={`${leftDimX},${oy} ${leftDimX - aw},${oy + ahLeft} ${leftDimX + aw},${oy + ahLeft}`}
          fill={dimLine}
        />
        <polygon
          points={`${leftDimX},${oy + H} ${leftDimX - aw},${oy + H - ahLeft} ${leftDimX + aw},${oy + H - ahLeft}`}
          fill={dimLine}
        />
        <text
          x={leftDimX - fontMain * 0.32}
          y={oy + H / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          transform={`rotate(-90 ${leftDimX - fontMain * 0.32} ${oy + H / 2})`}
        >
          <tspan fill={dimText} fontSize={fontMain} fontWeight={400}>
            {cotaNumeroStr(H)}
          </tspan>
          <tspan fill={dimUnitFill} fontSize={fontMain * 0.58} fontWeight={400} dy="0.14em">
            {' '}
            m
          </tspan>
        </text>

        {/* Cotas por tramo (abajo), una por panel */}
        {panelRects.map((p) => {
          const x1 = p.x;
          const x2 = p.x + p.w;
          const cx = p.x + p.w / 2;
          const ahP = Math.min(ahMax, Math.max(stroke * 2, p.w / 2 - stroke * 3));
          return (
            <g key={`bdim-${p.i}`}>
              <line x1={x1} y1={oy + H} x2={x1} y2={bottomDimLineY} stroke={dimLine} strokeWidth={dimStroke} />
              <line x1={x2} y1={oy + H} x2={x2} y2={bottomDimLineY} stroke={dimLine} strokeWidth={dimStroke} />
              <line
                x1={x1 + ahP}
                y1={bottomDimLineY}
                x2={x2 - ahP}
                y2={bottomDimLineY}
                stroke={dimLine}
                strokeWidth={dimStroke}
              />
              <polygon
                points={`${x1},${bottomDimLineY} ${x1 + ahP},${bottomDimLineY - aw} ${x1 + ahP},${bottomDimLineY + aw}`}
                fill={dimLine}
              />
              <polygon
                points={`${x2},${bottomDimLineY} ${x2 - ahP},${bottomDimLineY - aw} ${x2 - ahP},${bottomDimLineY + aw}`}
                fill={dimLine}
              />
              <text
                x={cx}
                y={bottomLabelY}
                textAnchor="middle"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                <tspan fill={dimText} fontSize={fontSmallPanel} fontWeight={400}>
                  {cotaNumeroStr(p.w)}
                </tspan>
                <tspan fill={dimUnitFill} fontSize={fontSmallPanel * 0.58} fontWeight={400} dy="0.12em">
                  {' '}
                  m
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-monday-subtext">
        <dt>Ancho material</dt>
        <dd className="text-monday-text font-medium tabular-nums text-right">{cotaMStr(anchoRolloM)}</dd>
        <dt>Tramos</dt>
        <dd className="text-monday-text font-medium tabular-nums text-right">{numLienzos}</dd>
        <dt>Empalmes</dt>
        <dd className="text-monday-text font-medium tabular-nums text-right">
          {empalmesVerticales === 0 ? '—' : empalmesVerticales}
        </dd>
      </dl>
    </div>
  );
}

export const CotizacionPage: React.FC = () => {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const canPersist = currentUser?.role !== 'USER';

  const [categoriaActiva, setCategoriaActiva] = useState<string>(
    CATEGORIA_KEYS[0] ?? 'Impresión Gran Formato'
  );
  const [servicioSel, setServicioSel] = useState('');
  const [ancho, setAncho] = useState('1.0');
  const [alto, setAlto] = useState('1.0');
  const [unidades, setUnidades] = useState('1');
  const [anchoRolloExp, setAnchoRolloExp] = useState('1.20');
  const [cart, setCart] = useState<ItemCarrito[]>([]);
  /** Si está definido, «Añadir al carrito» sustituye esa línea en lugar de crear otra. */
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [generando, setGenerando] = useState(false);

  const servicioDef = useMemo(() => (servicioSel ? findServicioDef(servicioSel) : null), [servicioSel]);

  useEffect(() => {
    if (!servicioSel) return;
    const opts = getAnchosRolloExp(servicioSel);
    if (!opts.some((x) => x.val === anchoRolloExp)) {
      setAnchoRolloExp(opts[0]?.val ?? '1.20');
    }
  }, [servicioSel, anchoRolloExp]);

  useEffect(() => {
    if (!editingCartItemId) return;
    const row = cart.find((c) => c.id === editingCartItemId);
    if (!row || row.servicio !== servicioSel) {
      setEditingCartItemId(null);
    }
  }, [servicioSel, editingCartItemId, cart]);

  const limits = servicioDef ? getLimits(servicioDef) : LIM_FALLBACK;

  const w = parseFloat(ancho) || 0;
  const h = parseFloat(alto) || 0;
  const u = parseInt(unidades, 10) || 1;
  const aRollo = parseFloat(anchoRolloExp) || 1.2;

  const calc = useMemo(() => {
    if (!servicioDef) {
      return {
        cant: 0,
        sufijo: 'm²',
        areaLabel: 'Área Calculada',
      };
    }
    return calcularCantidad(servicioDef, {
      ancho: w,
      alto: h,
      unidades: u,
      anchoRolloExp: aRollo,
    });
  }, [servicioDef, w, h, u, aRollo]);

  const granLayout = useMemo(() => {
    if (!servicioDef || servicioDef.tipo !== 'area') return null;
    return computeGranFormatoLayout(w, h, aRollo);
  }, [servicioDef, w, h, aRollo]);

  const pUnitario = servicioSel ? getPrecioUnitario(servicioSel, calc.cant) : 0;
  const subtotalServicio = calc.cant * pUnitario;
  const cartTotal = totalCarrito(cart);

  const agregarAlCarrito = useCallback(() => {
    if (!servicioSel || !servicioDef || calc.cant === 0) return;
    const desc = descripcionLineaCarrito(servicioDef, calc, w, h);
    const snapshot: Pick<
      ItemCarrito,
      'editAncho' | 'editAlto' | 'editUnidades' | 'editAnchoRolloExp'
    > =
      servicioDef.tipo === 'unidad'
        ? { editUnidades: u }
        : {
            editAncho: w,
            editAlto: h,
            editUnidades: u,
            ...(servicioDef.tipo === 'area' ? { editAnchoRolloExp: anchoRolloExp } : {}),
          };
    const line: ItemCarrito = {
      id: editingCartItemId ?? crypto.randomUUID(),
      servicio: servicioSel,
      cant: calc.cant,
      sufijo: calc.sufijo,
      precioUnit: pUnitario,
      total: subtotalServicio,
      desc,
      ...snapshot,
    };
    setCart((prev) => {
      if (editingCartItemId) {
        return prev.map((x) => (x.id === editingCartItemId ? line : x));
      }
      return [...prev, line];
    });
    setEditingCartItemId(null);
    setServicioSel('');
    setAncho('1.0');
    setAlto('1.0');
    setUnidades('1');
  }, [
    servicioSel,
    servicioDef,
    calc,
    w,
    h,
    u,
    anchoRolloExp,
    pUnitario,
    subtotalServicio,
    editingCartItemId,
  ]);

  const beginEditCartItem = useCallback((item: ItemCarrito) => {
    const def = findServicioDef(item.servicio);
    if (!def) return;
    setServicioSel(item.servicio);
    setEditingCartItemId(item.id);
    const lim = getLimits(def);
    if (def.tipo === 'unidad') {
      const n = item.editUnidades ?? item.cant;
      setUnidades(String(clampToLimits(n, lim)));
      setAncho('1.0');
      setAlto('1.0');
      return;
    }
    let ew = item.editAncho;
    let eh = item.editAlto;
    if (ew === undefined || eh === undefined) {
      const m = item.desc.match(/^([\d.]+)\s*m\s*×\s*([\d.]+)\s*m$/i);
      if (m) {
        ew = parseFloat(m[1]);
        eh = parseFloat(m[2]);
      }
    }
    setAncho(String(ew !== undefined ? clampToLimits(ew, lim) : lim.min));
    setAlto(String(eh !== undefined ? clampToLimits(eh, lim) : lim.min));
    setUnidades(String(item.editUnidades ?? 1));
    if (def.tipo === 'area' && item.editAnchoRolloExp) {
      const opts = getAnchosRolloExp(item.servicio);
      if (opts.some((o) => o.val === item.editAnchoRolloExp)) {
        setAnchoRolloExp(item.editAnchoRolloExp);
      }
    }
  }, []);

  const generarCotizacion = useCallback(async () => {
    if (!canPersist || cart.length === 0) return;
    setGenerando(true);
    try {
      const items: CotizacionItemInput[] = cart.map((i) => ({
        servicio: i.servicio,
        cantidad: i.cant,
        sufijo: i.sufijo,
        precioUnit: i.precioUnit,
        total: i.total,
      }));
      const res = await fetch(`${API_BASE}/api/cotizaciones`, {
        method: 'POST',
        headers: {
          ...buildAuthHeaders({ 'Content-Type': 'application/json' }),
        },
        body: JSON.stringify({
          cliente: cliente.trim() || undefined,
          items,
        }),
      });
      const raw = (await res.json().catch(() => null)) as { error?: string } | CotizacionApi | null;
      if (!res.ok) {
        const msg =
          raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string'
            ? raw.error
            : 'No se pudo guardar la cotización';
        toast(msg, 'error');
        return;
      }
      if (!raw || !('folio' in raw) || typeof raw.folio !== 'number') {
        toast('Respuesta del servidor inesperada', 'error');
        return;
      }
      const data = raw as CotizacionApi;
      const doc = new jsPDF();
      let y = 18;
      doc.setFontSize(16);
      doc.text(`Cotización #${data.folio}`, 14, y);
      y += 10;
      doc.setFontSize(11);
      doc.text(`Fecha: ${new Date(data.creadoEn).toLocaleString('es-MX')}`, 14, y);
      y += 7;
      if (data.cliente?.trim()) {
        doc.text(`Cliente: ${data.cliente.trim()}`, 14, y);
        y += 7;
      }
      y += 4;
      doc.setFontSize(10);
      doc.text('Concepto', 14, y);
      doc.text('Cant.', 100, y);
      doc.text('P. unit.', 125, y);
      doc.text('Total', 165, y);
      y += 6;
      doc.line(14, y, 196, y);
      y += 6;
      for (const it of data.items) {
        const line = doc.splitTextToSize(it.servicio, 80);
        doc.text(line, 14, y);
        doc.text(`${it.cantidad} ${it.sufijo}`, 100, y);
        doc.text(`$${it.precioUnit.toFixed(2)}`, 125, y);
        doc.text(`$${it.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, 165, y);
        y += Math.max(6, line.length * 5);
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }
      y += 4;
      doc.line(14, y, 196, y);
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Total: $${data.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        14,
        y
      );
      doc.save(`cotizacion-${data.folio}.pdf`);
      toast(`Cotización #${data.folio} generada`, 'success');

      const docsPayload: CotizacionDocsPrefill = {
        id: crypto.randomUUID(),
        cliente: cliente.trim(),
        folio: data.folio,
        total: data.total,
        creadoEn: data.creadoEn,
        items: cart.map((i) => ({
          servicio: i.servicio,
          cant: i.cant,
          sufijo: i.sufijo,
          precioUnit: i.precioUnit,
          total: i.total,
          desc: i.desc,
        })),
      };
      window.dispatchEvent(new CustomEvent('sunday:cotizacion-to-docs', { detail: docsPayload }));

      setCart([]);
      setCliente('');
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : 'Error al generar cotización', 'error');
    } finally {
      setGenerando(false);
    }
  }, [canPersist, cart, cliente, toast]);

  const serviciosEnCategoria = CATEGORIAS[categoriaActiva] ?? {};

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Encabezado alineado con Facturación / Equipo */}
      <div className="shrink-0 p-6 border-b border-monday-border bg-[var(--monday-surface)]">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <FileText size={22} className="text-monday-blue shrink-0" strokeWidth={2.25} />
          Cotizaciones
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1 max-w-[52rem] leading-relaxed">
          Arma la cotización con precios de catálogo, revisa el carrito y genera el PDF; el folio queda
          registrado en el sistema (mismo flujo operativo que el resto de documentos de Sunday).
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_min(400px,34vw)] min-h-0 overflow-hidden">
        {/* Columna catálogo + ajustes */}
        <div className="min-w-0 min-h-0 overflow-y-auto custom-scrollbar scroll-touch bg-monday-bg/80 p-4 sm:p-5 xl:p-6">
          <div className="max-w-6xl xl:max-w-none mx-auto space-y-7 xl:space-y-8">
            <section aria-labelledby="cot-cat-heading">
              <div className="flex items-center gap-2 mb-3">
                <Package size={16} className="text-monday-blue shrink-0" strokeWidth={2.25} />
                <h2
                  id="cot-cat-heading"
                  className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider"
                >
                  Categoría
                </h2>
              </div>
              <div
                className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-monday-hover/70 border border-monday-border/80 shadow-monday-sm"
                role="tablist"
                aria-label="Categorías de servicio"
              >
                {CATEGORIA_KEYS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={categoriaActiva === cat}
                    onClick={() => {
                      setCategoriaActiva(cat);
                      setServicioSel('');
                      setEditingCartItemId(null);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all min-h-[40px] ${
                      categoriaActiva === cat
                        ? 'bg-white text-monday-text shadow-monday-sm border border-monday-border/60'
                        : 'text-monday-subtext hover:text-monday-text hover:bg-white/70 border border-transparent'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="cot-svc-heading">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-monday-blue shrink-0" strokeWidth={2.25} />
                <h2
                  id="cot-svc-heading"
                  className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider"
                >
                  Servicios
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {Object.entries(serviciosEnCategoria).map(([nombre, def]) => {
                  const selected = servicioSel === nombre;
                  return (
                    <button
                      key={nombre}
                      type="button"
                      onClick={() => setServicioSel(nombre)}
                      className={`text-left rounded-monday border p-3.5 transition-all min-h-[88px] flex flex-col justify-between ${
                        selected
                          ? 'border-monday-blue bg-white shadow-monday-md ring-1 ring-monday-blue/25'
                          : 'border-monday-border bg-white hover:border-monday-blue/35 hover:shadow-monday-sm'
                      }`}
                    >
                      <p className="text-[13px] font-semibold text-monday-text leading-snug">{nombre}</p>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-[12px] font-medium text-monday-blue tabular-nums">
                          {getPrecioLabel(nombre)}
                        </p>
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-monday-pill text-monday-subtext shrink-0">
                          {etiquetaTipo(def.tipo)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {servicioSel && servicioDef && (
              <section
                className="rounded-monday border border-monday-border bg-white shadow-monday-sm overflow-hidden"
                aria-labelledby="cot-config-heading"
              >
                <div className="px-4 py-3 border-b border-monday-border bg-monday-hover/50 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <SlidersHorizontal
                      size={18}
                      className="text-monday-blue shrink-0 mt-0.5"
                      strokeWidth={2.25}
                    />
                    <div className="min-w-0">
                      <h2 id="cot-config-heading" className="text-[14px] font-semibold text-monday-text">
                        {servicioSel}
                      </h2>
                      <p className="text-[12px] text-monday-subtext mt-0.5">
                        Ajusta medidas o cantidad; el subtotal usa la misma escala de precios que el cotizador
                        clásico.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[12px] font-medium text-monday-subtext hover:text-monday-text px-2 py-1 rounded-lg hover:bg-monday-hover transition-colors"
                    onClick={() => {
                      setServicioSel('');
                      setAncho('1.0');
                      setAlto('1.0');
                      setUnidades('1');
                      setEditingCartItemId(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>

                <div className="p-4 sm:p-5 space-y-6">
                  {servicioDef.tipo === 'unidad' ? (
                    <div>
                      <label className="text-[12px] font-semibold text-monday-subtext block mb-2">
                        Cantidad requerida
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="number"
                          min={limits.min}
                          max={limits.max}
                          step={limits.step}
                          value={unidades}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!Number.isFinite(n)) {
                              setUnidades(e.target.value);
                              return;
                            }
                            setUnidades(String(clampToLimits(n, limits)));
                          }}
                          className={`${INPUT} w-32 text-right tabular-nums`}
                        />
                        <span className="text-[12px] font-medium text-monday-subtext">{calc.sufijo}</span>
                      </div>
                      <input
                        type="range"
                        className="w-full mt-3 h-2 rounded-full accent-monday-blue bg-monday-hover"
                        min={limits.min}
                        max={limits.max}
                        step={limits.step}
                        value={clampToLimits(parseFloat(unidades) || limits.min, limits)}
                        onChange={(e) => setUnidades(String(Number(e.target.value)))}
                      />
                    </div>
                  ) : servicioDef.tipo === 'area' ? (
                    <div className="grid lg:grid-cols-2 gap-5 lg:gap-6 items-start">
                      <div className="space-y-5 min-w-0">
                        <div className="grid sm:grid-cols-2 gap-5">
                          <div>
                            <label className="text-[12px] font-semibold text-monday-subtext block mb-2">
                              Ancho (m)
                            </label>
                            <input
                              type="number"
                              min={limits.min}
                              max={limits.max}
                              step={limits.step}
                              value={ancho}
                              onFocus={selectNumericInputOnFocus}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                if (!Number.isFinite(n)) {
                                  setAncho(e.target.value);
                                  return;
                                }
                                setAncho(String(clampToLimits(n, limits)));
                              }}
                              className={`${INPUT} tabular-nums`}
                            />
                            <input
                              type="range"
                              className="w-full mt-2 h-2 rounded-full accent-monday-blue bg-monday-hover"
                              min={limits.min}
                              max={limits.max}
                              step={limits.step}
                              value={clampToLimits(parseFloat(ancho) || limits.min, limits)}
                              onChange={(e) => setAncho(String(Number(e.target.value)))}
                            />
                          </div>
                          <div>
                            <label className="text-[12px] font-semibold text-monday-subtext block mb-2">
                              Alto (m)
                            </label>
                            <input
                              type="number"
                              min={limits.min}
                              max={limits.max}
                              step={limits.step}
                              value={alto}
                              onFocus={selectNumericInputOnFocus}
                              onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                if (!Number.isFinite(n)) {
                                  setAlto(e.target.value);
                                  return;
                                }
                                setAlto(String(clampToLimits(n, limits)));
                              }}
                              className={`${INPUT} tabular-nums`}
                            />
                            <input
                              type="range"
                              className="w-full mt-2 h-2 rounded-full accent-monday-blue bg-monday-hover"
                              min={limits.min}
                              max={limits.max}
                              step={limits.step}
                              value={clampToLimits(parseFloat(alto) || limits.min, limits)}
                              onChange={(e) => setAlto(String(Number(e.target.value)))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[12px] font-semibold text-monday-subtext block mb-2">
                            Formato de material (ancho de rollo)
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {getAnchosRolloExp(servicioSel).map((a) => (
                              <button
                                key={a.val}
                                type="button"
                                onClick={() => setAnchoRolloExp(a.val)}
                                className={`px-3 py-2 rounded-monday text-[12px] font-medium border transition-colors min-h-[40px] ${
                                  anchoRolloExp === a.val
                                    ? 'border-monday-blue bg-monday-blue/10 text-monday-text shadow-monday-sm'
                                    : 'border-monday-border bg-monday-hover/40 text-monday-text hover:bg-monday-hover'
                                }`}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 lg:sticky lg:top-3 self-start">
                        {granLayout ? <GranFormatoVistaPrevia layout={granLayout} /> : null}
                      </div>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label className="text-[12px] font-semibold text-monday-subtext block mb-2">
                          Ancho (m)
                        </label>
                        <input
                          type="number"
                          min={limits.min}
                          max={limits.max}
                          step={limits.step}
                          value={ancho}
                          onFocus={selectNumericInputOnFocus}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!Number.isFinite(n)) {
                              setAncho(e.target.value);
                              return;
                            }
                            setAncho(String(clampToLimits(n, limits)));
                          }}
                          className={`${INPUT} tabular-nums`}
                        />
                        <input
                          type="range"
                          className="w-full mt-2 h-2 rounded-full accent-monday-blue bg-monday-hover"
                          min={limits.min}
                          max={limits.max}
                          step={limits.step}
                          value={clampToLimits(parseFloat(ancho) || limits.min, limits)}
                          onChange={(e) => setAncho(String(Number(e.target.value)))}
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-monday-subtext block mb-2">
                          Alto (m)
                        </label>
                        <input
                          type="number"
                          min={limits.min}
                          max={limits.max}
                          step={limits.step}
                          value={alto}
                          onFocus={selectNumericInputOnFocus}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!Number.isFinite(n)) {
                              setAlto(e.target.value);
                              return;
                            }
                            setAlto(String(clampToLimits(n, limits)));
                          }}
                          className={`${INPUT} tabular-nums`}
                        />
                        <input
                          type="range"
                          className="w-full mt-2 h-2 rounded-full accent-monday-blue bg-monday-hover"
                          min={limits.min}
                          max={limits.max}
                          step={limits.step}
                          value={clampToLimits(parseFloat(alto) || limits.min, limits)}
                          onChange={(e) => setAlto(String(Number(e.target.value)))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-monday border border-monday-border bg-monday-hover/40 p-4">
                    <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
                      {calc.areaLabel}
                    </p>
                    <p className="text-[22px] font-semibold text-monday-text mt-1 tabular-nums">
                      {calc.cant > 0 ? `${calc.cant} ${calc.sufijo}` : '—'}
                    </p>
                    <p className="text-[12px] text-monday-subtext mt-2">
                      Tarifa aplicada:{' '}
                      <span className="font-medium text-monday-text">
                        {pUnitario > 0 ? `$${pUnitario} / ${calc.sufijo}` : '—'}
                      </span>
                    </p>
                    <p className="text-[13px] font-semibold text-monday-blue mt-3 tabular-nums">
                      Subtotal estimado:{' '}
                      {subtotalServicio.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                    </p>
                    <button
                      type="button"
                      disabled={!servicioSel || calc.cant === 0}
                      onClick={agregarAlCarrito}
                      className="mt-4 w-full py-2.5 rounded-monday text-[13px] font-semibold text-white bg-monday-blue hover:bg-monday-blue/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-monday-sm transition-colors"
                    >
                      {editingCartItemId ? 'Guardar cambios' : 'Añadir al carrito'}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Panel carrito — superficie tipo panel lateral Sunday */}
        <aside className="w-full min-h-0 xl:min-w-0 flex flex-col border-t xl:border-t-0 xl:border-l border-monday-border bg-[var(--monday-surface)] shadow-[inset_1px_0_0_0_var(--monday-border)]">
          <div className="px-4 py-3 sm:px-5 border-b border-monday-border bg-monday-hover/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShoppingCart size={18} className="text-monday-blue shrink-0" strokeWidth={2.25} />
              <h2 className="text-[14px] font-semibold text-monday-text truncate">Carrito</h2>
            </div>
            {cart.length > 0 && (
              <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-monday-pill text-monday-subtext shrink-0">
                {cart.length} {cart.length === 1 ? 'línea' : 'líneas'}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar scroll-touch min-h-0 p-4 sm:p-5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 sm:py-20 text-center px-2">
                <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4 shadow-monday-sm">
                  <ShoppingCart size={28} className="text-monday-subtext opacity-70" strokeWidth={1.75} />
                </div>
                <p className="text-[15px] font-medium text-monday-text">Tu carrito está vacío</p>
                <p className="text-[13px] text-monday-subtext mt-1 max-w-[240px] leading-relaxed">
                  Elige un servicio a la izquierda y añade líneas antes de generar el PDF.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {cart.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-monday border bg-white p-3.5 shadow-monday-sm transition-colors ${
                      editingCartItemId === item.id
                        ? 'border-monday-blue ring-1 ring-monday-blue/30'
                        : 'border-monday-border hover:border-monday-blue/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-monday-text leading-snug">{item.servicio}</p>
                        <p className="text-[11px] text-monday-subtext mt-1 leading-relaxed">{item.desc}</p>
                        <p className="text-[11px] text-monday-subtext mt-1.5 tabular-nums">
                          {item.cant} {item.sufijo} × {item.precioUnit.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[13px] font-semibold text-monday-text tabular-nums">
                          {item.total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            aria-label={`Editar ${item.servicio}`}
                            className="p-1.5 rounded-lg text-monday-subtext hover:text-monday-blue hover:bg-monday-blue/10 transition-colors"
                            onClick={() => beginEditCartItem(item)}
                          >
                            <Pencil size={16} strokeWidth={2.25} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Quitar ${item.servicio}`}
                            className="p-1.5 rounded-lg text-monday-subtext hover:text-red-600 hover:bg-red-50 transition-colors"
                            onClick={() => {
                              setCart((c) => c.filter((x) => x.id !== item.id));
                              setEditingCartItemId((id) => (id === item.id ? null : id));
                            }}
                          >
                            <Trash2 size={16} strokeWidth={2.25} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-monday-border p-4 sm:p-5 space-y-4 bg-monday-hover/25">
            <div className="flex justify-between items-end gap-3">
              <span className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wide">
                Total estimado
              </span>
              <span className="text-[24px] font-bold text-monday-text tabular-nums leading-none">
                {cartTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
              </span>
            </div>
            <div>
              <label
                htmlFor="cotizacion-cliente"
                className="text-[12px] font-semibold text-monday-subtext block mb-1.5"
              >
                Cliente (opcional)
              </label>
              <input
                id="cotizacion-cliente"
                type="text"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nombre, empresa o referencia"
                autoComplete="organization"
                className={INPUT}
              />
            </div>
            {!canPersist && (
              <div
                className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200/90 rounded-monday px-3 py-2.5 leading-relaxed"
                role="status"
              >
                <strong className="font-semibold">Solo lectura:</strong> tu rol no guarda cotizaciones en el
                servidor. Un administrador puede asignarte VENTAS, DISEÑO o TALLER para usar folios y PDF.
              </div>
            )}
            <button
              type="button"
              disabled={!canPersist || cart.length === 0 || generando}
              aria-busy={generando}
              onClick={generarCotizacion}
              className="w-full py-3 rounded-monday text-[14px] font-semibold text-white bg-monday-blue hover:bg-monday-blue/92 disabled:opacity-50 disabled:cursor-not-allowed shadow-monday-md transition-colors"
            >
              {generando ? 'Generando PDF…' : 'Generar cotización y PDF'}
            </button>
            {canPersist && (
              <p className="text-[11px] text-monday-subtext text-center leading-relaxed">
                Después de guardar el folio y descargar el PDF, se abre <span className="font-medium text-monday-text">Docs</span>{' '}
                con una cotización editable con estas mismas líneas.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

const LIM_FALLBACK = { min: 0.1, max: 20, step: 0.01 };
