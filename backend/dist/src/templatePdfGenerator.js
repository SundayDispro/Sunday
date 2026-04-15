"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATE_FIELD_POSITIONS = void 0;
exports.getTemplatePathIfExists = getTemplatePathIfExists;
exports.getTemplatesDir = getTemplatesDir;
exports.createPdfFromScreenshotImage = createPdfFromScreenshotImage;
exports.createPdfFromScreenshotPng = createPdfFromScreenshotPng;
exports.getTemplateImagePathIfExists = getTemplateImagePathIfExists;
exports.generatePdfFromTemplate = generatePdfFromTemplate;
exports.generateFilledPdf = generateFilledPdf;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const pdf_lib_1 = require("pdf-lib");
const paths_1 = require("./config/paths");
/** Convierte color hex (#000000 o #fff) a RGB para pdf-lib */
function hexToRgb(hex) {
    const s = String(hex).replace(/^#/, '');
    if (s.length === 3) {
        const r = parseInt(s[0] + s[0], 16) / 255;
        const g = parseInt(s[1] + s[1], 16) / 255;
        const b = parseInt(s[2] + s[2], 16) / 255;
        return (0, pdf_lib_1.rgb)(r, g, b);
    }
    if (s.length === 6) {
        const r = parseInt(s.slice(0, 2), 16) / 255;
        const g = parseInt(s.slice(2, 4), 16) / 255;
        const b = parseInt(s.slice(4, 6), 16) / 255;
        return (0, pdf_lib_1.rgb)(r, g, b);
    }
    return (0, pdf_lib_1.rgb)(0, 0, 0);
}
// Rutas relativas al backend para que funcionen aunque el proceso se inicie desde cualquier cwd.
const isInDist = __dirname.includes(path_1.default.sep + 'dist' + path_1.default.sep);
const BACKEND_ROOT = isInDist ? path_1.default.resolve(__dirname, '..', '..') : path_1.default.resolve(__dirname, '..');
const TEMPLATE_DIR_CANDIDATES = [
    path_1.default.join(BACKEND_ROOT, 'templates'),
    path_1.default.join(process.cwd(), 'templates'),
    path_1.default.join(process.cwd(), 'backend', 'templates'),
];
const TEMPLATES_DIR = TEMPLATE_DIR_CANDIDATES[0];
const FONTS_DIR = path_1.default.join(BACKEND_ROOT, 'assets', 'fonts', 'AvertaStd');
/** Formato de fecha para PDF (DD/MM/YYYY como en Corel/Illustrator). */
function formatDateForPdf(value) {
    const s = String(value).trim();
    if (!s)
        return s;
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match)
        return `${match[3]}/${match[2]}/${match[1]}`;
    return s;
}
/** Mapeo de nombre de campo -> posición por tipo de plantilla. Origen abajo-izq en puntos; valores debajo de rótulos (estilo Corel). */
exports.TEMPLATE_FIELD_POSITIONS = {
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
function getTemplatePath(kind) {
    return path_1.default.join(TEMPLATES_DIR, `${kind}.pdf`);
}
function getTemplatePathIfExists(kind) {
    for (const dir of TEMPLATE_DIR_CANDIDATES) {
        const p = path_1.default.join(dir, `${kind}.pdf`);
        if (fs_1.default.existsSync(p))
            return p;
    }
    return null;
}
/** Ruta del directorio de plantillas (para que el endpoint de upload guarde en el mismo sitio). */
function getTemplatesDir() {
    return TEMPLATES_DIR;
}
/** US Letter en puntos (72 pt = 1 inch). */
const LETTER_WIDTH_PT = 612;
const LETTER_HEIGHT_PT = 792;
/**
 * Crea un PDF de una página US Letter con una captura rasterizada (PNG/JPEG).
 * La imagen se dibuja a tamaño completo en la página (612×792 pt).
 */
async function createPdfFromScreenshotImage(imageBuffer, options) {
    const format = options?.format ?? 'png';
    const pdfDoc = await pdf_lib_1.PDFDocument.create();
    const page = pdfDoc.addPage([LETTER_WIDTH_PT, LETTER_HEIGHT_PT]);
    const embedded = format === 'jpeg'
        ? await pdfDoc.embedJpg(imageBuffer)
        : await pdfDoc.embedPng(imageBuffer);
    page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: LETTER_WIDTH_PT,
        height: LETTER_HEIGHT_PT,
    });
    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
}
/** Compatibilidad retro: mantiene nombre histórico para llamadas existentes. */
async function createPdfFromScreenshotPng(pngBuffer) {
    return createPdfFromScreenshotImage(pngBuffer, { format: 'png' });
}
/** Si no hay PDF, devuelve la ruta a una imagen de plantilla (JPG o PNG) si existe. */
function getTemplateImagePathIfExists(kind) {
    for (const dir of TEMPLATE_DIR_CANDIDATES) {
        const base = path_1.default.join(dir, kind);
        const candidates = [
            { path: base + '.jpg', isPng: false },
            { path: base + '.jpeg', isPng: false },
            { path: base + '.png', isPng: true },
        ];
        for (const c of candidates) {
            if (fs_1.default.existsSync(c.path))
                return c;
        }
    }
    return null;
}
/**
 * Resuelve imageUrl a buffer para incrustar en PDF.
 * Soporta data URL (base64) y rutas /uploads/ o URLs absolutas al backend.
 */
