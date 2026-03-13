import React, { useCallback, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';

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
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white text-monday-text hover:bg-monday-hover min-w-[5rem] text-left"
            title="Fuente"
          >
            Fuente
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
      <div className="w-px h-5 bg-monday-border mx-1" />
      <button type="button" onMouseDown={keepFocus(() => exec('bold'))} className={formatBarBtn} title="Negrita">
        <span className="text-[13px] font-bold">B</span>
      </button>
      <button type="button" onMouseDown={keepFocus(() => exec('italic'))} className={formatBarBtn} title="Cursiva">
        <span className="text-[13px] italic font-serif">I</span>
      </button>
      <button type="button" onMouseDown={keepFocus(() => exec('strikeThrough'))} className={formatBarBtn} title="Tachado">
        <span className="text-[13px] line-through">S</span>
      </button>
      <button type="button" onMouseDown={keepFocus(() => exec('underline'))} className={formatBarBtn} title="Subrayado">
        <span className="text-[13px] underline">U</span>
      </button>
      <div className="w-px h-5 bg-monday-border mx-1" />
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white text-monday-text hover:bg-monday-hover min-w-[4rem] text-left"
            title="Tamaño de texto"
          >
            Tamaño
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 p-1.5 rounded-lg shadow-lg border border-monday-border bg-white"
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
      <div className="w-px h-5 bg-monday-border mx-1" />
      <button type="button" onMouseDown={keepFocus(insertList('ul'))} className={formatBarBtn} title="Lista con viñetas">
        <span className="text-[14px]">•</span>
      </button>
      <button type="button" onMouseDown={keepFocus(insertList('ol'))} className={formatBarBtn} title="Lista numerada">
        <span className="text-[13px] font-medium">1.</span>
      </button>
      <div className="w-px h-5 bg-monday-border mx-1" />
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white hover:bg-monday-hover min-w-[4rem] text-left flex items-center gap-1"
            title="Color de texto"
          >
            <span className="w-3 h-3 rounded border border-monday-border bg-monday-text" />
            Color
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
      <div className="w-px h-5 bg-monday-border mx-1" />
      <span className="text-[11px] text-monday-subtext px-2">Documento</span>
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
    customBoxes?: Array<{ id: string; fontSize?: number; fontColor?: string }>;
  };
  onTemplateConfigChange: (patch: {
    fontFamily?: string;
    fontSize?: number;
    fontBold?: boolean;
    fontItalic?: boolean;
    fontColor?: string;
    customBoxes?: Array<{ id: string; fontSize?: number; fontColor?: string }>;
  }) => void;
  selectedBoxId: string | null;
  onAddTextBox?: () => void;
  onAddImageBox?: () => void;
}

export function TextFormatBarForTemplate({
  templateConfig,
  onTemplateConfigChange,
  selectedBoxId,
  onAddTextBox,
  onAddImageBox,
}: TextFormatBarForTemplateProps) {
  const selectedBox = selectedBoxId
    ? templateConfig.customBoxes?.find((b) => b.id === selectedBoxId)
    : null;
  const effectiveFontSize = selectedBox?.fontSize ?? templateConfig.fontSize ?? 11;
  const effectiveColor = selectedBox?.fontColor ?? templateConfig.fontColor ?? '#000000';

  const updateBoxOrGlobal = useCallback(
    (updates: { fontSize?: number; fontColor?: string; fontFamily?: string; fontBold?: boolean; fontItalic?: boolean }) => {
      const patch: Parameters<typeof onTemplateConfigChange>[0] = {};
      if (updates.fontFamily != null) patch.fontFamily = updates.fontFamily;
      if (updates.fontBold != null) patch.fontBold = updates.fontBold;
      if (updates.fontItalic != null) patch.fontItalic = updates.fontItalic;
      if (selectedBoxId && templateConfig.customBoxes && (updates.fontSize != null || updates.fontColor != null)) {
        patch.customBoxes = templateConfig.customBoxes.map((b) =>
          b.id === selectedBoxId
            ? {
                ...b,
                fontSize: updates.fontSize ?? b.fontSize,
                fontColor: updates.fontColor ?? b.fontColor,
              }
            : b
        );
      } else if (!selectedBoxId) {
        if (updates.fontSize != null) patch.fontSize = updates.fontSize;
        if (updates.fontColor != null) patch.fontColor = updates.fontColor;
      }
      if (Object.keys(patch).length > 0) onTemplateConfigChange(patch);
    },
    [selectedBoxId, templateConfig.customBoxes, onTemplateConfigChange]
  );

  const formatBarBtn =
    'p-2 rounded-monday border-0 text-monday-text hover:bg-monday-hover active:bg-monday-border transition-colors min-w-[32px]';

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white text-monday-text hover:bg-monday-hover min-w-[5rem] text-left"
            title="Fuente"
          >
            {FONT_OPTIONS.find((f) => f.value === templateConfig.fontFamily)?.label ?? templateConfig.fontFamily}
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
                className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                onClick={() => updateBoxOrGlobal({ fontFamily: value })}
              >
                {label}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="w-px h-5 bg-monday-border mx-1" />
      <button
        type="button"
        onClick={() => updateBoxOrGlobal({ fontBold: !templateConfig.fontBold })}
        className={formatBarBtn}
        title="Negrita"
      >
        <span className="text-[13px] font-bold">B</span>
      </button>
      <button
        type="button"
        onClick={() => updateBoxOrGlobal({ fontItalic: !templateConfig.fontItalic })}
        className={formatBarBtn}
        title="Cursiva"
      >
        <span className="text-[13px] italic font-serif">I</span>
      </button>
      <div className="w-px h-5 bg-monday-border mx-1" />
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white text-monday-text hover:bg-monday-hover min-w-[4rem] text-left"
            title="Tamaño"
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
                className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                onClick={() => updateBoxOrGlobal({ fontSize: pt })}
              >
                {pt}pt
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="w-px h-5 bg-monday-border mx-1" />
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white hover:bg-monday-hover min-w-[4rem] text-left flex items-center gap-1"
            title="Color"
          >
            <span className="w-3 h-3 rounded border border-monday-border" style={{ backgroundColor: effectiveColor }} />
            Color
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 p-1.5 rounded-lg shadow-lg border border-monday-border bg-white"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {[
              { value: '#000000', label: 'Negro' },
              { value: '#ffffff', label: 'Blanco' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                onClick={() => updateBoxOrGlobal({ fontColor: value })}
              >
                <span className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: value }} />
                {label}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {onAddTextBox && (
        <>
          <div className="w-px h-5 bg-monday-border mx-1" />
          <button
            type="button"
            onClick={onAddTextBox}
            className={formatBarBtn}
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
          className={formatBarBtn}
          title="Agregar imagen"
        >
          <span className="text-[12px]">+ Imagen</span>
        </button>
      )}
      <span className="text-[11px] text-monday-subtext px-2">
        {selectedBoxId ? 'Cuadro seleccionado' : 'Plantilla'}
      </span>
    </div>
  );
}
