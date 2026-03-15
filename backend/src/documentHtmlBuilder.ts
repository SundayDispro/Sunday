/**
 * Genera HTML que replica el layout del editor de plantillas PDF.
 * Mismas dimensiones lógicas que el editor: 612×792 (US Letter en puntos), para que posiciones coincidan 1:1.
 */
import fs from 'fs';
import path from 'path';

// US Letter en puntos (no píxeles). Mismo sistema que PdfTemplateEditor.
const PAGE_W_PT = 612;
const PAGE_H_PT = 792;

// Paddings en px (Tailwind); inyectar como px en CSS para no escalar mal en PDF
const PADDING_TOP_FOLIO_PX = 12;
const PADDING_TOP_SINGLE_PX = 16;
const PADDING_TOP_DESCRIPCION_CORTA_PX = 28;
const PADDING_TOP_MULTI_PX = 8;
const PADDING_BOTTOM_PX = 4;
const PADDING_SIDES_PX = 6;
const PADDING_FOLIO_LEFT_PX = 26;
const PADDING_TOTAL_RIGHT_PX = 12;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateForPdf(value: string): string {
  const s = String(value).trim();
  if (!s) return s;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return s;
}

interface CustomBox {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  kind?: 'text' | 'image';
  singleLine?: boolean;
  /** Si es 'folio', se trata como una línea y se aplica altura mínima para no cortar números. */
  semantic?: 'element' | 'folio';
  fontSize?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontFamily?: string;
  fontColor?: string;
  fieldKey?: string;
  imageUrl?: string;
  /** Fondo del cuadro (ej. #000000 para cajas negras con texto blanco) */
  backgroundColor?: string;
}

/** Devuelve CSS @font-face para Averta Std (mismo nombre que en el editor) para que Puppeteer renderice igual. */
function getAvertaStdFontFaceCss(): string {
  const fontsDir = path.join(__dirname, '..', 'assets', 'fonts', 'AvertaStd');
  const pairs: { file: string; weight: number; style: string }[] = [
    { file: 'AvertaStd-Regular.ttf', weight: 400, style: 'normal' },
    { file: 'AvertaStd-Bold.ttf', weight: 700, style: 'normal' },
    { file: 'AvertaStd-RegularItalic.ttf', weight: 400, style: 'italic' },
    { file: 'AvertaStd-BoldItalic.ttf', weight: 700, style: 'italic' },
  ];
  const rules: string[] = [];
  for (const { file, weight, style } of pairs) {
    const filePath = path.join(fontsDir, file);
    try {
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const b64 = buf.toString('base64');
        rules.push(
          `@font-face{font-family:'Averta Std';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:${weight};font-style:${style};}`
        );
      }
    } catch {
      // ignorar si no se puede leer
    }
  }
  return rules.length > 0 ? rules.join('\n    ') : '';
}

export interface BuildDocumentHtmlOptions {
  /** Contenido del documento (customBoxes, customFieldValues, cliente, fecha, etc.) */
  content: Record<string, unknown>;
  /** URL de la imagen de fondo (plantilla) en base64 o URL. Si no se pasa, fondo blanco. */
  backgroundImageDataUrl?: string | null;
}

/**
 * Construye el HTML de una página US Letter (612×792) con los mismos cuadros y estilos que el editor.
 * Posiciones y tamaños en % (0-1), igual que en PdfTemplateEditor.
 */
