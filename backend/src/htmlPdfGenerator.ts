import puppeteer from 'puppeteer';

export interface HtmlPdfOptions {
  /**
   * Tamaño de página. Usamos 'A4' para cotizaciones.
   */
  format?: 'A4' | 'Letter';
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

