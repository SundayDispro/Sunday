import React from 'react';
import DocsPage from '../pages/DocsPage';
import type { Board } from '../../types';
import type { DocType as GlobalDocType } from '../../types';
import type { CotizacionDocsPrefill } from '../../types/cotizacion';

export function MobileDocsHub({
  workspaceId,
  boards,
  initialCreateFromBoard,
  onConsumeInitialCreateFromBoard,
  initialOpenDocId,
  onConsumeInitialOpenDocId,
  initialCreateDocType,
  onConsumeInitialCreateDocType,
  initialCotizacionCartPrefill,
  onConsumeInitialCotizacionCartPrefill,
  onAddReminderWidget,
}: {
  workspaceId: string | null;
  boards: Board[];
  initialCreateFromBoard: any;
  onConsumeInitialCreateFromBoard: () => void;
  initialOpenDocId: string | null;
  onConsumeInitialOpenDocId: () => void;
  initialCreateDocType?: GlobalDocType | null;
  onConsumeInitialCreateDocType?: () => void;
  initialCotizacionCartPrefill?: CotizacionDocsPrefill | null;
  onConsumeInitialCotizacionCartPrefill?: () => void;
  onAddReminderWidget?: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-monday-bg">
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pt-2 pb-2"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {/* Sin rounded-t suelto: evita el “pico” donde el antialias del arco no coincide con el header */}
        <div className="rounded-2xl border border-monday-border bg-[var(--monday-surface)] overflow-hidden min-h-min shadow-sm">
          <DocsPage
            workspaceId={workspaceId}
            boards={boards}
            initialCreateFromBoard={initialCreateFromBoard}
            onConsumeInitialCreateFromBoard={onConsumeInitialCreateFromBoard}
            initialCreateDocType={initialCreateDocType}
            onConsumeInitialCreateDocType={onConsumeInitialCreateDocType}
            initialCotizacionCartPrefill={initialCotizacionCartPrefill}
            onConsumeInitialCotizacionCartPrefill={onConsumeInitialCotizacionCartPrefill}
            initialOpenDocId={initialOpenDocId}
            onConsumeInitialOpenDocId={onConsumeInitialOpenDocId}
            onAddReminderWidget={onAddReminderWidget}
            mobileLayout
            scrollListInParent
            mobileWordShell
          />
        </div>
      </div>
    </div>
  );
}
