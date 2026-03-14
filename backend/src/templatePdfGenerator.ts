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
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

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

/** Formato de fecha para PDF (DD/MM/YYYY como en Corel/Illustrator). */
function formatDateForPdf(value: string): string {
  const s = String(value).trim();
  if (!s) return s;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return s;
}

/** Mapeo de nombre de campo -> posición por tipo de plantilla. Origen abajo-izq en puntos; valores debajo de rótulos (estilo Corel). */
export const TEMPLATE_FIELD_POSITIONS: Record<TemplateKind, Record<string, FieldPosition>> = {
  cotizacion: {
    cliente: { x: 80, y: 678, fontSize: 11 },
    fecha: { x: 450, y: 700, fontSize: 10 },
    vigencia: { x: 80, y: 648, fontSize: 10 },
    subtotal: { x: 400, y: 200, fontSize: 10 },
    iva: { x: 400, y: 180, fontSize: 10 },
    total: { x: 400, y: 160, fontSize: 11 },
    notas: { x: 80, y: 130, fontSize: 9, maxWidth: 450 },
  },
  levantamiento: {
    proyecto: { x: 80, y: 678, fontSize: 11 },
    fecha: { x: 450, y: 700, fontSize: 10 },
    direccion: { x: 80, y: 658, fontSize: 10, maxWidth: 450 },
    descripcion: { x: 80, y: 578, fontSize: 10, maxWidth: 450 },
    observaciones: { x: 80, y: 400, fontSize: 9, maxWidth: 450 },
  },
  hoja_trabajo: {
    titulo: { x: 80, y: 678, fontSize: 12 },
    fecha: { x: 450, y: 700, fontSize: 10 },
    item: { x: 80, y: 658, fontSize: 10 },
    descripcion: { x: 80, y: 578, fontSize: 10, maxWidth: 450 },
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

/** Si no hay PDF, devuelve la ruta a una imagen de plantilla (JPG o PNG) si existe. */
export function getTemplateImagePathIfExists(kind: TemplateKind): { path: string; isPng: boolean } | null {
  const base = path.join(TEMPLATES_DIR, kind);
  const candidates = [
    { path: base + '.jpg', isPng: false },
    { path: base + '.jpeg', isPng: false },
    { path: base + '.png', isPng: true },
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.path)) return c;
  }
  return null;
}

/**
 * Resuelve imageUrl a buffer para incrustar en PDF.
 * Soporta data URL (base64) y rutas /uploads/ o URLs absolutas al backend.
 */
