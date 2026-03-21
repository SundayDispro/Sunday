import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Plus, Trash2, Type, Save, Maximize2, Upload, Loader2, Pencil, ImageIcon } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  type PdfDocType,
  type TemplateConfigState,
  type CustomBoxDef,
} from './pdfTemplateConfig';
import { WordLikeImageHandles, type WordImageHandleKind } from './WordLikeImageHandles';
import { TextFormatBarForTemplate } from '../../docs/TextFormatBar';
import { useUser } from '../../../store/UserContext';
import { apiFetch } from '../../../api';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

/** 96 DPI: 612pt = 816px, 792pt = 1056px. Misma escala que el PDF generado (Puppeteer). */
export const PAGE_WIDTH_PX_96DPI = 816;
export const PAGE_HEIGHT_PX_96DPI = 1056;
const PDF_SCALE = 96 / 72;

GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface Props {
  docType: PdfDocType;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  docId: string;
  templateConfig?: TemplateConfigState | null;
  isAdmin?: boolean;
  onTemplateConfigChange?: (config: TemplateConfigState) => void;
  /** Señal al padre: caja enfocada y su geometría (porcentajes del canvas). */
  onActiveBoxChange?: (payload: ActiveBoxChangePayload) => void;
  /** Si true: no renderiza TextFormatBarForTemplate dentro del editor. */
  renderFormatBarExternally?: boolean;
  /** Scale override (PR2) para Focus Mode. Si es null/undefined, se calcula auto-fit. */
  focusZoomScale?: number | null;
  /** Exponer el contenedor con `overflow: auto` para auto-scroll/zoom desde el padre (PR2). */
  onScrollContainerReady?: (el: HTMLDivElement | null) => void;
  /** m5: oculta el PDF de fondo (rejilla + wireframe) para scroll más fluido en móvil. */
  blueprintMode?: boolean;
  /** m5: doble clic en el lienzo vacío (fuera de cajas), p. ej. quitar zoom de focus mode. */
  onCanvasDoubleTap?: () => void;
  /** m5: `touch-action: pan-y` en el lienzo (focus mode / gestos). */
  canvasTouchPanY?: boolean;
  onSaveTemplateConfig?: (configOverride?: TemplateConfigState) => void | Promise<void>;
  savingTemplateConfig?: boolean;
  /** Solo visualización: sin barra de formato, sin menú admin y cuadros de solo lectura */
  viewerOnly?: boolean;
  /** Habilita mover/redimensionar/eliminar cuadros (sin afectar edición de texto). */
  allowBoxEditing?: boolean;
  /** Muestra un outline tenue cuando el cuadro está bloqueado (allowBoxEditing=false). */
  lockedOutline?: boolean;
  /** Minimiza padding del contenedor para aprovechar más pantalla en móvil. */
  compactPadding?: boolean;
  /** URL de plantilla PDF (cuando la proporciona el padre, no se hace fetch interno). */
  templatePdfUrlProp?: string | null;
  /** Llamado cuando el preview está listo para captura PDF (canvas + overlays). */
  onExportReady?: () => void;
  /** Escala de píxeles para export (ej. 3.125 = 300 DPI). Canvas y overlays se dibujan a 816*scale × 1056*scale. */
  exportPixelScale?: number;
}

/** Relación de aspecto US Letter (612×792). */
export const PAGE_ASPECT = 612 / 792;

/** Devuelve el texto de placeholder sugerido según el campo semántico del cuadro. */
function getSemanticPlaceholder(box: import('./pdfTemplateConfig').CustomBoxDef): string {
  const key = box.fieldKey ?? (box.semantic === 'folio' ? 'folio' : box.semantic === 'element' ? 'elemento' : '');
  switch (key) {
    case 'cliente':       return 'Nombre del cliente';
    case 'folio':         return '0000';
    case 'fecha':         return '00/00/0000';
    case 'descripcion_corta':
    case 'vigencia':
    case 'item':          return 'Breve descripción';
    case 'elemento':      return 'Elemento / concepto';
    case 'descripcion_larga':
    case 'descripcion':
    case 'observaciones': return 'Descripción detallada del proyecto';
    case 'total':         return 'Total : $00,000.00';
    case 'nota_iva':
    case 'notas':         return 'Esta cotización no incluye I.V.A.';
    default:
      return box.singleLine ? 'Texto (una línea)' : 'Texto (varios renglones)';
  }
}

/** Valor guardado en el doc (DD/MM/YYYY, ISO o vacío) → yyyy-mm-dd para input[type=date]. */
function fechaDraftToIso(s: string): string {
  const t = String(s).trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  return '';
}

