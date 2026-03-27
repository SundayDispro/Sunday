import { useEffect, useState } from 'react';

/** Altura máxima en landscape para considerar "poco espacio vertical" (nav compacto, menos padding). */
const LANDSCAPE_SHORT_MAX_HEIGHT = 500;

/**
 * Ancho máximo para usar el módulo Docs móvil (shell tipo Word iOS, sheets móvil, lista+visor).
 * Incluye tablets en portrait y la mayoría de ventanas “estrechas”; por encima se usa Docs escritorio.
 */
const DOCS_MOBILE_MAX_WIDTH_PX = 1024;

export type ViewportState = {
  /** Ventana estrecha (≤767px) o landscape con poca altura → UI móvil (bottom nav, etc.). */
  isMobile: boolean;
  /** Viewport apto para Docs móvil (Word shell, hub): ≤1024px o landscape con poca altura. */
  isDocsMobile: boolean;
  /** Orientación horizontal (pantalla más ancha que alta). */
  isLandscape: boolean;
  /** Landscape con poca altura (≤500px) → barra inferior compacta, menos padding. */
  isLandscapeShort: boolean;
  /** Orientación vertical. */
  isPortrait: boolean;
  /** Ancho suficiente para preferir layout tipo desktop en landscape (ej. ≥640px). */
  hasWidthForDesktop: boolean;
  /** Usar vista de cards en tableros en lugar de tabla (móvil o sin ancho desktop). Una sola fuente de verdad. */
  useCardView: boolean;
};

function getViewportState(): ViewportState {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isDocsMobile: false,
      isLandscape: false,
      isLandscapeShort: false,
      isPortrait: true,
      hasWidthForDesktop: true,
      useCardView: false,
    };
  }
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const docsNarrow = window.matchMedia(`(max-width: ${DOCS_MOBILE_MAX_WIDTH_PX}px)`).matches;
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const landscapeShort = window.matchMedia(
    `(orientation: landscape) and (max-height: ${LANDSCAPE_SHORT_MAX_HEIGHT}px)`
  ).matches;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const hasWidthForDesktop = window.matchMedia('(min-width: 640px)').matches;

  const isMobile = narrow || landscapeShort;
  const isDocsMobile = docsNarrow || landscapeShort;
  const useCardView = isMobile || !hasWidthForDesktop;

  return {
    isMobile,
    isDocsMobile,
    isLandscape: landscape,
    isLandscapeShort: landscapeShort,
    isPortrait: portrait,
    hasWidthForDesktop,
    useCardView,
  };
}

/**
 * Estado del viewport: móvil, orientación y si el landscape tiene poca altura.
 * Útil para adaptar layout, bottom nav compacto y padding en modo horizontal.
 */
export function useViewport(): ViewportState {
  const [state, setState] = useState(getViewportState);

  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 767px)');
    const mqDocsNarrow = window.matchMedia(`(max-width: ${DOCS_MOBILE_MAX_WIDTH_PX}px)`);
    const mqLandscape = window.matchMedia('(orientation: landscape)');
    const mqLandscapeShort = window.matchMedia(
      `(orientation: landscape) and (max-height: ${LANDSCAPE_SHORT_MAX_HEIGHT}px)`
    );
    const mqPortrait = window.matchMedia('(orientation: portrait)');
    const mqWidth = window.matchMedia('(min-width: 640px)');

    const handler = () => setState(getViewportState());

    handler();
    mqNarrow.addEventListener('change', handler);
    mqDocsNarrow.addEventListener('change', handler);
    mqLandscape.addEventListener('change', handler);
    mqLandscapeShort.addEventListener('change', handler);
    mqPortrait.addEventListener('change', handler);
    mqWidth.addEventListener('change', handler);

    return () => {
      mqNarrow.removeEventListener('change', handler);
      mqDocsNarrow.removeEventListener('change', handler);
      mqLandscape.removeEventListener('change', handler);
      mqLandscapeShort.removeEventListener('change', handler);
      mqPortrait.removeEventListener('change', handler);
      mqWidth.removeEventListener('change', handler);
    };
  }, []);

  return state;
}
