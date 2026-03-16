import { useEffect, useRef, useState } from 'react';

/**
 * Hook para ocultar cabeceras al hacer scroll hacia abajo y mostrarlas al hacer scroll hacia arriba (hide-on-scroll).
 * Pensado para móvil: el elemento scrolleable es el que dispara los eventos.
 *
 * @param scrollRef - Ref del elemento con overflow-y-auto/scroll (ej. contenedor del tablero)
 * @param threshold - Píxeles de scroll hacia abajo para considerar "ocultar" (default 10)
 * @returns { isHidden, scrollDirection }
 */
export function useHideOnScroll(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  threshold: number = 10
): { isHidden: boolean; scrollDirection: 'up' | 'down' } {
  const [isHidden, setIsHidden] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const lastScrollY = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      console.log('[useHideOnScroll] no element, scrollRef.current is null');
      return;
    }
    console.log('[useHideOnScroll] attaching to', el.tagName, el.className?.slice(0, 80), 'scrollHeight=', el.scrollHeight, 'clientHeight=', el.clientHeight);

    const handleScroll = () => {
      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const scrollY = el.scrollTop;
        console.log('scroll detected', scrollY, lastScrollY.current);
        const delta = scrollY - lastScrollY.current;

        if (delta > threshold) {
          lastScrollY.current = scrollY;
          setScrollDirection('down');
          if (!isHidden) setIsHidden(true);
        } else if (delta < 0) {
          lastScrollY.current = scrollY;
          setScrollDirection('up');
          if (isHidden) setIsHidden(false);
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [scrollRef, threshold, isHidden]);

  return { isHidden, scrollDirection };
}
