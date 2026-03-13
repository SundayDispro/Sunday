/**
 * Genera HTML que replica exactamente el layout del editor de plantillas PDF.
 * Una sola fuente de verdad: el mismo HTML/CSS que ve el usuario es el que
 * Puppeteer convierte a PDF → WYSIWYG.
 * Usamos dimensiones fijas en px (A4) para que el layout no dependa de % en print.
 */
const PAGE_W_PX = 595;
const PAGE_H_PX = 842;

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

function isLightColor(hex: string): boolean {
  const s = String(hex).replace(/^#/, '');
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    return r + g + b >= 0x2a0; // ~384
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return r + g + b >= 0x2a0;
  }
  return false;
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
    ? `background-image: url(${backgroundImageDataUrl}); background-size: 100% 100%; background-repeat: no-repeat;`
    : 'background-color: #ffffff;';

  const boxHtmlParts: string[] = [];

  for (const box of customBoxes) {
    if (!box || box.kind === 'image') continue;

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

    // Texto claro sobre fondo sin plantilla queda invisible: usar fondo negro si el color es blanco/claro
    const bgCol =
      typeof box.backgroundColor === 'string' && box.backgroundColor
        ? box.backgroundColor
        : isLightColor(col)
          ? '#000000'
          : 'transparent';

    // Posición y tamaño en PÍXELES (A4) para que el PDF no malinterprete % en print.
    const leftPx = Math.round((box.x ?? 0) * PAGE_W_PX);
    const topPx = Math.round((box.y ?? 0) * PAGE_H_PX);
    const widthPx = Math.round((box.width ?? 0.3) * PAGE_W_PX);
    const heightPx = Math.round((box.height ?? 0.05) * PAGE_H_PX);
    // Padding superior generoso (14px) para que el folio y números no se corten por arriba.
    const boxStyle = [
      `position: absolute`,
      `left: ${leftPx}px`,
      `top: ${topPx}px`,
      `width: ${widthPx}px`,
      `height: ${heightPx}px`,
      `margin: 0`,
      `padding: 14px 6px 6px 6px`,
      `line-height: 1.35`,
      `box-sizing: border-box`,
      `overflow: hidden`,
      `display: block`,
    ].join('; ');

    // Interior: ancho fijo en px para que el texto envuelva bien (evita apilado vertical).
    const innerStyle = [
      `display: block`,
      `width: ${Math.max(0, widthPx - 12)}px`,
      `height: 100%`,
      `min-width: 0`,
      `margin: 0`,
      `font-family: ${escapeHtml(ff)}, sans-serif`,
      `font-size: ${size}pt`,
      `font-weight: ${bold ? 'bold' : 'normal'}`,
      `font-style: ${italic ? 'italic' : 'normal'}`,
      `color: ${col}`,
      `background-color: ${bgCol}`,
      `white-space: pre-wrap`,
      `word-break: break-word`,
      `overflow-wrap: break-word`,
      `box-sizing: border-box`,
    ].join('; ');

    boxHtmlParts.push(
      `<div class="doc-box" style="${boxStyle}"><div class="doc-box-inner" style="${innerStyle}">${escapeHtml(text) || '&nbsp;'}</div></div>`
    );
  }

  // Imágenes (también en px para consistencia)
  for (const box of customBoxes) {
    if (!box || box.kind !== 'image' || !box.imageUrl) continue;
    const leftPx = Math.round((box.x ?? 0) * PAGE_W_PX);
    const topPx = Math.round((box.y ?? 0) * PAGE_H_PX);
    const widthPx = Math.round((box.width ?? 0.3) * PAGE_W_PX);
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
  }

  const boxesHtml = boxHtmlParts.join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=595, height=842">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 595px;
      height: 842px;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 595px;
      height: 842px;
      position: relative;
      ${backgroundStyle}
    }
    .doc-box, .doc-img { position: absolute; }
    .doc-box-inner { display: block; width: 100%; max-width: 100%; min-width: 0; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; }
  </style>
</head>
<body>
  <div class="page">
${boxesHtml}
  </div>
</body>
</html>`;
}
