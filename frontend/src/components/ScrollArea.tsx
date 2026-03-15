import type { RefObject } from 'react';
import SimpleBar from 'simplebar-react';

export interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Ref al nodo con overflow (scrollable), para compatibilidad con código que usa scrollContainerRef */
  scrollableRef?: RefObject<HTMLDivElement | null>;
  /** Forzar barra visible: true = ambas, 'x' = horizontal, 'y' = vertical */
  forceVisible?: boolean | 'x' | 'y';
  /** false = barra siempre visible cuando hay overflow (comportamiento tipo Edge) */
  autoHide?: boolean;
}

/**
 * Área de scroll con barra custom (SimpleBar). Mismo aspecto y comportamiento
 * en todos los navegadores (Arc, Edge, etc.), no depende de las scrollbars nativas.
 */
export function ScrollArea({
  children,
  className,
  style,
  scrollableRef,
  forceVisible = true,
  autoHide = false,
}: ScrollAreaProps) {
  return (
    <SimpleBar
      className={className}
      style={style}
      forceVisible={forceVisible}
      autoHide={autoHide}
      scrollableNodeProps={scrollableRef ? { ref: scrollableRef } : undefined}
    >
      {children}
    </SimpleBar>
  );
}
