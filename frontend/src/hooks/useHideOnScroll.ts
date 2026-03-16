import { useEffect, useRef, useState } from 'react';

/**
 * Hook para ocultar cabeceras al hacer scroll hacia abajo y mostrarlas al hacer scroll hacia arriba (hide-on-scroll).
 * Pensado para móvil: el elemento scrolleable es el que dispara los eventos.
 *
 * @param scrollElement - El div con overflow-y-auto que hace scroll (null hasta que el ref se asigna; pasar estado desde callback ref)
 * @param threshold - Píxeles de scroll hacia abajo para considerar "ocultar" (default 10)
 * @param showWhenScrollTopBelow - Si scrollTop < este valor, forzar mostrar la barra (default 40); 0 desactiva
 * @returns { isHidden, scrollDirection }
 */
export function useHideOnScroll(
  scrollElement: HTMLDivElement | null,
  threshold: number = 10,
  showWhenScrollTopBelow: number = 40
): { isHidden: boolean; scrollDirection: 'up' | 'down' } {
  const [isHidden, setIsHidden] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const lastScrollY = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollElement;
    if (!el) return;

    const handleScroll = () => {
      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const scrollY = el.scrollTop;
        const delta = scrollY - lastScrollY.current;

        if (showWhenScrollTopBelow > 0 && scrollY < showWhenScrollTopBelow) {
          lastScrollY.current = scrollY;
          if (isHidden) {
            setScrollDirection('up');
            setIsHidden(false);
          }
          return;
        }

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
  }, [scrollElement, threshold, showWhenScrollTopBelow, isHidden]);

  return { isHidden, scrollDirection };
}
