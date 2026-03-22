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
exports.generatePdfFromExportPreview = generatePdfFromExportPreview;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const worker_threads_1 = require("worker_threads");
const templatePdfGenerator_1 = require("./templatePdfGenerator");
const paths_1 = require("./config/paths");
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
        const absolutePath = path_1.default.resolve(paths_1.UPLOADS_DIR, path_1.default.basename(normalized));
        const resolvedUploadDir = path_1.default.resolve(paths_1.UPLOADS_DIR);
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
/** US Letter en px a 96 DPI: 612pt = 816px, 792pt = 1056px. Misma escala que el HTML de export. */
const TEMPLATE_VIEWPORT_WIDTH = 816;
const TEMPLATE_VIEWPORT_HEIGHT = 1056;
const PDF_EXPORT_DPI = 300;
const VIEWPORT_DPI = 96;
const RASTER_SCALE = PDF_EXPORT_DPI / VIEWPORT_DPI;
/**
 * Convierte la primera página del PDF de plantilla a imagen base64.
 * Viewport 816×1056 (96 DPI) para que la imagen no se reescale en el HTML (612pt×792pt = 816×1056 px).
 */
async function getTemplatePdfFirstPageAsDataUrlWithBrowser(browser, templatePdfPath) {
    if (!fs_1.default.existsSync(templatePdfPath))
        return null;
    const absolutePath = path_1.default.resolve(templatePdfPath);
    const fileUrl = `file:///${absolutePath.replace(/\\/g, '/')}#toolbar=0&navpanes=0&scrollbar=0`;
    try {
        const page = await browser.newPage();
        await page.setViewport({
            width: TEMPLATE_VIEWPORT_WIDTH,
            height: TEMPLATE_VIEWPORT_HEIGHT,
            deviceScaleFactor: 1,
        });
        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
        await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
        const screenshotBuffer = await page.screenshot({
            type: 'png',
            clip: {
                x: 0,
                y: 0,
                width: TEMPLATE_VIEWPORT_WIDTH,
                height: TEMPLATE_VIEWPORT_HEIGHT,
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
// generatePdfFromHtml se mantiene como helper legacy basado en Puppeteer en el proceso principal.
// Para la generación WYSIWYG de documentos se recomienda usar generatePdfFromDocument (con worker).
async function generatePdfFromHtml(html, options = {}) {
    const { default: puppeteer } = await Promise.resolve().then(() => __importStar(require('puppeteer')));
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        // Captura rasterizada a 300 dpi efectivos: 96 dpi de base * 3.125 = 300 dpi.
        await page.setViewport({
            width: TEMPLATE_VIEWPORT_WIDTH,
            height: TEMPLATE_VIEWPORT_HEIGHT,
            deviceScaleFactor: RASTER_SCALE,
        });
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
        await page.emulateMediaType('screen');
        const screenshotBuffer = await page.screenshot({
            type: 'png',
            fullPage: true,
            omitBackground: false,
        });
        return (0, templatePdfGenerator_1.createPdfFromScreenshotPng)(Buffer.from(screenshotBuffer));
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
    // En desarrollo (ts-node) __dirname suele ser "backend/src" y el worker compilado vive en "backend/dist/src".
    // En producción (__dirname ≈ "backend/dist/src") el worker está como "./pdfWorker.js".
    const isDistBuild = __dirname.includes(path_1.default.join('dist', 'src'));
    const workerPath = isDistBuild
        ? path_1.default.join(__dirname, 'pdfWorker.js')
        : path_1.default.join(__dirname, '..', 'dist', 'src', 'pdfWorker.js');
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    return new Promise((resolve, reject) => {
        const worker = new worker_threads_1.Worker(workerPath, {
            workerData: {
                options,
                apiBaseUrl,
            },
        });
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            worker.terminate().catch(() => { });
            reject(new Error('PDF generation timeout'));
        }, 90_000);
        worker.on('message', (msg) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (msg.success && msg.buffer) {
                resolve(Buffer.from(msg.buffer));
            }
            else {
                reject(new Error(msg.error || 'PDF worker returned an error'));
            }
        });
        worker.on('error', (err) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(err);
        });
        worker.on('exit', (code) => {
            if (settled)
                return;
            if (code === 0) {
                // exit 0 sin mensaje explícito: considerar que ya se resolvió por 'message'
                return;
            }
            settled = true;
            clearTimeout(timer);
            reject(new Error(`PDF worker exited with code ${code}`));
        });
    });
}
async function generatePdfFromExportPreview(options) {
    const { default: puppeteer } = await Promise.resolve().then(() => __importStar(require('puppeteer')));
    const scale = options.exportScale && options.exportScale > 0 ? options.exportScale : RASTER_SCALE;
    const url = new URL('/docs/export', options.frontendUrl);
    url.searchParams.set('docId', options.docId);
    url.searchParams.set('token', options.token);
    if (options.contentKey)
        url.searchParams.set('contentKey', options.contentKey);
    url.searchParams.set('scale', String(scale));
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({
            width: TEMPLATE_VIEWPORT_WIDTH,
            height: TEMPLATE_VIEWPORT_HEIGHT,
            deviceScaleFactor: scale,
        });
        await page.goto(url.toString(), { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForSelector('[data-export-ready="true"]', { timeout: 60000 });
        const root = await page.$('[data-export-root="true"]');
        if (!root)
            throw new Error('No se encontró la vista de exportación');
        const screenshotBuffer = await root.screenshot({ type: 'png' });
        return (0, templatePdfGenerator_1.createPdfFromScreenshotPng)(Buffer.from(screenshotBuffer));
    }
    finally {
        await browser.close();
    }
}
