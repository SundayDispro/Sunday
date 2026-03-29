import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
  });
}

function attachTrap(rootEl: HTMLElement, previous: HTMLElement | null): () => void {
  const focusFirst = () => {
    const list = getFocusable(rootEl);
    const target = list[0];
    if (target) target.focus({ preventScroll: true });
  };

  const t = window.setTimeout(focusFirst, 0);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const list = getFocusable(rootEl);
    if (list.length === 0) return;

    const first = list[0];
    const last = list[list.length - 1];
    const activeEl = document.activeElement as HTMLElement | null;

    if (!rootEl.contains(activeEl)) {
      e.preventDefault();
      first.focus();
      return;
    }

    if (e.shiftKey) {
      if (activeEl === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (activeEl === last) {
      e.preventDefault();
      first.focus();
    }
  };

  rootEl.addEventListener('keydown', onKeyDown);
  return () => {
    window.clearTimeout(t);
    rootEl.removeEventListener('keydown', onKeyDown);
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      previous.focus({ preventScroll: true });
    }
  };
}

/**
 * Mantiene el foco dentro de un contenedor (modales, sheets, drawers).
 * Enfoca el primer elemento al activarse y restaura el foco previo al cerrar.
 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active) return;

    const previous = document.activeElement as HTMLElement | null;
    let detach: (() => void) | undefined;

    const tryAttach = () => {
      const root = containerRef.current;
      if (root && !detach) {
        detach = attachTrap(root, previous);
      }
    };

    tryAttach();
    const raf = requestAnimationFrame(tryAttach);

    return () => {
      cancelAnimationFrame(raf);
      detach?.();
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef]);
}