/** yyyy-mm-dd → DD/MM/YYYY (alineado con formatDateForPdf del backend). */
function isoToFechaDraft(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function placeCaretAtEnd(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

type ActiveBoxKind = 'text' | 'image';
type ActiveBoxGeomPct = { xPct: number; yPct: number; wPct: number; hPct: number };
type ActiveBoxChangePayload =
  | ({ boxId: string; boxKind: ActiveBoxKind } & ActiveBoxGeomPct)
  | { boxId: null };

const DEFAULT_TEMPLATE_CONFIG: TemplateConfigState = {
  fieldPositions: {},
  fontColor: '#000000',
  // Fuente base de las cotizaciones: Averta Std (coincide con backend/PDF).
  fontFamily: 'Averta Std',
  fontSize: 11,
  fontBold: false,
  fontItalic: false,
  customBoxes: [],
};

export const PdfTemplateEditor: React.FC<Props> = ({
  docType,
  value,
  onChange,
  docId,
  templateConfig = null,
  isAdmin = false,
  onTemplateConfigChange,
  onActiveBoxChange,
  renderFormatBarExternally = false,
  focusZoomScale = null,
  onScrollContainerReady,
  blueprintMode = false,
  onCanvasDoubleTap,
  canvasTouchPanY = false,
  onSaveTemplateConfig,
  savingTemplateConfig = false,
  viewerOnly = false,
  allowBoxEditing = true,
  lockedOutline = false,
  compactPadding = false,
  templatePdfUrlProp = null,
  onExportReady,
  exportPixelScale,
}) => {
  const { currentUser } = useUser();
  const [templatePdfUrlInternal, setTemplatePdfUrlInternal] = useState<string | null>(null);
  const templatePdfUrl = templatePdfUrlProp ?? templatePdfUrlInternal;
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  /** UI tipo Word iOS solo en puntero grueso (touch); en mouse desktop usamos agarres clásicos. */
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [templatePdfWaitedTooLong, setTemplatePdfWaitedTooLong] = useState(false);
  const pixelScale = exportPixelScale ?? 1;
  const PAGE_WIDTH_PX = Math.round(PAGE_WIDTH_PX_96DPI * pixelScale);
  const PAGE_HEIGHT_PX = Math.round(PAGE_HEIGHT_PX_96DPI * pixelScale);
  const [dragging, setDragging] = useState<{
    fieldKey: string;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    clampW: number;
    clampH: number;
  } | null>(null);
  const [dragCandidate, setDragCandidate] = useState<{
    fieldKey: string;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    clampW: number;
    clampH: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const skipNextBoxClickRef = useRef(false);
  type ResizeAxis = 'e' | 's' | 'se';
  const [resizing, setResizing] = useState<{
    boxId: string;
    pointerId: number;
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ width: number; height: number } | null>(null);
  const [pinching, setPinching] = useState<{
    boxId: string;
    pointerIds: [number, number];
    startDistancePx: number;
    startW: number;
    startH: number;
    startCx: number;
    startCy: number;
  } | null>(null);
  const [pinchPreview, setPinchPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const pinchPreviewRef = useRef(pinchPreview);
  useEffect(() => {
    pinchPreviewRef.current = pinchPreview;
  }, [pinchPreview]);
  const activeImagePointersRef = useRef<{
    boxId: string | null;
    pointers: Map<number, { x: number; y: number }>;
  }>({ boxId: null, pointers: new Map() });

  /** Redimensionar / rotar imagen con marcas estilo Word (sustituye pinch en imágenes). */
  type WordImageGestureState = {
    boxId: string;
    kind: WordImageHandleKind;
    pointerId: number;
    startX: number;
    startY: number;
    start: { x: number; y: number; w: number; h: number; rotationDeg: number };
    centerX: number;
    centerY: number;
    startPointerAngle: number;
  };
  const [wordImageGesture, setWordImageGesture] = useState<WordImageGestureState | null>(null);
  const [wordImagePreview, setWordImagePreview] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    rotationDeg: number;
  } | null>(null);
  const wordImageLiveRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    rotationDeg: number;
  } | null>(null);

  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const prevSelectedBoxIdRef = useRef<string | null>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageDialogMode, setImageDialogMode] = useState<'add' | 'edit'>('add');
  const [imageDialogBoxId, setImageDialogBoxId] = useState<string | null>(null);
  const [imageDialogUrl, setImageDialogUrl] = useState('');
  const [imageDialogUploading, setImageDialogUploading] = useState(false);
  const [imageDialogError, setImageDialogError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  /** Lienzo vacío (capa bajo las cajas): doble toque táctil = reset zoom (m7 / iOS). */
  const canvasOverlayRef = useRef<HTMLDivElement | null>(null);
  const onCanvasDoubleTapRef = useRef(onCanvasDoubleTap);
  onCanvasDoubleTapRef.current = onCanvasDoubleTap;
  const lastCanvasTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const DRAG_START_THRESHOLD_PX = 7;
  const PINCH_MIN_W_PCT = 0.08;
  const PINCH_MAX_W_PCT = 0.95;
  const PINCH_MIN_H_PCT = 0.04;
  const PINCH_MAX_H_PCT = 0.9;

  const update = useCallback(
    (updates: Record<string, unknown>) => onChange({ ...value, ...updates }),
    [value, onChange]
  );

  const effectiveConfig = templateConfig ?? DEFAULT_TEMPLATE_CONFIG;
  // Fallback: si la config de la API no tiene cajas pero el documento sí (guardadas en content), usarlas para que todos los roles vean igual
  const configBoxes = effectiveConfig.customBoxes ?? [];
  const valueBoxes = Array.isArray(value.customBoxes) ? value.customBoxes : [];
  const customBoxes = configBoxes.length > 0 ? configBoxes : valueBoxes;
  const fontColor = effectiveConfig.fontColor ?? '#000000';
  const fontFamily = effectiveConfig.fontFamily ?? 'Helvetica';
  const fontSize = effectiveConfig.fontSize ?? 11;
  const fontBold = effectiveConfig.fontBold ?? false;
  const fontItalic = effectiveConfig.fontItalic ?? false;

  // Cargar URL de plantilla PDF para usarla como fondo (solo si el padre no pasa templatePdfUrlProp)
  useEffect(() => {
    if (templatePdfUrlProp != null) return;
    let revoked = false;
    let objectUrl: string | null = null;
    apiFetch(`${API_BASE}/api/templates/${docType}?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) {
          setTemplatePdfUrlInternal(null);
          return;
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setTemplatePdfUrlInternal(objectUrl);
      })
      .catch(() => setTemplatePdfUrlInternal(null));
    return () => {
      revoked = true;
      if (objectUrl) {
        const url = objectUrl;
        objectUrl = null;
        setTimeout(() => URL.revokeObjectURL(url), 500);
      }
    };
  }, [docType, templatePdfUrlProp, viewerOnly]);

  // Placeholder premium mientras el viewerOnly espera a que el padre cargue la plantilla.
  useEffect(() => {
    if (!viewerOnly) return;
    if (templatePdfUrlProp != null) return;
    setTemplatePdfWaitedTooLong(false);
    const t = window.setTimeout(() => setTemplatePdfWaitedTooLong(true), 900);
    return () => window.clearTimeout(t);
  }, [viewerOnly, templatePdfUrlProp, docType]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
  const editableRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const vibrate = useCallback((ms: number) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (exportPixelScale) return;
    // PR2: si el padre fija zoom, no recalculamos auto-fit por resize.
    if (focusZoomScale != null) return;
    const el = wrapperRef.current;
    if (!el) return;
    const calcScale = () => {
      if (!wrapperRef.current) return;
      const baseW = PAGE_WIDTH_PX_96DPI;
      const available = wrapperRef.current.clientWidth ?? 0;
      const raw = available > 0 ? available / baseW : 1;
      setScale(Math.max(0.25, Math.min(1, raw)));
    };
    calcScale();
    const ro = new ResizeObserver(calcScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [exportPixelScale, focusZoomScale]);

  useEffect(() => {
    // PR2: aplicar override si existe.
    if (exportPixelScale) return;
    if (focusZoomScale == null) return;
    const next = Math.max(0.25, Math.min(1, focusZoomScale));
    setScale(next);
  }, [focusZoomScale, exportPixelScale]);

  useEffect(() => {
    if (blueprintMode) {
      setPdfRenderError(null);
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, c.width || 0, c.height || 0);
      }
      return;
    }
    if (!templatePdfUrl || !canvasRef.current) {
      setPdfRenderError(null);
      return;
    }
    let cancelled = false;
    setPdfRenderError(null);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const load = async () => {
      try {
        const loadingTask = getDocument({ url: templatePdfUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: PDF_SCALE * pixelScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvasContext: ctx,
          viewport,
          intent: 'display',
        }).promise;
        if (cancelled) return;
        setPdfRenderError(null);
        if (onExportReady) {
          const done = () => {
            if (cancelled) return;
            setTimeout(() => onExportReady(), 150);
          };
          if (typeof document !== 'undefined' && document.fonts?.ready) {
            document.fonts.ready.then(done).catch(done);
          } else {
            setTimeout(done, 250);
          }
        }
      } catch (e) {
        if (!cancelled) setPdfRenderError(e instanceof Error ? e.message : 'Error al cargar PDF');
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [templatePdfUrl, onExportReady, pixelScale, blueprintMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setCoarsePointer(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const el = canvasOverlayRef.current;
    if (!el || viewerOnly || exportPixelScale) return;
    const DOUBLE_MS = 380;
    const MAX_D_PX = 48;
    const handler = (e: TouchEvent) => {
      const cb = onCanvasDoubleTapRef.current;
      if (!cb) return;
      if (e.target !== e.currentTarget) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const now = Date.now();
      const last = lastCanvasTapRef.current;
      if (last && now - last.t < DOUBLE_MS) {
        const dx = touch.clientX - last.x;
        const dy = touch.clientY - last.y;
        if (dx * dx + dy * dy <= MAX_D_PX * MAX_D_PX) {
          lastCanvasTapRef.current = null;
          e.preventDefault();
          cb();
          return;
        }
      }
      lastCanvasTapRef.current = { t: now, x: touch.clientX, y: touch.clientY };
    };
    el.addEventListener('touchend', handler, { passive: false });
    return () => el.removeEventListener('touchend', handler);
  }, [viewerOnly, exportPixelScale]);

  const handleCustomBoxPointerDown = useCallback((e: React.PointerEvent, box: CustomBoxDef) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    vibrate(8);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    setSelectedBoxId(box.id);
    const bw = typeof box.width === 'number' ? box.width : box.kind === 'image' ? 0.3 : 0.1;
    const bh = typeof box.height === 'number' ? box.height : box.kind === 'image' ? 0.15 : 0.04;

    onActiveBoxChange?.({
      boxId: box.id,
      boxKind: box.kind === 'image' ? 'image' : 'text',
      xPct: box.x,
      yPct: box.y,
      wPct: bw,
      hPct: bh,
    });

    // Imágenes: arrastre con un dedo; redimensión/rotación con marcas Word (sin pinch, evita conflicto con handles).
    if (box.kind === 'image' && allowBoxEditing) {
      activeImagePointersRef.current.boxId = null;
      activeImagePointersRef.current.pointers.clear();
      setDragCandidate({
        fieldKey: box.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: box.x,
        startTop: box.y,
        clampW: bw,
        clampH: bh,
      });
      return;
    }

    // Texto u otras cajas: drag normal
    setDragCandidate({
      fieldKey: box.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: box.x,
      startTop: box.y,
      clampW: bw,
      clampH: bh,
    });
  }, [vibrate, onActiveBoxChange, allowBoxEditing]);

  useEffect(() => {
    if (!dragCandidate) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== dragCandidate.pointerId) return;
      const dxPx = e.clientX - dragCandidate.startX;
      const dyPx = e.clientY - dragCandidate.startY;
      const dist2 = dxPx * dxPx + dyPx * dyPx;
      if (dist2 < DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX) return;

      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (!w || !h) return;

      const dx = (e.clientX - dragCandidate.startX) / w;
      const dy = (e.clientY - dragCandidate.startY) / h;
      let nx = dragCandidate.startLeft + dx;
      let ny = dragCandidate.startTop + dy;
      const maxX = Math.max(0, 1 - dragCandidate.clampW);
      const maxY = Math.max(0, 1 - dragCandidate.clampH);
      nx = Math.max(0, Math.min(maxX, nx));
      ny = Math.max(0, Math.min(maxY, ny));

      skipNextBoxClickRef.current = true;
      setDragging({
        fieldKey: dragCandidate.fieldKey,
        pointerId: dragCandidate.pointerId,
        startX: dragCandidate.startX,
        startY: dragCandidate.startY,
        startLeft: dragCandidate.startLeft,
        startTop: dragCandidate.startTop,
        clampW: dragCandidate.clampW,
        clampH: dragCandidate.clampH,
      });
      setDragPreview({ x: nx, y: ny });
      setDragCandidate(null);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== dragCandidate.pointerId) return;
      setDragCandidate(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragCandidate]);

  useEffect(() => {
    if (!pinching) return;

    const { boxId, pointerIds, startDistancePx, startW, startH, startCx, startCy } = pinching;
    const [idA, idB] = pointerIds;

    const computeScale = (distPx: number) => {
      const rawScale = distPx / Math.max(1, startDistancePx);
      const scaleMin = Math.max(PINCH_MIN_W_PCT / startW, PINCH_MIN_H_PCT / startH);
      const scaleMax = Math.min(PINCH_MAX_W_PCT / startW, PINCH_MAX_H_PCT / startH);
      return Math.max(scaleMin, Math.min(scaleMax, rawScale));
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== idA && e.pointerId !== idB) return;
      const ptrState = activeImagePointersRef.current;
      if (ptrState.boxId !== boxId) return;
      ptrState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pA = ptrState.pointers.get(idA);
      const pB = ptrState.pointers.get(idB);
      if (!pA || !pB) return;

      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = computeScale(dist);

      const newW = startW * scale;
      const newH = startH * scale;
      const newX = Math.max(0, Math.min(1 - newW, startCx - newW / 2));
      const newY = Math.max(0, Math.min(1 - newH, startCy - newH / 2));

      setPinchPreview({ x: newX, y: newY, w: newW, h: newH });
    };

    const commitAndEnd = () => {
      const preview = pinchPreviewRef.current;
      if (!preview || !onTemplateConfigChange) {
        setPinching(null);
        setPinchPreview(null);
        return;
      }

      const nextBoxes = customBoxes.map((b) =>
        b.id === boxId ? { ...b, x: preview.x, y: preview.y, width: preview.w, height: preview.h } : b
      );
      onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
      setPinching(null);
      setPinchPreview(null);
      activeImagePointersRef.current.boxId = null;
      activeImagePointersRef.current.pointers.clear();
      setDragCandidate(null);
      setDragging(null);
      setDragPreview(null);
      setResizing(null);
      setResizePreview(null);
    };

    const onUpOrCancel = (e: PointerEvent) => {
      if (e.pointerId !== idA && e.pointerId !== idB) return;
      commitAndEnd();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUpOrCancel);
    window.addEventListener('pointercancel', onUpOrCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUpOrCancel);
      window.removeEventListener('pointercancel', onUpOrCancel);
    };
  }, [
    pinching,
    customBoxes,
    effectiveConfig,
    onTemplateConfigChange,
    PINCH_MIN_W_PCT,
    PINCH_MAX_W_PCT,
    PINCH_MIN_H_PCT,
    PINCH_MAX_H_PCT,
  ]);

  const addCustomBox = useCallback((singleLine = false) => {
    if (!onTemplateConfigChange || !currentUser?.id) return;
    const newBox: CustomBoxDef = {
      id: `custom-${Date.now()}`,
      x: 0.1,
      y: 0.5,
      width: 0.4,
      height: singleLine ? 0.03 : 0.05,
      kind: 'text',
      ownerId: currentUser.id,
      ...(singleLine ? { singleLine: true } : {}),
    };
    onTemplateConfigChange({
      ...effectiveConfig,
      customBoxes: [...customBoxes, newBox],
    });
    const cf = (value.customFieldValues as Record<string, string>) ?? {};
    update({ customFieldValues: { ...cf, [newBox.id]: '' } });
  }, [effectiveConfig, onTemplateConfigChange, customBoxes, value.customFieldValues, update, currentUser?.id]);

  const openAddImageDialog = useCallback(() => {
    if (!onTemplateConfigChange || !currentUser?.id) return;
    setImageDialogMode('add');
    setImageDialogBoxId(null);
    setImageDialogUrl('');
    setImageDialogError(null);
    setImageDialogOpen(true);
  }, [onTemplateConfigChange, currentUser?.id]);

  const openEditImageDialog = useCallback((box: CustomBoxDef) => {
    setImageDialogMode('edit');
    setImageDialogBoxId(box.id);
    setImageDialogUrl(box.imageUrl || '');
    setImageDialogError(null);
    setImageDialogOpen(true);
  }, []);

  const applyImageDialog = useCallback(() => {
    const url = imageDialogUrl.trim();
    if (!url || !onTemplateConfigChange) return;
    if (imageDialogMode === 'add' && currentUser?.id) {
      const newBox: CustomBoxDef = {
        id: `img-${Date.now()}`,
        x: 0.15,
        y: 0.2,
        width: 0.3,
        height: 0.15,
        kind: 'image',
        imageUrl: url,
        ownerId: currentUser.id,
      };
      const nextBoxes = [...customBoxes, newBox];
      const newConfig = { ...effectiveConfig, customBoxes: nextBoxes };
      onTemplateConfigChange(newConfig);
      if (onSaveTemplateConfig) onSaveTemplateConfig(newConfig);
    } else if (imageDialogMode === 'edit' && imageDialogBoxId) {
      const nextBoxes = customBoxes.map((b) =>
        b.id === imageDialogBoxId ? { ...b, imageUrl: url } : b
      );
      const newConfig = { ...effectiveConfig, customBoxes: nextBoxes };
      onTemplateConfigChange(newConfig);
      if (onSaveTemplateConfig) onSaveTemplateConfig(newConfig);
    }
    setImageDialogOpen(false);
  }, [imageDialogMode, imageDialogBoxId, imageDialogUrl, effectiveConfig, onTemplateConfigChange, onSaveTemplateConfig, customBoxes, currentUser?.id]);

  const handleImageFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImageDialogError(null);
      if (!/^image\/jpe?g$/i.test(file.type)) {
        setImageDialogError('Tipo de archivo no permitido. Solo se aceptan imágenes JPG.');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      setImageDialogUploading(true);
      try {
        const res = await apiFetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const data: { error?: string; url?: string } = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
          const backendMsg =
            typeof data.error === 'string' && data.error.trim()
              ? data.error
              : res.status === 404
              ? 'Servidor no disponible. ¿Está corriendo el backend en el puerto 3001?'
              : `Error al subir archivo (${res.status}).`;
          throw new Error(backendMsg);
        }
        const fullUrl = data.url.startsWith('/') ? `${API_BASE}${data.url}` : data.url;
        setImageDialogUrl(fullUrl);
        if (imageFileInputRef.current) imageFileInputRef.current.value = '';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
        const isNetwork =
          msg === 'Failed to fetch' ||
          msg.includes('NetworkError') ||
          msg.toLowerCase().includes('failed to fetch');
        setImageDialogError(
          isNetwork
            ? 'No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 3001).'
            : msg
        );
      } finally {
        setImageDialogUploading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== dragging.pointerId) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dx = (e.clientX - dragging.startX) / w;
      const dy = (e.clientY - dragging.startY) / h;
      let nx = dragging.startLeft + dx;
      let ny = dragging.startTop + dy;
      const maxX = Math.max(0, 1 - dragging.clampW);
      const maxY = Math.max(0, 1 - dragging.clampH);
      nx = Math.max(0, Math.min(maxX, nx));
      ny = Math.max(0, Math.min(maxY, ny));
      setDragPreview({ x: nx, y: ny });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== dragging.pointerId) return;
      if (dragPreview !== null && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === dragging.fieldKey ? { ...b, x: dragPreview.x, y: dragPreview.y } : b
        );
        onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
      }
      setDragging(null);
      setDragPreview(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, dragPreview, customBoxes, effectiveConfig, onTemplateConfigChange]);

  const handleResizeStart = useCallback((e: React.PointerEvent, box: CustomBoxDef, axis: ResizeAxis) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    vibrate(10);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setResizing({ boxId: box.id, pointerId: e.pointerId, axis, startX: e.clientX, startY: e.clientY, startW: box.width, startH: box.height });
  }, [vibrate]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== resizing.pointerId) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - resizing.startX) / rect.width;
      const dy = (e.clientY - resizing.startY) / rect.height;
      const { axis } = resizing;
      let w = resizing.startW;
      let h = resizing.startH;
      if (axis === 'e' || axis === 'se') w = resizing.startW + dx;
      if (axis === 's' || axis === 'se') h = resizing.startH + dy;
      w = Math.max(0.08, Math.min(0.95, w));
      h = Math.max(0.04, Math.min(0.9, h));
      setResizePreview({ width: w, height: h });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== resizing.pointerId) return;
      if (resizePreview !== null && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === resizing.boxId ? { ...b, width: resizePreview.width, height: resizePreview.height } : b
        );
        onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
      }
      setResizing(null);
      setResizePreview(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [resizing, resizePreview, customBoxes, effectiveConfig, onTemplateConfigChange]);

  const onWordImageHandlePointerDown = useCallback(
    (box: CustomBoxDef, kind: WordImageHandleKind, e: React.PointerEvent) => {
      if (!onTemplateConfigChange || !e.isPrimary || viewerOnly) return;
      e.preventDefault();
      e.stopPropagation();
      vibrate(8);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const bw = typeof box.width === 'number' ? box.width : 0.3;
      const bh = typeof box.height === 'number' ? box.height : 0.15;
      const bx = box.x;
      const by = box.y;
      const rotationDeg =
        typeof box.rotationDeg === 'number' && !Number.isNaN(box.rotationDeg) ? box.rotationDeg : 0;
      const cx = rect.left + (bx + bw / 2) * rect.width;
      const cy = rect.top + (by + bh / 2) * rect.height;
      const startPointerAngle = kind === 'rotate' ? Math.atan2(e.clientY - cy, e.clientX - cx) : 0;
      const initial = { x: bx, y: by, w: bw, h: bh, rotationDeg };
      wordImageLiveRef.current = initial;
      setWordImageGesture({
        boxId: box.id,
        kind,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        start: { x: bx, y: by, w: bw, h: bh, rotationDeg },
        centerX: cx,
        centerY: cy,
        startPointerAngle,
      });
      setWordImagePreview(initial);
    },
    [onTemplateConfigChange, viewerOnly, vibrate],
  );

  useEffect(() => {
    if (!wordImageGesture) return;
    const g = wordImageGesture;
    const clampPct = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== g.pointerId) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pw = rect.width;
      const ph = rect.height;
      const dx = (e.clientX - g.startX) / pw;
      const dy = (e.clientY - g.startY) / ph;
      const px = clampPct((e.clientX - rect.left) / pw, 0, 1);
      const py = clampPct((e.clientY - rect.top) / ph, 0, 1);
      const { kind, start } = g;
      const ar = start.w / Math.max(start.h, 1e-6);

      if (kind === 'rotate') {
        const angle = Math.atan2(e.clientY - g.centerY, e.clientX - g.centerX);
        let deltaDeg = ((angle - g.startPointerAngle) * 180) / Math.PI;
        let nextRot = start.rotationDeg + deltaDeg;
        while (nextRot > 180) nextRot -= 360;
        while (nextRot <= -180) nextRot += 360;
        const next = { ...start, rotationDeg: nextRot };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }

      if (kind === 'e') {
        const nw = clampPct(start.w + dx, 0.05, 0.95 - start.x);
        const next = { ...start, w: nw };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
      if (kind === 'w') {
        const nx = clampPct(start.x + dx, 0, start.x + start.w - 0.05);
        const nw = start.x + start.w - nx;
        const next = { ...start, x: nx, w: nw };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
      if (kind === 's') {
        const nh = clampPct(start.h + dy, 0.04, 0.95 - start.y);
        const next = { ...start, h: nh };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
      if (kind === 'n') {
        const ny = clampPct(start.y + dy, 0, start.y + start.h - 0.04);
        const nh = start.y + start.h - ny;
        const next = { ...start, y: ny, h: nh };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }

      if (kind === 'se') {
        const nx = start.x;
        const ny = start.y;
        let nw = clampPct(start.w + dx, 0.05, 0.95 - nx);
        let nh = nw / ar;
        if (ny + nh > 0.96) nh = Math.max(0.04, 0.96 - ny);
        nw = nh * ar;
        const next = { x: nx, y: ny, w: nw, h: nh, rotationDeg: start.rotationDeg };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
      if (kind === 'nw') {
        const fx = start.x + start.w;
        const fy = start.y + start.h;
        let nw = clampPct(fx - px, 0.05, fx);
        let nh = nw / ar;
        let ny = fy - nh;
        let nx = fx - nw;
        nx = clampPct(nx, 0, fx - 0.05);
        ny = clampPct(ny, 0, fy - 0.04);
        nw = fx - nx;
        nh = fy - ny;
        const next = { x: nx, y: ny, w: nw, h: nh, rotationDeg: start.rotationDeg };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
      if (kind === 'ne') {
        const fx = start.x;
        const fy = start.y + start.h;
        let nw = clampPct(px - fx, 0.05, 0.95 - fx);
        let nh = nw / ar;
        let ny = fy - nh;
        ny = clampPct(ny, 0, fy - 0.04);
        nh = fy - ny;
        nw = nh * ar;
        const next = { x: fx, y: ny, w: nw, h: nh, rotationDeg: start.rotationDeg };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
      if (kind === 'sw') {
        const fx = start.x + start.w;
        const fy = start.y;
        let nw = clampPct(fx - px, 0.05, fx);
        let nh = nw / ar;
        let nx = fx - nw;
        nx = clampPct(nx, 0, fx - 0.05);
        nw = fx - nx;
        nh = clampPct(nh, 0.04, 0.96 - fy);
        const next = { x: nx, y: fy, w: nw, h: nh, rotationDeg: start.rotationDeg };
        wordImageLiveRef.current = next;
        setWordImagePreview(next);
        return;
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== g.pointerId) return;
      const prev = wordImageLiveRef.current;
      if (prev && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === g.boxId
            ? {
                ...b,
                x: prev.x,
                y: prev.y,
                width: prev.w,
                height: prev.h,
                rotationDeg: prev.rotationDeg,
              }
            : b
        );
        onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
      }
      wordImageLiveRef.current = null;
      setWordImageGesture(null);
      setWordImagePreview(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [wordImageGesture, customBoxes, effectiveConfig, onTemplateConfigChange]);

  const normalizedColor = fontColor.toLowerCase() === '#ffffff' ? '#ffffff' : '#000000';
  const getBoxTextValue = useCallback((box: CustomBoxDef) => {
    const customValues = (value.customFieldValues as Record<string, string>) ?? {};
    if (box.fieldKey && value[box.fieldKey] !== undefined && value[box.fieldKey] !== null) {
      return box.fieldKey === 'fecha' ? String(value[box.fieldKey]) : String(value[box.fieldKey]).trim();
    }
    return customValues[box.id] ?? '';
  }, [value]);

  useEffect(() => {
    for (const box of customBoxes) {
      if (box.kind !== 'text' || box.fieldKey === 'fecha') continue;
      const el = editableRefs.current[box.id];
      if (!el) continue;
      if (selectedBoxId === box.id) continue; // Nunca pisar mientras el usuario escribe.
      const nextText = getBoxTextValue(box);
      if (el.innerText !== nextText) el.innerText = nextText;
    }
  }, [customBoxes, selectedBoxId, getBoxTextValue]);

  const getTextStyleForBox = (box: CustomBoxDef) => {
    // Estilos globales definidos por admin en TemplateConfig;
    // los valores específicos por cuadro (fontSize, fontFamily, etc.)
    // prevalecen sobre los globales. line-height 1.1 para folio/una línea = igual que backend (documentHtmlBuilder).
    // fontSize en px para consistencia entre navegadores (Edge, Arc, etc.). En export a alta res se escala.
    const sizePt = box.fontSize ?? fontSize;
    const sizePx = Math.round(sizePt * (4 / 3)) * pixelScale;
    const colBase = box.fontColor ?? fontColor;
    const col = colBase.toLowerCase() === '#ffffff' ? '#ffffff' : '#000000';
    const ff = box.fontFamily ?? fontFamily;
    const bold = box.fontBold ?? fontBold;
    const italic = box.fontItalic ?? fontItalic;
    const isSingleLineOrFolio = box.singleLine === true || box.semantic === 'folio';
    const isTotalBox = box.fieldKey === 'total';
    return {
      fontFamily: ff,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      color: col,
      fontSize: `${sizePx}px`,
      textAlign: (isTotalBox ? 'right' : 'left') as 'left' | 'right',
      direction: 'ltr' as const,
      lineHeight: isTotalBox ? 1 : (isSingleLineOrFolio ? 1.1 : 1.35),
      ...(box.backgroundColor ? { backgroundColor: box.backgroundColor } : {}),
    };
  };
  useEffect(() => {
    if (selectedBoxId && !customBoxes.some((b) => b.id === selectedBoxId)) setSelectedBoxId(null);
  }, [selectedBoxId, customBoxes]);

  useEffect(() => {
    // Mecanismo seguro: si por cualquier razón el estado interno pasa a null,
    // notificamos al padre para que cierre Focus Mode.
    if (prevSelectedBoxIdRef.current && selectedBoxId === null) {
      onActiveBoxChange?.({ boxId: null });
    }
    prevSelectedBoxIdRef.current = selectedBoxId;
  }, [selectedBoxId, onActiveBoxChange]);

  const previewImageUrl = imageDialogUrl.trim().startsWith('/') ? `${API_BASE}${imageDialogUrl}` : imageDialogUrl;

  return (
    <div className={`relative flex-1 flex flex-col overflow-hidden min-h-0 ${viewerOnly ? 'bg-white' : 'bg-monday-bg/30'}`}>
      <Dialog.Root open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[100]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-md bg-white rounded-xl shadow-xl border border-monday-border p-4">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text mb-3">
              {imageDialogMode === 'add' ? 'Añadir imagen a la plantilla' : 'Editar imagen'}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Formulario para añadir o editar una imagen en la plantilla del documento
            </Dialog.Description>
            <p className="text-[12px] text-monday-subtext mb-2">
              Escribe la URL de la imagen o sube un archivo (JPG, PNG, GIF, WebP).
            </p>
            <input
              type="url"
              value={imageDialogUrl}
              onChange={(e) => { setImageDialogUrl(e.target.value); setImageDialogError(null); }}
              placeholder="https://… o deja vacío y sube un archivo"
              className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg text-monday-text placeholder:text-monday-subtext mb-2"
            />
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              className="hidden"
              id="template-image-upload"
              onChange={handleImageFileUpload}
            />
            <div className="flex items-center gap-2 mb-2">
              <label
                htmlFor="template-image-upload"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-monday-blue text-white text-[12px] cursor-pointer hover:bg-monday-blue/90"
              >
                {imageDialogUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Subiendo…
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Subir archivo
                  </>
                )}
              </label>
            </div>
            {imageDialogError && (
              <p className="text-[12px] text-red-600 mb-2" role="alert">{imageDialogError}</p>
            )}
            {imageDialogUrl.trim() && (
              <div className="mb-3 rounded-lg border border-monday-border overflow-hidden bg-monday-hover/30 flex justify-center p-2">
                <img src={previewImageUrl} alt="Vista previa" className="max-h-24 w-auto object-contain" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="px-3 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover">
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={applyImageDialog}
                disabled={!imageDialogUrl.trim()}
                className="px-3 py-1.5 rounded-lg bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
              >
                {imageDialogMode === 'add' ? 'Añadir' : 'Guardar'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {isAdmin && !viewerOnly && allowBoxEditing && onTemplateConfigChange && (
        <div className="absolute top-2 right-2 z-30 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setAdminMenuOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-monday-border shadow-monday text-[13px] font-medium text-monday-text hover:bg-monday-hover"
          >
            <Type size={16} />
            {adminMenuOpen ? 'Cerrar menú' : 'Menú plantilla (admin)'}
          </button>
          {adminMenuOpen && (
            <div className="w-56 rounded-lg bg-white border border-monday-border shadow-monday p-3 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-monday-subtext uppercase">Solo posición</p>
              <p className="text-[11px] text-monday-subtext">Arrastra, redimensiona (esquina) o elimina los cuadros sobre la plantilla.</p>
              <button
                type="button"
                onClick={() => addCustomBox(false)}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-monday-border text-[12px] text-monday-text hover:bg-monday-hover"
              >
                <Plus size={14} /> Agregar cuadro de texto
              </button>
              <button
                type="button"
                onClick={() => addCustomBox(true)}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-monday-border text-[12px] text-monday-text hover:bg-monday-hover"
              >
                <Plus size={14} /> Agregar cuadro (una línea)
              </button>
              {onSaveTemplateConfig && (
                <button
                  type="button"
                  onClick={() => onSaveTemplateConfig()}
                  disabled={savingTemplateConfig}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
                >
                  <Save size={14} />
                  {savingTemplateConfig ? 'Guardando…' : 'Guardar cambios'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!renderFormatBarExternally && onTemplateConfigChange && !viewerOnly && (
        <TextFormatBarForTemplate
          templateConfig={{
            fontFamily: effectiveConfig.fontFamily,
            fontSize: effectiveConfig.fontSize,
            fontBold: effectiveConfig.fontBold,
            fontItalic: effectiveConfig.fontItalic,
            fontColor: effectiveConfig.fontColor,
            customBoxes: effectiveConfig.customBoxes ?? [],
          }}
          onTemplateConfigChange={(patch) => {
            onTemplateConfigChange({
              ...effectiveConfig,
              ...patch,
            });
          }}
          selectedBoxId={selectedBoxId}
          onAddTextBox={() => addCustomBox(false)}
          onAddImageBox={openAddImageDialog}
          isAdmin={isAdmin}
        />
      )}
      <div
        className={`flex-1 flex min-h-0 ${viewerOnly ? 'items-stretch justify-center overflow-auto p-0' : compactPadding ? 'items-center justify-center p-0 overflow-auto' : 'items-center justify-center p-2 sm:p-4 overflow-auto'}`}
        ref={(el) => onScrollContainerReady?.(el)}
      >
        {!viewerOnly && scale === 1 && (
          <div className="absolute top-14 left-4 z-20 text-[10px] text-monday-subtext bg-white/90 px-1.5 py-0.5 rounded border border-monday-border/60">
            1:1 @ 96 DPI (816×1056 px)
          </div>
        )}
        <div
          ref={wrapperRef}
          style={{
            ...(exportPixelScale
              ? { width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX, position: 'relative' as const, overflow: 'hidden' as const }
              : {
                  width: '100%',
                  maxWidth: `${PAGE_WIDTH_PX}px`,
                  ...(viewerOnly
                    ? { aspectRatio: '612/792', minHeight: 0, position: 'relative' as const, overflow: 'hidden' as const }
                    : {
                        height: `${Math.max(100, PAGE_HEIGHT_PX * scale)}px`,
                        position: 'relative' as const,
                        overflow: 'hidden' as const,
                      }),
                }),
            ...(!exportPixelScale && (dragging || resizing || pinching) ? { touchAction: 'none' as const } : {}),
            ...(!exportPixelScale && !(dragging || resizing || pinching) && canvasTouchPanY ? { touchAction: 'pan-y' as const } : {}),
          }}
        >
          <div
            ref={containerRef}
            className={`relative bg-transparent ${
              viewerOnly
                ? 'w-full h-full rounded-none overflow-visible'
                : 'overflow-hidden rounded-lg border border-monday-border/60 shadow-monday'
            }`}
            style={{
              width: `${PAGE_WIDTH_PX}px`,
              height: `${PAGE_HEIGHT_PX}px`,
              position: 'relative',
              transformOrigin: 'top left',
              transform: `scale(${exportPixelScale ? 1 : scale})`,
              ...(exportPixelScale && exportPixelScale > 1 ? { fontSize: `${16 * exportPixelScale}px` } : {}),
            }}
          >
          {/* Capa 1: Fondo (PDF renderizado con PDF.js a 96 DPI o blanco). */}
          <div
            className={`absolute inset-0 z-0 ${viewerOnly ? 'overflow-visible' : 'overflow-hidden'} ${
              blueprintMode && !viewerOnly ? 'bg-slate-100' : 'bg-white'
            }`}
            style={
              blueprintMode && !viewerOnly
                ? {
                    backgroundImage:
                      'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                  }
                : undefined
            }
          >
            {templatePdfUrl ? (
              <>
                <canvas
                  ref={canvasRef}
                  className={`w-full h-full block pointer-events-none select-none transition-opacity duration-200 ${
                    blueprintMode && !viewerOnly ? 'opacity-0' : 'opacity-100'
                  }`}
                  style={{ width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX }}
                  width={PAGE_WIDTH_PX}
                  height={PAGE_HEIGHT_PX}
                  title="Plantilla PDF"
                />
                {pdfRenderError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90 text-red-600 text-sm p-4 text-center">
                    {pdfRenderError}
                  </div>
                )}
              </>
            ) : !viewerOnly || templatePdfWaitedTooLong ? (
              <div className="w-full h-full bg-white flex items-center justify-center text-monday-subtext text-sm">
                Sin plantilla PDF. Coloca {docType}.pdf en backend/templates/
              </div>
            ) : (
              <div className="w-full h-full bg-white flex items-center justify-center">
                <div className="w-[72%] h-[18px] rounded-full bg-monday-border/60 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-monday-blue/10 via-monday-blue/25 to-monday-blue/10 animate-pulse" />
                </div>
              </div>
            )}
          </div>
          {/* Capa 2: cuadros que ADMIN agrega/modifica (customBoxes). En viewerOnly sin overflow-hidden para no recortar. */}
          <div className={`absolute inset-0 z-20 ${viewerOnly ? 'pointer-events-none overflow-visible' : 'overflow-hidden'}`}>
            <div
              ref={canvasOverlayRef}
              className={`absolute inset-0 ${viewerOnly ? '' : 'pointer-events-auto'}`}
              onDoubleClick={(e) => {
                if (viewerOnly || exportPixelScale || !onCanvasDoubleTap) return;
                if (e.target !== e.currentTarget) return;
                onCanvasDoubleTap();
              }}
            >
              {customBoxes.map((box) => {
                const bp = blueprintMode && !viewerOnly;
                const canMoveOrDelete = !viewerOnly && allowBoxEditing && (isAdmin || (currentUser?.id && box.ownerId === currentUser.id));
                const isLocked = !viewerOnly && lockedOutline && !allowBoxEditing;
                // Para usuarios no admin y que no son dueños del cuadro: solo mostrar texto “plano” sin marco.
                // En modo locked (ADMIN sin edición de cajas), mostrar un outline tenue para feedback.
                const showFrame = !!canMoveOrDelete || isLocked;
                const canFormatBox = !viewerOnly;
                const isDraggingThis = dragging?.fieldKey === box.id && dragPreview;
                const isResizingThis = resizing?.boxId === box.id && resizePreview;
                const isPinchingThis = pinching?.boxId === box.id && pinchPreview;
                const isWordImageLive =
                  wordImageGesture?.boxId === box.id && wordImagePreview !== null;
                const isTransformingThisBox = Boolean(
                  isDraggingThis || isResizingThis || isPinchingThis || isWordImageLive
                );
                const x = isWordImageLive && wordImagePreview
                  ? wordImagePreview.x
                  : isDraggingThis
                    ? dragPreview!.x
                    : isPinchingThis
                      ? pinchPreview!.x
                      : box.x;
                const y = isWordImageLive && wordImagePreview
                  ? wordImagePreview.y
                  : isDraggingThis
                    ? dragPreview!.y
                    : isPinchingThis
                      ? pinchPreview!.y
                      : box.y;
                let w = isWordImageLive && wordImagePreview
                  ? wordImagePreview.w
                  : isResizingThis
                    ? resizePreview!.width
                    : isPinchingThis
                      ? pinchPreview!.w
                      : (box.width ?? 0.3);
                let h = isWordImageLive && wordImagePreview
                  ? wordImagePreview.h
                  : isResizingThis
                    ? resizePreview!.height
                    : isPinchingThis
                      ? pinchPreview!.h
                      : (box.height ?? 0.05);
                // Recortar al área de la plantilla: que ningún cuadro sobresalga por la derecha o por abajo
                w = Math.min(Number(w) || 0.3, Math.max(0, 1 - (Number(x) || 0)));
                h = Math.min(Number(h) || 0.05, Math.max(0, 1 - (Number(y) || 0)));
                const customValues = (value.customFieldValues as Record<string, string>) ?? {};
                const boxVal =
                  box.fieldKey && value[box.fieldKey] !== undefined && value[box.fieldKey] !== null
                    ? (box.fieldKey === 'fecha' ? String(value[box.fieldKey]) : String(value[box.fieldKey]).trim())
                    : (customValues[box.id] ?? '');
                const boxTextStyle = getTextStyleForBox(box);
                const isSelected = selectedBoxId === box.id;
                const isSingleLineOrFolio = box.singleLine === true || box.semantic === 'folio';
                const isFolio = box.semantic === 'folio';
                const isDescripcionCorta = box.fieldKey === 'descripcion_corta';
                const isTotalBox = box.fieldKey === 'total';
                const isSingleLineInput = box.singleLine === true || box.semantic === 'folio';
                const isWhiteText = String(boxTextStyle.color ?? '').toLowerCase() === '#ffffff';
                const rotationDeg =
                  isWordImageLive && wordImagePreview
                    ? wordImagePreview.rotationDeg
                    : typeof box.rotationDeg === 'number' && !Number.isNaN(box.rotationDeg)
                      ? box.rotationDeg
                      : 0;
                const useWordLikeImageChrome =
                  box.kind === 'image' && isSelected && canMoveOrDelete && coarsePointer;
                const showClassicResizeAndRail =
                  canMoveOrDelete &&
                  (!(box.kind === 'image' && isSelected) || !coarsePointer);
                return (
                  <div
                    key={box.id}
                    className={`absolute flex items-stretch overflow-visible ${isDescripcionCorta ? 'pt-3' : ''}`}
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                      minHeight: 0,
                      minWidth: 0,
                      // Hint temporal durante drag/resize para mejorar suavidad en móvil.
                      willChange: isTransformingThisBox ? 'left, top, width, height' : 'auto',
                    }}
                  >
                    <div
                      role={viewerOnly ? undefined : 'button'}
                      tabIndex={viewerOnly ? undefined : 0}
                      onClick={
                        viewerOnly
                          ? undefined
                          : () => {
                              if (!canFormatBox) return;
                              vibrate(6);
                              setSelectedBoxId(box.id);
                            }
                      }
                      className={`flex-1 min-w-0 flex flex-col transition-all ${
                        useWordLikeImageChrome ? 'overflow-visible' : 'overflow-hidden'
                      } box-border relative ${
                        showFrame
                          ? canMoveOrDelete
                            ? isSelected
                              ? bp
                                ? 'rounded border-2 border-dashed border-monday-blue bg-white/40 shadow-none ring-0'
                                : 'rounded border border-monday-blue ring-2 ring-monday-blue/35 bg-transparent shadow-none'
                              : bp
                                ? 'rounded border-2 border-dashed border-slate-400 bg-white/30 hover:bg-white/45'
                                : 'rounded border border-monday-border/70 bg-transparent hover:ring-1 hover:ring-monday-blue/20'
                            : isSelected
                              ? bp
                                ? 'rounded border-2 border-dashed border-monday-blue bg-white/35 shadow-none ring-0'
                                : 'rounded border-2 border-monday-blue/35 border-dashed ring-2 ring-monday-blue/25 bg-transparent'
                              : bp
                                ? 'rounded border border-dashed border-slate-400 bg-white/25'
                                : 'rounded border border-monday-border/50 border-dashed bg-transparent'
                          : bp
                            ? 'rounded border border-dashed border-slate-300/50 bg-white/15'
                            : ''
                      }`}
                    >
                    <div
                      className={`flex-1 min-h-0 min-w-0 flex ${
                        useWordLikeImageChrome ? 'overflow-visible' : 'overflow-hidden'
                      } rounded-sm ${
                        bp
                          ? 'bg-white/40 focus-within:bg-white/55 focus-within:ring-1 focus-within:ring-monday-blue/35'
                          : canMoveOrDelete
                            ? 'bg-transparent focus-within:ring-1 focus-within:ring-monday-blue/50'
                            : isLocked
                              ? 'bg-transparent focus-within:ring-1 focus-within:ring-monday-blue/35'
                              : 'bg-transparent'
                      }`}
                    >
                      {box.kind === 'image' ? (
                        <div
                          className="w-full h-full flex items-center justify-center pointer-events-auto"
                          style={{
                            transform: `rotate(${rotationDeg}deg)`,
                            transformOrigin: 'center center',
                          }}
                        >
                          <img
                            src={box.imageUrl || ''}
                            alt=""
                            className={`w-full h-full object-contain select-none ${bp ? 'opacity-[0.42]' : ''}`}
                            style={{ touchAction: 'none' }}
                            onPointerDown={
                              viewerOnly
                                ? undefined
                                : (e) => {
                                    if (!canMoveOrDelete) return;
                                    handleCustomBoxPointerDown(e, {
                                      ...box,
                                      x,
                                      y,
                                      width: w,
                                      height: h,
                                      rotationDeg,
                                    });
                                  }
                            }
                            onClick={
                              viewerOnly
                                ? undefined
                                : (e) => {
                                    e.stopPropagation();
                                    if (skipNextBoxClickRef.current) {
                                      skipNextBoxClickRef.current = false;
                                      return;
                                    }
                                    if (canFormatBox) {
                                      vibrate(6);
                                      setSelectedBoxId(box.id);
                                      onActiveBoxChange?.({
                                        boxId: box.id,
                                        boxKind: 'image',
                                        xPct: x,
                                        yPct: y,
                                        wPct: w,
                                        hPct: h,
                                      });
                                    }
                                  }
                            }
                          />
                        </div>
                      ) : viewerOnly ? (
                        <div
                          style={boxTextStyle}
                          className={`w-full h-full min-h-0 border-0 outline-none bg-transparent px-1.5 overflow-hidden whitespace-pre-wrap break-words text-left box-border ${
                            isTotalBox
                              ? 'flex items-center justify-end py-0'
                              : isDescripcionCorta
                                ? 'flex flex-col justify-start pt-5 pb-1'
                                : isFolio || isSingleLineOrFolio
                                  ? 'flex items-center py-0'
                                  : 'flex flex-col justify-start pt-1.5 pb-1'
                          }`}
                        >
                          {isTotalBox ? (
                            <span
                              style={{
                                display: 'inline-block',
                                textAlign: 'right',
                                width: 'auto',
                                flexShrink: 0,
                                marginLeft: 'auto',
                                lineHeight: 1.2,
                                color: boxTextStyle.color ?? '#ffffff',
                              }}
                            >
                              {boxVal || '\u00A0'}
                            </span>
                          ) : (
                            boxVal || '\u00A0'
                          )}
                        </div>
                      ) : box.fieldKey === 'fecha' ? (
                        <input
                          type="date"
                          value={fechaDraftToIso(boxVal)}
                          onChange={(e) => {
                            const iso = e.target.value;
                            update({ fecha: iso ? isoToFechaDraft(iso) : '' });
                          }}
                          onFocus={() => {
                            vibrate(4);
                            setSelectedBoxId(box.id);
                            onActiveBoxChange?.({
                              boxId: box.id,
                              boxKind: 'text',
                              xPct: x,
                              yPct: y,
                              wPct: w,
                              hPct: h,
                            });
                          }}
                          onBlur={() => {
                            onActiveBoxChange?.({ boxId: null });
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canFormatBox) {
                              vibrate(4);
                              setSelectedBoxId(box.id);
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            ...boxTextStyle,
                            backgroundColor: bp
                              ? canMoveOrDelete || isLocked
                                ? 'rgba(255,255,255,0.42)'
                                : 'rgba(255,255,255,0.18)'
                              : 'transparent',
                          }}
                          className={`w-full min-h-0 max-h-full border-0 outline-none focus:ring-0 px-1.5 box-border ${
                            isFolio || isSingleLineOrFolio ? 'py-2' : 'py-1.5'
                          } ${showFrame ? 'rounded' : ''}`}
                          title="Fecha (selector nativo)"
                        />
                      ) : (
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          ref={(el) => {
                            editableRefs.current[box.id] = el;
                          }}
                          onInput={(e) => {
                            const target = e.currentTarget;
                            const text = target.innerText.replace(/\r\n/g, '\n');
                            const normalizedText = isSingleLineInput ? text.replace(/\n+/g, ' ') : text;
                            if (normalizedText !== text) {
                              target.innerText = normalizedText;
                              placeCaretAtEnd(target);
                            }
                            if (box.fieldKey) {
                              update({ [box.fieldKey]: normalizedText });
                            } else {
                              update({
                                customFieldValues: { ...customValues, [box.id]: normalizedText },
                              });
                            }
                          }}
                          onFocus={() => {
                            // Mientras el cuadro tiene foco, evitamos sobrescribir su contenido desde React
                            // para que no salte el cursor al principio.
                            vibrate(4);
                            setSelectedBoxId(box.id);
                            onActiveBoxChange?.({
                              boxId: box.id,
                              boxKind: 'text',
                              xPct: x,
                              yPct: y,
                              wPct: w,
                              hPct: h,
                            });
                          }}
                          onKeyDown={(e) => {
                            if (isSingleLineInput && e.key === 'Enter') {
                              e.preventDefault();
                            }
                          }}
                          onPaste={(e) => {
                            if (!isSingleLineInput) return;
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text/plain').replace(/\r?\n+/g, ' ');
                            document.execCommand('insertText', false, pasted);
                          }}
                          onBlur={() => {
                            onActiveBoxChange?.({ boxId: null });
                          }}
                          data-placeholder={getSemanticPlaceholder(box)}
                          style={{
                            ...boxTextStyle,
                            backgroundColor: bp
                              ? canMoveOrDelete || isLocked
                                ? 'rgba(255,255,255,0.42)'
                                : 'rgba(255,255,255,0.18)'
                              : 'transparent',
                            textShadow: isWhiteText ? '0 1px 2px rgba(0,0,0,0.78)' : undefined,
                            caretColor: isWhiteText ? '#ffffff' : undefined,
                          }}
                          className={`w-full h-full min-h-0 border-0 outline-none focus:ring-0 px-1.5 placeholder:text-gray-500 block whitespace-pre-wrap break-words text-left box-border ${
                            isTotalBox
                              ? 'pt-0 pb-0 flex items-center justify-end'
                              : isDescripcionCorta
                                ? 'pt-6 pb-1'
                                : isFolio
                                  ? 'pt-3 pb-1'
                                  : isSingleLineOrFolio
                                    ? 'pt-4 pb-1'
                                    : 'pt-2 py-1'
                          } ${showFrame ? 'rounded' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                          spellCheck
                        />
                      )}
                    </div>
                    {useWordLikeImageChrome && (
                      <WordLikeImageHandles
                        onHandlePointerDown={(kind, e) =>
                          onWordImageHandlePointerDown(
                            {
                              ...box,
                              x,
                              y,
                              width: w,
                              height: h,
                              rotationDeg,
                            },
                            kind,
                            e
                          )
                        }
                      />
                    )}
                    {useWordLikeImageChrome && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 bottom-3 z-[38] flex items-center gap-1 rounded-2xl bg-zinc-900/93 border border-white/10 px-2 py-1.5 shadow-2xl pointer-events-auto"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="flex flex-col items-center justify-center min-w-[44px] py-1 px-1 rounded-xl text-white/90 hover:bg-white/10 touch-manipulation"
                          onClick={() =>
                            openEditImageDialog({
                              ...box,
                              x,
                              y,
                              width: w,
                              height: h,
                              rotationDeg,
                            })
                          }
                        >
                          <ImageIcon size={18} />
                          <span className="text-[9px] font-medium mt-0.5">Reemplazar</span>
                        </button>
                        <button
                          type="button"
                          className="flex flex-col items-center justify-center min-w-[44px] py-1 px-1 rounded-xl text-red-300 hover:bg-red-500/20 touch-manipulation"
                          onClick={() => {
                            if (!onTemplateConfigChange) return;
                            onTemplateConfigChange({
                              ...effectiveConfig,
                              customBoxes: customBoxes.filter((b) => b.id !== box.id),
                            });
                            setSelectedBoxId(null);
                          }}
                        >
                          <Trash2 size={18} />
                          <span className="text-[9px] font-medium mt-0.5">Quitar</span>
                        </button>
                      </div>
                    )}
                    {showClassicResizeAndRail && (
                      <>
                        <div
                          className="absolute top-0 right-0 w-2 bottom-4 z-10 cursor-ew-resize hover:bg-monday-blue/20 transition-colors"
                          onPointerDown={(e) =>
                            handleResizeStart(e, { ...box, x, y, width: w, height: h, rotationDeg }, 'e')
                          }
                          style={{ touchAction: 'none' }}
                          title="Redimensionar ancho"
                        />
                        <div
                          className="absolute bottom-0 left-0 right-4 h-2 z-10 cursor-ns-resize hover:bg-monday-blue/20 transition-colors"
                          onPointerDown={(e) =>
                            handleResizeStart(e, { ...box, x, y, width: w, height: h, rotationDeg }, 's')
                          }
                          style={{ touchAction: 'none' }}
                          title="Redimensionar alto"
                        />
                        <div
                          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-monday-subtext hover:text-monday-blue border-t border-l border-monday-border/40 rounded-tl bg-white/90 z-20"
                          onPointerDown={(e) =>
                            handleResizeStart(e, { ...box, x, y, width: w, height: h, rotationDeg }, 'se')
                          }
                          style={{ touchAction: 'none' }}
                          title="Redimensionar ancho y alto"
                        >
                          <Maximize2 size={10} />
                        </div>
                      </>
                    )}
                    </div>
                    {showClassicResizeAndRail && (
                      <div
                        className="absolute top-0 right-0 bottom-0 w-10 flex flex-col gap-1 pl-1.5 pr-1 py-1 justify-start items-center bg-white/95 rounded-r border border-l-0 border-monday-border/50 z-10"
                        style={{ width: '40px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="cursor-grab active:cursor-grabbing text-monday-subtext hover:text-monday-blue p-1.5 rounded hover:bg-monday-hover shrink-0"
                          onPointerDown={(e) =>
                            canMoveOrDelete &&
                            handleCustomBoxPointerDown(e, {
                              ...box,
                              x,
                              y,
                              width: w,
                              height: h,
                              rotationDeg,
                            })
                          }
                          style={{ touchAction: 'none' }}
                          title="Mover"
                        >
                          <GripVertical size={14} />
                        </div>
                        {box.kind === 'image' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditImageDialog(box);
                            }}
                            className="p-1.5 rounded text-monday-subtext hover:text-monday-blue hover:bg-monday-hover shrink-0"
                            title="Editar imagen"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!onTemplateConfigChange || !canMoveOrDelete) return;
                            onTemplateConfigChange({
                              ...effectiveConfig,
                              customBoxes: customBoxes.filter((b) => b.id !== box.id),
                            });
                          }}
                          className="p-1.5 rounded text-monday-subtext hover:text-red-600 hover:bg-red-50 shrink-0"
                          title="Eliminar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
