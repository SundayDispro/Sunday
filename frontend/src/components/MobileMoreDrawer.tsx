import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Folder,
  LayoutGrid,
  Star,
  Plus,
  Search,
  BookOpen,
  Users,
  Receipt,
  ListTodo,
  Sun,
  Moon,
  Sparkles,
  X,
  Command,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { UserPanel } from './UserPanel';
import type { Workspace, Board } from '../types';
import {
  type AppTheme,
  SIDEBAR_THEME_IDS,
  THEME_LABELS,
  THEME_SWATCHES,
} from '../theme';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspaceName: string;
  onSelectWorkspace: (id: string) => void;
  boards: Board[];
  boardSearch: string;
  onBoardSearchChange: (value: string) => void;
  activeBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  /** Páginas que solo están en este menú en móvil (notificaciones/bandeja van en la barra inferior). */
  onNavigate: (page: 'docs' | 'team' | 'facturacion' | 'tasks') => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  canSeeFacturacion: boolean;
  isTaller: boolean;
  /** Si el usuario puede crear tableros (POST /api/boards). */
  canCreateBoard: boolean;
  onRequestAddBoard: () => void;
  userPanelTrigger: React.ReactNode;
  userPanelOpen: boolean;
  onUserPanelOpenChange: (open: boolean) => void;
  boardsCount?: number;
  workspaceName?: string;
  onOpenAdmin?: () => void;
  /** Abre la paleta de comandos (tableros, /temas, atajos). */
  onOpenCommandPalette: () => void;
  /**
   * Si la barra inferior global está visible (MobileBottomNav).
   * Si es false (Docs, landscape sin bottom nav), el drawer llega al borde inferior.
   */
  reserveBottomNavSpace?: boolean;
}

