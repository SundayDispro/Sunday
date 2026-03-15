/**
 * Vista estática del documento para PDF y preview.
 * Una sola fuente de verdad: mismo layout que el backend usará para generar el PDF.
 * Solo estilos inline (sin Tailwind) para poder renderizarse en Node con react-dom/server.
 */
import React from 'react';

// US Letter en puntos (no píxeles)
const PAGE_W_PT = 612;
const PAGE_H_PT = 792;
// Paddings en px (Tailwind); inyectar como px en CSS para no escalar mal en PDF
const PADDING_TOP_FOLIO_PX = 12;
const PADDING_TOP_SINGLE_PX = 16;
const PADDING_TOP_DESCRIPCION_CORTA_PX = 28;
const PADDING_TOP_MULTI_PX = 8;
const PADDING_BOTTOM_PX = 4;
const PADDING_SIDES_PX = 6;
// Folio: 8px para que en el PDF coincida con el editor (evita que el número quede demasiado a la izquierda).
const PADDING_FOLIO_LEFT_PX = 8;
const PADDING_TOP_TOTAL_PX = 6;
const PADDING_TOTAL_RIGHT_PX = 16;

function formatDateForPdf(value: string): string {
  const s = String(value).trim();
  if (!s) return s;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return s;
}

export interface CustomBoxForPdf {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  kind?: 'text' | 'image';
  singleLine?: boolean;
  semantic?: 'element' | 'folio';
  fontSize?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontFamily?: string;
  fontColor?: string;
  fieldKey?: string;
  imageUrl?: string;
  backgroundColor?: string;
}

export interface DocumentPageForPdfProps {
  content: Record<string, unknown>;
  backgroundImageDataUrl?: string | null;
}

function getBoxText(
  box: CustomBoxForPdf,
  content: Record<string, unknown>,
  customFieldValues: Record<string, string>
): string {
  const rawFromField = box.fieldKey ? content[box.fieldKey] : undefined;
  const strFromField =
    rawFromField !== undefined && rawFromField !== null
      ? String(rawFromField).trim()
      : '';
  const hasFieldValue = strFromField !== '';
  const isElementBox = box.fieldKey === 'elemento' || box.semantic === 'element';
  const rawElemento = content['elemento'] ?? content['descripcion_corta'];
  const strElemento =
    rawElemento !== undefined && rawElemento !== null
      ? String(rawElemento).trim()
      : '';
  if (box.fieldKey && hasFieldValue) {
    return box.fieldKey === 'fecha'
      ? formatDateForPdf(String(rawFromField))
      : strFromField;
  }
  if (isElementBox && strElemento) return strElemento;
  const byId = (customFieldValues[box.id] ?? '').trim();
  if (byId) {
    return box.fieldKey === 'fecha' ? formatDateForPdf(byId) : byId;
  }
  if (box.fieldKey === 'cliente') {
    const alt = content['cliente'] ?? content['client'] ?? '';
    return (typeof alt === 'string' ? alt : String(alt ?? '')).trim();
  }
  if (box.fieldKey === 'total' || box.fieldKey === 'folio') {
    const alt = content[box.fieldKey] ?? customFieldValues[box.id];
    return (alt !== undefined && alt !== null ? String(alt) : '').trim();
  }
  if (isElementBox) return strElemento;
  if (
    box.fieldKey &&
    rawFromField !== undefined &&
    rawFromField !== null
  ) {
    return box.fieldKey === 'fecha'
      ? formatDateForPdf(String(rawFromField))
      : String(rawFromField).trim();
  }
  return '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Color de texto "blanco" para el PDF. rgb(254,254,254) para que Chromium lo dibuje y sea seleccionable.
 */
const PDF_WHITE_COLOR = 'rgb(254,254,254)';

function normalizeTextColor(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === '#ffffff' || s === '#fff' || s === 'white') return PDF_WHITE_COLOR;
  if (/^rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)$/.test(s.replace(/\s/g, ''))) return PDF_WHITE_COLOR;
  return '#000000';
}

function normalizeBackgroundColor(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (!s) return 'transparent';
  if (s === '#000000' || s === '#000' || s === 'black') return '#000000';
  if (/^rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(s.replace(/\s/g, ''))) return '#000000';
  return s;
}

