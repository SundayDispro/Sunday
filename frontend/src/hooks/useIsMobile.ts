import { useEffect, useState } from 'react';

/**
 * Detecta si la vista es móvil: ventana estrecha (≤767px) o landscape con poca altura (≤500px).
 * Usado para PWA, bottom nav, Kanban horizontal, etc.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    const landscapeShort = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    return narrow || landscapeShort;
  });

  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 767px)');
    const mqLandscapeShort = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const handler = () => {
      setIsMobile(mqNarrow.matches || mqLandscapeShort.matches);
    };
    handler();
    mqNarrow.addEventListener('change', handler);
    mqLandscapeShort.addEventListener('change', handler);
    return () => {
      mqNarrow.removeEventListener('change', handler);
      mqLandscapeShort.removeEventListener('change', handler);
    };
  }, []);

  return isMobile;
}
