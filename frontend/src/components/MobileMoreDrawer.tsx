import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Folder,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { UserPanel } from './UserPanel';
import type { Workspace } from '../types';

export type AppTheme = 'light' | 'dark' | 'night' | 'dawn' | 'fog' | 'plum' | 'cacao' | 'aurora';

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspaceName: string;
  onSelectWorkspace: (id: string) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  userPanelTrigger: React.ReactNode;
  userPanelOpen: boolean;
  onUserPanelOpenChange: (open: boolean) => void;
  boardsCount?: number;
  workspaceName?: string;
  onOpenAdmin?: () => void;
}

/** Misma fórmula que el FAB en `MobileLayout`: encima de `MobileBottomNav`. */
const SHEET_BOTTOM = 'max(72px, calc(env(safe-area-inset-bottom) + 56px))';

export function MobileMoreDrawer({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  activeWorkspaceName,
  onSelectWorkspace,
  theme,
  onThemeChange,
  userPanelTrigger,
  userPanelOpen,
  onUserPanelOpenChange,
  boardsCount = 0,
  workspaceName = '',
  onOpenAdmin,
}: MobileMoreDrawerProps) {
  const [workspaceSelectorOpen, setWorkspaceSelectorOpen] = useState(false);
  const themeLabel: Record<AppTheme, string> = {
    light: 'Claro',
    dark: 'Oscuro',
    night: 'Noche',
    dawn: 'Dawn',
    fog: 'Fog',
    plum: 'Plum',
    cacao: 'Cacao',
    aurora: 'Aurora',
  };
  const themeSwatches: Record<AppTheme, [string, string]> = {
    light: ['#f6f7fb', '#d0d4e4'],
    dark: ['#111827', '#374151'],
    night: ['#0a0a0a', '#262626'],
    dawn: ['#e1d4c0', '#bda78a'],
    fog: ['#b8b8b8', '#8f8f8f'],
    plum: ['#12091a', '#3a244f'],
    cacao: ['#1a1410', '#4a3526'],
    aurora: ['#091821', '#234252'],
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[19] bg-black/25 border-0 cursor-default"
              aria-label="Cerrar menú"
              onClick={() => onOpenChange(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Ajustes rápidos"
              initial={{ y: '110%', opacity: 0.98 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '110%', opacity: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed left-0 right-0 z-20 flex justify-end pr-2 pl-2 sm:pr-3 pointer-events-none"
              style={{ bottom: SHEET_BOTTOM }}
            >
              <div
                className="pointer-events-auto w-[min(208px,calc(100vw-0.75rem))] shrink-0 rounded-[18px] border border-monday-border bg-[var(--monday-surface)] shadow-[0_-8px_32px_rgba(0,0,0,0.12)] overflow-hidden"
                style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
              >
                {/* Asa tipo sheet + cierre por swipe implícito (tap fuera) */}
                <div className="flex justify-end pr-4 pt-2 pb-1">
                  <span className="h-1 w-8 rounded-full bg-monday-border/90" aria-hidden />
                </div>

                <div className="px-2.5 pb-2 space-y-0.5">
                  <Popover.Root open={workspaceSelectorOpen} onOpenChange={setWorkspaceSelectorOpen}>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 min-h-[44px] px-2.5 rounded-2xl text-monday-text hover:bg-monday-hover/80 active:bg-monday-hover transition-colors text-left"
                        title={`Workspace: ${activeWorkspaceName}`}
                      >
                        <div className="w-8 h-8 rounded-xl bg-monday-blue flex items-center justify-center text-white shrink-0">
                          <Folder size={15} strokeWidth={2.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-monday-subtext uppercase tracking-wide leading-tight">
                            Workspace
                          </div>
                          <div className="text-[13px] font-semibold text-monday-text truncate leading-snug">
                            {activeWorkspaceName}
                          </div>
                        </div>
                        <ChevronDown size={16} className="text-monday-subtext shrink-0" strokeWidth={2.5} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-[60] w-[min(280px,calc(100vw-1.5rem))] rounded-2xl shadow-monday-lg border border-monday-border bg-[var(--monday-surface)] p-1.5"
                        side="top"
                        sideOffset={8}
                        align="center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-[10px] font-semibold text-monday-subtext px-2 py-1 uppercase tracking-wider">
                          Cambiar workspace
                        </p>
                        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar scroll-touch">
                          {workspaces.map((ws) => (
                            <button
                              key={ws.id}
                              type="button"
                              className={`w-full flex items-center gap-2 px-2 py-2 rounded-xl text-[13px] transition-colors ${
                                ws.id === activeWorkspaceId
                                  ? 'bg-monday-blue/12 text-monday-blue font-semibold'
                                  : 'text-monday-text hover:bg-monday-hover'
                              }`}
                              onClick={() => {
                                onSelectWorkspace(ws.id);
                                setWorkspaceSelectorOpen(false);
                              }}
                            >
                              <div className="w-6 h-6 rounded-lg bg-monday-blue flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                {ws.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="flex-1 text-left truncate">{ws.name}</span>
                            </button>
                          ))}
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>

                  <div className="h-px bg-monday-border/70 mx-1" aria-hidden />

                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 min-h-[44px] px-2.5 rounded-2xl text-monday-text hover:bg-monday-hover/80 active:bg-monday-hover transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-xl bg-monday-pill border border-monday-border flex items-center justify-center shrink-0">
                          {theme === 'light' && <Sun size={15} />}
                          {theme === 'dark' && <Moon size={15} />}
                          {(theme === 'night' || theme === 'dawn' || theme === 'fog' || theme === 'plum' || theme === 'cacao' || theme === 'aurora') && (
                            <Sparkles size={15} className="text-monday-subtext" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-monday-subtext uppercase tracking-wide leading-tight">
                            Tema
                          </div>
                          <div className="text-[13px] font-semibold text-monday-text leading-snug flex items-center gap-1.5">
                            {themeLabel[theme]}
                            <span className="inline-flex gap-0.5">
                              <span className="w-2 h-2 rounded-full border border-monday-border/80" style={{ backgroundColor: themeSwatches[theme][0] }} />
                              <span className="w-2 h-2 rounded-full border border-monday-border/80" style={{ backgroundColor: themeSwatches[theme][1] }} />
                            </span>
                          </div>
                        </div>
                        <ChevronDown size={16} className="text-monday-subtext shrink-0" strokeWidth={2.5} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-[60] bg-[var(--monday-surface)] rounded-2xl shadow-monday-lg border border-monday-border w-[min(220px,calc(100vw-2rem))] max-h-[55vh] overflow-y-auto custom-scrollbar p-1"
                        side="top"
                        sideOffset={8}
                        align="center"
                      >
                        {(['light', 'dark', 'night', 'dawn', 'fog', 'plum', 'cacao', 'aurora'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => onThemeChange(t)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[12px] text-left transition-colors ${
                              theme === t ? 'bg-monday-pill font-semibold text-monday-text' : 'text-monday-text hover:bg-monday-hover'
                            }`}
                          >
                            {t === 'light' && <Sun size={14} />}
                            {t === 'dark' && <Moon size={14} />}
                            {t !== 'light' && t !== 'dark' && <Sparkles size={14} />}
                            <span className="flex-1">{themeLabel[t]}</span>
                            <span className="flex gap-0.5 shrink-0">
                              <span className="w-2 h-2 rounded-full border border-monday-border" style={{ backgroundColor: themeSwatches[t][0] }} />
                              <span className="w-2 h-2 rounded-full border border-monday-border" style={{ backgroundColor: themeSwatches[t][1] }} />
                            </span>
                          </button>
                        ))}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>

                  <div className="h-px bg-monday-border/70 mx-1" aria-hidden />

                  <div className="[&_button]:min-h-[44px] [&_button]:rounded-2xl [&_button]:px-2.5">
                    <UserPanel
                      open={userPanelOpen}
                      onOpenChange={onUserPanelOpenChange}
                      trigger={userPanelTrigger}
                      boardsCount={boardsCount}
                      workspaceName={workspaceName}
                      onOpenAdmin={onOpenAdmin}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
