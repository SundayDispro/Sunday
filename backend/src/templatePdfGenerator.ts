import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, RGB } from 'pdf-lib';

/** Convierte color hex (#000000 o #fff) a RGB para pdf-lib */
function hexToRgb(hex: string): RGB {
  const s = String(hex).replace(/^#/, '');
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16) / 255;
    const g = parseInt(s[1] + s[1], 16) / 255;
    const b = parseInt(s[2] + s[2], 16) / 255;
    return rgb(r, g, b);
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16) / 255;
    const g = parseInt(s.slice(2, 4), 16) / 255;
    const b = parseInt(s.slice(4, 6), 16) / 255;
    return rgb(r, g, b);
  }
  return rgb(0, 0, 0);
}

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');
const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts', 'AvertaStd');

export type TemplateKind = 'cotizacion' | 'levantamiento' | 'hoja_trabajo';

/** Posición y opciones para dibujar un campo en el PDF (y en puntos, origen abajo-izquierda) */
export interface FieldPosition {
  x: number;
  y: number;
  fontSize?: number;
  maxWidth?: number;
  weight?: 'regular' | 'bold';
}

/** Posiciones enviadas desde el editor (0-1, origen arriba-izquierda). Si existen se usan en lugar de TEMPLATE_FIELD_POSITIONS */
export interface ContentFieldPosition {
  x: number;
  y: number;
  fontSize?: number;
  maxWidth?: number;
}

/** Mapeo de nombre de campo -> posición por tipo de plantilla. Ajustar según tus PDFs. */
export const TEMPLATE_FIELD_POSITIONS: Record<TemplateKind, Record<string, FieldPosition>> = {
  cotizacion: {
    cliente: { x: 80, y: 700, fontSize: 11 },
    fecha: { x: 450, y: 700, fontSize: 10 },
    vigencia: { x: 80, y: 670, fontSize: 10 },
    subtotal: { x: 400, y: 200, fontSize: 10 },
    iva: { x: 400, y: 180, fontSize: 10 },
    total: { x: 400, y: 160, fontSize: 11 },
    notas: { x: 80, y: 130, fontSize: 9, maxWidth: 450 },
  },
  levantamiento: {
    proyecto: { x: 80, y: 700, fontSize: 11 },
    fecha: { x: 450, y: 700, fontSize: 10 },
    direccion: { x: 80, y: 660, fontSize: 10, maxWidth: 450 },
    descripcion: { x: 80, y: 600, fontSize: 10, maxWidth: 450 },
    observaciones: { x: 80, y: 400, fontSize: 9, maxWidth: 450 },
  },
  hoja_trabajo: {
    titulo: { x: 80, y: 700, fontSize: 12 },
    fecha: { x: 450, y: 700, fontSize: 10 },
    item: { x: 80, y: 660, fontSize: 10 },
    descripcion: { x: 80, y: 600, fontSize: 10, maxWidth: 450 },
    observaciones: { x: 80, y: 400, fontSize: 9, maxWidth: 450 },
  },
};

function getTemplatePath(kind: TemplateKind): string {
  return path.join(TEMPLATES_DIR, `${kind}.pdf`);
}

export function getTemplatePathIfExists(kind: TemplateKind): string | null {
  const p = getTemplatePath(kind);
  return fs.existsSync(p) ? p : null;
}

/**
 * Genera un PDF rellenando la plantilla con el contenido.
 * Si no existe la plantilla, crea un PDF de una página con los textos en las posiciones definidas.
 */
