import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

export interface HtmlPdfOptions {
  /**
   * Tamaño de página. Usamos 'A4' para cotizaciones.
   */
  format?: 'A4' | 'Letter';
}

/**
 * Convierte la primera página del PDF de plantilla a imagen base64.
 * Usa el browser ya abierto para no lanzar Puppeteer dos veces.
 */
async function getTemplatePdfFirstPageAsDataUrlWithBrowser(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  templatePdfPath: string
): Promise<string | null> {
  if (!fs.existsSync(templatePdfPath)) return null;
  const absolutePath = path.resolve(templatePdfPath);
  const fileUrl = `file:///${absolutePath.replace(/\\/g, '/')}`;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 595, height: 842 });
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 10000 });
    const buffer = await page.screenshot({ type: 'png', omitBackground: false });
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
 * Si hay plantilla, la convierte a imagen y la usa de fondo en una sola ejecución de Puppeteer.
 */
export async function generatePdfFromDocument(
  options: GeneratePdfFromDocumentOptions
): Promise<Buffer> {
  const { content, format = 'A4', templatePdfPath } = options;
  const { buildDocumentHtml } = await import('./documentHtmlBuilder');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    let backgroundImageDataUrl: string | null = null;
    if (templatePdfPath) {
      backgroundImageDataUrl = await getTemplatePdfFirstPageAsDataUrlWithBrowser(
        browser,
        templatePdfPath
      );
    }

    const html = buildDocumentHtml({
      content,
      backgroundImageDataUrl,
    });

    const page = await browser.newPage();
    // Viewport A4 (595x842 pt) para que el layout con % se calcule igual que en el editor
    const width = format === 'Letter' ? 612 : 595;
    const height = format === 'Letter' ? 792 : 842;
    await page.setViewport({ width, height });
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
    });

    const pdf = await page.pdf({
      format,
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

