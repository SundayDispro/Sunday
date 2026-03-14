import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

export interface HtmlPdfOptions {
  /**
   * Tamaño de página. Usamos 'A4' para cotizaciones.
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

/**
 * Convierte la primera página del PDF de plantilla a imagen base64.
 * Usa el browser ya abierto. Carga el PDF con parámetros para ocultar la UI del visor
 * (#toolbar=0&navpanes=0&scrollbar=0) y captura solo el contenido con clip al viewport.
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
    const width = 595;
    const height = 842;
    await page.setViewport({ width, height });
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    // Dar tiempo a que el visor oculte la barra y renderice la página
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    // Capturar solo el área del viewport (evitar barras si aún aparecen)
    const buffer = await page.screenshot({
      type: 'png',
      omitBackground: false,
      clip: { x: 0, y: 0, width, height },
    });
    await page.close();
    if (!buffer || !(buffer instanceof Buffer)) return null;
    return `data:image/png;base64,${buffer.toString('base64')}`;
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
export async function generatePdfFromDocument(
  options: GeneratePdfFromDocumentOptions
): Promise<Buffer> {
  const { content, format = 'A4', templatePdfPath } = options;
  const { buildDocumentHtml } = await import('./documentHtmlBuilder');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-pdf-viewer-hud',
    ],
  });

  try {
    let backgroundImageDataUrl: string | null = null;
    if (templatePdfPath) {
      backgroundImageDataUrl = await getTemplatePdfFirstPageAsDataUrlWithBrowser(
        browser,
        templatePdfPath
      );
    }

    // Resolver imageUrl de cajas imagen a data URLs para que Puppeteer no dependa de red
    const resolvedContent = resolveImageUrlsToDataUrls(content);

    const html = buildDocumentHtml({
      content: resolvedContent,
      backgroundImageDataUrl,
    });

    const page = await browser.newPage();
    // Viewport = A4 a 96dpi (794×1123) para que el contenido llene la página sin scale y sin franjas grises
    const width = format === 'Letter' ? 816 : 794;
    const height = format === 'Letter' ? 1056 : 1123;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
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
    const pdf = await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