function imageUrlToBuffer(imageUrl: string): { buffer: Buffer; isPng: boolean } | null {
  try {
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
      if (!match) return null;
      const buffer = Buffer.from(match[2], 'base64');
      const isPng = match[1].toLowerCase() === 'png';
      return { buffer, isPng };
    }
    let relativePath: string | null = null;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const parsed = new URL(imageUrl);
      relativePath = parsed.pathname;
    } else {
      relativePath = imageUrl;
    }
    const normalized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    const absolutePath = path.resolve(UPLOAD_DIR, path.basename(normalized));
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!absolutePath.startsWith(resolvedUploadDir + path.sep) && absolutePath !== resolvedUploadDir) {
      return null;
    }
    if (!fs.existsSync(absolutePath)) return null;
    const ext = path.extname(absolutePath).toLowerCase();
    const buffer = fs.readFileSync(absolutePath);
    const isPng = ext === '.png';
    if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') return null;
    return { buffer, isPng };
  } catch {
    return null;
  }
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
  const templateImage = !templatePath ? getTemplateImagePathIfExists(kind) : null;

  let pdfDoc: PDFDocument;
  let pageIndex = 0;

  if (templatePath) {
    const bytes = fs.readFileSync(templatePath);
    pdfDoc = await PDFDocument.load(bytes);
  } else if (templateImage) {
    pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const imgBytes = fs.readFileSync(templateImage.path);
    const embedded = templateImage.isPng
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);
    page.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 });
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
  let avertaItalic = standardHelveticaOblique;
  let avertaBoldItalic = standardHelveticaBoldOblique;
  try {
    const regularBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-Regular.ttf'));
    const boldBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-Bold.ttf'));
    avertaRegular = await pdfDoc.embedFont(regularBytes);
    avertaBold = await pdfDoc.embedFont(boldBytes);
    const italicBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-RegularItalic.ttf'));
    const boldItalicBytes = fs.readFileSync(path.join(FONTS_DIR, 'AvertaStd-BoldItalic.ttf'));
    avertaItalic = await pdfDoc.embedFont(italicBytes);
    avertaBoldItalic = await pdfDoc.embedFont(boldItalicBytes);
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
    // Averta Std (u otra familia no estándar): devolver variante correcta (Regular, Bold, Italic, BoldItalic)
    if (bold && italic) return avertaBoldItalic;
    if (bold) return avertaBold;
    if (italic) return avertaItalic;
    return avertaRegular;
  }

  const defaultColor = hexToRgb((content.globalFontColor as string) || '#000000');
  const globalFontBold = content.globalFontBold === true || content.globalFontBold === 'true';
  const globalFontItalic = content.globalFontItalic === true || content.globalFontItalic === 'true';

  const lineHeight = 1.2;
  /** Relación aproximada ascenso/tamaño (em). Valor conservador para que la parte superior del glifo no se corte en el cuadro (folio, etc.). */
  const ascentFactor = 0.82;
  /** Margen superior en puntos para que el texto no se corte por el borde del cuadro (cap height / ascendente). */
  const TOP_MARGIN_PT = 5;

  /** Dibuja texto respetando saltos de línea (\n) y word-wrap. y = distancia desde el borde SUPERIOR de la página hasta la parte superior del cuadro (origen arriba-izq). */
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
    // Margen superior por cuadro: evita que el borde corte la parte alta de las letras (ej. folio "006").
    const topMarginPt = Math.max(TOP_MARGIN_PT, size * 0.08);
    // En PDF drawText usa baseline (y hacia arriba). baseline desde arriba = y + margen + ascenso.
    const firstLineBaselineFromTop = y + topMarginPt + size * ascentFactor;
    let yy = height - firstLineBaselineFromTop;

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

  // Se dibujan customBoxes en orden (imágenes y texto) para respetar z-order del editor.
  const globalFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;
  const customBoxes = (content.customBoxes ?? []) as Array<
    {
      id: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      kind?: 'text' | 'image';
      imageUrl?: string;
      fontSize?: number;
      fontBold?: boolean;
      fontItalic?: boolean;
      fontFamily?: string;
      fontColor?: string;
      fieldKey?: string;
    }
  >;
  const customFieldValues = (content.customFieldValues ?? {}) as Record<string, string>;
  const defaultBoxFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;

  /** Convierte a número (0-1) por si viene como string desde JSON. */
  const num = (v: unknown, fallback: number): number => {
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, Math.min(1, v));
    const n = Number(v);
    return Number.isNaN(n) ? fallback : Math.max(0, Math.min(1, n));
  };

  if (Array.isArray(customBoxes)) {
    for (const box of customBoxes) {
      if (!box || typeof box !== 'object') continue;

      if (box.kind === 'image' && box.imageUrl) {
        const resolved = imageUrlToBuffer(String(box.imageUrl));
        if (!resolved) continue;
        const wPts = num(box.width, 0.3) * width;
        const hPts = num(box.height, 0.15) * height;
        const xPts = num(box.x, 0) * width;
        const yFromBottom = height - num(box.y, 0) * height - hPts;
        try {
          const embedded = resolved.isPng
            ? await pdfDoc.embedPng(resolved.buffer)
            : await pdfDoc.embedJpg(resolved.buffer);
          page.drawImage(embedded, {
            x: xPts,
            y: yFromBottom,
            width: wPts,
            height: hPts,
          });
        } catch {
          // Ignorar imágenes que no se puedan incrustar
        }
        continue;
      }

      if (box.kind && box.kind !== 'text') continue;
      let text: string;
      const fieldVal = box.fieldKey ? content[box.fieldKey] : undefined;
      if (box.fieldKey && fieldVal !== undefined && fieldVal !== null) {
        text =
          box.fieldKey === 'fecha'
            ? formatDateForPdf(String(fieldVal))
            : String(fieldVal).trim();
      } else {
        text = (customFieldValues[String(box.id)] ?? '').trim();
      }
      if (!text) continue;
      const size =
        typeof box.fontSize === 'number' && !Number.isNaN(box.fontSize)
          ? box.fontSize
          : defaultBoxFontSize;
      const boxBold = typeof box.fontBold === 'boolean' ? box.fontBold : globalFontBold;
      const boxItalic = typeof box.fontItalic === 'boolean' ? box.fontItalic : globalFontItalic;
      const boxFont = getFont(box.fontFamily, boxBold, boxItalic);
      const boxColor =
        typeof box.fontColor === 'string' && box.fontColor
          ? hexToRgb(box.fontColor)
          : defaultColor;
      const boxW = num(box.width, 0.3);
      const maxWidth = boxW > 0 ? boxW * width : undefined;
      const xPts = num(box.x, 0) * width;
      const yPts = num(box.y, 0) * height;
      drawText(text, xPts, yPts, size, maxWidth, boxFont, boxColor);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