export function buildDocumentHtml(options: BuildDocumentHtmlOptions): string {
  const { content, backgroundImageDataUrl } = options;
  const customBoxes = (content.customBoxes ?? []) as CustomBox[];
  const customFieldValues = (content.customFieldValues ?? {}) as Record<string, string>;

  const globalFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;
  const globalFontFamily = String(content.globalFontFamily ?? 'Averta Std').trim();
  const globalFontColor = String(content.globalFontColor ?? '#000000').trim();
  const globalFontBold = content.globalFontBold === true || content.globalFontBold === 'true';
  const globalFontItalic = content.globalFontItalic === true || content.globalFontItalic === 'true';

  const backgroundStyle = backgroundImageDataUrl
    ? `background-image: url(${backgroundImageDataUrl}); background-size: 612pt 792pt; background-position: 0 0; background-repeat: no-repeat;`
    : 'background-color: #ffffff;';

  // Una sola pasada en orden customBoxes para que el z-order del PDF coincida 1:1 con el editor.
  const boxHtmlParts: string[] = [];

  for (const box of customBoxes) {
    if (!box) continue;

    const leftPt = Math.max(0, Math.min(
      Math.round((box.x ?? 0) * PAGE_W_PT),
      PAGE_W_PT - 1
    ));
    const topPt = Math.max(0, Math.min(
      Math.round((box.y ?? 0) * PAGE_H_PT),
      PAGE_H_PT - 1
    ));
    const widthPt = Math.round((box.width ?? 0.3) * PAGE_W_PT);

    if (box.kind === 'image' && box.imageUrl) {
      const heightPt = Math.round((box.height ?? 0.15) * PAGE_H_PT);
      const style = [
        `position: absolute`,
        `left: ${leftPt}pt`,
        `top: ${topPt}pt`,
        `width: ${widthPt}pt`,
        `height: ${heightPt}pt`,
        `object-fit: contain`,
        `object-position: left top`,
      ].join('; ');
      boxHtmlParts.push(
        `<img class="doc-img" src="${escapeHtml(box.imageUrl)}" alt="" style="${style}" />`
      );
      continue;
    }

    // Caja de texto: content[fieldKey] -> customFieldValues[box.id] -> alias/fallback por fieldKey
    let text = '';
    const rawFromField = box.fieldKey ? content[box.fieldKey] : undefined;
    const strFromField = rawFromField !== undefined && rawFromField !== null ? String(rawFromField).trim() : '';
    const hasFieldValue = strFromField !== '';
    // Elemento: permitir también descripcion_corta si elemento viene vacío
    const rawElemento = (content['elemento'] ?? content['descripcion_corta']);
    const strElemento = rawElemento !== undefined && rawElemento !== null ? String(rawElemento).trim() : '';
    const isElementBox = box.fieldKey === 'elemento' || box.semantic === 'element';
    if (box.fieldKey && hasFieldValue) {
      text =
        box.fieldKey === 'fecha'
          ? formatDateForPdf(String(rawFromField))
          : strFromField;
    } else if (isElementBox && strElemento) {
      text = strElemento;
    } else {
      const byId = (customFieldValues[box.id] ?? '').trim();
      if (byId) {
        text = box.fieldKey === 'fecha' ? formatDateForPdf(byId) : byId;
      } else if (box.fieldKey === 'cliente') {
        const alt = (content['cliente'] ?? content['client'] ?? '');
        text = (typeof alt === 'string' ? alt : String(alt ?? '')).trim();
      } else if (box.fieldKey === 'total' || box.fieldKey === 'folio') {
        const alt = content[box.fieldKey] ?? customFieldValues[box.id];
        text = (alt !== undefined && alt !== null ? String(alt) : '').trim();
      } else if (isElementBox) {
        text = strElemento;
      } else if (box.fieldKey && strFromField === '' && rawFromField !== undefined && rawFromField !== null) {
        text = box.fieldKey === 'fecha' ? formatDateForPdf(String(rawFromField)) : String(rawFromField).trim();
      }
    }

    let size = typeof box.fontSize === 'number' ? box.fontSize : globalFontSize;
    if (box.fieldKey === 'total') {
      size = Math.max(size, 11);
    }
    // Fecha: respetar fontSize/fuente de la plantilla (1:1 con editor), sin tope
    if (box.semantic === 'folio' || box.fieldKey === 'folio') {
      size = typeof box.fontSize === 'number' ? box.fontSize : globalFontSize;
    }
    const ff = (box.fontFamily ?? globalFontFamily).trim();
    let bold = typeof box.fontBold === 'boolean' ? box.fontBold : globalFontBold;
    if (box.fieldKey === 'total') bold = true;
    const italic = typeof box.fontItalic === 'boolean' ? box.fontItalic : globalFontItalic;
    const colRaw = typeof box.fontColor === 'string' && box.fontColor ? box.fontColor : globalFontColor;
    // Normalizar color como en el editor: solo #ffffff o #000000
    const textCol = colRaw.toLowerCase().trim() === '#ffffff' ? '#ffffff' : '#000000';

    // Respetar backgroundColor del cuadro (ej. total con barra negra y texto blanco) para que el PDF sea 1:1 con el preview
    const bgCol =
      typeof box.backgroundColor === 'string' && box.backgroundColor.trim()
        ? box.backgroundColor.trim()
        : 'transparent';

    const isFolio = box.semantic === 'folio';
    const isSingleLine = box.singleLine === true || isFolio;
    const isDescripcionCorta = box.fieldKey === 'descripcion_corta';
    const rawHeightPt = Math.round((box.height ?? 0.05) * PAGE_H_PT);
    const heightClampedPt = Math.min(rawHeightPt, PAGE_H_PT - topPt);
    const lineHeight = isSingleLine ? '1.1' : '1.35';
    // Padding alineado con el editor (Tailwind: folio pt-3, single pt-4, descripcion_corta pt-6, multi pt-2, pb-1, px-1.5)
    const paddingTopPx = isDescripcionCorta
      ? PADDING_TOP_DESCRIPCION_CORTA_PX
      : isFolio
        ? PADDING_TOP_FOLIO_PX
        : isSingleLine
          ? PADDING_TOP_SINGLE_PX
          : PADDING_TOP_MULTI_PX;
    const isTotal = box.fieldKey === 'total';
    const paddingLeftPx = isFolio ? PADDING_FOLIO_LEFT_PX : PADDING_SIDES_PX;
    const paddingRightPx = isTotal ? PADDING_TOTAL_RIGHT_PX : PADDING_SIDES_PX;
    const boxStyle = [
      `position: absolute`,
      `left: ${leftPt}pt`,
      `top: ${topPt}pt`,
      `width: ${widthPt}pt`,
      `height: ${heightClampedPt}pt`,
      `margin: 0`,
      `padding: ${paddingTopPx}px ${paddingRightPx}px ${PADDING_BOTTOM_PX}px ${paddingLeftPx}px`,
      `line-height: ${lineHeight}`,
      `box-sizing: border-box`,
      `overflow: hidden`,
      `display: block`,
      `z-index: 5`,
      `background-color: ${bgCol}`,
      `-webkit-print-color-adjust: exact`,
      `print-color-adjust: exact`,
    ].join('; ');

    const innerStyle = [
      `display: block`,
      `width: 100%`,
      `height: 100%`,
      `min-width: 0`,
      `margin: 0`,
      `overflow: hidden`,
      `font-family: ${escapeHtml(ff)}, sans-serif`,
      `font-size: ${size}pt`,
      `font-weight: ${bold ? 'bold' : 'normal'}`,
      `font-style: ${italic ? 'italic' : 'normal'}`,
      `color: ${textCol}`,
      `background-color: transparent`,
      `white-space: pre-wrap`,
      `word-break: break-word`,
      `overflow-wrap: break-word`,
      `box-sizing: border-box`,
      `text-align: ${isTotal ? 'right' : 'left'}`,
      `direction: ltr`,
      `font-variant: no-common-ligatures`,
      `text-rendering: geometricPrecision`,
      `-webkit-print-color-adjust: exact !important`,
      `print-color-adjust: exact !important`,
    ].join('; ');

    const boxHtml = `<div class="doc-box" style="${boxStyle}"><div class="doc-box-inner" style="${innerStyle}">${escapeHtml(text) || '&nbsp;'}</div></div>`;
    boxHtmlParts.push(boxHtml);
  }

  const boxesHtml = boxHtmlParts.join('\n');

  console.log('[PDF BOXES DEBUG]', JSON.stringify(
    (content.customBoxes ?? []).map((b: CustomBox) => ({
      id: b.id,
      fieldKey: b.fieldKey,
      fontColor: b.fontColor,
      customVal: (content.customFieldValues as Record<string, string> | undefined)?.[b.id],
      contentVal: b.fieldKey ? (content as Record<string, unknown>)[b.fieldKey] : undefined,
    })),
    null,
    2
  ));

  const needsAverta =
    /averta\s*std/i.test(globalFontFamily) ||
    customBoxes.some((b) => b && typeof b.fontFamily === 'string' && /averta\s*std/i.test(b.fontFamily));
  const fontFaceCss = needsAverta ? getAvertaStdFontFaceCss() : '';

  const pageDivHtml = `<div class="page" style="width:${PAGE_W_PT}pt;height:${PAGE_H_PT}pt;min-width:${PAGE_W_PT}pt;min-height:${PAGE_H_PT}pt;position:relative;overflow:hidden;background-color:#ffffff;${backgroundStyle}">\n${boxesHtml}\n</div>`;
  return buildDocumentWrapperHtml(pageDivHtml, { content, fontFaceCss });
}

