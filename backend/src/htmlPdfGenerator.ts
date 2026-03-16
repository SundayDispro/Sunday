import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { enqueuePdfTask } from './pdfQueue';
import { buildDocumentWrapperHtml } from './documentHtmlBuilder';

export interface HtmlPdfOptions {
  /**
   * Tamaño de página. El tamaño efectivo usado es US Letter (612×792 pts) para coincidir con la plantilla y el editor.
   */
  format?: 'A4' | 'Letter';
}

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Convierte una imageUrl (relativa o absoluta apuntando al backend) en un data URL base64.
 * Soporta:
 *   - "/uploads/foto.jpg"
 *   - "http://localhost:3001/uploads/foto.jpg"
 *   - "http://<cualquier-host>/uploads/foto.jpg"  (extrae el path /uploads/...)
 * Si la ruta resuelta no está bajo UPLOAD_DIR, o el archivo no existe/no es imagen, retorna null.
 */
function imageUrlToDataUrl(imageUrl: string): string | null {
  try {
    let relativePath: string | null = null;

    // URL absoluta: extraer el path
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const parsed = new URL(imageUrl);
      relativePath = parsed.pathname; // e.g. /uploads/filename.jpg
    } else {
      relativePath = imageUrl;
    }

    // Normalizar: quitar la barra inicial si es /uploads/...
    const normalized = relativePath.startsWith('/')
      ? relativePath.slice(1) // "uploads/filename.jpg"
      : relativePath;

    // Resolver a path absoluto y validar que esté bajo UPLOAD_DIR (evitar path traversal)
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
    if (!mime) return null; // No es una imagen soportada

    const buffer = fs.readFileSync(absolutePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Recorre los customBoxes del content y reemplaza imageUrl por data URL.
 * Retorna una copia del content con las imágenes resueltas.
 * Las cajas cuya imagen no se pudo resolver se dejan con imageUrl = '' (no rompen el PDF).
 */
function resolveImageUrlsToDataUrls(content: Record<string, unknown>): Record<string, unknown> {
  const customBoxes = Array.isArray(content.customBoxes)
    ? content.customBoxes
    : [];

  const resolvedBoxes = customBoxes.map((box: Record<string, unknown>) => {
    if (box.kind !== 'image' || !box.imageUrl) return box;
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

/**
 * Convierte la primera página del PDF de plantilla a imagen base64.
 * Viewport 816×1056 (96 DPI) para que la imagen no se reescale en el HTML (612pt×792pt = 816×1056 px).
 */
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

export async function generatePdfFromHtml(
  html: string,
  options: HtmlPdfOptions = {}
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });

    const pdf = await page.pdf({
      format: options.format ?? 'Letter',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export interface GeneratePdfFromDocumentOptions {
  /** Contenido del documento (customBoxes, customFieldValues, etc.) */
  content: Record<string, unknown>;
  format?: 'A4' | 'Letter';
  /** Ruta al PDF de plantilla para usarlo como fondo (opcional). */
  templatePdfPath?: string | null;
}

/**
 * Genera PDF WYSIWYG: mismo HTML/CSS que el editor.
 * El PDF contiene ÚNICAMENTE el documento (página A4 + cajas + fondo); no se captura
 * la ventana ni la UI de la aplicación. Puppeteer recibe HTML mínimo (body > .page > cajas).
 * Si hay plantilla, la convierte a imagen y la usa de fondo en una sola ejecución de Puppeteer.
 */
/** Carga renderDocumentHtml del bundle (React). Si no existe el bundle, devuelve null. */
function loadRenderDocumentHtml(): ((props: { content: Record<string, unknown>; backgroundImageDataUrl?: string | null }) => string) | null {
  try {
    const bundlePath = path.join(__dirname, '..', 'dist', 'documentViewBundle.cjs');
    if (!fs.existsSync(bundlePath)) return null;
    const mod = require(bundlePath);
    return typeof mod?.renderDocumentHtml === 'function' ? mod.renderDocumentHtml : null;
  } catch {
    return null;
  }
}

export async function generatePdfFromDocument(
  options: GeneratePdfFromDocumentOptions
): Promise<Buffer> {
  const { content, format = 'A4', templatePdfPath } = options;
  const { buildDocumentHtml } = await import('./documentHtmlBuilder');
  return enqueuePdfTask<Buffer>(async (browser) => {
    let backgroundImageDataUrl: string | null = null;
    if (templatePdfPath) {
      backgroundImageDataUrl = await getTemplatePdfFirstPageAsDataUrlWithBrowser(
        browser,
        templatePdfPath
      );
    }

    // Resolver imageUrl de cajas imagen a data URLs para que Puppeteer no dependa de red
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
    // Viewport en px para que 612pt×792pt se renderice 1:1 (96 DPI: 612pt=816px, 792pt=1056px)
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: 'load',
      baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
      timeout: 60000,
    });

    // Esperar a que todas las <img> hayan terminado de cargar (data URLs son síncronas pero por robustez)
    await Promise.race([
      page.evaluate(() =>
        Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve(); // ignorar error: el PDF se genera igual
                })
          )
        )
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)), // timeout de seguridad
    ]);

    await page.emulateMediaType('screen');
    // US Letter exacto (612×792 pt). printBackground: true para que se vean fondos y texto blanco en el PDF.
    const pdf = await page.pdf({
      format: format === 'Letter' ? 'Letter' : 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    return Buffer.from(pdf);
  });
}

