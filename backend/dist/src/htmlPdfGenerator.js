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
exports.generatePdfFromHtml = generatePdfFromHtml;
exports.generatePdfFromDocument = generatePdfFromDocument;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const documentHtmlBuilder_1 = require("./documentHtmlBuilder");
const UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads');
/**
 * Convierte una imageUrl (relativa o absoluta apuntando al backend) en un data URL base64.
 * Soporta:
 *   - "/uploads/foto.jpg"
 *   - "http://localhost:3001/uploads/foto.jpg"
 *   - "http://<cualquier-host>/uploads/foto.jpg"  (extrae el path /uploads/...)
 * Si la ruta resuelta no está bajo UPLOAD_DIR, o el archivo no existe/no es imagen, retorna null.
 */
function imageUrlToDataUrl(imageUrl) {
    try {
        let relativePath = null;
        // URL absoluta: extraer el path
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            const parsed = new URL(imageUrl);
            relativePath = parsed.pathname; // e.g. /uploads/filename.jpg
        }
        else {
            relativePath = imageUrl;
        }
        // Normalizar: quitar la barra inicial si es /uploads/...
        const normalized = relativePath.startsWith('/')
            ? relativePath.slice(1) // "uploads/filename.jpg"
            : relativePath;
        // Resolver a path absoluto y validar que esté bajo UPLOAD_DIR (evitar path traversal)
        const absolutePath = path_1.default.resolve(UPLOAD_DIR, path_1.default.basename(normalized));
        const resolvedUploadDir = path_1.default.resolve(UPLOAD_DIR);
        if (!absolutePath.startsWith(resolvedUploadDir + path_1.default.sep) && absolutePath !== resolvedUploadDir) {
            return null;
        }
        if (!fs_1.default.existsSync(absolutePath))
            return null;
        const ext = path_1.default.extname(absolutePath).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
        };
        const mime = mimeMap[ext];
        if (!mime)
            return null; // No es una imagen soportada
        const buffer = fs_1.default.readFileSync(absolutePath);
        return `data:${mime};base64,${buffer.toString('base64')}`;
    }
    catch {
        return null;
    }
}
/**
 * Recorre los customBoxes del content y reemplaza imageUrl por data URL.
 * Retorna una copia del content con las imágenes resueltas.
 * Las cajas cuya imagen no se pudo resolver se dejan con imageUrl = '' (no rompen el PDF).
 */
function resolveImageUrlsToDataUrls(content) {
    const customBoxes = Array.isArray(content.customBoxes)
        ? content.customBoxes
        : [];
    const resolvedBoxes = customBoxes.map((box) => {
        if (box.kind !== 'image' || !box.imageUrl)
            return box;
        const dataUrl = imageUrlToDataUrl(String(box.imageUrl));
        if (!dataUrl) {
            console.warn(`[PDF] No se pudo resolver la imagen: ${box.imageUrl}`);
            return { ...box, imageUrl: '' }; // vacío → no renderiza nada pero no rompe
        }
        return { ...box, imageUrl: dataUrl };
    });
    return { ...content, customBoxes: resolvedBoxes };
}
/**
 * Convierte la primera página del PDF de plantilla a imagen base64.
 * Mismo tamaño que la página HTML (612×792 US Letter) para alineación 1:1 con el editor.
 */
