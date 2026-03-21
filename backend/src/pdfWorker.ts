import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { parentPort, workerData } from 'worker_threads';
import { buildDocumentWrapperHtml } from './documentHtmlBuilder';
import { createPdfFromScreenshotPng } from './templatePdfGenerator';

type GeneratePdfFromDocumentOptions = {
  content: Record<string, unknown>;
  format?: 'A4' | 'Letter';
  templatePdfPath?: string | null;
};

type WorkerPayload = {
  options: GeneratePdfFromDocumentOptions;
  apiBaseUrl?: string;
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function imageUrlToDataUrl(imageUrl: string): string | null {
  try {
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
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const mime = mimeMap[ext];
    if (!mime) return null;

    const buffer = fs.readFileSync(absolutePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function resolveImageUrlsToDataUrls(content: Record<string, unknown>): Record<string, unknown> {
  const customBoxes = Array.isArray((content as any).customBoxes)
    ? ((content as any).customBoxes as Array<Record<string, unknown>>)
    : [];

  const resolvedBoxes = customBoxes.map((box) => {
    if (box.kind !== 'image' || !box.imageUrl) return box;
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

async function getTemplatePdfFirstPageAsDataUrlWithBrowser(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  templatePdfPath: string
): Promise<string | null> {
  if (!fs.existsSync(templatePdfPath)) return null;
  const absolutePath = path.resolve(templatePdfPath);
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
    if (!screenshotBuffer || !(screenshotBuffer instanceof Buffer)) return null;
    return `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function loadRenderDocumentHtml():
  | ((props: { content: Record<string, unknown>; backgroundImageDataUrl?: string | null }) => string)
  | null {
  try {
    const bundlePath = path.join(__dirname, '..', 'dist', 'documentViewBundle.cjs');
    if (!fs.existsSync(bundlePath)) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(bundlePath);
    return typeof mod?.renderDocumentHtml === 'function' ? mod.renderDocumentHtml : null;
  } catch {
    return null;
  }
}

async function runInWorker(payload: WorkerPayload): Promise<Buffer> {
  const { options } = payload;
  const { content, format = 'A4', templatePdfPath } = options;
  const { buildDocumentHtml } = await import('./documentHtmlBuilder');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-pdf-viewer-hud'],
  });

  try {
    let backgroundImageDataUrl: string | null = null;
    if (templatePdfPath) {
      backgroundImageDataUrl = await getTemplatePdfFirstPageAsDataUrlWithBrowser(browser, templatePdfPath);
    }

    const resolvedContent = resolveImageUrlsToDataUrls(content);

    const renderDocumentHtml = loadRenderDocumentHtml();
    const html =
      renderDocumentHtml
        ? buildDocumentWrapperHtml(
            renderDocumentHtml({
              content: resolvedContent,
              backgroundImageDataUrl,
            }),
            { content: resolvedContent }
          )
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
      page.evaluate(() =>
        Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                })
          )
        )
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    await page.emulateMediaType('screen');
    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage: true,
      omitBackground: false,
    });

    return createPdfFromScreenshotPng(Buffer.from(screenshotBuffer as Buffer));
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!parentPort) {
    return;
  }

  try {
    const buffer = await runInWorker(workerData as WorkerPayload);
    parentPort.postMessage({ success: true, buffer });
  } catch (err: any) {
    parentPort.postMessage({
      success: false,
      error: err instanceof Error ? err.message : 'PDF generation failed',
    });
  }
}

void main();

