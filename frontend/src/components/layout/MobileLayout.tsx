import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { MobileBottomNav, type MobileBottomTab } from '../MobileBottomNav';

export type MobileLayoutProps = {
  /** Clave para transiciones de página (p. ej. activePage o activePage + boardId). */
  pageKey: string;
  children: React.ReactNode;
  activeTab: MobileBottomTab;
  onNavigate: (tab: MobileBottomTab) => void;
  compact?: boolean;
  unreadNotifCount?: number;
  /** Punto verde en campana si hay no leídas muy recientes (< 2 min). */
  recentUnreadNotif?: boolean;
  showFAB?: boolean;
  onFABClick?: () => void;
  isLandscapeShort?: boolean;
  /** Oculta la barra inferior global (p. ej. Docs usa su propia navegación fija). */
  hideBottomNav?: boolean;
};

/**
 * Layout móvil: transiciones de página (AnimatePresence), FAB y barra inferior.
 * El padding superior safe-area lo aplica el padre en App (junto al header común).
 */
export function MobileLayout({
  pageKey,
  children,
  activeTab,
  onNavigate,
  compact = false,
  unreadNotifCount = 0,
  recentUnreadNotif = false,
  showFAB = false,
  onFABClick,
  isLandscapeShort = false,
  hideBottomNav = false,
}: MobileLayoutProps) {
  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageKey}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {showFAB && (
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(20);
            }
            onFABClick?.();
          }}
          className="fixed right-4 z-30 w-14 h-14 rounded-full bg-monday-blue text-white shadow-monday-lg flex items-center justify-center hover:bg-monday-blue/90 transition-colors safe-area-mr"
          style={{
            bottom: isLandscapeShort
              ? 'max(52px, calc(env(safe-area-inset-bottom) + 44px))'
              : 'max(72px, calc(env(safe-area-inset-bottom) + 56px))',
          }}
          aria-label="Añadir"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      <MobileBottomNav
        activeTab={activeTab}
        onNavigate={onNavigate}
        compact={compact}
        unreadNotifCount={unreadNotifCount}
        recentUnreadNotif={recentUnreadNotif}
      />
    </>
  );
}
