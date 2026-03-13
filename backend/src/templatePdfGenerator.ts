import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';

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
  // Embed AvertaStd fonts (fall back to default font if something goes wrong)
  const [avertaRegular, avertaBold] = await (async () => {
    try {
      const regularBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-Regular.ttf'));
      const boldBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-Bold.ttf'));
      const regularFont = await pdfDoc.embedFont(regularBytes);
      const boldFont = await pdfDoc.embedFont(boldBytes);
      return [regularFont, boldFont];
    } catch {
      // Si por alguna razón no se pueden cargar las fuentes personalizadas,
      // usamos la fuente estándar incorporada.
      const { StandardFonts } = await import('pdf-lib');
      const fallback = await pdfDoc.embedFont(StandardFonts.Helvetica);
      return [fallback, fallback];
    }
  })();

  function drawText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    maxWidth?: number,
    weight: 'regular' | 'bold' = 'regular'
  ): void {
    if (!text) return;
    const safeText = String(text).slice(0, 500);
    const font = weight === 'bold' ? avertaBold : avertaRegular;
    const size = fontSize;
    let yy = height - y;
    if (maxWidth && safeText.length * (size / 2) > maxWidth) {
      const lines: string[] = [];
      const words = safeText.split(/\s+/);
      let line = '';
      for (const w of words) {
        if (font.widthOfTextAtSize(line + w, size) > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = line ? line + ' ' + w : w;
        }
      }
      if (line) lines.push(line);
      for (const l of lines) {
        page.drawText(l, { x, y: yy, size, font, color: rgb(0, 0, 0) });
        yy -= size * 1.2;
      }
    } else {
      page.drawText(safeText, { x, y: yy, size, font, color: rgb(0, 0, 0) });
    }
  }

  const fieldPositionsFromContent = (content.fieldPositions ?? {}) as Record<string, ContentFieldPosition>;

  // Campos estándar basados en TEMPLATE_FIELD_POSITIONS
  for (const [key, pos] of Object.entries(positions)) {
    const value = content[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && key !== 'items') continue;
    if (Array.isArray(value)) continue; // items se dibujan aparte
    const text = String(value).trim();
    if (!text) continue;
    const custom = fieldPositionsFromContent[key];
    let xPts: number;
    let yPts: number;
    let fontSize = pos.fontSize ?? 10;
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
    drawText(text, xPts, yPts, fontSize, maxWidth, pos.weight ?? 'regular');
  }

  // Cuadros personalizados provenientes del editor (customBoxes + customFieldValues)
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
    }
  >;
  const customFieldValues = (content.customFieldValues ?? {}) as Record<string, string>;
  if (Array.isArray(customBoxes) && Object.keys(customFieldValues).length > 0) {
    for (const box of customBoxes) {
      if (!box || (box.kind && box.kind !== 'text')) continue;
      const text = (customFieldValues[box.id] ?? '').trim();
      if (!text) continue;
      const size = box.fontSize ?? 11;
      const weight: 'regular' | 'bold' = box.fontBold ? 'bold' : 'regular';
      const maxWidth = box.width ? box.width * width : undefined;
      const xPts = (box.x ?? 0) * width;
      const yPts = (box.y ?? 0) * height;
      drawText(text, xPts, yPts, size, maxWidth, weight);
    }
  }

  // Caso especial: ítems de cotización (tabla)
  if (kind === 'cotizacion' && Array.isArray(content.items) && content.items.length > 0) {
    const items = content.items as Array<{ descripcion?: string; cantidad?: string; precio?: string; total?: string }>;
    let rowY = 620;
    const colX = { desc: 80, cant: 350, precio: 400, total: 480 };
    const fontSize = 9;
    for (let i = 0; i < Math.min(items.length, 15); i++) {
      const it = items[i];
      if (it.descripcion)
        page.drawText(String(it.descripcion).slice(0, 50), {
          x: colX.desc,
          y: height - rowY,
          size: fontSize,
          font: avertaRegular,
          color: rgb(0, 0, 0),
        });
      if (it.cantidad)
        page.drawText(String(it.cantidad), {
          x: colX.cant,
          y: height - rowY,
          size: fontSize,
          font: avertaRegular,
          color: rgb(0, 0, 0),
        });
      if (it.precio)
        page.drawText(String(it.precio), {
          x: colX.precio,
          y: height - rowY,
          size: fontSize,
          font: avertaRegular,
          color: rgb(0, 0, 0),
        });
      if (it.total)
        page.drawText(String(it.total), {
          x: colX.total,
          y: height - rowY,
          size: fontSize,
          font: avertaBold,
          color: rgb(0, 0, 0),
        });
      rowY += 22;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