async function getTemplatePdfFirstPageAsDataUrlWithBrowser(browser, templatePdfPath) {
    if (!fs_1.default.existsSync(templatePdfPath))
        return null;
    const absolutePath = path_1.default.resolve(templatePdfPath);
    const fileUrl = `file:///${absolutePath.replace(/\\/g, '/')}#toolbar=0&navpanes=0&scrollbar=0`;
    try {
        const page = await browser.newPage();
        // Plantilla en US Letter (612×792)
        const width = 612;
        const height = 792;
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
        // Dar más tiempo para que el visor renderice la página completa incluyendo la parte inferior
        await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
        // Detectar si hay toolbar del visor PDF
        const toolbarHeight = await page.evaluate(() => {
            const embed = document.querySelector('embed');
            if (embed) {
                const rect = embed.getBoundingClientRect();
                return rect.top; // altura de lo que hay encima del PDF
            }
            return 0;
        });
        const screenshotBuffer = await page.screenshot({
            type: 'png',
            clip: {
                x: 0,
                y: toolbarHeight,
                width: 612,
                height: 792,
            },
        });
        await page.close();
        if (!screenshotBuffer || !(screenshotBuffer instanceof Buffer))
            return null;
        return `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
    }
    catch {
        return null;
    }
}
async function generatePdfFromHtml(html, options = {}) {
    const browser = await puppeteer_1.default.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: options.format ?? 'A4',
            printBackground: true,
            margin: {
                top: '0mm',
                right: '0mm',
                bottom: '0mm',
                left: '0mm',
            },
        });
        return Buffer.from(pdf);
    }
    finally {
        await browser.close();
    }
}
/**
 * Genera PDF WYSIWYG: mismo HTML/CSS que el editor.
 * El PDF contiene ÚNICAMENTE el documento (página A4 + cajas + fondo); no se captura
 * la ventana ni la UI de la aplicación. Puppeteer recibe HTML mínimo (body > .page > cajas).
 * Si hay plantilla, la convierte a imagen y la usa de fondo en una sola ejecución de Puppeteer.
 */
/** Carga renderDocumentHtml del bundle (React). Si no existe el bundle, devuelve null. */
function loadRenderDocumentHtml() {
    try {
        const bundlePath = path_1.default.join(__dirname, '..', 'dist', 'documentViewBundle.cjs');
        if (!fs_1.default.existsSync(bundlePath))
            return null;
        const mod = require(bundlePath);
        return typeof mod?.renderDocumentHtml === 'function' ? mod.renderDocumentHtml : null;
    }
    catch {
        return null;
    }
}
async function generatePdfFromDocument(options) {
    const { content, format = 'A4', templatePdfPath } = options;
    const { buildDocumentHtml } = await Promise.resolve().then(() => __importStar(require('./documentHtmlBuilder')));
    const browser = await puppeteer_1.default.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-pdf-viewer-hud',
        ],
    });
    try {
        let backgroundImageDataUrl = null;
        if (templatePdfPath) {
            backgroundImageDataUrl = await getTemplatePdfFirstPageAsDataUrlWithBrowser(browser, templatePdfPath);
        }
        // Resolver imageUrl de cajas imagen a data URLs para que Puppeteer no dependa de red
        const resolvedContent = resolveImageUrlsToDataUrls(content);
        const renderDocumentHtml = loadRenderDocumentHtml();
        const html = renderDocumentHtml
            ? (0, documentHtmlBuilder_1.buildDocumentWrapperHtml)(renderDocumentHtml({
                content: resolvedContent,
                backgroundImageDataUrl,
            }), { content: resolvedContent })
            : buildDocumentHtml({
                content: resolvedContent,
                backgroundImageDataUrl,
            });
        const page = await browser.newPage();
        // Viewport en px para que 612pt×792pt se renderice 1:1 (96 DPI: 612pt=816px, 792pt=1056px)
        await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });
        await page.setContent(html, {
            waitUntil: 'networkidle0',
            baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
        });
        // Esperar a que todas las <img> hayan terminado de cargar (data URLs son síncronas pero por robustez)
        await Promise.race([
            page.evaluate(() => Promise.all(Array.from(document.images).map((img) => img.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); // ignorar error: el PDF se genera igual
                })))),
            new Promise((resolve) => setTimeout(resolve, 5000)), // timeout de seguridad
        ]);
        await page.emulateMediaType('screen');
        // US Letter exacto (612×792 pt): format 'Letter' evita que px se interprete distinto y la hoja quede mal
        const pdf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        });
        return Buffer.from(pdf);
    }
    finally {
        await browser.close();
    }
}