function imageUrlToBuffer(imageUrl) {
    try {
        if (imageUrl.startsWith('data:')) {
            const match = imageUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
            if (!match)
                return null;
            const buffer = Buffer.from(match[2], 'base64');
            const isPng = match[1].toLowerCase() === 'png';
            return { buffer, isPng };
        }
        let relativePath = null;
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            const parsed = new URL(imageUrl);
            relativePath = parsed.pathname;
        }
        else {
            relativePath = imageUrl;
        }
        const normalized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
        const absolutePath = path_1.default.resolve(paths_1.UPLOADS_DIR, path_1.default.basename(normalized));
        const resolvedUploadDir = path_1.default.resolve(paths_1.UPLOADS_DIR);
        if (!absolutePath.startsWith(resolvedUploadDir + path_1.default.sep) && absolutePath !== resolvedUploadDir) {
            return null;
        }
        if (!fs_1.default.existsSync(absolutePath))
            return null;
        const ext = path_1.default.extname(absolutePath).toLowerCase();
        const buffer = fs_1.default.readFileSync(absolutePath);
        const isPng = ext === '.png';
        if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg')
            return null;
        return { buffer, isPng };
    }
    catch {
        return null;
    }
}
function sha1Buffer(buffer) {
    return crypto_1.default.createHash('sha1').update(buffer).digest('hex');
}
const SIMPLE_TEMPLATE_FIELDS = {
    cotizacion: {
        cliente: { page: 0, x: 80, y: 678, size: 11, align: 'left' },
        fecha: { page: 0, x: 450, y: 700, size: 11, align: 'left' },
        total: { page: 0, x: 520, y: 120, size: 12, align: 'right' },
    },
    levantamiento: {},
    hoja_trabajo: {},
};
/**
 * Genera un PDF rellenando la plantilla con el contenido.
 * Si no existe la plantilla, crea un PDF de una página con los textos en las posiciones definidas.
 */
