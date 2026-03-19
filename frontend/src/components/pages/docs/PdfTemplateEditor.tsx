import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Plus, Trash2, Type, Save, Maximize2, Upload, Loader2, Pencil } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  type PdfDocType,
  type TemplateConfigState,
  type CustomBoxDef,
} from './pdfTemplateConfig';
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
  const pixelScale = exportPixelScale ?? 1;
  const PAGE_WIDTH_PX = Math.round(PAGE_WIDTH_PX_96DPI * pixelScale);
  const PAGE_HEIGHT_PX = Math.round(PAGE_HEIGHT_PX_96DPI * pixelScale);
  const [dragging, setDragging] = useState<{ fieldKey: string; startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  type ResizeAxis = 'e' | 's' | 'se';
  const [resizing, setResizing] = useState<{ boxId: string; axis: ResizeAxis; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ width: number; height: number } | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageDialogMode, setImageDialogMode] = useState<'add' | 'edit'>('add');
  const [imageDialogBoxId, setImageDialogBoxId] = useState<string | null>(null);
  const [imageDialogUrl, setImageDialogUrl] = useState('');
  const [imageDialogUploading, setImageDialogUploading] = useState(false);
  const [imageDialogError, setImageDialogError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

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
    apiFetch(`${API_BASE}/api/templates/${docType}`)
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
  }, [docType, templatePdfUrlProp]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (exportPixelScale) return;
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
  }, [exportPixelScale]);

  useEffect(() => {
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
  }, [templatePdfUrl, onExportReady, pixelScale]);

  const handleCustomBoxMouseDown = useCallback((e: React.MouseEvent, box: CustomBoxDef) => {
    e.preventDefault();
    setDragging({ fieldKey: box.id, startX: e.clientX, startY: e.clientY, startLeft: box.x, startTop: box.y });
  }, []);

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
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dx = (e.clientX - dragging.startX) / w;
      const dy = (e.clientY - dragging.startY) / h;
      let nx = dragging.startLeft + dx;
      let ny = dragging.startTop + dy;
      nx = Math.max(0, Math.min(1 - 0.1, nx));
      ny = Math.max(0, Math.min(1 - 0.04, ny));
      setDragPreview({ x: nx, y: ny });
    };
    const onUp = () => {
      if (!dragging) return;
      if (dragPreview !== null && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === dragging.fieldKey ? { ...b, x: dragPreview.x, y: dragPreview.y } : b
        );
        onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
      }
      setDragging(null);
      setDragPreview(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, dragPreview, customBoxes, effectiveConfig, onTemplateConfigChange]);

  const handleResizeStart = useCallback((e: React.MouseEvent, box: CustomBoxDef, axis: ResizeAxis) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ boxId: box.id, axis, startX: e.clientX, startY: e.clientY, startW: box.width, startH: box.height });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
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
    const onUp = () => {
      if (!resizing) return;
      if (resizePreview !== null && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === resizing.boxId ? { ...b, width: resizePreview.width, height: resizePreview.height } : b
        );
        onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
      }
      setResizing(null);
      setResizePreview(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, resizePreview, customBoxes, effectiveConfig, onTemplateConfigChange]);

  const normalizedColor = fontColor.toLowerCase() === '#ffffff' ? '#ffffff' : '#000000';
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
      {onTemplateConfigChange && !viewerOnly && (
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
      <div className={`flex-1 flex min-h-0 ${viewerOnly ? 'items-stretch justify-center overflow-auto p-0' : compactPadding ? 'items-center justify-center p-0 overflow-auto' : 'items-center justify-center p-2 sm:p-4 overflow-auto'}`}>
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
            className={`absolute inset-0 z-0 bg-white ${viewerOnly ? 'overflow-visible' : 'overflow-hidden'}`}
          >
            {templatePdfUrl ? (
              <>
                <canvas
                  ref={canvasRef}
                  className="w-full h-full block pointer-events-none select-none"
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
            ) : (
              <div className="w-full h-full bg-white flex items-center justify-center text-monday-subtext text-sm">
                Sin plantilla PDF. Coloca {docType}.pdf en backend/templates/
              </div>
            )}
          </div>
          {/* Capa 2: cuadros que ADMIN agrega/modifica (customBoxes). En viewerOnly sin overflow-hidden para no recortar. */}
          <div className={`absolute inset-0 z-20 ${viewerOnly ? 'pointer-events-none overflow-visible' : 'overflow-hidden'}`}>
            <div className={`absolute inset-0 ${viewerOnly ? '' : 'pointer-events-auto'}`}>
              {customBoxes.map((box) => {
                const canMoveOrDelete = !viewerOnly && allowBoxEditing && (isAdmin || (currentUser?.id && box.ownerId === currentUser.id));
                const isLocked = !viewerOnly && lockedOutline && !allowBoxEditing;
                // Para usuarios no admin y que no son dueños del cuadro: solo mostrar texto “plano” sin marco.
                // En modo locked (ADMIN sin edición de cajas), mostrar un outline tenue para feedback.
                const showFrame = !!canMoveOrDelete || isLocked;
                const canFormatBox = !viewerOnly;
                const isDraggingThis = dragging?.fieldKey === box.id && dragPreview;
                const isResizingThis = resizing?.boxId === box.id && resizePreview;
                const x = isDraggingThis ? dragPreview.x : box.x;
                const y = isDraggingThis ? dragPreview.y : box.y;
                let w = isResizingThis ? resizePreview.width : (box.width ?? 0.3);
                let h = isResizingThis ? resizePreview.height : (box.height ?? 0.05);
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
                    }}
                  >
                    <div
                      role={viewerOnly ? undefined : 'button'}
                      tabIndex={viewerOnly ? undefined : 0}
                      onClick={viewerOnly ? undefined : () => canFormatBox && setSelectedBoxId(box.id)}
                      className={`flex-1 min-w-0 flex flex-col transition-all overflow-hidden box-border relative ${
                        showFrame
                          ? canMoveOrDelete
                            ? isSelected
                              ? 'rounded border border-monday-blue ring-2 ring-monday-blue/30 bg-white shadow-md'
                              : 'rounded border border-monday-border bg-white/95 hover:bg-white'
                            : isSelected
                              ? 'rounded border-2 border-monday-blue/30 border-dashed ring-2 ring-monday-blue/20 bg-white/70'
                              : 'rounded border border-monday-border/60 border-dashed bg-white/60'
                          : ''
                      }`}
                    >
                    <div
                      className={`flex-1 min-h-0 min-w-0 flex overflow-hidden rounded-sm ${
                        canMoveOrDelete
                          ? 'bg-white/95 focus-within:bg-white focus-within:ring-1 focus-within:ring-monday-blue/40'
                          : isLocked
                            ? 'bg-white/70 focus-within:bg-white focus-within:ring-1 focus-within:ring-monday-blue/30'
                            : 'bg-transparent'
                      }`}
                    >
                      {box.kind === 'image' ? (
                        <img
                          src={box.imageUrl || ''}
                          alt=""
                          className="w-full h-full object-contain select-none"
                          onClick={viewerOnly ? undefined : (e) => {
                            e.stopPropagation();
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                        />
                      ) : viewerOnly ? (
                        <div
                          style={boxTextStyle}
                          className={`w-full h-full min-h-0 border-0 outline-none bg-transparent px-1.5 overflow-hidden whitespace-pre-wrap break-words text-left box-border ${
                            isTotalBox
                              ? 'flex items-center justify-end py-0'
                              : isDescripcionCorta
                                ? 'flex flex-col justify-center pt-5 pb-1'
                                : isFolio || isSingleLineOrFolio
                                  ? 'flex items-center py-0'
                                  : 'flex flex-col justify-center pt-1.5 pb-1'
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
                      ) : (
                <div
                          contentEditable
                          suppressContentEditableWarning
                          onInput={(e) => {
                            const target = e.currentTarget;
                            const text = target.innerText.replace(/\r\n/g, '\n');
                            if (box.fieldKey) {
                              update({ [box.fieldKey]: text });
                            } else {
                              update({
                                customFieldValues: { ...customValues, [box.id]: text },
                              });
                            }
                          }}
                          onFocus={() => {
                            // Mientras el cuadro tiene foco, evitamos sobrescribir su contenido desde React
                            // para que no salte el cursor al principio.
                            setSelectedBoxId(box.id);
                          }}
                          data-placeholder={getSemanticPlaceholder(box)}
                          style={{
                            ...boxTextStyle,
                            backgroundColor: canMoveOrDelete
                              ? 'rgba(255,255,255,0.95)'
                              : isLocked
                                ? 'rgba(255,255,255,0.65)'
                                : 'transparent',
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
                        >
                          {/*
                            No inyectamos boxVal cuando el cuadro está seleccionado para no
                            forzar un re-render que mueva el cursor al inicio mientras el usuario escribe.
                          */}
                          {selectedBoxId === box.id ? null : boxVal || ''}
                        </div>
                      )}
                    </div>
                    {canMoveOrDelete && (
                      <>
                        <div
                          className="absolute top-0 right-0 w-2 bottom-4 z-10 cursor-ew-resize hover:bg-monday-blue/20 transition-colors"
                          onMouseDown={(e) => handleResizeStart(e, box, 'e')}
                          title="Redimensionar ancho"
                        />
                        <div
                          className="absolute bottom-0 left-0 right-4 h-2 z-10 cursor-ns-resize hover:bg-monday-blue/20 transition-colors"
                          onMouseDown={(e) => handleResizeStart(e, box, 's')}
                          title="Redimensionar alto"
                        />
                        <div
                          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-monday-subtext hover:text-monday-blue border-t border-l border-monday-border/40 rounded-tl bg-white/90 z-20"
                          onMouseDown={(e) => handleResizeStart(e, box, 'se')}
                          title="Redimensionar ancho y alto"
                        >
                          <Maximize2 size={10} />
                        </div>
                      </>
                    )}
                    </div>
                    {canMoveOrDelete && (
                      <div
                        className="absolute top-0 right-0 bottom-0 w-10 flex flex-col gap-1 pl-1.5 pr-1 py-1 justify-start items-center bg-white/95 rounded-r border border-l-0 border-monday-border/50 z-10"
                        style={{ width: '40px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="cursor-grab active:cursor-grabbing text-monday-subtext hover:text-monday-blue p-1.5 rounded hover:bg-monday-hover shrink-0"
                          onMouseDown={(e) => canMoveOrDelete && handleCustomBoxMouseDown(e, box)}
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
