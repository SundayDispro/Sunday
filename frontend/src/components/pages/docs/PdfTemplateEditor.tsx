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

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

interface Props {
  docType: PdfDocType;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  docId: string;
  templateConfig?: TemplateConfigState | null;
  isAdmin?: boolean;
  onTemplateConfigChange?: (config: TemplateConfigState) => void;
  onSaveTemplateConfig?: () => Promise<void>;
  savingTemplateConfig?: boolean;
  /** Solo visualización: sin barra de formato, sin menú admin y cuadros de solo lectura */
  viewerOnly?: boolean;
}

/** Relación de aspecto US Letter (612×792); usar en editor y preview para 1:1 con PDF. */
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
  fontFamily: 'Helvetica',
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
}) => {
  const { currentUser } = useUser();
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
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

  // Cargar URL de plantilla PDF para usarla como fondo
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    fetch(`${API_BASE}/api/templates/${docType}`)
      .then((res) => {
        if (!res.ok) {
          setTemplatePdfUrl(null);
          return;
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setTemplatePdfUrl(objectUrl);
      })
      .catch(() => setTemplatePdfUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docType]);

  const PAGE_WIDTH_PX = 612;
  const PAGE_HEIGHT_PX = 792;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const calcScale = () => {
      if (!wrapperRef.current) return;
      const available = wrapperRef.current.clientWidth ?? 0;
      const raw = available > 0 ? available / PAGE_WIDTH_PX : 1;
      setScale(Math.max(0.25, Math.min(1, raw)));
    };
    calcScale();
    const ro = new ResizeObserver(calcScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      onTemplateConfigChange({
        ...effectiveConfig,
        customBoxes: [...customBoxes, newBox],
      });
    } else if (imageDialogMode === 'edit' && imageDialogBoxId) {
      const nextBoxes = customBoxes.map((b) =>
        b.id === imageDialogBoxId ? { ...b, imageUrl: url } : b
      );
      onTemplateConfigChange({ ...effectiveConfig, customBoxes: nextBoxes });
    }
    setImageDialogOpen(false);
  }, [imageDialogMode, imageDialogBoxId, imageDialogUrl, effectiveConfig, onTemplateConfigChange, customBoxes, currentUser?.id]);

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
        const res = await fetch(`${API_BASE}/api/upload`, {
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
    // fontSize en px para consistencia entre navegadores (Edge, Arc, etc.)
    const sizePt = box.fontSize ?? fontSize;
    const sizePx = Math.round(sizePt * (4 / 3));
    const colBase = box.fontColor ?? fontColor;
    const col = colBase.toLowerCase() === '#ffffff' ? '#ffffff' : '#000000';
    const ff = box.fontFamily ?? fontFamily;
    const bold = box.fontBold ?? fontBold;
    const italic = box.fontItalic ?? fontItalic;
    const isSingleLineOrFolio = box.singleLine === true || box.semantic === 'folio';
    return {
      fontFamily: ff,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      color: col,
      fontSize: `${sizePx}px`,
      textAlign: 'left',
      direction: 'ltr',
      lineHeight: isSingleLineOrFolio ? 1.1 : 1.35,
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
      {isAdmin && !viewerOnly && (
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
                  onClick={onSaveTemplateConfig}
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
          onTemplateConfigChange={onTemplateConfigChange}
          selectedBoxId={selectedBoxId}
          onAddTextBox={() => addCustomBox(false)}
          onAddImageBox={openAddImageDialog}
          isAdmin={isAdmin}
        />
      )}
      <div className={`flex-1 flex min-h-0 ${viewerOnly ? 'items-stretch justify-center overflow-auto p-0' : 'items-center justify-center p-2 sm:p-4 overflow-auto'}`}>
        <div
          ref={wrapperRef}
          style={{
            width: '100%',
            maxWidth: `${PAGE_WIDTH_PX}px`,
            ...(viewerOnly
              ? { aspectRatio: '612/792', minHeight: 0, position: 'relative' as const, overflow: 'hidden' as const }
              : {
                  height: `${Math.max(100, PAGE_HEIGHT_PX * scale)}px`,
                  position: 'relative' as const,
                  overflow: 'hidden' as const,
                }),
          }}
        >
          <div
            ref={containerRef}
            className={`relative bg-transparent ${viewerOnly ? 'w-full h-full rounded-none overflow-visible border border-gray-200' : 'overflow-hidden rounded-lg border border-monday-border/60 shadow-monday'}`}
            style={{
              width: `${PAGE_WIDTH_PX}px`,
              height: `${PAGE_HEIGHT_PX}px`,
              position: 'relative',
              transformOrigin: 'top left',
              transform: `scale(${scale})`,
            }}
          >
          {/* Capa 1: Fondo (PDF o blanco). Sin recorte para mostrar documento completo. */}
          <div
            className={`absolute inset-0 z-0 bg-white ${viewerOnly ? 'overflow-visible' : 'overflow-hidden'}`}
          >
            {templatePdfUrl ? (
              <iframe
                src={`${templatePdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                title="Plantilla PDF"
                className="w-full h-full border-0 pointer-events-none select-none bg-white"
                tabIndex={-1}
              />
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
                const canMoveOrDelete = !viewerOnly && (isAdmin || (currentUser?.id && box.ownerId === currentUser.id));
                // Para usuarios no admin y que no son dueños del cuadro: solo mostrar texto “plano” sin marco
                const showFrame = !!canMoveOrDelete;
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
                          ? isSelected
                            ? 'rounded border border-monday-blue ring-2 ring-monday-blue/30 bg-white shadow-md'
                            : 'rounded border border-monday-border bg-white/95 hover:bg-white'
                          : ''
                      }`}
                    >
                    <div
                      className={`flex-1 min-h-0 min-w-0 flex overflow-hidden rounded-sm ${
                        showFrame ? 'bg-white/95 focus-within:bg-white focus-within:ring-1 focus-within:ring-monday-blue/40' : 'bg-transparent'
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
                        <textarea
                          readOnly
                          value={boxVal}
                          style={boxTextStyle}
                          className={`w-full h-full min-h-0 resize-none border-0 outline-none bg-transparent px-1.5 overflow-hidden block whitespace-pre-wrap break-words text-left box-border ${isDescripcionCorta ? 'pt-6 pb-1' : isFolio ? 'pt-3 pb-1' : isSingleLineOrFolio ? 'pt-4 pb-1' : 'pt-2 py-1'}`}
                        />
                      ) : box.singleLine ? (
                        <input
                          type="text"
                          value={boxVal}
                          onChange={(e) =>
                            box.fieldKey
                              ? update({ [box.fieldKey]: e.target.value })
                              : update({
                                  customFieldValues: { ...customValues, [box.id]: e.target.value },
                                })
                          }
                          placeholder={getSemanticPlaceholder(box)}
                          style={{
                            ...boxTextStyle,
                            backgroundColor: showFrame ? 'rgba(255,255,255,0.95)' : 'transparent',
                          }}
                          className={`w-full h-full min-h-0 border-0 outline-none focus:ring-0 px-1.5 placeholder:text-gray-500 block text-left box-border ${isDescripcionCorta ? 'pt-6 pb-1' : isFolio ? 'pt-3 pb-1' : isSingleLineOrFolio ? 'pt-4 pb-1' : 'pt-2 py-1'} ${
                            showFrame ? 'rounded' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                          onFocus={() => {
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                          spellCheck
                        />
                      ) : (
                        <textarea
                          value={boxVal}
                          onChange={(e) =>
                            box.fieldKey
                              ? update({ [box.fieldKey]: e.target.value })
                              : update({
                                  customFieldValues: { ...customValues, [box.id]: e.target.value },
                                })
                          }
                          placeholder={getSemanticPlaceholder(box)}
                          style={{
                            ...boxTextStyle,
                            backgroundColor: showFrame ? 'rgba(255,255,255,0.95)' : 'transparent',
                          }}
                          className={`w-full h-full min-h-0 resize-none border-0 outline-none focus:ring-0 ${isDescripcionCorta ? 'pt-6' : 'pt-2'} py-1 px-1.5 placeholder:text-gray-500 overflow-auto block text-left box-border ${
                            showFrame ? 'rounded' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                          onFocus={() => {
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                          spellCheck
                        />
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
