import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { buildDocumentHtml } from '../src/documentHtmlBuilder';
import { createPdfFromScreenshotImage } from '../src/templatePdfGenerator';

type Sample = {
  id: string;
  templatePdfPath: string;
  content: Record<string, unknown>;
};

type Profile = {
  id: 'legacy' | 'optimized';
  screenshotType: 'png' | 'jpeg';
  screenshotQuality?: number;
  scale: number;
};

const VIEWPORT_WIDTH = 816;
const VIEWPORT_HEIGHT = 1056;
const LEGACY_SCALE = 300 / 96;
const OPTIMIZED_SCALE = 220 / 96;

const samples: Sample[] = [
  {
    id: 'doc-cotizacion',
    templatePdfPath: path.resolve(__dirname, '..', 'templates', 'cotizacion.pdf'),
    content: {
      globalFontFamily: 'Averta Std',
      globalFontSize: 11,
      customFieldValues: {},
      customBoxes: [
        { id: 'c1', kind: 'text', x: 0.08, y: 0.12, width: 0.84, height: 0.08, fieldKey: 'cliente', fontSize: 13 },
        { id: 'c2', kind: 'text', x: 0.08, y: 0.22, width: 0.84, height: 0.08, fieldKey: 'descripcion_corta', fontSize: 11 },
        { id: 'c3', kind: 'text', x: 0.08, y: 0.34, width: 0.84, height: 0.20, fieldKey: 'notas', fontSize: 11 },
        { id: 'c4', kind: 'text', x: 0.7, y: 0.8, width: 0.22, height: 0.07, fieldKey: 'total', fontSize: 16, backgroundColor: '#000000' },
      ],
      cliente: 'Cliente de prueba - Acme Industrial S.A.',
      descripcion_corta: 'Fabricacion e instalacion de estructura metalica para nave industrial.',
      notas:
        'Incluye visita tecnica, levantamiento, corte y soldadura, anticorrosivo y montaje final en sitio.\nCondiciones comerciales: 50% anticipo, 50% contra entrega.\nTiempo estimado: 12 dias habiles.',
      total: '$ 245,600.00',
    },
  },
  {
    id: 'doc-levantamiento',
    templatePdfPath: path.resolve(__dirname, '..', 'templates', 'levantamiento.pdf'),
    content: {
      globalFontFamily: 'Averta Std',
      globalFontSize: 10,
      customFieldValues: {},
      customBoxes: [
        { id: 'l1', kind: 'text', x: 0.07, y: 0.1, width: 0.86, height: 0.08, fieldKey: 'proyecto', fontSize: 12 },
        { id: 'l2', kind: 'text', x: 0.07, y: 0.2, width: 0.86, height: 0.08, fieldKey: 'direccion', fontSize: 10 },
        { id: 'l3', kind: 'text', x: 0.07, y: 0.3, width: 0.86, height: 0.25, fieldKey: 'descripcion', fontSize: 10 },
        { id: 'l4', kind: 'text', x: 0.07, y: 0.6, width: 0.86, height: 0.25, fieldKey: 'observaciones', fontSize: 10 },
      ],
      proyecto: 'Levantamiento tecnico para ampliacion de area de produccion',
      direccion: 'Parque Industrial Norte, Bodega 14, Monterrey, Nuevo Leon',
      descripcion:
        'Se revisa estructura existente, niveles de piso, columnas, claros y acometidas electricas.\nSe documentan interferencias y puntos criticos para instalacion.',
      observaciones:
        'Requiere reforzamiento en dos columnas. Se recomienda mantenimiento preventivo en cubierta y sustitucion de luminarias en zona poniente.',
    },
  },
];

const profiles: Profile[] = [
  { id: 'legacy', screenshotType: 'png', scale: LEGACY_SCALE },
  { id: 'optimized', screenshotType: 'jpeg', screenshotQuality: 82, scale: OPTIMIZED_SCALE },
];

async function run() {
  const outputDir = path.resolve(__dirname, '..', 'tmp', 'pdf-benchmark');
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results: Array<{
    sample: string;
    profile: string;
    sizeBytes: number;
    timeMs: number;
    outputFile: string;
  }> = [];

  async function templateToDataUrl(templatePdfPath: string): Promise<string | null> {
    if (!fs.existsSync(templatePdfPath)) return null;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1 });
      const fileUrl = `file:///${templatePdfPath.replace(/\\/g, '/')}#toolbar=0&navpanes=0&scrollbar=0`;
      await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      });
      return `data:image/png;base64,${Buffer.from(screenshotBuffer as Buffer).toString('base64')}`;
    } finally {
      await page.close();
    }
  }

  const templateCache = new Map<string, string | null>();

  try {
    for (const sample of samples) {
      if (!templateCache.has(sample.templatePdfPath)) {
        templateCache.set(sample.templatePdfPath, await templateToDataUrl(sample.templatePdfPath));
      }
      const templateDataUrl = templateCache.get(sample.templatePdfPath) ?? null;
      for (const profile of profiles) {
        const page = await browser.newPage();
        const start = performance.now();
        await page.setViewport({
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          deviceScaleFactor: profile.scale,
        });

        const html = buildDocumentHtml({
          content: sample.content,
          backgroundImageDataUrl: templateDataUrl,
        });
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
        await page.emulateMediaType('screen');

        const shot = await page.screenshot({
          type: profile.screenshotType,
          quality: profile.screenshotQuality,
          fullPage: true,
          omitBackground: false,
        });

        const pdf = await createPdfFromScreenshotImage(Buffer.from(shot as Buffer), {
          format: profile.screenshotType === 'jpeg' ? 'jpeg' : 'png',
        });
        const elapsedMs = Math.round(performance.now() - start);
        const fileName = `${sample.id}-${profile.id}.pdf`;
        const outputFile = path.join(outputDir, fileName);
        fs.writeFileSync(outputFile, pdf);
        await page.close();

        results.push({
          sample: sample.id,
          profile: profile.id,
          sizeBytes: pdf.byteLength,
          timeMs: elapsedMs,
          outputFile,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const grouped = new Map<string, { legacy?: typeof results[number]; optimized?: typeof results[number] }>();
  for (const result of results) {
    const current = grouped.get(result.sample) ?? {};
    if (result.profile === 'legacy') current.legacy = result;
    if (result.profile === 'optimized') current.optimized = result;
    grouped.set(result.sample, current);
  }

  for (const [sample, pair] of grouped.entries()) {
    if (!pair.legacy || !pair.optimized) continue;
    const reduction = ((pair.legacy.sizeBytes - pair.optimized.sizeBytes) / pair.legacy.sizeBytes) * 100;
    // eslint-disable-next-line no-console
    console.log(
      `[${sample}] legacy=${(pair.legacy.sizeBytes / 1024).toFixed(1)}KB (${pair.legacy.timeMs}ms) | optimized=${(
        pair.optimized.sizeBytes / 1024
      ).toFixed(1)}KB (${pair.optimized.timeMs}ms) | reduction=${reduction.toFixed(2)}%`
    );
  }
}

void run();
