import { useEffect } from 'react';

const VIEWPORT_DEFAULT =
  'width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no';

/**
 * Safari/iOS a veces mantiene escala u offset al rotar; forzar recálculo del meta viewport
 * es un truco conocido para volver a escala 1.
 */
function resetViewportMetaTag() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  const restore = viewport.getAttribute('content') || VIEWPORT_DEFAULT;
  viewport.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, shrink-to-fit=no',
  );
  requestAnimationFrame(() => {
    viewport.setAttribute('content', restore);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

function scrollTopLeft() {
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

/**
 * Al rotar en móvil: recentrar scroll y reiniciar viewport para que no quede zoom/letterboxing.
 */
export function useOrientationViewportFix() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    if (!coarse) return;

    let orientationTimer: number | undefined;
    const onOrientationChange = () => {
      window.clearTimeout(orientationTimer);
      resetViewportMetaTag();
      scrollTopLeft();
      orientationTimer = window.setTimeout(() => {
        resetViewportMetaTag();
        scrollTopLeft();
      }, 120);
      window.setTimeout(() => {
        resetViewportMetaTag();
        scrollTopLeft();
      }, 400);
    };

    let resizeDebounce: number | undefined;
    const onVisualViewportResize = () => {
      const vv = window.visualViewport;
      if (vv && vv.scale !== 1) {
        window.clearTimeout(resizeDebounce);
        resizeDebounce = window.setTimeout(() => {
          resetViewportMetaTag();
          scrollTopLeft();
        }, 50);
      } else {
        scrollTopLeft();
      }
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', onVisualViewportResize);
    vv?.addEventListener('scroll', scrollTopLeft);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('resize', scrollTopLeft);

    return () => {
      window.clearTimeout(orientationTimer);
      window.clearTimeout(resizeDebounce);
      vv?.removeEventListener('resize', onVisualViewportResize);
      vv?.removeEventListener('scroll', scrollTopLeft);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('resize', scrollTopLeft);
    };
  }, []);
}
