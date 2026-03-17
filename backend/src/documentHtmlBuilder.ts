/**
 * Genera HTML que replica el layout del editor de plantillas PDF.
 * Mismas dimensiones lógicas que el editor: 612×792 (US Letter en puntos), para que posiciones coincidan 1:1.
 */
import fs from 'fs';
import path from 'path';

// US Letter en puntos (no píxeles). Mismo sistema que PdfTemplateEditor.
const PAGE_W_PT = 612;
const PAGE_H_PT = 792;

// Raíz del backend (tanto en src como en dist/src) para resolver assets de forma estable.
const BACKEND_ROOT = path.join(__dirname, '..');

// Paddings en pt (convertidos de px: 1px = 0.75pt a 96 DPI)
const PADDING_TOP_FOLIO_PT = 9;       // 12px -> 9pt
const PADDING_TOP_SINGLE_PT = 12;      // 16px -> 12pt
const PADDING_TOP_DESCRIPCION_CORTA_PT = 27; // 36px (12+24) -> 27pt
const PADDING_TOP_MULTI_PT = 6;        // 8px -> 6pt
const PADDING_BOTTOM_PT = 3;           // 4px -> 3pt
const PADDING_SIDES_PT = 4.5;          // 6px -> 4.5pt
const PADDING_FOLIO_LEFT_PT = 4.5;     // 6px -> 4.5pt
const PADDING_TOP_TOTAL_PT = 0;
const PADDING_TOTAL_RIGHT_PT = 4.5;    // 6px -> 4.5pt

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Color de texto "blanco" para el PDF. Usamos rgb(254,254,254) porque Chromium al exportar
 * a PDF a veces no dibuja #ffffff (lo trata como "sin tinta"). Así el texto Total es visible y seleccionable.
 */
const PDF_WHITE_COLOR = 'rgb(254,254,254)';

function normalizeTextColor(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === '#ffffff' || s === '#fff' || s === 'white') return PDF_WHITE_COLOR;
  if (/^rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)$/.test(s.replace(/\s/g, ''))) return PDF_WHITE_COLOR;
  return '#000000';
}

