import React, { useCallback, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ImagePlus } from 'lucide-react';
import { apiFetch } from '../../api';
import type { CustomBoxDef } from '../pages/docs/pdfTemplateConfig';

const UPLOAD_API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

/** Opciones de fuente compartidas entre docs y plantillas (incl. Averta Std) */
export const FONT_OPTIONS = [
  { value: 'Averta Std', label: 'Averta Std' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier New', label: 'Courier New' },
];

export const FONT_SIZES = [
  { label: '10pt', value: '10pt' },
  { label: '11pt', value: '11pt' },
  { label: '12pt', value: '12pt' },
  { label: '14pt', value: '14pt' },
  { label: '18pt', value: '18pt' },
  { label: '24pt', value: '24pt' },
];

const COLOR_OPTIONS = [
  { value: '#000000', label: 'Negro' },
  { value: '#374151', label: 'Gris oscuro' },
  { value: '#6b7280', label: 'Gris' },
  { value: '#2563eb', label: 'Azul' },
  { value: '#16a34a', label: 'Verde' },
  { value: '#dc2626', label: 'Rojo' },
  { value: '#ca8a04', label: 'Amarillo / oro' },
  { value: '#ffffff', label: 'Blanco' },
];

const formatBarBtn =
  'p-2 rounded-monday border-0 text-monday-text hover:bg-monday-hover active:bg-monday-border transition-colors min-w-[32px]';

/** Barra para editor contentEditable (docs): negrita, cursiva, tachado, subrayado, fuente, tamaño, listas */
export interface TextFormatBarForEditorProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  reportContent: () => void;
}