async function generatePdfFromTemplate(kind, content) {
    const templatePath = getTemplatePathIfExists(kind);
    const templateImage = !templatePath ? getTemplateImagePathIfExists(kind) : null;
    let pdfDoc;
    let pageIndex = 0;
    if (templatePath) {
        const bytes = fs_1.default.readFileSync(templatePath);
        pdfDoc = await pdf_lib_1.PDFDocument.load(bytes);
    }
    else if (templateImage) {
        pdfDoc = await pdf_lib_1.PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]); // US Letter
        const imgBytes = fs_1.default.readFileSync(templateImage.path);
        const embedded = templateImage.isPng
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);
        page.drawImage(embedded, { x: 0, y: 0, width: 612, height: 792 });
    }
    else {
        pdfDoc = await pdf_lib_1.PDFDocument.create();
        pdfDoc.addPage([612, 792]); // US Letter
    }
    const page = pdfDoc.getPage(pageIndex);
    const { width, height } = page.getSize();
    const { StandardFonts } = await Promise.resolve().then(() => __importStar(require('pdf-lib')));
    const standardHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const standardHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const standardHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const standardHelveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    let avertaRegular = standardHelvetica;
    let avertaBold = standardHelveticaBold;
    let avertaItalic = standardHelveticaOblique;
    let avertaBoldItalic = standardHelveticaBoldOblique;
    try {
        const regularPath = path_1.default.join(FONTS_DIR, 'AvertaStd-Regular.ttf');
        const boldPath = path_1.default.join(FONTS_DIR, 'AvertaStd-Bold.ttf');
        let regularBytes = null;
        let boldBytes = null;
        if (fs_1.default.existsSync(regularPath))
            regularBytes = fs_1.default.readFileSync(regularPath);
        if (fs_1.default.existsSync(boldPath))
            boldBytes = fs_1.default.readFileSync(boldPath);
        // Fallback: OTF del frontend (misma fuente que el preview)
        if (!regularBytes) {
            const otfPaths = [
                path_1.default.join(BACKEND_ROOT, '..', 'frontend', 'dist', 'AvertaDemoPECuttedDemo-Regular.otf'),
                path_1.default.join(BACKEND_ROOT, '..', 'frontend', 'dist', 'assets', 'AvertaDemoPECuttedDemo-Regular-A7gaq-Ug.otf'),
            ];
            for (const p of otfPaths) {
                if (fs_1.default.existsSync(p)) {
                    regularBytes = fs_1.default.readFileSync(p);
                    break;
                }
            }
        }
        if (regularBytes) {
            avertaRegular = await pdfDoc.embedFont(regularBytes, { subset: true });
            avertaItalic = avertaRegular; // OTF demo suele ser solo Regular
        }
        if (boldBytes) {
            avertaBold = await pdfDoc.embedFont(boldBytes, { subset: true });
            avertaBoldItalic = avertaBold;
        }
        else if (regularBytes) {
            avertaBold = avertaRegular;
            avertaBoldItalic = avertaRegular;
        }
        if (!boldBytes && regularBytes) {
            const italicPath = path_1.default.join(FONTS_DIR, 'AvertaStd-RegularItalic.ttf');
            const boldItalicPath = path_1.default.join(FONTS_DIR, 'AvertaStd-BoldItalic.ttf');
            if (fs_1.default.existsSync(italicPath))
                avertaItalic = await pdfDoc.embedFont(fs_1.default.readFileSync(italicPath), { subset: true });
            if (fs_1.default.existsSync(boldItalicPath))
                avertaBoldItalic = await pdfDoc.embedFont(fs_1.default.readFileSync(boldItalicPath), { subset: true });
        }
    }
    catch {
        // Si Averta no está disponible se usan las estándar ya asignadas
    }
    // Por defecto Averta Std para que el PDF use fuentes embebidas y se vea igual en cualquier visor (como en Illustrator)
    const globalFontFamily = String(content.globalFontFamily ?? 'Averta Std').trim();
    function getFont(boxFontFamily, bold, italic) {
        const family = (boxFontFamily ?? globalFontFamily).trim();
        const useStd = /^Helvetica|Arial|sans-serif$/i.test(family) && family.length > 0;
        if (useStd) {
            if (bold && italic)
                return standardHelveticaBoldOblique;
            if (bold)
                return standardHelveticaBold;
            if (italic)
                return standardHelveticaOblique;
            return standardHelvetica;
        }
        // Averta Std (u otra familia no estándar): devolver variante correcta (Regular, Bold, Italic, BoldItalic)
        if (bold && italic)
            return avertaBoldItalic;
        if (bold)
            return avertaBold;
        if (italic)
            return avertaItalic;
        return avertaRegular;
    }
    const defaultColor = hexToRgb(content.globalFontColor || '#000000');
    const globalFontBold = content.globalFontBold === true || content.globalFontBold === 'true';
    const globalFontItalic = content.globalFontItalic === true || content.globalFontItalic === 'true';
    /** Relación aproximada ascenso/tamaño (em). Valor conservador para que la parte superior del glifo no se corte en el cuadro (folio, etc.). */
    const ascentFactor = 0.82;
    /** Paddings en pt sincronizados con DocumentPageForPdf (1px = 0.75pt a 96 DPI). */
    const PADDING_TOP_FOLIO_PT = 9; // 12px
    const PADDING_TOP_SINGLE_PT = 12; // 16px
    const PADDING_TOP_DESCRIPCION_CORTA_PT = 27; // 36px (12+24)
    const PADDING_TOP_MULTI_PT = 6; // 8px
    const PADDING_SIDES_PT = 4.5; // 6px
    const pdfWhite = (0, pdf_lib_1.rgb)(254 / 255, 254 / 255, 254 / 255);
    /** Dibuja texto respetando saltos de línea (\n) y word-wrap. y = distancia desde el borde SUPERIOR de la página hasta la parte superior del cuadro (origen arriba-izq). */
    function drawText(text, x, y, fontSize, maxWidth, font, color = defaultColor, align = 'left', paddingTopPt, lineHeight) {
        if (text == null || String(text).trim() === '')
            return;
        const safeText = String(text).slice(0, 2000);
        const size = fontSize;
        const topMarginPt = Math.max(paddingTopPt, size * 0.08);
        const firstLineBaselineFromTop = y + topMarginPt + size * ascentFactor;
        let yy = height - firstLineBaselineFromTop;
        const wrapLine = (line) => {
            if (!maxWidth || line.trim() === '')
                return [line];
            const words = line.trim().split(/\s+/);
            if (words.length === 0)
                return [line];
            const result = [];
            let current = '';
            for (const w of words) {
                const next = current ? current + ' ' + w : w;
                if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
                    result.push(current);
                    current = w;
                }
                else {
                    current = next;
                }
            }
            if (current)
                result.push(current);
            return result;
        };
        const effectiveWidth = maxWidth ?? (width - x - PADDING_SIDES_PT * 2);
        const paragraphs = safeText.split(/\r?\n/);
        for (const para of paragraphs) {
            const sublines = wrapLine(para);
            for (const line of sublines) {
                if (line.length > 0) {
                    const lineW = font.widthOfTextAtSize(line, size);
                    let drawX = x;
                    if (align === 'right' && effectiveWidth > 0)
                        drawX = x + effectiveWidth - lineW;
                    else if (align === 'center' && effectiveWidth > 0)
                        drawX = x + (effectiveWidth - lineW) / 2;
                    page.drawText(line, { x: drawX, y: yy, size, font, color });
                }
                yy -= size * lineHeight;
            }
        }
    }
    // Se dibujan customBoxes en orden (imágenes y texto) para respetar z-order del editor.
    const globalFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;
    const customBoxes = (content.customBoxes ?? []);
    const customFieldValues = (content.customFieldValues ?? {});
    const defaultBoxFontSize = typeof content.globalFontSize === 'number' ? content.globalFontSize : 11;
    const embeddedImageCache = new Map();
    /** Convierte a número (0-1) por si viene como string desde JSON. */
    const num = (v, fallback) => {
        if (typeof v === 'number' && !Number.isNaN(v))
            return Math.max(0, Math.min(1, v));
        const n = Number(v);
        return Number.isNaN(n) ? fallback : Math.max(0, Math.min(1, n));
    };
    if (Array.isArray(customBoxes)) {
        for (const box of customBoxes) {
            if (!box || typeof box !== 'object')
                continue;
            if (box.kind === 'image' && box.imageUrl) {
                const resolved = imageUrlToBuffer(String(box.imageUrl));
                if (!resolved)
                    continue;
                const wPts = num(box.width, 0.3) * width;
                const hPts = num(box.height, 0.15) * height;
                const xPts = num(box.x, 0) * width;
                const yFromBottom = height - num(box.y, 0) * height - hPts;
                try {
                    const cacheKey = `${resolved.isPng ? 'png' : 'jpg'}:${sha1Buffer(resolved.buffer)}`;
                    let embedded = embeddedImageCache.get(cacheKey);
                    if (!embedded) {
                        embedded = resolved.isPng
                            ? await pdfDoc.embedPng(resolved.buffer)
                            : await pdfDoc.embedJpg(resolved.buffer);
                        embeddedImageCache.set(cacheKey, embedded);
                    }
                    const rotDeg = typeof box.rotationDeg === 'number' && !Number.isNaN(box.rotationDeg) ? box.rotationDeg : 0;
                    if (Math.abs(rotDeg) < 0.01) {
                        page.drawImage(embedded, {
                            x: xPts,
                            y: yFromBottom,
                            width: wPts,
                            height: hPts,
                        });
                    }
                    else {
                        const cx = xPts + wPts / 2;
                        const cy = yFromBottom + hPts / 2;
                        const xObjectKey = page.node.newXObject('Image', embedded.ref);
                        // Alineado con CSS (positivo = horario en pantalla Y-abajo): invertir en PDF (Y-arriba).
                        const rad = (-rotDeg * Math.PI) / 180;
                        page.pushOperators((0, pdf_lib_1.pushGraphicsState)(), (0, pdf_lib_1.translate)(cx, cy), (0, pdf_lib_1.rotateRadians)(rad), (0, pdf_lib_1.translate)(-wPts / 2, -hPts / 2), (0, pdf_lib_1.scale)(wPts, hPts), (0, pdf_lib_1.drawObject)(xObjectKey), (0, pdf_lib_1.popGraphicsState)());
                    }
                }
                catch {
                    // Ignorar imágenes que no se puedan incrustar
                }
                continue;
            }
            if (box.kind && box.kind !== 'text')
                continue;
            let text;
            const fieldVal = box.fieldKey ? content[box.fieldKey] : undefined;
            if (box.fieldKey && fieldVal !== undefined && fieldVal !== null) {
                text =
                    box.fieldKey === 'fecha'
                        ? formatDateForPdf(String(fieldVal))
                        : String(fieldVal).trim();
            }
            else {
                text = (customFieldValues[String(box.id)] ?? '').trim();
            }
            if (!text)
                continue;
            let size = typeof box.fontSize === 'number' && !Number.isNaN(box.fontSize)
                ? box.fontSize
                : defaultBoxFontSize;
            const isTotalBox = box.fieldKey === 'total';
            const isFolioBox = box.fieldKey === 'folio' || box.semantic === 'folio';
            const isDescripcionCortaBox = box.fieldKey === 'descripcion_corta';
            const isSingleLineBox = box.singleLine === true || isFolioBox || isTotalBox;
            if (isTotalBox)
                size = Math.max(size, 11);
            const boxBg = typeof box.backgroundColor === 'string' && box.backgroundColor.trim() ? box.backgroundColor.trim().toLowerCase() : '';
            const hasBlackBg = boxBg === '#000000' || boxBg === '#000';
            const useWhiteText = isTotalBox || hasBlackBg;
            const boxBold = isTotalBox ? true : (typeof box.fontBold === 'boolean' ? box.fontBold : globalFontBold);
            const boxItalic = typeof box.fontItalic === 'boolean' ? box.fontItalic : globalFontItalic;
            const boxFont = getFont(box.fontFamily, boxBold, boxItalic);
            const boxColor = useWhiteText ? pdfWhite : (typeof box.fontColor === 'string' && box.fontColor ? hexToRgb(box.fontColor) : defaultColor);
            const boxW = num(box.width, 0.3);
            const boxWidthPts = boxW > 0 ? boxW * width : 0;
            const paddingTopPt = isTotalBox
                ? 0
                : isDescripcionCortaBox
                    ? PADDING_TOP_DESCRIPCION_CORTA_PT
                    : isFolioBox
                        ? PADDING_TOP_FOLIO_PT
                        : isSingleLineBox
                            ? PADDING_TOP_SINGLE_PT
                            : PADDING_TOP_MULTI_PT;
            const effectiveWidthPts = boxWidthPts > PADDING_SIDES_PT * 2 ? boxWidthPts - PADDING_SIDES_PT * 2 : 0;
            const maxWidth = effectiveWidthPts > 0 ? effectiveWidthPts : undefined;
            const xPts = num(box.x, 0) * width + PADDING_SIDES_PT;
            const yPts = num(box.y, 0) * height;
            const textAlign = isTotalBox ? 'right' : 'left';
            const lineHeightForBox = isTotalBox ? 1 : isSingleLineBox ? 1.1 : 1.35;
            drawText(text, xPts, yPts, size, maxWidth, boxFont, boxColor, textAlign, paddingTopPt, lineHeightForBox);
        }
    }
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
/**
 * Rellena una plantilla PDF base dibujando texto directamente con pdf-lib.
 * Paso 1 del plan: solo campos básicos de cotización (cliente, fecha, total) con
 * coordenadas fijas; más adelante se generalizará usando TemplateConfig/customBoxes.
 */
