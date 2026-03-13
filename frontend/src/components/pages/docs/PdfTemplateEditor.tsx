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
}

const PAGE_ASPECT = 595 / 842; // A4

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
}) => {
  const { currentUser } = useUser();
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ fieldKey: string; startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{ boxId: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
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

  const fontColor = templateConfig?.fontColor ?? '#000000';
  const fontFamily = templateConfig?.fontFamily ?? 'Helvetica';
  const fontSize = templateConfig?.fontSize ?? 11;
  const fontBold = templateConfig?.fontBold ?? false;
  const fontItalic = templateConfig?.fontItalic ?? false;
  const customBoxes = templateConfig?.customBoxes ?? [];

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

  const handleCustomBoxMouseDown = useCallback((e: React.MouseEvent, box: CustomBoxDef) => {
    e.preventDefault();
    setDragging({ fieldKey: box.id, startX: e.clientX, startY: e.clientY, startLeft: box.x, startTop: box.y });
  }, []);

  const addCustomBox = useCallback((singleLine = false) => {
    if (!templateConfig || !onTemplateConfigChange || !currentUser?.id) return;
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
      ...templateConfig,
      customBoxes: [...customBoxes, newBox],
    });
    const cf = (value.customFieldValues as Record<string, string>) ?? {};
    update({ customFieldValues: { ...cf, [newBox.id]: '' } });
  }, [templateConfig, onTemplateConfigChange, customBoxes, value.customFieldValues, update, currentUser?.id]);

  const openAddImageDialog = useCallback(() => {
    if (!templateConfig || !onTemplateConfigChange || !currentUser?.id) return;
    setImageDialogMode('add');
    setImageDialogBoxId(null);
    setImageDialogUrl('');
    setImageDialogError(null);
    setImageDialogOpen(true);
  }, [templateConfig, onTemplateConfigChange, currentUser?.id]);

  const openEditImageDialog = useCallback((box: CustomBoxDef) => {
    setImageDialogMode('edit');
    setImageDialogBoxId(box.id);
    setImageDialogUrl(box.imageUrl || '');
    setImageDialogError(null);
    setImageDialogOpen(true);
  }, []);

  const applyImageDialog = useCallback(() => {
    const url = imageDialogUrl.trim();
    if (!url || !templateConfig || !onTemplateConfigChange) return;
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
        ...templateConfig,
        customBoxes: [...customBoxes, newBox],
      });
    } else if (imageDialogMode === 'edit' && imageDialogBoxId) {
      const nextBoxes = customBoxes.map((b) =>
        b.id === imageDialogBoxId ? { ...b, imageUrl: url } : b
      );
      onTemplateConfigChange({ ...templateConfig, customBoxes: nextBoxes });
    }
    setImageDialogOpen(false);
  }, [imageDialogMode, imageDialogBoxId, imageDialogUrl, templateConfig, onTemplateConfigChange, customBoxes, currentUser?.id]);

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
      if (dragPreview !== null && templateConfig && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === dragging.fieldKey ? { ...b, x: dragPreview.x, y: dragPreview.y } : b
        );
        onTemplateConfigChange({ ...templateConfig, customBoxes: nextBoxes });
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
  }, [dragging, dragPreview, customBoxes, templateConfig, onTemplateConfigChange]);

  const handleResizeStart = useCallback((e: React.MouseEvent, box: CustomBoxDef) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ boxId: box.id, startX: e.clientX, startY: e.clientY, startW: box.width, startH: box.height });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - resizing.startX) / rect.width;
      const dy = (e.clientY - resizing.startY) / rect.height;
      let w = resizing.startW + dx;
      let h = resizing.startH + dy;
      w = Math.max(0.08, Math.min(0.95, w));
      h = Math.max(0.04, Math.min(0.9, h));
      setResizePreview({ width: w, height: h });
    };
    const onUp = () => {
      if (!resizing) return;
      if (resizePreview !== null && templateConfig && onTemplateConfigChange) {
        const nextBoxes = customBoxes.map((b) =>
          b.id === resizing.boxId ? { ...b, width: resizePreview.width, height: resizePreview.height } : b
        );
        onTemplateConfigChange({ ...templateConfig, customBoxes: nextBoxes });
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
  }, [resizing, resizePreview, customBoxes, templateConfig, onTemplateConfigChange]);

  const normalizedColor = fontColor.toLowerCase() === '#ffffff' ? '#ffffff' : '#000000';
  const getTextStyleForBox = (box: CustomBoxDef) => {
    const size = box.fontSize ?? 11;
    const col = box.fontColor != null ? (box.fontColor.toLowerCase() === '#ffffff' ? '#ffffff' : '#000000') : normalizedColor;
    const ff = box.fontFamily ?? fontFamily;
    const bold = box.fontBold ?? fontBold;
    const italic = box.fontItalic ?? fontItalic;
    return {
      fontFamily: ff,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      color: col,
      fontSize: `${size}pt`,
    };
  };
  useEffect(() => {
    if (selectedBoxId && !customBoxes.some((b) => b.id === selectedBoxId)) setSelectedBoxId(null);
  }, [selectedBoxId, customBoxes]);

  const previewImageUrl = imageDialogUrl.trim().startsWith('/') ? `${API_BASE}${imageDialogUrl}` : imageDialogUrl;

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-monday-bg/30 min-h-0">
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
      {isAdmin && templateConfig && (
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
      {templateConfig && onTemplateConfigChange && (
        <TextFormatBarForTemplate
          templateConfig={{
            fontFamily: templateConfig.fontFamily,
            fontSize: templateConfig.fontSize,
            fontBold: templateConfig.fontBold,
            fontItalic: templateConfig.fontItalic,
            fontColor: templateConfig.fontColor,
            customBoxes: templateConfig.customBoxes,
          }}
          onTemplateConfigChange={onTemplateConfigChange}
          selectedBoxId={selectedBoxId}
          onAddTextBox={() => addCustomBox(false)}
          onAddImageBox={openAddImageDialog}
          isAdmin={isAdmin}
        />
      )}
      <div className="flex-1 overflow-auto flex items-center justify-center min-h-0 p-2 sm:p-4">
        <div
          ref={containerRef}
          className="relative bg-transparent rounded-lg border border-monday-border/60 shadow-monday overflow-hidden"
          style={{
            width: '100%',
            maxWidth: '21cm',
            aspectRatio: String(PAGE_ASPECT),
            maxHeight: 'calc(100vh - 12rem)',
            height: 'auto',
          }}
        >
          {/* Capa 1: Fondo (PDF o blanco) — detrás y sin recibir clics */}
          <div className="absolute inset-0 z-0">
            {templatePdfUrl ? (
              <iframe
                src={`${templatePdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                title="Plantilla PDF"
                className="w-full h-full border-0 pointer-events-none select-none"
                tabIndex={-1}
              />
            ) : (
              <div className="w-full h-full bg-white flex items-center justify-center text-monday-subtext text-sm">
                Sin plantilla PDF. Coloca {docType}.pdf en backend/templates/
              </div>
            )}
          </div>
          {/* Capa 2: cuadros dinámicos sobre la plantilla */}
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className="absolute inset-0 pointer-events-auto">
              {/* Cuadros de texto / imagen agregados en la plantilla */}
              {customBoxes.map((box) => {
                const canMoveOrDelete = isAdmin || (currentUser?.id && box.ownerId === currentUser.id);
                const canFormatBox = true;
                const isDraggingThis = dragging?.fieldKey === box.id && dragPreview;
                const isResizingThis = resizing?.boxId === box.id && resizePreview;
                const x = isDraggingThis ? dragPreview.x : box.x;
                const y = isDraggingThis ? dragPreview.y : box.y;
                const w = isResizingThis ? resizePreview.width : box.width;
                const h = isResizingThis ? resizePreview.height : box.height;
                const customValues = (value.customFieldValues as Record<string, string>) ?? {};
                const boxVal = customValues[box.id] ?? '';
                const boxTextStyle = getTextStyleForBox(box);
                const isSelected = selectedBoxId === box.id;
                return (
                  <div
                    key={box.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => canFormatBox && setSelectedBoxId(box.id)}
                    className={`absolute flex flex-col group box-border rounded border transition-all overflow-visible ${isSelected ? 'border-monday-blue ring-2 ring-monday-blue/30 bg-white/10' : 'border-monday-border/20 bg-white/5'}`}
                    style={{
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                      minHeight: '28px',
                      minWidth: '60px',
                    }}
                  >
                    {canMoveOrDelete && (
                    <div
                      className="absolute left-0 right-0 flex items-center justify-end gap-0.5 h-6 px-1 rounded-t border border-monday-border/20 border-b-0 bg-white/95 shadow-sm z-10 -top-6"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="cursor-grab active:cursor-grabbing text-monday-subtext hover:text-monday-blue p-0.5 rounded"
                        onMouseDown={(e) => canMoveOrDelete && handleCustomBoxMouseDown(e, box)}
                        title="Arrastrar"
                      >
                        <GripVertical size={12} />
                      </div>
                      {box.kind === 'image' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditImageDialog(box);
                          }}
                          className="p-0.5 rounded text-monday-subtext hover:text-monday-blue hover:bg-monday-hover"
                          title="Editar imagen"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!templateConfig || !onTemplateConfigChange || !canMoveOrDelete) return;
                          onTemplateConfigChange({
                            ...templateConfig,
                            customBoxes: customBoxes.filter((b) => b.id !== box.id),
                          });
                        }}
                        className="p-0.5 rounded text-monday-subtext hover:text-red-600 hover:bg-red-50"
                        title="Eliminar cuadro"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    )}
                    <div className="flex-1 min-h-0 flex overflow-hidden rounded-sm focus-within:bg-white/60 focus-within:ring-1 focus-within:ring-monday-blue/40">
                      {box.kind === 'image' ? (
                        <img
                          src={box.imageUrl || ''}
                          alt=""
                          className="w-full h-full object-contain select-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canFormatBox) setSelectedBoxId(box.id);
                          }}
                        />
                      ) : box.singleLine ? (
                        <input
                          type="text"
                          value={boxVal}
                          onChange={(e) =>
                            update({
                              customFieldValues: { ...customValues, [box.id]: e.target.value },
                            })
                          }
                          placeholder="Texto (una línea)"
                          style={boxTextStyle}
                          className="w-full h-full min-h-0 bg-transparent border-0 outline-none focus:ring-0 py-1 px-1.5 placeholder:text-gray-400 block"
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
                            update({
                              customFieldValues: { ...customValues, [box.id]: e.target.value },
                            })
                          }
                          placeholder="Texto (varios renglones)"
                          style={boxTextStyle}
                          className="w-full h-full min-h-0 resize-none bg-transparent border-0 outline-none focus:ring-0 py-1 px-1.5 placeholder:text-gray-400 overflow-auto block"
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
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-monday-subtext hover:text-monday-blue border-t border-l border-monday-border/40 rounded-tl bg-white/80"
                      onMouseDown={(e) => canMoveOrDelete && handleResizeStart(e, box)}
                      title="Redimensionar (arrastrar)"
                    >
                      <Maximize2 size={10} />
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
  );
};