export function TextFormatBarForEditor({ editorRef, reportContent }: TextFormatBarForEditorProps) {
  const savedRangeRef = useRef<Range | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const el = editorRef.current;
    if (!el || !el.contains(sel.anchorNode)) return;
    savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }, [editorRef]);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el || !savedRangeRef.current) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  }, [editorRef]);

  const keepFocus = useCallback(
    (fn: () => void) => {
      return (e: React.MouseEvent) => {
        e.preventDefault();
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        fn();
        reportContent();
      };
    },
    [editorRef, reportContent]
  );

  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value ?? '');
  }, []);

  const applyFontSize = useCallback(
    (size: string) => {
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        document.execCommand('insertHTML', false, `<span style="font-size: ${size}">&#8203;</span>`);
        return;
      }
      const span = document.createElement('span');
      span.style.fontSize = size;
      try {
        range.surroundContents(span);
      } catch {
        document.execCommand('insertHTML', false, `<span style="font-size: ${size}">${range.toString()}</span>`);
      }
    },
    [restoreSelection]
  );

  const applyFontFamily = useCallback(
    (fontFamily: string) => {
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) {
        document.execCommand('insertHTML', false, `<span style="font-family: ${fontFamily}">&#8203;</span>`);
        return;
      }
      const span = document.createElement('span');
      span.style.fontFamily = fontFamily;
      try {
        range.surroundContents(span);
      } catch {
        document.execCommand('insertHTML', false, `<span style="font-family: ${fontFamily}">${range.toString()}</span>`);
      }
    },
    [restoreSelection]
  );

  const insertImageAtSelection = useCallback(
    async (file: File) => {
      if (!/^image\/jpe?g$/i.test(file.type)) {
        window.alert('Solo se aceptan imágenes JPG para insertar en el documento (mismo criterio que el encabezado).');
        return;
      }
      setImageUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiFetch(`${UPLOAD_API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const text = await res.text();
        let data: { error?: string; url?: string } = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { error: `Error del servidor (${res.status})` };
        }
        if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
        const url = data.url;
        if (!url) throw new Error('Sin URL de imagen');
        const abs = url.trim().startsWith('/') ? UPLOAD_API_BASE + url : url;
        editorRef.current?.focus();
        restoreSelection();
        const img = `<p><img src="${abs}" alt="" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:0.5em 0;" /></p>`;
        document.execCommand('insertHTML', false, img);
        reportContent();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al subir';
        window.alert(msg);
      } finally {
        setImageUploading(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
      }
    },
    [editorRef, reportContent, restoreSelection],
  );

  const insertList = useCallback(
    (tag: 'ul' | 'ol') => () => {
      const cmd = tag === 'ul' ? 'insertUnorderedList' : 'insertOrderedList';
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        document.execCommand(cmd, false);
        return;
      }
      const range = sel.getRangeAt(0);
      const el = editorRef.current;
      if (!el) {
        document.execCommand(cmd, false);
        return;
      }
      let block: HTMLElement | null =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? (range.startContainer.parentElement as HTMLElement)
          : (range.startContainer as HTMLElement);
      while (block && block !== el && !/^(P|DIV|LI|H[1-6])$/i.test(block.nodeName)) {
        block = block.parentElement;
      }
      const isEmpty = block && el.contains(block) && (!block.textContent || block.textContent.trim() === '');
      if (isEmpty && block) {
        const list = document.createElement(tag);
        list.className = tag === 'ul' ? 'list-disc ml-4 my-1' : 'list-decimal ml-4 my-1';
        const li = document.createElement('li');
        li.appendChild(document.createElement('br'));
        list.appendChild(li);
        block.parentNode?.replaceChild(list, block);
        const r = document.createRange();
        r.setStart(li, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      document.execCommand(cmd, false);
    },
    [editorRef]
  );

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-2 sm:px-3 py-2 bg-[var(--monday-surface)] border-b border-monday-border shadow-sm overflow-x-auto overflow-y-hidden flex-nowrap max-w-full touch-pan-x">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/jpg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void insertImageAtSelection(f);
        }}
      />
      <Popover.Root modal={false}>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            className="shrink-0 px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-[var(--monday-surface)] text-monday-text hover:bg-monday-hover min-w-[4.5rem] text-left touch-manipulation"
            title="Fuente"
          >
            Fuente
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[80] p-1.5 rounded-lg shadow-lg border border-monday-border bg-[var(--monday-surface)] max-h-[240px] overflow-auto"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {FONT_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                onClick={() => {
                  restoreSelection();
                  applyFontFamily(value);
                  reportContent();
                }}
              >
                {label}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="w-px h-5 bg-monday-border mx-0.5 shrink-0" />
      <button type="button" onMouseDown={keepFocus(() => exec('bold'))} className={`${formatBarBtn} shrink-0 touch-manipulation`} title="Negrita">
        <span className="text-[13px] font-bold">B</span>
      </button>
      <button type="button" onMouseDown={keepFocus(() => exec('italic'))} className={`${formatBarBtn} shrink-0 touch-manipulation`} title="Cursiva">
        <span className="text-[13px] italic font-serif">I</span>
      </button>
      <button type="button" onMouseDown={keepFocus(() => exec('strikeThrough'))} className={`${formatBarBtn} shrink-0 touch-manipulation`} title="Tachado">
        <span className="text-[13px] line-through">S</span>
      </button>
      <button type="button" onMouseDown={keepFocus(() => exec('underline'))} className={`${formatBarBtn} shrink-0 touch-manipulation`} title="Subrayado">
        <span className="text-[13px] underline">U</span>
      </button>
      <div className="w-px h-5 bg-monday-border mx-0.5 shrink-0" />
      <Popover.Root modal={false}>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            className="shrink-0 px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-[var(--monday-surface)] text-monday-text hover:bg-monday-hover min-w-[3.75rem] text-left touch-manipulation"
            title="Tamaño de texto"
          >
            Tamaño
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[80] p-1.5 rounded-lg shadow-lg border border-monday-border bg-[var(--monday-surface)]"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {FONT_SIZES.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                onClick={() => {
                  applyFontSize(value);
                  reportContent();
                }}
              >
                {label}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="w-px h-5 bg-monday-border mx-0.5 shrink-0" />
      <button type="button" onMouseDown={keepFocus(insertList('ul'))} className={`${formatBarBtn} shrink-0 touch-manipulation`} title="Lista con viñetas">
        <span className="text-[14px]">•</span>
      </button>
      <button type="button" onMouseDown={keepFocus(insertList('ol'))} className={`${formatBarBtn} shrink-0 touch-manipulation`} title="Lista numerada">
        <span className="text-[13px] font-medium">1.</span>
      </button>
      <div className="w-px h-5 bg-monday-border mx-0.5 shrink-0" />
      <Popover.Root modal={false}>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            className="shrink-0 px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-[var(--monday-surface)] hover:bg-monday-hover min-w-[3.75rem] text-left flex items-center gap-1 touch-manipulation"
            title="Color de texto"
          >
            <span className="w-3 h-3 rounded border border-monday-border bg-monday-text" />
            Color
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[80] p-1.5 rounded-lg shadow-lg border border-monday-border bg-[var(--monday-surface)] max-h-[220px] overflow-y-auto"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {COLOR_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                onClick={() => {
                  restoreSelection();
                  exec('foreColor', value);
                  reportContent();
                }}
              >
                <span className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: value }} />
                {label}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="w-px h-5 bg-monday-border mx-0.5 shrink-0" />
      <button
        type="button"
        disabled={imageUploading}
        onMouseDown={(e) => {
          e.preventDefault();
          saveSelection();
          editorRef.current?.focus();
          imageInputRef.current?.click();
        }}
        className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-[var(--monday-surface)] text-monday-text hover:bg-monday-hover touch-manipulation disabled:opacity-50"
        title="Insertar imagen (JPG)"
      >
        <ImagePlus size={14} className="shrink-0" />
        Imagen
      </button>
      <span className="text-[11px] text-monday-subtext px-1 shrink-0 whitespace-nowrap hidden sm:inline">Doc</span>
    </div>
  );
}

