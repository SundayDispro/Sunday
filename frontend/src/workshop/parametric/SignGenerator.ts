// ============================================================================
// Sunday 3D Workshop — Sign & Lettering Parametric Generator
// Letters, channel bodies, rear panels, and front diffuser assemblies (mm)
// ============================================================================

import type { SignConfig, SignResult, SignLetterBody } from '../types.ts';

/**
 * Calculates and generates sign components, letter dimensions, and usable interior areas.
 */
export function generateSign(config: SignConfig): SignResult {
  const text = config.text.trim() || 'LETRAS';
  const letterHeight = Math.max(10, config.letterHeight);
  const letterDepth = Math.max(5, config.letterDepth);
  const letterSpacing = Math.max(0, config.letterSpacing);
  const wallThickness = config.enclosureEnabled ? Math.max(1, config.wallThickness) : 0;

  // Approximate letter aspect ratio for sizing (standard proportion approx 0.7 width/height)
  const letterWidthRatio = 0.7;
  const letterWidth = letterHeight * letterWidthRatio;

  const letterBodies: SignLetterBody[] = [];
  let currentX = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isSpace = char === ' ';
    const actualWidth = isSpace ? letterWidth * 0.5 : letterWidth;

    if (!isSpace) {
      // Calculate interior usable area (subtracting wall thickness from perimeter)
      const usableWidth = Math.max(0, actualWidth - wallThickness * 2);
      const usableHeight = Math.max(0, letterHeight - wallThickness * 2);
      // Letter interior area estimation (accounting for letter fill factor ~ 0.5)
      const interiorArea = usableWidth * usableHeight * 0.5;

      letterBodies.push({
        letter: char,
        index: i,
        width: actualWidth,
        height: letterHeight,
        depth: letterDepth,
        position: {
          x: currentX + actualWidth / 2,
          y: letterHeight / 2,
          z: letterDepth / 2,
        },
        interiorArea,
      });
    }

    currentX += actualWidth + letterSpacing;
  }

  const totalWidth = Math.max(currentX - letterSpacing, 10);
  const totalHeight = letterHeight;
  const totalDepth = letterDepth + (config.rearPanel ? 3 : 0) + (config.frontPanel ? 3 : 0);

  const panels: { name: string; width: number; height: number; thickness: number }[] = [];
  const componentList: { description: string; quantity: number; unit: string }[] = [];

  // Letters component
  componentList.push({
    description: `Cuerpo de letras 3D ("${text}")`,
    quantity: letterBodies.length,
    unit: 'piezas',
  });

  // Rear panel
  if (config.rearPanel) {
    panels.push({
      name: 'Panel Trasero (Base/Fondo)',
      width: totalWidth + 20,
      height: totalHeight + 20,
      thickness: 3,
    });
    componentList.push({
      name: 'Panel Trasero',
      description: 'Placa trasera de PVC/Aluminio para montaje',
      quantity: 1,
      unit: 'pieza',
    } as any);
  }

  // Front panel (Acrílico difusor para iluminación)
  if (config.frontPanel) {
    panels.push({
      name: 'Caras Frontales Difusoras (Acrílico)',
      width: totalWidth,
      height: totalHeight,
      thickness: 3,
    });
    componentList.push({
      description: 'Caras de acrílico blanco difusor 3mm',
      quantity: letterBodies.length,
      unit: 'piezas',
    });
  }

  // Enclosure / mounting hardware
  if (config.enclosureEnabled) {
    componentList.push({
      description: 'Perfil/carcasa perimetral de contención',
      quantity: letterBodies.length,
      unit: 'juegos',
    });
  }

  return {
    letterBodies,
    enclosure: config.enclosureEnabled
      ? {
          body: {
            width: totalWidth,
            height: totalHeight,
            depth: letterDepth,
            wallThickness,
          },
          lid: config.frontPanel ? { width: totalWidth, depth: totalHeight, thickness: 3 } : null,
          panels,
          totalDimensions: { width: totalWidth, height: totalHeight, depth: totalDepth },
          interiorVolume: totalWidth * totalHeight * letterDepth * 0.4,
        }
      : null,
    panels,
    dimensions: {
      totalWidth,
      totalHeight,
      totalDepth,
    },
    componentList,
  };
}
