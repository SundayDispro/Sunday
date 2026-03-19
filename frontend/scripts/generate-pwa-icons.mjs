import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

const logoSvgPath = path.join(publicDir, 'logo.svg');
if (!fs.existsSync(logoSvgPath)) {
  throw new Error(`No encuentro ${logoSvgPath}`);
}

const logoSvg = fs.readFileSync(logoSvgPath, 'utf8');

const viewBoxMatch = logoSvg.match(/viewBox="([^"]+)"/i);
if (!viewBoxMatch) {
  throw new Error('logo.svg no tiene viewBox');
}

const [_, __, viewW, viewH] = viewBoxMatch[1].split(/\s+/).map(Number);
if (!Number.isFinite(viewW) || !Number.isFinite(viewH) || viewW <= 0 || viewH <= 0) {
  throw new Error(`viewBox inválido: ${viewBoxMatch[1]}`);
}

// Extraer el contenido interno del SVG (sin <svg> wrapper).
const innerMatch = logoSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
if (!innerMatch) throw new Error('No pude extraer el contenido interno del SVG');
const logoInner = innerMatch[1].trim();

function buildIconSvg(size) {
  // Para ajustar el logo completo (595x841) dentro de un canvas cuadrado,
  // escalar por altura y centrar horizontalmente.
  const scale = size / viewH;
  const contentW = viewW * scale;
  const xOffset = (size - contentW) / 2;
  const yOffset = 0;

  // Background estilo "banner de login" (aprox con overlays radiales + linear).
  // Colores basados en el login actual: #ff4aa8, #7c3aed, #ffb100, #ff2f7d, #6d28d9.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="#ffffff">
  <defs>
    <linearGradient id="bgLinear" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff2f7d"/>
      <stop offset="50%" stop-color="#6d28d9"/>
      <stop offset="100%" stop-color="#ffb100"/>
    </linearGradient>

    <radialGradient id="bgR1" cx="0.2" cy="0.2" r="0.6">
      <stop offset="0%" stop-color="#ff4aa8" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#ff4aa8" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="bgR2" cx="0.8" cy="0.15" r="0.55">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.9"/>
      <stop offset="58%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="bgR3" cx="0.6" cy="0.85" r="0.55">
      <stop offset="0%" stop-color="#ffb100" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#ffb100" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${size}" height="${size}" fill="url(#bgLinear)"/>
  <rect width="${size}" height="${size}" fill="url(#bgR1)"/>
  <rect width="${size}" height="${size}" fill="url(#bgR2)"/>
  <rect width="${size}" height="${size}" fill="url(#bgR3)"/>

  <g transform="translate(${xOffset} ${yOffset}) scale(${scale})">
    ${logoInner}
  </g>
</svg>`;
}

async function writePng(size, outFile) {
  const svg = buildIconSvg(size);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outFile);
}

async function main() {
  // iOS (Agregar a inicio) suele preferir `apple-touch-icon` con 180x180.
  // Mantener un único set activo reduce fallbacks/caches ambiguos en iOS.
  const out180V6 = path.join(publicDir, 'icon-180.v6.png');
  const out192V6 = path.join(publicDir, 'icon-192.v6.png');
  const out512V6 = path.join(publicDir, 'icon-512.v6.png');
  const outAppleTouch = path.join(publicDir, 'apple-touch-icon.png');
  const outAppleTouchPrecomposed = path.join(publicDir, 'apple-touch-icon-precomposed.png');
  const outAppleTouch180 = path.join(publicDir, 'apple-touch-icon-180x180.png');
  const outAppleTouchV6 = path.join(publicDir, 'apple-touch-icon.v6.png');
  const outAppleTouchPrecomposedV6 = path.join(publicDir, 'apple-touch-icon-precomposed.v6.png');
  const outAppleTouch180V6 = path.join(publicDir, 'apple-touch-icon-180x180.v6.png');
  const outFavicon = path.join(publicDir, 'favicon.ico');

  // Variante extra (no usada por manifest, pero se mantiene por compatibilidad).
  const outLogo = path.join(publicDir, 'logo.png');

  await writePng(180, out180V6);
  await writePng(192, out192V6);
  await writePng(512, out512V6);
  await writePng(180, outAppleTouch);
  await writePng(180, outAppleTouchPrecomposed);
  await writePng(180, outAppleTouch180);
  await writePng(180, outAppleTouchV6);
  await writePng(180, outAppleTouchPrecomposedV6);
  await writePng(180, outAppleTouch180V6);

  // Safari a veces usa favicon.ico para webclip fallback.
  await sharp(path.join(publicDir, 'icon-192.v6.png')).toFile(outFavicon);
  await writePng(512, outLogo);

  console.log('PWA icons generados:', {
    out180V6,
    out192V6,
    out512V6,
    outAppleTouch,
    outAppleTouchPrecomposed,
    outAppleTouch180,
    outAppleTouchV6,
    outAppleTouchPrecomposedV6,
    outAppleTouch180V6,
    outFavicon,
    outLogo,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