/** Normaliza color de fondo (ej. #000000 para la barra del total). */
function normalizeBackgroundColor(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (!s) return 'transparent';
  if (s === '#000000' || s === '#000' || s === 'black') return '#000000';
  if (/^rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(s.replace(/\s/g, ''))) return '#000000';
  return s;
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
  const fontsDir = path.join(BACKEND_ROOT, 'assets', 'fonts', 'AvertaStd');

  const candidates: Array<{
    file: string;
    weight: number;
    style: 'normal' | 'italic';
  }> = [
    { file: 'AvertaStd-Thin.ttf', weight: 100, style: 'normal' },
    { file: 'AvertaStd-ThinItalic.ttf', weight: 100, style: 'italic' },
    { file: 'AvertaStd-ExtraThin.ttf', weight: 200, style: 'normal' },
    { file: 'AvertaStd-ExtraThinItalic.ttf', weight: 200, style: 'italic' },
    { file: 'AvertaStd-Light.ttf', weight: 300, style: 'normal' },
    { file: 'AvertaStd-LightItalic.ttf', weight: 300, style: 'italic' },
    { file: 'AvertaStd-Regular.ttf', weight: 400, style: 'normal' },
    { file: 'AvertaStd-RegularItalic.ttf', weight: 400, style: 'italic' },
    { file: 'AvertaStd-Semibold.ttf', weight: 600, style: 'normal' },
    { file: 'AvertaStd-SemiboldItalic.ttf', weight: 600, style: 'italic' },
    { file: 'AvertaStd-Bold.ttf', weight: 700, style: 'normal' },
    { file: 'AvertaStd-BoldItalic.ttf', weight: 700, style: 'italic' },
    { file: 'AvertaStd-ExtraBold.ttf', weight: 800, style: 'normal' },
    { file: 'AvertaStd-ExtraBoldItalic.ttf', weight: 800, style: 'italic' },
    { file: 'AvertaStd-Black.ttf', weight: 900, style: 'normal' },
    { file: 'AvertaStd-BlackItalic.ttf', weight: 900, style: 'italic' },
  ];

  const rules: string[] = [];

  for (const candidate of candidates) {
    try {
      const filePath = path.join(fontsDir, candidate.file);
      if (!fs.existsSync(filePath)) continue;
      const buf = fs.readFileSync(filePath);
      const b64 = buf.toString('base64');
      rules.push(
        "@font-face{font-family:'Averta Std';src:url('data:font/ttf;base64," +
          b64 +
          "') format('truetype');font-weight:" +
          String(candidate.weight) +
          ';font-style:' +
          candidate.style +
          ';}'
      );
    } catch {
      // ignorar errores de lectura individuales y continuar con el resto
    }
  }

  return rules.join('\n');
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
  // Fuente por defecto: Averta Std (igual que cotizador / editor).
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

    // Coordenadas en pt exactos (sin redondeo agresivo para mantener precisión de % del editor)
    const rawLeftPt = (box.x ?? 0) * PAGE_W_PT;
    const leftPt = rawLeftPt;
    const topPt = (box.y ?? 0) * PAGE_H_PT;
    const widthPt = (box.width ?? 0.3) * PAGE_W_PT;

    if (box.kind === 'image' && box.imageUrl) {
      const heightPt = (box.height ?? 0.15) * PAGE_H_PT;
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

    // Caja de texto
    let text = '';
    const rawFromField = box.fieldKey ? content[box.fieldKey] : undefined;
    const strFromField = rawFromField !== undefined && rawFromField !== null ? String(rawFromField).trim() : '';
    const hasFieldValue = strFromField !== '';
    const rawElemento = (content['elemento'] ?? content['descripcion_corta']);
    const strElemento = rawElemento !== undefined && rawElemento !== null ? String(rawElemento).trim() : '';
    const isElementBox = box.fieldKey === 'elemento' || box.semantic === 'element';
    
    if (box.fieldKey && hasFieldValue) {
      text = box.fieldKey === 'fecha' ? formatDateForPdf(String(rawFromField)) : strFromField;
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
    if (box.fieldKey === 'total') size = Math.max(size, 11);
    if (box.semantic === 'folio' || box.fieldKey === 'folio') size = typeof box.fontSize === 'number' ? box.fontSize : globalFontSize;
    
    const ff = (box.fontFamily ?? globalFontFamily).trim();
    let bold = typeof box.fontBold === 'boolean' ? box.fontBold : globalFontBold;
    const italic = typeof box.fontItalic === 'boolean' ? box.fontItalic : globalFontItalic;
    const colRaw = typeof box.fontColor === 'string' && box.fontColor ? box.fontColor : globalFontColor;
    let textCol = normalizeTextColor(colRaw);
    let bgCol: string;
    const bgRaw = typeof box.backgroundColor === 'string' && box.backgroundColor.trim() ? box.backgroundColor.trim() : 'transparent';
    bgCol = bgRaw === 'transparent' ? 'transparent' : normalizeBackgroundColor(bgRaw);
    
    const totalStr = content.total != null ? String(content.total).trim() : '';
    const isTotalBox = box.fieldKey === 'total' || (totalStr !== '' && text === totalStr) || (totalStr !== '' && text !== '' && text.replace(/\s/g, '') === totalStr.replace(/\s/g, ''));
    
    if (bgCol === '#000000' || isTotalBox) {
      textCol = PDF_WHITE_COLOR;
      if (isTotalBox) bgCol = '#000000';
    }
    if (isTotalBox) bold = true;

    const isFolio = box.semantic === 'folio' || box.fieldKey === 'folio';
    const isSingleLine = box.singleLine === true || isFolio;
    const isDescripcionCorta = box.fieldKey === 'descripcion_corta';
    const heightPt = (box.height ?? 0.05) * PAGE_H_PT;
    const heightClampedPt = Math.min(heightPt, PAGE_H_PT - topPt);
    const lineHeight = isSingleLine ? '1.1' : '1.35';

    // Padding en pt para evitar problemas de DPI/escalado
    const paddingTopPt = isTotalBox
      ? PADDING_TOP_TOTAL_PT
      : isDescripcionCorta
        ? PADDING_TOP_DESCRIPCION_CORTA_PT
        : isFolio
          ? PADDING_TOP_FOLIO_PT
          : isSingleLine
            ? PADDING_TOP_SINGLE_PT
            : PADDING_TOP_MULTI_PT;
    const paddingBottomPt = isTotalBox ? 0 : PADDING_BOTTOM_PT;
    const paddingLeftPt = isFolio ? PADDING_FOLIO_LEFT_PT : PADDING_SIDES_PT;
    const paddingRightPt = isTotalBox ? PADDING_TOTAL_RIGHT_PT : PADDING_SIDES_PT;

    const boxStyle = [
      `position: absolute`,
      `left: ${leftPt}pt`,
      `top: ${topPt}pt`,
      `width: ${widthPt}pt`,
      `height: ${heightClampedPt}pt`,
      `margin: 0`,
      `padding: ${paddingTopPt}pt ${paddingRightPt}pt ${paddingBottomPt}pt ${paddingLeftPt}pt`,
      `line-height: ${lineHeight}`,
      `box-sizing: border-box`,
      `overflow: hidden`,
      `display: block`,
      `z-index: 5`,
      `background-color: ${bgCol} !important`,
      `-webkit-print-color-adjust: exact`,
      `print-color-adjust: exact`,
    ].join('; ');

    const innerStyleParts = [
      isTotalBox ? `display: flex` : `display: block`,
      `width: 100%`,
      `height: 100%`,
      `min-width: 0`,
      `margin: 0`,
      `overflow: hidden`,
      `font-family: ${escapeHtml(ff)}, sans-serif`,
      `font-size: ${size}pt`,
      `font-weight: ${bold ? 'bold' : 'normal'}`,
      `font-style: ${italic ? 'italic' : 'normal'}`,
      `color: ${textCol} !important`,
      `background-color: transparent`,
      `white-space: pre-wrap`,
      `word-break: break-word`,
      `overflow-wrap: break-word`,
      `box-sizing: border-box`,
      `text-align: ${isTotalBox ? 'right' : 'left'}`,
      `direction: ltr`,
      `font-variant: no-common-ligatures`,
      `text-rendering: geometricPrecision`,
      `-webkit-print-color-adjust: exact !important`,
      `print-color-adjust: exact !important`,
    ];
    if (isTotalBox) {
      innerStyleParts.push(`justify-content: flex-end`, `align-items: center`, `line-height: 1`);
      innerStyleParts.push(`-webkit-text-fill-color: ${PDF_WHITE_COLOR} !important`);
    }
    const innerStyle = innerStyleParts.join('; ');

    const boxClass = isTotalBox ? 'doc-box doc-box-total' : 'doc-box';
    // Para Total: envolver en span para que el contenedor flex (doc-box-inner) tenga un hijo explícito
    // y justify-content: flex-end lo alinee a la derecha (igual que en el editor).
    const innerContent = isTotalBox
      ? `<span class="doc-box-total-text" style="display:inline-block;text-align:right;width:auto;margin-left:auto;line-height:1;color:rgb(254,254,254) !important;-webkit-text-fill-color:rgb(254,254,254) !important;">${escapeHtml(text) || '&nbsp;'}</span>`
      : (escapeHtml(text) || '&nbsp;');
    const boxHtml = `<div class="${boxClass}" style="${boxStyle}"><div class="doc-box-inner" style="${innerStyle}">${innerContent}</div></div>`;
    boxHtmlParts.push(boxHtml);
  }

  const boxesHtml = boxHtmlParts.join('\n');

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
  // Misma fuente por defecto que en el editor: Averta Std.
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
    .doc-box-total { background-color: #000000 !important; overflow: visible !important; }
    .doc-box-total .doc-box-inner {
      color: rgb(254,254,254) !important;
      -webkit-text-fill-color: rgb(254,254,254) !important;
      display: flex !important;
      justify-content: flex-end !important;
      align-items: center !important;
      text-align: right !important;
      overflow: visible !important;
      line-height: 1 !important;
    }
    .doc-box-total .doc-box-total-text { width: auto !important; flex-shrink: 0 !important; margin-left: auto !important; line-height: 1 !important; color: rgb(254,254,254) !important; -webkit-text-fill-color: rgb(254,254,254) !important; }
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
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  </style>
</head>
<body>
${pageContentHtml}
</body>
</html>`;
}