async function generateFilledPdf(kind, fieldValues) {
    const templatePath = getTemplatePathIfExists(kind);
    if (!templatePath) {
        throw new Error(`Plantilla ${kind} no encontrada. Coloca el archivo en backend/templates/${kind}.pdf`);
    }
    const bytes = fs_1.default.readFileSync(templatePath);
    const pdfDoc = await pdf_lib_1.PDFDocument.load(bytes);
    const pages = pdfDoc.getPages();
    if (!pages.length) {
        pages.push(pdfDoc.addPage([612, 792]));
    }
    const { StandardFonts } = await Promise.resolve().then(() => __importStar(require('pdf-lib')));
    const standardHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const standardHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let avertaRegular = standardHelvetica;
    let avertaBold = standardHelveticaBold;
    try {
        const regularBytes = fs_1.default.readFileSync(path_1.default.join(FONTS_DIR, 'AvertaStd-Regular.ttf'));
        const boldBytes = fs_1.default.readFileSync(path_1.default.join(FONTS_DIR, 'AvertaStd-Bold.ttf'));
        avertaRegular = await pdfDoc.embedFont(regularBytes);
        avertaBold = await pdfDoc.embedFont(boldBytes);
    }
    catch {
        // Si Averta no está disponible se usan las fuentes estándar ya asignadas.
    }
    const fieldsForKind = SIMPLE_TEMPLATE_FIELDS[kind] ?? {};
    const page0 = pages[0];
    for (const [key, cfg] of Object.entries(fieldsForKind)) {
        const raw = fieldValues[key] !== undefined && fieldValues[key] !== null
            ? String(fieldValues[key]).trim()
            : '';
        if (!raw)
            continue;
        const text = key === 'fecha' ? formatDateForPdf(raw) : raw;
        const font = key === 'total' ? avertaBold : avertaRegular;
        let x = cfg.x;
        const y = cfg.y;
        if (cfg.align === 'right') {
            const w = font.widthOfTextAtSize(text, cfg.size);
            x = cfg.x - w;
        }
        else if (cfg.align === 'center') {
            const w = font.widthOfTextAtSize(text, cfg.size);
            x = cfg.x - w / 2;
        }
        const targetPage = pages[cfg.page] ?? page0;
        targetPage.drawText(text, {
            x,
            y,
            size: cfg.size,
            font,
            color: hexToRgb('#000000'),
        });
    }
    const outBytes = await pdfDoc.save();
    return Buffer.from(outBytes);
}