export async function generatePdfFromTemplate(
  kind: TemplateKind,
  content: Record<string, unknown>
): Promise<Buffer> {
  const templatePath = getTemplatePathIfExists(kind);
  const positions = TEMPLATE_FIELD_POSITIONS[kind] ?? {};

  let pdfDoc: PDFDocument;
  let pageIndex = 0;

  if (templatePath) {
    const bytes = fs.readFileSync(templatePath);
    pdfDoc = await PDFDocument.load(bytes);
  } else {
    pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]); // A4
  }

  const page = pdfDoc.getPage(pageIndex);
  const { width, height } = page.getSize();

  const { StandardFonts } = await import('pdf-lib');
  const standardHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const standardHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const standardHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const standardHelveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  let avertaRegular = standardHelvetica;
  let avertaBold = standardHelveticaBold;
  try {
    const regularBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-Regular.ttf'));
    const boldBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-Bold.ttf'));
    avertaRegular = await pdfDoc.embedFont(regularBytes);
    avertaBold = await pdfDoc.embedFont(boldBytes);
  } catch {
    // Si Averta no está disponible se usan las estándar ya asignadas
  }

  // Por defecto Averta Std para que el PDF use fuentes embebidas y se vea igual en cualquier visor (como en Illustrator)
  const globalFontFamily = String(content.globalFontFamily ?? 'Averta Std').trim();

  type FontRef = typeof standardHelvetica;
  function getFont(boxFontFamily?: string, bold?: boolean, italic?: boolean): FontRef {
    const family = (boxFontFamily ?? globalFontFamily).trim();
    const useStd = /^Helvetica|Arial|sans-serif$/i.test(family) && family.length > 0;
    if (useStd) {
      if (bold && italic) return standardHelveticaBoldOblique;
      if (bold) return standardHelveticaBold;
      if (italic) return standardHelveticaOblique;
      return standardHelvetica;
    }
    return bold ? avertaBold : avertaRegular;
  }

  const defaultColor = hexToRgb((content.globalFontColor as string) || '#000000');

  const lineHeight = 1.2;

  /** Dibuja texto respetando saltos de línea (\n) y aplicando word-wrap si maxWidth está definido */
  function drawText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    maxWidth: number | undefined,
    font: FontRef,
    color: RGB = defaultColor
  ): void {
    if (text == null || String(text).trim() === '') return;
    const safeText = String(text).slice(0, 2000);
    const size = fontSize;
    let yy = height - y;

    const wrapLine = (line: string): string[] => {
      if (!maxWidth || line.trim() === '') return [line];
      const words = line.trim().split(/\s+/);
      if (words.length === 0) return [line];
      const result: string[] = [];
      let current = '';
      for (const w of words) {
        const next = current ? current + ' ' + w : w;
        if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
          result.push(current);
          current = w;
        } else {
          current = next;
        }
      }
      if (current) result.push(current);
      return result;
    };

    // Respetar saltos de línea del documento
    const paragraphs = safeText.split(/\r?\n/);
    for (const para of paragraphs) {
      const sublines = wrapLine(para);
      for (const line of sublines) {
        if (line.length > 0) {
          page.drawText(line, { x, y: yy, size, font, color });
        }
        yy -= size * lineHeight;
      }
    }
  }

  // Posiciones: priorizar las del documento (fieldPositions en content), luego las por defecto
  const docFieldPositions = (content.fieldPositions ?? {}) as Record<string, ContentFieldPosition>;
  const globalFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : undefined;
  const standardFieldValues = new Set<string>();
  for (const key of Object.keys(positions)) {
    if (key === 'items') continue;
    const v = content[key];
    if (v != null && typeof v !== 'object' && !Array.isArray(v)) {
      const t = String(v).trim();
      if (t) standardFieldValues.add(t);
    }
  }

  // Campos estándar basados en TEMPLATE_FIELD_POSITIONS
  for (const [key, pos] of Object.entries(positions)) {
    const value = content[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && key !== 'items') continue;
    if (Array.isArray(value)) continue; // items se dibujan aparte
    const text = String(value).trim();
    if (!text) continue;
    const custom = docFieldPositions[key];
    let xPts: number;
    let yPts: number;
    let fontSize = globalFontSize ?? pos.fontSize ?? 10;
    let maxWidth = pos.maxWidth;
    if (custom && typeof custom.x === 'number' && typeof custom.y === 'number') {
      xPts = custom.x * width;
      yPts = custom.y * height;
      if (typeof custom.fontSize === 'number') fontSize = custom.fontSize;
      if (typeof custom.maxWidth === 'number') maxWidth = custom.maxWidth;
    } else {
      xPts = pos.x;
      yPts = pos.y;
    }
    const font = getFont(undefined, (pos.weight ?? 'regular') === 'bold', false);
    drawText(text, xPts, yPts, fontSize, maxWidth, font, defaultColor);
  }

  // Cuadros personalizados: usar posición y estilo del documento (customBoxes con fontSize, fontBold, fontItalic, fontFamily, fontColor)
  const customBoxes = (content.customBoxes ?? []) as Array<
    {
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
    }
  >;
  const customFieldValues = (content.customFieldValues ?? {}) as Record<string, string>;
  const defaultBoxFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;
  if (Array.isArray(customBoxes) && Object.keys(customFieldValues).length > 0) {
    for (const box of customBoxes) {
      if (!box || (box.kind && box.kind !== 'text')) continue;
      const text = (customFieldValues[box.id] ?? '').trim();
      if (!text) continue;
      if (standardFieldValues.has(text)) continue; // ya dibujado como campo estándar en su posición correcta, evitar duplicar
      const size = typeof box.fontSize === 'number' ? box.fontSize : defaultBoxFontSize;
      const boxFont = getFont(box.fontFamily, !!box.fontBold, !!box.fontItalic);
      const boxColor = typeof box.fontColor === 'string' && box.fontColor
        ? hexToRgb(box.fontColor)
        : defaultColor;
      const maxWidth = box.width ? box.width * width : undefined;
      const xPts = (box.x ?? 0) * width;
      const yPts = (box.y ?? 0) * height;
      drawText(text, xPts, yPts, size, maxWidth, boxFont, boxColor);
    }
  }

  // Caso especial: ítems de cotización (tabla) — misma fuente que el resto (Averta/Helvetica)
  if (kind === 'cotizacion' && Array.isArray(content.items) && content.items.length > 0) {
    const items = content.items as Array<{ descripcion?: string; cantidad?: string; precio?: string; total?: string }>;
    let rowY = 620;
    const colX = { desc: 80, cant: 350, precio: 400, total: 480 };
    const fontSize = 9;
    const fontTable = getFont(undefined, false, false);
    const fontTableBold = getFont(undefined, true, false);
    for (let i = 0; i < Math.min(items.length, 15); i++) {
      const it = items[i];
      if (it.descripcion)
        page.drawText(String(it.descripcion).slice(0, 50), {
          x: colX.desc,
          y: height - rowY,
          size: fontSize,
          font: fontTable,
          color: defaultColor,
        });
      if (it.cantidad)
        page.drawText(String(it.cantidad), {
          x: colX.cant,
          y: height - rowY,
          size: fontSize,
          font: fontTable,
          color: defaultColor,
        });
      if (it.precio)
        page.drawText(String(it.precio), {
          x: colX.precio,
          y: height - rowY,
          size: fontSize,
          font: fontTable,
          color: defaultColor,
        });
      if (it.total)
        page.drawText(String(it.total), {
          x: colX.total,
          y: height - rowY,
          size: fontSize,
          font: fontTableBold,
          color: defaultColor,
        });
      rowY += 22;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