export const DocumentPageForPdf: React.FC<DocumentPageForPdfProps> = ({
  content,
  backgroundImageDataUrl,
}) => {
  const customBoxes = (content.customBoxes ?? []) as CustomBoxForPdf[];
  const customFieldValues = (content.customFieldValues ?? {}) as Record<
    string,
    string
  >;
  const globalFontSize =
    typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;
  const globalFontFamily = String(
    content.globalFontFamily ?? 'Averta Std'
  ).trim();
  const globalFontColor = String(content.globalFontColor ?? '#000000').trim();
  const globalFontBold =
    content.globalFontBold === true || content.globalFontBold === 'true';
  const globalFontItalic =
    content.globalFontItalic === true || content.globalFontItalic === 'true';

  const backgroundStyle = backgroundImageDataUrl
    ? {
        backgroundImage: `url(${backgroundImageDataUrl})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat' as const,
        backgroundPosition: '0 0',
      }
    : { backgroundColor: '#ffffff' };

  const pageStyle: React.CSSProperties = {
    width: '612pt',
    height: '792pt',
    minWidth: '612pt',
    minHeight: '792pt',
    position: 'relative',
    overflow: 'visible',
    backgroundColor: '#ffffff',
    ...backgroundStyle,
  };

  const boxes = customBoxes.map((box) => {
    if (!box) return null;
    const isFolioBox = box.semantic === 'folio' || box.fieldKey === 'folio';
    const FOLIO_OFFSET_PT = 40;
    const rawLeftPt = Math.round((box.x ?? 0) * PAGE_W_PT);
    const leftPt = isFolioBox ? Math.min(rawLeftPt + FOLIO_OFFSET_PT, PAGE_W_PT - 28) : rawLeftPt;
    const topPt = Math.round((box.y ?? 0) * PAGE_H_PT);
    const rawWidthPt = Math.round((box.width ?? 0.3) * PAGE_W_PT);
    const widthPt = isFolioBox ? Math.max(28, rawWidthPt - FOLIO_OFFSET_PT) : rawWidthPt;

    if (box.kind === 'image' && box.imageUrl) {
      const heightPt = Math.round((box.height ?? 0.15) * PAGE_H_PT);
      return (
        <img
          key={box.id}
          src={box.imageUrl}
          alt=""
          style={{
            position: 'absolute',
            left: `${leftPt}pt`,
            top: `${topPt}pt`,
            width: `${widthPt}pt`,
            height: `${heightPt}pt`,
            objectFit: 'contain',
            objectPosition: 'left top',
          }}
        />
      );
    }

    const text = getBoxText(box, content, customFieldValues);
    const totalStr = String(content?.total ?? '').trim();
    const isTotalBox =
      box.fieldKey === 'total' ||
      (totalStr !== '' && text.trim() === totalStr);

    let size = typeof box.fontSize === 'number' ? box.fontSize : globalFontSize;
    if (isTotalBox) {
      size = Math.max(size, 11);
    }
    // Fecha: respetar fontSize/fuente de la plantilla (1:1 con editor), sin tope
    if (box.semantic === 'folio' || box.fieldKey === 'folio') {
      size = typeof box.fontSize === 'number' ? box.fontSize : globalFontSize;
    }
    const ff = (box.fontFamily ?? globalFontFamily).trim();
    let bold = typeof box.fontBold === 'boolean' ? box.fontBold : globalFontBold;
    if (isTotalBox) bold = true;
    const italic =
      typeof box.fontItalic === 'boolean' ? box.fontItalic : globalFontItalic;
    const colRaw =
      typeof box.fontColor === 'string' && box.fontColor
        ? box.fontColor
        : globalFontColor;
    let textCol = normalizeTextColor(colRaw);

    const bgRaw =
      typeof box.backgroundColor === 'string' && box.backgroundColor.trim()
        ? box.backgroundColor.trim()
        : 'transparent';
    let bgCol = bgRaw === 'transparent' ? 'transparent' : normalizeBackgroundColor(bgRaw);
    if (bgCol === '#000000' || isTotalBox) {
      textCol = PDF_WHITE_COLOR;
      if (isTotalBox) bgCol = '#000000';
    }

    const isFolio = box.semantic === 'folio';
    const isSingleLine = box.singleLine === true || isFolio;
    const isDescripcionCorta = box.fieldKey === 'descripcion_corta';
    const isTotal = isTotalBox;
    const rawHeightPt = Math.round((box.height ?? 0.05) * PAGE_H_PT);
    const heightClampedPt = Math.min(rawHeightPt, PAGE_H_PT - topPt);
    const lineHeight = isSingleLine ? 1.1 : 1.35;
    const paddingTopPx = isTotalBox
      ? PADDING_TOP_TOTAL_PX
      : isDescripcionCorta
        ? PADDING_TOP_DESCRIPCION_CORTA_PX
        : isFolio
          ? PADDING_TOP_FOLIO_PX
          : isSingleLine
            ? PADDING_TOP_SINGLE_PX
            : PADDING_TOP_MULTI_PX;
    const paddingLeftPx = isFolio ? PADDING_FOLIO_LEFT_PX : PADDING_SIDES_PX;
    const paddingRightPx = isTotal ? PADDING_TOTAL_RIGHT_PX : PADDING_SIDES_PX;

    const boxStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${leftPt}pt`,
      top: `${topPt}pt`,
      width: `${widthPt}pt`,
      height: `${heightClampedPt}pt`,
      margin: 0,
      padding: `${paddingTopPx}px ${paddingRightPx}px ${PADDING_BOTTOM_PX}px ${paddingLeftPx}px`,
      lineHeight,
      boxSizing: 'border-box',
      overflow: isTotalBox ? 'visible' : 'hidden',
      display: 'block',
      zIndex: 5,
      backgroundColor: bgCol,
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
    };

    const innerStyle: React.CSSProperties = {
      display: isTotalBox ? 'flex' : 'block',
      justifyContent: isTotalBox ? 'flex-end' : undefined,
      alignItems: isTotalBox ? 'flex-start' : undefined,
      width: '100%',
      height: '100%',
      minWidth: 0,
      margin: 0,
      overflow: isTotalBox ? 'visible' : 'hidden',
      fontFamily: `${ff}, sans-serif`,
      fontSize: `${size}pt`,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      color: textCol,
      backgroundColor: 'transparent',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      boxSizing: 'border-box',
      textAlign: isTotal ? 'right' : 'left',
      direction: 'ltr',
      fontVariant: 'no-common-ligatures',
      textRendering: 'geometricPrecision',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
      ...(isTotalBox && { WebkitTextFillColor: PDF_WHITE_COLOR }),
    };

    return (
      <div key={box.id} className={isTotalBox ? 'doc-box-total' : undefined} style={boxStyle}>
        <div style={innerStyle}>
          {isTotalBox ? <span style={{ display: 'inline-block', textAlign: 'right', width: 'auto', flexShrink: 0, marginLeft: 'auto', color: PDF_WHITE_COLOR, WebkitTextFillColor: PDF_WHITE_COLOR }}>{text || '\u00A0'}</span> : (text || '\u00A0')}
        </div>
      </div>
    );
  });

  return <div style={pageStyle}>{boxes}</div>;
};

export default DocumentPageForPdf;