export function MobileMoreDrawer({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  activeWorkspaceName,
  onSelectWorkspace,
  boards,
  boardSearch,
  onBoardSearchChange,
  activeBoardId,
  onSelectBoard,
  onNavigate,
  theme,
  onThemeChange,
  canSeeFacturacion,
  isTaller,
  canCreateBoard,
  onRequestAddBoard,
  userPanelTrigger,
  userPanelOpen,
  onUserPanelOpenChange,
  boardsCount = 0,
  workspaceName = '',
  onOpenAdmin,
  onOpenCommandPalette,
  reserveBottomNavSpace = true,
}: MobileMoreDrawerProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  useFocusTrap(open, asideRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const [workspaceSelectorOpen, setWorkspaceSelectorOpen] = useState(false);

  const handleSelectBoard = (id: string | null) => {
    if (navigator.vibrate) navigator.vibrate(15);
    onSelectBoard(id);
    onOpenChange(false);
  };

  const handleNav = (page: 'docs' | 'team' | 'facturacion' | 'tasks') => {
    if (navigator.vibrate) navigator.vibrate(15);
    onNavigate(page);
    onOpenChange(false);
  };

  const handleOpenCommandPalette = () => {
    if (navigator.vibrate) navigator.vibrate(12);
    onOpenChange(false);
    onOpenCommandPalette();
  };

  const filteredBoards = boards.filter(
    (b) => b && (!boardSearch.trim() || b.name.toLowerCase().includes(boardSearch.trim().toLowerCase()))
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[19] bg-black/30"
              aria-hidden
              onClick={() => onOpenChange(false)}
            />
            <motion.aside
              ref={asideRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-more-drawer-title"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed left-0 top-0 z-20 w-[min(280px,85vw)] max-w-[280px] bg-monday-sidebarPanel flex flex-col shadow-monday-xl border-r border-monday-border overflow-hidden"
              style={
                reserveBottomNavSpace
                  ? { bottom: 'calc(56px + max(0.5rem, env(safe-area-inset-bottom)))' }
                  : { bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)' }
              }
            >
              <div className="shrink-0 flex items-center justify-between h-14 px-3 border-b border-monday-border">
                <span id="mobile-more-drawer-title" className="text-[15px] font-semibold text-monday-text">
                  Más
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(15);
                    onOpenChange(false);
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch py-3 px-2">
                {/* Bloque Workspace + Tableros */}
                <div className="mb-4">
                  <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">
                    Workspace
                  </p>
                  <Popover.Root open={workspaceSelectorOpen} onOpenChange={setWorkspaceSelectorOpen}>
                    <Popover.Trigger asChild>
                      <button
                        className="w-full flex items-center gap-2.5 text-monday-text hover:bg-monday-hover rounded-lg px-2.5 py-2 transition-colors shadow-sm border border-monday-border/60"
                        title={`Workspace: ${activeWorkspaceName}`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-monday-blue flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Folder size={16} />
                        </div>
                        <span className="text-[13px] font-semibold flex-1 text-left text-monday-text truncate min-w-0">
                          {activeWorkspaceName}
                        </span>
                        <ChevronDown size={16} className="text-monday-subtext shrink-0" strokeWidth={2.5} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-50 w-64 rounded-xl shadow-monday-lg border border-monday-border bg-monday-sidebarPanel p-2"
                        sideOffset={8}
                        align="start"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-[11px] font-semibold text-monday-subtext px-1.5 mb-1.5 uppercase tracking-wider">
                          Workspaces
                        </p>
                        <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                          {workspaces.map((ws) => (
                            <button
                              key={ws.id}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                                ws.id === activeWorkspaceId
                                  ? 'bg-monday-blue/15 text-monday-blue font-medium'
                                  : 'text-monday-text hover:bg-monday-hover'
                              }`}
                              onClick={() => {
                                onSelectWorkspace(ws.id);
                                setWorkspaceSelectorOpen(false);
                              }}
                            >
                              <div className="w-6 h-6 rounded-md bg-monday-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
                                {ws.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="flex-1 text-left truncate">{ws.name}</span>
                            </button>
                          ))}
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>

                  <div className="relative mt-2 mb-2 group/search">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-monday-subtext group-hover/search:text-monday-text transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Buscar tableros..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-monday-sidebarPanel border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
                      value={boardSearch}
                      onChange={(e) => onBoardSearchChange(e.target.value)}
                    />
                  </div>

                  <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-1 uppercase tracking-wider">
                    Tableros
                  </p>
                  <button
                    onClick={() => handleSelectBoard(null)}
                    className={`w-full flex items-center gap-2 text-[13px] px-2.5 py-2 rounded-lg transition-colors mb-0.5 ${
                      activeBoardId === null ? 'bg-monday-blue text-white font-medium' : 'text-monday-text hover:bg-monday-hover'
                    }`}
                  >
                    <LayoutGrid size={15} className="shrink-0" strokeWidth={2.25} />
                    Vista general
                  </button>
                  {filteredBoards.map(
                    (b) =>
                      b && (
                        <button
                          key={b.id}
                          onClick={() => handleSelectBoard(b.id)}
                          className={`w-full flex items-center gap-2 text-[13px] px-2.5 py-2 rounded-lg transition-colors mb-0.5 ${
                            activeBoardId === b.id ? 'bg-monday-blue text-white font-medium' : 'text-monday-text hover:bg-monday-hover'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
                          <span className="truncate">{b.name}</span>
                          {activeBoardId === b.id && (
                            <Star size={13} className="ml-auto opacity-50 text-monday-orange shrink-0" />
                          )}
                        </button>
                      )
                  )}
                  {canCreateBoard && (
                    <button
                      type="button"
                      onClick={() => {
                        onRequestAddBoard();
                      }}
                      className="w-full flex items-center gap-2 text-[12px] px-2 py-1.5 text-monday-subtext hover:text-monday-text hover:bg-monday-hover transition-colors mt-1 rounded-lg"
                    >
                      <Plus size={14} />
                      Agregar tablero
                    </button>
                  )}
                </div>

                {/* Bloque Navegación (búsqueda global: Comandos → /buscar) */}
                <div className="mb-4">
                  <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">
                    Navegación
                  </p>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleNav('docs')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px]"
                    >
                      <BookOpen size={18} className="text-monday-subtext shrink-0" />
                      Docs
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCommandPalette}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px]"
                    >
                      <Command size={18} className="text-monday-subtext shrink-0" />
                      Comandos
                    </button>
                    {!isTaller && (
                      <button
                        onClick={() => handleNav('team')}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px]"
                      >
                        <Users size={18} className="text-monday-subtext shrink-0" />
                        Equipo
                      </button>
                    )}
                    {canSeeFacturacion && (
                      <button
                        onClick={() => handleNav('facturacion')}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px]"
                      >
                        <Receipt size={18} className="text-monday-subtext shrink-0" />
                        Facturación
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleNav('tasks')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px]"
                    >
                      <ListTodo size={18} className="text-monday-subtext shrink-0" />
                      Tareas
                    </button>
                  </div>
                </div>

                {/* Bloque Cuenta: Tema + Usuario */}
                <div>
                  <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">
                    Cuenta
                  </p>
                    <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <span className="text-[12px] text-monday-subtext shrink-0">Tema</span>
                      <Popover.Root>
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            className="flex-1 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-monday-border bg-monday-sidebarPanel text-[12px] text-monday-text hover:bg-monday-hover transition-colors"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {theme === 'light' && <Sun size={14} />}
                              {theme === 'dark' && <Moon size={14} />}
                              {theme !== 'light' && theme !== 'dark' && <Sparkles size={14} />}
                              <span className="truncate">{THEME_LABELS[theme]}</span>
                            </span>
                            <span className="ml-auto flex items-center gap-1">
                              <span className="w-2.5 h-2.5 rounded-full border border-monday-border" style={{ backgroundColor: THEME_SWATCHES[theme][0] }} />
                              <span className="w-2.5 h-2.5 rounded-full border border-monday-border" style={{ backgroundColor: THEME_SWATCHES[theme][1] }} />
                            </span>
                            <ChevronDown size={14} className="text-monday-subtext shrink-0" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            className="z-50 bg-monday-sidebarPanel rounded-xl shadow-monday-lg border border-monday-border w-[min(calc(100vw-2rem),280px)] max-h-[min(70vh,420px)] overflow-y-auto custom-scrollbar p-1"
                            sideOffset={6}
                            align="start"
                          >
                            {SIDEBAR_THEME_IDS.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => onThemeChange(t)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-left transition-colors ${
                                  theme === t ? 'bg-monday-pill text-monday-text font-medium' : 'text-monday-text hover:bg-monday-hover'
                                }`}
                              >
                                {t === 'light' && <Sun size={14} />}
                                {t === 'dark' && <Moon size={14} />}
                                {t !== 'light' && t !== 'dark' && <Sparkles size={14} />}
                                <span className="flex-1">{THEME_LABELS[t]}</span>
                                <span className="ml-auto flex items-center gap-1 shrink-0">
                                  <span className="w-2.5 h-2.5 rounded-full border border-monday-border" style={{ backgroundColor: THEME_SWATCHES[t][0] }} />
                                  <span className="w-2.5 h-2.5 rounded-full border border-monday-border" style={{ backgroundColor: THEME_SWATCHES[t][1] }} />
                                </span>
                              </button>
                            ))}
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </div>
                    <p className="text-[10px] text-monday-subtext px-2.5 pt-1 leading-snug">
                      Temas: <span className="font-medium text-monday-text">Comandos</span> y{' '}
                      <span className="font-mono text-monday-text">/temas</span>. Búsqueda:{' '}
                      <span className="font-mono text-monday-text">/buscar</span>.
                    </p>
                    <div className="px-2.5 py-1">
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
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
