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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const worker_threads_1 = require("worker_threads");
const documentHtmlBuilder_1 = require("./documentHtmlBuilder");
const templatePdfGenerator_1 = require("./templatePdfGenerator");
const paths_1 = require("./config/paths");
function imageUrlToDataUrl(imageUrl) {
    try {
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
            return null;
        const buffer = fs_1.default.readFileSync(absolutePath);
        return `data:${mime};base64,${buffer.toString('base64')}`;
    }
    catch {
        return null;
    }
}
function resolveImageUrlsToDataUrls(content) {
    const customBoxes = Array.isArray(content.customBoxes)
        ? content.customBoxes
        : [];
    const resolvedBoxes = customBoxes.map((box) => {
        if (box.kind !== 'image' || !box.imageUrl)
            return box;
        const dataUrl = imageUrlToDataUrl(String(box.imageUrl));
        if (!dataUrl) {
            // eslint-disable-next-line no-console
            console.warn(`[PDF] No se pudo resolver la imagen: ${box.imageUrl}`);
            return { ...box, imageUrl: '' };
        }
        return { ...box, imageUrl: dataUrl };
    });
    return { ...content, customBoxes: resolvedBoxes };
}
// US Letter a 96 DPI lógico: 612pt → 816px, 792pt → 1056px
const TEMPLATE_VIEWPORT_WIDTH = 816;
const TEMPLATE_VIEWPORT_HEIGHT = 1056;
/** Escala para 300 dpi efectivos en la captura PNG (300/96 ≈ 3.125). */
const PDF_EXPORT_DPI = 300;
const VIEWPORT_DPI = 96;
const RENDER_SCALE = PDF_EXPORT_DPI / VIEWPORT_DPI;
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
function loadRenderDocumentHtml() {
    try {
        const bundlePath = path_1.default.join(__dirname, '..', 'dist', 'documentViewBundle.cjs');
        if (!fs_1.default.existsSync(bundlePath))
            return null;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(bundlePath);
        return typeof mod?.renderDocumentHtml === 'function' ? mod.renderDocumentHtml : null;
    }
    catch {
        return null;
    }
}
async function runInWorker(payload) {
    const { options } = payload;
    const { content, format = 'A4', templatePdfPath } = options;
    const { buildDocumentHtml } = await Promise.resolve().then(() => __importStar(require('./documentHtmlBuilder')));
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-pdf-viewer-hud'],
    });
    try {
        let backgroundImageDataUrl = null;
        if (templatePdfPath) {
            backgroundImageDataUrl = await getTemplatePdfFirstPageAsDataUrlWithBrowser(browser, templatePdfPath);
        }
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
        await page.setViewport({
            width: TEMPLATE_VIEWPORT_WIDTH,
            height: TEMPLATE_VIEWPORT_HEIGHT,
            deviceScaleFactor: RENDER_SCALE,
        });
        await page.setContent(html, {
            waitUntil: 'load',
            timeout: 60000,
        });
        await Promise.race([
            page.evaluate(() => Promise.all(Array.from(document.images).map((img) => img.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                })))),
            new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
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
async function main() {
    if (!worker_threads_1.parentPort) {
        return;
    }
    try {
        const buffer = await runInWorker(worker_threads_1.workerData);
        worker_threads_1.parentPort.postMessage({ success: true, buffer });
    }
    catch (err) {
        worker_threads_1.parentPort.postMessage({
            success: false,
            error: err instanceof Error ? err.message : 'PDF generation failed',
        });
    }
}
void main();