/**
 * Envuelve el HTML del contenido de la página (div.page o equivalente) en documento completo.
 * Usado cuando el cuerpo viene de renderDocumentHtml (React) para reutilizar fuentes y estilos base.
 */
export function buildDocumentWrapperHtml(
  pageContentHtml: string,
  options: {
    content?: Record<string, unknown>;
    backgroundStyle?: string;
    fontFaceCss?: string;
  }
): string {
  const { content = {}, backgroundStyle = 'background-color: #ffffff;', fontFaceCss: injectedFontCss } = options;
  const customBoxes = (content.customBoxes ?? []) as CustomBox[];
  const globalFontFamily = String(content.globalFontFamily ?? 'Averta Std').trim();
  const needsAverta =
    injectedFontCss !== undefined
      ? !!injectedFontCss
      : /averta\s*std/i.test(globalFontFamily) ||
        customBoxes.some((b) => b && typeof b.fontFamily === 'string' && /averta\s*std/i.test(b.fontFamily));
  const fontFaceCss = injectedFontCss ?? (needsAverta ? getAvertaStdFontFaceCss() : '');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=816, height=1056">
  <style>
    ${fontFaceCss ? fontFaceCss + '\n    ' : ''}@page { size: 612pt 792pt; margin: 0; }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${PAGE_W_PT}pt;
      height: ${PAGE_H_PT}pt;
      min-width: ${PAGE_W_PT}pt;
      min-height: ${PAGE_H_PT}pt;
      overflow: hidden;
      background-color: #ffffff !important;
      border: none;
      outline: none;
      box-shadow: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
${pageContentHtml}
</body>
</html>`;
}
