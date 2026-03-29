import { useViewport } from './useViewport';

/**
 * Misma regla que `useViewport().isMobile` (≤767px o landscape bajo).
 * Preferir este hook o `useViewport` directamente para no duplicar media queries.
 */
export function useIsMobile(): boolean {
  const { isMobile } = useViewport();
  return isMobile;
}