/** Opciones de tamaño en pt para plantillas (igual criterio que FONT_SIZES) */
export const FONT_SIZE_PT_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18];

/** Barra de formato para editor de plantillas PDF: fuente, tamaño, negrita, cursiva, color (aplica al cuadro seleccionado o por defecto) */
export interface TextFormatBarForTemplateProps {
  templateConfig: {
    fontFamily: string;
    fontSize?: number;
    fontBold?: boolean;
    fontItalic?: boolean;
    fontColor?: string;
    customBoxes?: CustomBoxDef[];
  };
  onTemplateConfigChange: (patch: {
    fontFamily?: string;
    fontSize?: number;
    fontBold?: boolean;
    fontItalic?: boolean;
    fontColor?: string;
    customBoxes?: CustomBoxDef[];
  }) => void;
  selectedBoxId: string | null;
  onAddTextBox?: () => void;
  onAddImageBox?: () => void;
  /** Solo los administradores pueden marcar un cuadro como Elemento/Folio */
  isAdmin?: boolean;
  /** Modo de UI para restringir controles estructurales (Focus Mode / Micro-Editor). */
  uiMode?: 'full' | 'textStyleOnly';
}

export function TextFormatBarForTemplate({
  templateConfig,
  onTemplateConfigChange,
  selectedBoxId,
  onAddTextBox,
  onAddImageBox,
  isAdmin,
  uiMode = 'full',
}: TextFormatBarForTemplateProps) {
  const isTextStyleOnly = uiMode === 'textStyleOnly';
  const selectedBox = selectedBoxId
    ? templateConfig.customBoxes?.find((b) => b.id === selectedBoxId)
    : null;

  // Valores efectivos: prioridad al cuadro seleccionado, fallback al global
  const effectiveFontSize = selectedBox?.fontSize ?? templateConfig.fontSize ?? 11;
  const effectiveColor = selectedBox?.fontColor ?? templateConfig.fontColor ?? '#000000';
  const effectiveFontFamily = selectedBox?.fontFamily ?? templateConfig.fontFamily;
  const effectiveBold = selectedBox?.fontBold ?? templateConfig.fontBold ?? false;
  const effectiveItalic = selectedBox?.fontItalic ?? templateConfig.fontItalic ?? false;

  const hasSelection = !!selectedBoxId && !!(templateConfig.customBoxes ?? []).find((b) => b.id === selectedBoxId);

  const updateSelectedBox = useCallback(
    (updates: { fontSize?: number; fontColor?: string; fontFamily?: string; fontBold?: boolean; fontItalic?: boolean }) => {
      if (!selectedBoxId || !templateConfig.customBoxes) return;
      const patch: Parameters<typeof onTemplateConfigChange>[0] = {
        customBoxes: templateConfig.customBoxes.map((b) =>
          b.id === selectedBoxId
            ? {
                ...b,
                ...(updates.fontSize != null ? { fontSize: updates.fontSize } : {}),
                ...(updates.fontColor != null ? { fontColor: updates.fontColor } : {}),
                ...(updates.fontFamily != null ? { fontFamily: updates.fontFamily } : {}),
                ...(updates.fontBold != null ? { fontBold: updates.fontBold } : {}),
                ...(updates.fontItalic != null ? { fontItalic: updates.fontItalic } : {}),
              }
            : b
        ),
      };
      onTemplateConfigChange(patch);
    },
    [selectedBoxId, templateConfig.customBoxes, onTemplateConfigChange]
  );

  // Si hay cuadro seleccionado, aplica estilo al cuadro; si no, aplica estilo global del master.
  const applyStyle = useCallback(
    (updates: { fontSize?: number; fontColor?: string; fontFamily?: string; fontBold?: boolean; fontItalic?: boolean }) => {
      if (hasSelection) {
        updateSelectedBox(updates);
        return;
      }
      onTemplateConfigChange({
        ...(updates.fontFamily != null ? { fontFamily: updates.fontFamily } : {}),
        ...(updates.fontSize != null ? { fontSize: updates.fontSize } : {}),
        ...(updates.fontBold != null ? { fontBold: updates.fontBold } : {}),
        ...(updates.fontItalic != null ? { fontItalic: updates.fontItalic } : {}),
        ...(updates.fontColor != null ? { fontColor: updates.fontColor } : {}),
      });
    },
    [hasSelection, onTemplateConfigChange, updateSelectedBox]
  );

  const disabledCls = 'opacity-40 cursor-not-allowed pointer-events-none';
  const formatBarBtn =
    'p-2 rounded-monday border-0 transition-colors min-w-[32px]';
  const activeFormatBarBtn = `${formatBarBtn} text-monday-text hover:bg-monday-hover active:bg-monday-border`;
  const inactiveFormatBarBtn = `${formatBarBtn} text-monday-subtext ${disabledCls}`;

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
      {!isTextStyleOnly && (
        <>
          {/* Fuente */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white min-w-[5rem] text-left transition-colors text-monday-text hover:bg-monday-hover"
                title={hasSelection ? 'Fuente del cuadro' : 'Fuente global del master'}
              >
                {FONT_OPTIONS.find((f) => f.value === effectiveFontFamily)?.label ?? effectiveFontFamily}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 p-1.5 rounded-lg shadow-lg border border-monday-border bg-white max-h-[240px] overflow-auto"
                sideOffset={4}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {FONT_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-monday-hover rounded ${value === effectiveFontFamily ? 'text-monday-blue font-semibold' : 'text-monday-text'}`}
                    onClick={() => applyStyle({ fontFamily: value })}
                  >
                    {label}
                  </button>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <div className="w-px h-5 bg-monday-border mx-1" />

          {/* Marcar semántica del cuadro (Elemento / Folio) – solo ADMIN */}
          {isAdmin && hasSelection && (
            <>
              <button
                type="button"
                className={activeFormatBarBtn}
                title="Usar este cuadro para el nombre de elemento del tablero"
                onClick={() => {
                  if (!templateConfig.customBoxes || !selectedBoxId) return;
                  const next: CustomBoxDef[] = templateConfig.customBoxes.map((b) => {
                    if (b.id === selectedBoxId) return { ...b, semantic: 'element' };
                    if (b.semantic === 'element') {
                      const { semantic, ...rest } = b;
                      return rest;
                    }
                    return b;
                  });
                  onTemplateConfigChange({ customBoxes: next });
                }}
              >
                Elemento
              </button>
              <button
                type="button"
                className={activeFormatBarBtn}
                title="Usar este cuadro para el folio del tablero"
                onClick={() => {
                  if (!templateConfig.customBoxes || !selectedBoxId) return;
                  const next: CustomBoxDef[] = templateConfig.customBoxes.map((b) => {
                    if (b.id === selectedBoxId) return { ...b, semantic: 'folio' };
                    if (b.semantic === 'folio') {
                      const { semantic, ...rest } = b;
                      return rest;
                    }
                    return b;
                  });
                  onTemplateConfigChange({ customBoxes: next });
                }}
              >
                Folio
              </button>
            </>
          )}

          <div className="w-px h-5 bg-monday-border mx-1" />
        </>
      )}

      {/* Negrita */}
      <button
        type="button"
        onClick={() => applyStyle({ fontBold: !effectiveBold })}
        className={`${activeFormatBarBtn} ${effectiveBold ? 'bg-monday-hover' : ''}`}
        title={hasSelection ? 'Negrita del cuadro' : 'Negrita global del master'}
      >
        <span className="text-[13px] font-bold">B</span>
      </button>

      {/* Cursiva */}
      <button
        type="button"
        onClick={() => applyStyle({ fontItalic: !effectiveItalic })}
        className={`${activeFormatBarBtn} ${effectiveItalic ? 'bg-monday-hover' : ''}`}
        title={hasSelection ? 'Cursiva del cuadro' : 'Cursiva global del master'}
      >
        <span className="text-[13px] italic font-serif">I</span>
      </button>

      <div className="w-px h-5 bg-monday-border mx-1" />

      {!isTextStyleOnly && (
        <>
          {/* Tamaño */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white min-w-[4rem] text-left transition-colors text-monday-text hover:bg-monday-hover"
                title={hasSelection ? 'Tamaño del cuadro' : 'Tamaño global del master'}
              >
                {effectiveFontSize}pt
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 p-1.5 rounded-lg shadow-lg border border-monday-border bg-white"
                sideOffset={4}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {FONT_SIZE_PT_OPTIONS.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-monday-hover rounded ${pt === effectiveFontSize ? 'text-monday-blue font-semibold' : 'text-monday-text'}`}
                    onClick={() => applyStyle({ fontSize: pt })}
                  >
                    {pt}pt
                  </button>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <div className="w-px h-5 bg-monday-border mx-1" />
        </>
      )}

      {/* Color */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white min-w-[4rem] text-left flex items-center gap-1 transition-colors hover:bg-monday-hover"
            title={hasSelection ? 'Color del cuadro' : 'Color global del master'}
          >
            <span
              className="w-3 h-3 rounded border border-monday-border"
              style={{ backgroundColor: effectiveColor }}
            />
            <span className="text-monday-text">Color</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 p-1.5 rounded-lg shadow-lg border border-monday-border bg-white"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {COLOR_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-[12px] hover:bg-monday-hover rounded ${value === effectiveColor ? 'text-monday-blue font-semibold' : 'text-monday-text'}`}
                onClick={() => applyStyle({ fontColor: value })}
              >
                <span className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: value }} />
                {label}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {!isTextStyleOnly && (
        <>
          {/* Acciones admin */}
          {onAddTextBox && (
            <>
              <div className="w-px h-5 bg-monday-border mx-1" />
              <button
                type="button"
                onClick={onAddTextBox}
                className={activeFormatBarBtn}
                title="Agregar cuadro de texto"
              >
                <span className="text-[12px]">+ Texto</span>
              </button>
            </>
          )}
          {onAddImageBox && (
            <button
              type="button"
              onClick={onAddImageBox}
              className={activeFormatBarBtn}
              title="Agregar imagen"
            >
              <span className="text-[12px]">+ Imagen</span>
            </button>
          )}
        </>
      )}

      {/* Indicador de estado */}
      <span className={`text-[11px] px-2 ${hasSelection ? 'text-monday-blue font-medium' : 'text-monday-subtext'}`}>
        {hasSelection ? '✎ Cuadro seleccionado' : 'Sin selección: editando estilo global del master'}
      </span>
    </div>
  );
}
