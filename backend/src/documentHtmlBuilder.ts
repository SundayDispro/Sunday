/**
 * Genera HTML que replica el layout del editor de plantillas PDF.
 * Mismas dimensiones lógicas que el editor: 595×842 (A4 en puntos), para que posiciones coincidan 1:1.
 */
import fs from 'fs';
import path from 'path';

// Mismo sistema de coordenadas que PdfTemplateEditor (PAGE_ASPECT 595/842)
const PAGE_W_PX = 595;
const PAGE_H_PX = 842;

// Mismas proporciones que el editor (Tailwind: 48/28px minHeight, pt-3/pt-2/py-1, px-1.5, pb-1)
const MIN_HEIGHT_SINGLE_LINE_PX = Math.round(PAGE_H_PX * (48 / 842));
const MIN_HEIGHT_MULTI_PX = Math.round(PAGE_H_PX * (28 / 842));
const PADDING_TOP_FOLIO_PX = Math.round(PAGE_H_PX * (12 / 842));   // pt-3
const PADDING_TOP_SINGLE_PX = Math.round(PAGE_H_PX * (8 / 842));   // pt-2
const PADDING_TOP_MULTI_PX = Math.round(PAGE_H_PX * (4 / 842));    // py-1
const PADDING_BOTTOM_PX = Math.round(PAGE_H_PX * (4 / 842));        // pb-1 / py-1
const PADDING_SIDES_PX = Math.round(PAGE_W_PX * (6 / 595));        // px-1.5

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
 * Construye el HTML de una página A4 con los mismos cuadros y estilos que el editor.
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
    ? `background-image: url(${backgroundImageDataUrl}); background-size: 100% 100%; background-repeat: no-repeat; background-position: 0 0;`
    : 'background-color: #ffffff;';

  // Una sola pasada en orden customBoxes para que el z-order del PDF coincida 1:1 con el editor.
  const boxHtmlParts: string[] = [];

  for (const box of customBoxes) {
    if (!box) continue;

    const leftPx = Math.round((box.x ?? 0) * PAGE_W_PX);
    const topPx = Math.round((box.y ?? 0) * PAGE_H_PX);
    const widthPx = Math.round((box.width ?? 0.3) * PAGE_W_PX);

    if (box.kind === 'image' && box.imageUrl) {
      const heightPx = Math.round((box.height ?? 0.15) * PAGE_H_PX);
      const style = [
        `position: absolute`,
        `left: ${leftPx}px`,
        `top: ${topPx}px`,
        `width: ${widthPx}px`,
        `height: ${heightPx}px`,
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
    if (box.fieldKey && content[box.fieldKey] !== undefined && content[box.fieldKey] !== null) {
      const raw = content[box.fieldKey];
      text =
        box.fieldKey === 'fecha'
          ? formatDateForPdf(String(raw))
          : String(raw).trim();
    } else {
      text = (customFieldValues[box.id] ?? '').trim();
    }

    const size = typeof box.fontSize === 'number' ? box.fontSize : globalFontSize;
    const ff = (box.fontFamily ?? globalFontFamily).trim();
    const bold = typeof box.fontBold === 'boolean' ? box.fontBold : globalFontBold;
    const italic = typeof box.fontItalic === 'boolean' ? box.fontItalic : globalFontItalic;
    const col = typeof box.fontColor === 'string' && box.fontColor ? box.fontColor : globalFontColor;

    // Fondo siempre transparente: la plantilla PDF ya trae barras/colores; no duplicamos backgroundColor.
    const bgCol = 'transparent';
    // Respetar el color de texto de la caja (ej. blanco en Total sobre la barra del PDF).
    const textCol = col;

    const isFolio = box.semantic === 'folio';
    const isSingleLine = box.singleLine === true || isFolio;
    const rawHeightPx = Math.round((box.height ?? 0.05) * PAGE_H_PX);
    const minHeightPx = isSingleLine ? MIN_HEIGHT_SINGLE_LINE_PX : MIN_HEIGHT_MULTI_PX;
    const heightPx = Math.max(rawHeightPx, minHeightPx);
    // Misma regla que el editor: recortar al borde de página (equivalente a Math.min(h, 1 - y)).
    const heightClampedPx = Math.min(heightPx, PAGE_H_PX - topPx);
    const lineHeight = isSingleLine ? '1.1' : '1.35';
    // Padding alineado con el editor (Tailwind: folio pt-3, single pt-2 pb-1, multi py-1, px-1.5)
    const paddingTopPx = isFolio
      ? PADDING_TOP_FOLIO_PX
      : isSingleLine
        ? PADDING_TOP_SINGLE_PX
        : PADDING_TOP_MULTI_PX;
    const boxStyle = [
      `position: absolute`,
      `left: ${leftPx}px`,
      `top: ${topPx}px`,
      `width: ${widthPx}px`,
      `height: ${heightClampedPx}px`,
      `margin: 0`,
      `padding: ${paddingTopPx}px ${PADDING_SIDES_PX}px ${PADDING_BOTTOM_PX}px ${PADDING_SIDES_PX}px`,
      `line-height: ${lineHeight}`,
      `box-sizing: border-box`,
      `overflow: visible`,
      `display: block`,
    ].join('; ');

    const innerWidthPx = Math.max(0, widthPx - PADDING_SIDES_PX * 2);
    const innerStyle = [
      `display: block`,
      `width: ${innerWidthPx}px`,
      `height: 100%`,
      `min-width: 0`,
      `margin: 0`,
      `font-family: ${escapeHtml(ff)}, sans-serif`,
      `font-size: ${size}pt`,
      `font-weight: ${bold ? 'bold' : 'normal'}`,
      `font-style: ${italic ? 'italic' : 'normal'}`,
      `color: ${textCol}`,
      `background-color: ${bgCol}`,
      `white-space: pre-wrap`,
      `word-break: break-word`,
      `overflow-wrap: break-word`,
      `box-sizing: border-box`,
      `font-variant: no-common-ligatures`,
      `text-rendering: geometricPrecision`,
    ].join('; ');

    boxHtmlParts.push(
      `<div class="doc-box" style="${boxStyle}"><div class="doc-box-inner" style="${innerStyle}">${escapeHtml(text) || '&nbsp;'}</div></div>`
    );
  }

  const boxesHtml = boxHtmlParts.join('\n');

  const needsAverta =
    /averta\s*std/i.test(globalFontFamily) ||
    customBoxes.some((b) => b && typeof b.fontFamily === 'string' && /averta\s*std/i.test(b.fontFamily));
  const fontFaceCss = needsAverta ? getAvertaStdFontFaceCss() : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${PAGE_W_PX}, height=${PAGE_H_PX}">
  <style>
    ${fontFaceCss ? fontFaceCss + '\n    ' : ''}@page { size: 210mm 297mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${PAGE_W_PX}px;
      height: ${PAGE_H_PX}px;
      min-width: ${PAGE_W_PX}px;
      min-height: ${PAGE_H_PX}px;
      overflow: hidden;
      background-color: #ffffff !important;
      border: none;
      outline: none;
      box-shadow: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: ${PAGE_W_PX}px;
      height: ${PAGE_H_PX}px;
      min-width: ${PAGE_W_PX}px;
      min-height: ${PAGE_H_PX}px;
      position: relative;
      overflow: visible;
      border: none;
      outline: none;
      box-shadow: none;
      background-color: #ffffff;
      ${backgroundStyle}
    }
    .doc-box, .doc-img { position: absolute; }
    .doc-box-inner { display: block; min-width: 0; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; font-variant: no-common-ligatures; text-rendering: geometricPrecision; }
  </style>
</head>
<body>
  <div class="page">
${boxesHtml}
  </div>
</body>
</html>`;
}
