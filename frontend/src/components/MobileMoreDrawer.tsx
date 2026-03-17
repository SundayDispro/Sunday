import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  LayoutGrid,
  Star,
  Plus,
  Search,
  Bell,
  BookOpen,
  Users,
  Receipt,
  Sun,
  Moon,
  Sparkles,
  X,
  Inbox,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { UserPanel } from './UserPanel';
import type { Workspace, Board } from '../types';

export type AppTheme = 'light' | 'dark' | 'night' | 'dawn' | 'fog' | 'plum' | 'ember';

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
  onNavigate: (page: 'notifications' | 'docs' | 'search' | 'team' | 'facturacion' | 'inbox') => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  canSeeFacturacion: boolean;
  isTaller: boolean;
  onRequestAddBoard: () => void;
  unreadNotifCount?: number;
  userPanelTrigger: React.ReactNode;
  userPanelOpen: boolean;
  onUserPanelOpenChange: (open: boolean) => void;
  boardsCount?: number;
  workspaceName?: string;
  onOpenAdmin?: () => void;
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
  onRequestAddBoard,
  unreadNotifCount = 0,
  userPanelTrigger,
  userPanelOpen,
  onUserPanelOpenChange,
  boardsCount = 0,
  workspaceName = '',
  onOpenAdmin,
}: MobileMoreDrawerProps) {
  const [workspaceSelectorOpen, setWorkspaceSelectorOpen] = useState(false);

  const handleSelectBoard = (id: string | null) => {
    onSelectBoard(id);
    onOpenChange(false);
  };

  const handleNav = (page: 'notifications' | 'docs' | 'search' | 'team' | 'facturacion' | 'inbox') => {
    onNavigate(page);
    onOpenChange(false);
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
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed left-0 top-0 z-20 w-[min(280px,85vw)] max-w-[280px] bg-monday-sidebarPanel flex flex-col shadow-monday-xl border-r border-monday-border overflow-hidden"
              style={{ bottom: 'calc(56px + max(0.5rem, env(safe-area-inset-bottom)))' }}
              aria-label="Menú Más"
            >
              <div className="shrink-0 flex items-center justify-between h-14 px-3 border-b border-monday-border">
                <span className="text-[15px] font-semibold text-monday-text">Más</span>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch py-3 px-2">
                {/* Bandeja y Notificaciones destacados (acceso rápido desde 4 tabs) */}
                <div className="mb-4 p-2 rounded-xl bg-monday-pill/40 border border-monday-border/60">
                  <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">
                    Ir a
                  </p>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleNav('notifications')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px] font-medium"
                    >
                      <Bell size={18} className="text-monday-subtext shrink-0" />
                      <span>Notificaciones</span>
                      {unreadNotifCount > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                          {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleNav('inbox')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px] font-medium"
                    >
                      <Inbox size={18} className="text-monday-subtext shrink-0" />
                      <span>Bandeja</span>
                    </button>
                  </div>
                </div>

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
                        className="z-50 w-64 rounded-xl shadow-monday-lg border border-monday-border bg-white p-2"
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
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
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
                </div>

                {/* Bloque Navegación */}
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
                      onClick={() => handleNav('search')}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-monday-text hover:bg-monday-hover transition-colors text-left text-[13px]"
                    >
                      <Search size={18} className="text-monday-subtext shrink-0" />
                      Buscar
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
                      <div className="flex gap-1 flex-1">
                        {(['light', 'dark', 'night', 'dawn', 'fog', 'plum', 'ember'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => onThemeChange(t)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                              theme === t ? 'bg-monday-pill text-monday-text font-medium' : 'text-monday-subtext hover:bg-monday-hover'
                            }`}
                          >
                            {t === 'light' && <Sun size={14} />}
                            {t === 'dark' && <Moon size={14} />}
                            {t === 'night' && <Sparkles size={14} />}
                            {t === 'dawn' && <Sparkles size={14} />}
                            {t === 'fog' && <Sparkles size={14} />}
                            {t === 'plum' && <Sparkles size={14} />}
                            {t === 'ember' && <Sparkles size={14} />}
                            <span>
                              {t === 'light'
                                ? 'Claro'
                                : t === 'dark'
                                ? 'Oscuro'
                                : t === 'night'
                                ? 'Noche'
                                : t === 'dawn'
                                ? 'Dawn'
                                : t === 'fog'
                                ? 'Fog'
                                : t === 'plum'
                                ? 'Plum'
                                : 'Ember'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
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
