import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

const DELAY_MS = 600;

/**
 * Proveedor global de tooltips (delay 600ms). Envuelve la app o secciones con muchos íconos.
 */
export function AppTooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={DELAY_MS} skipDelayDuration={200}>
      {children}
    </Tooltip.Provider>
  );
}

type AppTooltipProps = {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

export function AppTooltip({ label, children, side = 'bottom' }: AppTooltipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-[600] rounded-md border border-monday-border bg-[var(--monday-surface)] px-2 py-1 text-[11px] text-monday-text shadow-monday-md"
        >
          {label}
          <Tooltip.Arrow className="fill-[var(--monday-border)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
