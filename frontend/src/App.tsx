import React, { useEffect, useRef, useState } from 'react';
import { socket } from './store/socket';
import BoardContainer from './components/Board/BoardContainer';
import { ItemDetailsPanel } from './components/Board/ItemDetailsPanel';
import {
  Home, Bell, Search, Settings, ChevronDown, ChevronRight,
  LayoutGrid, Users, BookOpen, BarChart2, Inbox, Star, Plus, Receipt, Calendar,
} from 'lucide-react';
import { Item, Board, Workspace } from './types';
import { useUser } from './store/UserContext';
import { Login } from './components/Login';
import { AdminUsersPanel } from './components/AdminUsersPanel';
import { InboxPage } from './components/pages/InboxPage';
import { NotificationsPage } from './components/pages/NotificationsPage';
import { SearchPage } from './components/pages/SearchPage';
import { DocsPage } from './components/pages/DocsPage';
import { DashboardPage } from './components/pages/DashboardPage';
import { TeamPage } from './components/pages/TeamPage';
import { FacturacionPage } from './components/pages/FacturacionPage';
import { WorkspaceOverviewPage } from './components/pages/WorkspaceOverviewPage';
import * as Popover from '@radix-ui/react-popover';
type ViewMode = 'table' | 'kanban' | 'calendar' | 'facturacion';

function AddViewDropdown({
  enabledViews,
  onAddView,
  open,
  onOpenChange,
  canAddFacturacion,
}: {
  enabledViews: ViewMode[];
  onAddView: (view: ViewMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAddFacturacion: boolean;
}) {
  const canAddCalendar = !enabledViews.includes('calendar');
  const canAddFact = canAddFacturacion && !enabledViews.includes('facturacion');
  const hasAny = canAddCalendar || canAddFact;
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          className="py-2.5 px-2 text-monday-subtext hover:text-monday-blue transition-colors rounded-t-md"
          title="Añadir vista"
        >
          <Plus size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-52 p-2 fade-in"
          sideOffset={6}
          align="start"
        >
          <div className="text-[12px] font-semibold text-monday-subtext mb-2 px-2 uppercase tracking-tight">
            Añadir vista
          </div>
          {canAddFact && (
            <button
              onClick={() => onAddView('facturacion')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
            >
              <Receipt size={16} className="text-monday-blue shrink-0" />
              Facturación
            </button>
          )}
          {canAddCalendar && (
            <button
              onClick={() => onAddView('calendar')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
            >
              <Calendar size={16} className="text-monday-blue shrink-0" />
              Calendario
            </button>
          )}
          {!hasAny && (
            <p className="text-[12px] text-monday-subtext px-2 py-2">Todas las vistas están activas.</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function App() {
  const { currentUser, logout } = useUser();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const canSeeFacturacionView = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';
  const [currentView, setCurrentView] = useState<ViewMode>('table');
  const [enabledViews, setEnabledViews] = useState<ViewMode[]>(['table', 'kanban']);
  const [showAddViewPopover, setShowAddViewPopover] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Navigation state
  const [activePage, setActivePage] = useState<'home' | 'inbox' | 'notifications' | 'dashboard' | 'board' | 'search' | 'docs' | 'team' | 'facturacion'>('board');
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceSelectorOpen, setWorkspaceSelectorOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const newWorkspaceInputRef = useRef<HTMLInputElement>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [createBoardError, setCreateBoardError] = useState<string | null>(null);
  const newBoardNameInputRef = useRef<HTMLInputElement>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const fetchUnreadNotifications = React.useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`http://localhost:3001/api/notifications?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setUnreadNotifCount(data.filter((n: { read: boolean }) => !n.read).length);
      }
    } catch {
      // ignore
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchUnreadNotifications();
  }, [fetchUnreadNotifications]);

  useEffect(() => {
    if (!currentUser?.id) return;
    socket.on('notification_created', (notif: { userId: string }) => {
      if (notif.userId === currentUser.id) fetchUnreadNotifications();
    });
    return () => {
      socket.off('notification_created');
    };
  }, [currentUser?.id, fetchUnreadNotifications]);

  // Load workspaces once user is available
  useEffect(() => {
    if (!currentUser) return;
    fetch('http://localhost:3001/api/workspaces')
      .then(r => r.json())
      .then((data: Workspace[]) => {
        if (!Array.isArray(data)) return;
        setWorkspaces(data);
        setActiveWorkspaceId(prev => {
          if (prev && data.some(w => w.id === prev)) return prev;
          return data[0]?.id ?? null;
        });
      })
      .catch(err => console.error('Error fetching workspaces:', err));
  }, [currentUser]);

  // Load boards for active workspace
  useEffect(() => {
    if (!currentUser) return;
    const url = activeWorkspaceId
      ? `http://localhost:3001/api/boards?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
      : 'http://localhost:3001/api/boards';

    fetch(url)
      .then(r => r.json())
      .then((data: Board[]) => {
        if (!Array.isArray(data)) return;
        setBoards(data);
        setActiveBoardId(prev => {
          if (data.length === 0) return null;
          const exists = data.some(b => b.id === prev);
          return exists ? prev : data[0].id;
        });
      })
      .catch(err => console.error('Error fetching boards:', err));

    socket.on('board_renamed', (updated: Board) => {
      setBoards(prev => prev.map(b => b.id === updated.id ? { ...b, name: updated.name } : b));
    });
    socket.on('board_added', (newBoard: Board) => {
      // Sólo añadimos automáticamente si pertenece al workspace activo (o si no hay ninguno activo)
      if (!activeWorkspaceId || newBoard.workspaceId === activeWorkspaceId) {
        setBoards(prev => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
      }
    });
    return () => {
      socket.off('board_renamed');
      socket.off('board_added');
    };
  }, [currentUser, activeWorkspaceId]);

  if (!currentUser) {
    return <Login />;
  }

  const activeWorkspaceName =
    workspaces.find(w => w.id === activeWorkspaceId)?.name || 'Main Workspace';

  const navIcons = [
    { id: 'board', icon: <Home size={20} />, label: 'Inicio' },
    { id: 'inbox', icon: <Inbox size={20} />, label: 'Bandeja' },
    { id: 'notifications', icon: <Bell size={20} />, label: 'Notificaciones' },
    { id: 'search', icon: <Search size={20} />, label: 'Buscar' },
    { id: 'docs', icon: <BookOpen size={20} />, label: 'Docs' },
    { id: 'dashboard', icon: <BarChart2 size={20} />, label: 'Panel' },
    { id: 'team', icon: <Users size={20} />, label: 'Equipo' },
    { id: 'admin', icon: <Settings size={20} />, label: 'Admin' },
  ];

  const handleCreateBoard = async () => {
    const name = newBoardName.trim() || 'Nuevo tablero';
    if (!name) return;
    setCreatingBoard(true);
    setCreateBoardError(null);
    try {
      const res = await fetch('http://localhost:3001/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workspaceId: activeWorkspaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Error del servidor (${res.status})`);
      }
      if (!data?.id) {
        throw new Error('El servidor no devolvió un tablero válido');
      }
      const board: Board = {
        id: data.id,
        name: data.name,
        workspaceId: data.workspaceId,
        groups: [],
        columns: [],
      };
      setBoards(prev => [...prev, board]);
      setActiveBoardId(board.id);
      setNewBoardName('');
      setCreateBoardError(null);
      setShowAddBoard(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear el tablero';
      const isNetwork =
        err instanceof TypeError ||
        (typeof message === 'string' && (message.includes('fetch') || message.includes('network')));
      setCreateBoardError(
        isNetwork
          ? 'No se pudo conectar con el servidor. Comprueba que el backend esté en marcha (puerto 3001).'
          : message
      );
      console.error('Error creating board:', err);
    } finally {
      setCreatingBoard(false);
    }
  };

  return (
    <div className="flex h-screen bg-monday-bg overflow-hidden font-sans">
      {/* ─── Left Nav Rail ─────────────────────────────────────── */}
      <aside className="w-[56px] min-w-[56px] bg-monday-sidebar flex flex-col items-center py-3 gap-1 z-30">
        {/* Logo */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-monday-md mb-3 overflow-hidden">
          <img src="/logo.png" alt="Sunday" className="w-full h-full object-contain" />
        </div>

        {navIcons.map(({ id, icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => {
              if (id === 'admin') {
                setShowAdminPanel(true);
                return;
              }
              const pageIds = ['board', 'inbox', 'dashboard', 'search', 'docs', 'team', 'notifications'];
              if (pageIds.includes(id)) {
                setActivePage(id as typeof activePage);
                setSidebarOpen(true);
                if (id === 'notifications') fetchUnreadNotifications();
              }
            }}
            className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 ${activePage === id ? 'bg-monday-sidebarHover text-white' : 'text-white/50 hover:text-white hover:bg-monday-sidebarHover'}`}
          >
            {icon}
            {id === 'notifications' && unreadNotifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
              </span>
            )}
          </button>
        ))}

        {/* Spacer + avatar at bottom */}
        <div className="flex-1" />
        <button 
          title={`Cerrar sesión (${currentUser.name})`} 
          onClick={logout}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shadow-sm mb-1 hover:opacity-80 transition-opacity"
          style={{ backgroundColor: currentUser.color }}
        >
          {currentUser.initials}
        </button>
        <button title="Apps" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-monday-sidebarHover transition-all duration-150">
          <LayoutGrid size={20} />
        </button>
      </aside>

      {/* ─── Workspace Sidebar ─────────────────────────────────── */}
      <aside
        className={`${sidebarOpen ? 'w-[232px] min-w-[232px]' : 'w-0 min-w-0'} bg-monday-sidebar flex flex-col overflow-hidden transition-all duration-200 z-20 border-r border-white/10`}
      >
        <div className="px-3 py-3 border-b border-white/10">
          <Popover.Root open={workspaceSelectorOpen} onOpenChange={setWorkspaceSelectorOpen}>
            <Popover.Trigger asChild>
              <button className="w-full flex items-center gap-2 text-white/90 hover:bg-monday-sidebarHover rounded-lg px-2 py-1.5 transition-colors">
                <div className="w-6 h-6 rounded bg-monday-purple/80 flex items-center justify-center text-white text-xs font-bold">E</div>
                <span className="text-[13px] font-semibold flex-1 text-left truncate">
                  {activeWorkspaceName}
                </span>
                <ChevronDown size={15} className="text-white/50" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 w-64 rounded-xl shadow-monday-lg border border-white/10 bg-monday-sidebar p-2"
                sideOffset={8}
                align="start"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[11px] font-semibold text-white/40 px-1 mb-1 uppercase tracking-wider">
                  Workspaces
                </p>
                <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                        ws.id === activeWorkspaceId
                          ? 'bg-white/10 text-white'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`}
                      onClick={() => {
                        setActiveWorkspaceId(ws.id);
                        setActiveBoardId(null);
                        setWorkspaceSelectorOpen(false);
                      }}
                    >
                      <div className="w-6 h-6 rounded bg-monday-purple/80 flex items-center justify-center text-white text-xs font-bold">
                        {ws.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-left truncate">{ws.name}</span>
                    </button>
                  ))}
                  {workspaces.length === 0 && (
                    <p className="text-[12px] text-white/50 px-2 py-1.5">
                      No hay workspaces disponibles.
                    </p>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <input
                    ref={newWorkspaceInputRef}
                    type="text"
                    value={newWorkspaceName}
                    onChange={e => { setNewWorkspaceName(e.target.value); setWorkspaceError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                    placeholder="Nuevo workspace"
                    className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-monday-blue mb-1.5"
                    disabled={creatingWorkspace}
                  />
                  {workspaceError && <p className="text-red-400 text-[11px] mb-1.5">{workspaceError}</p>}
                  <button
                    type="button"
                    disabled={creatingWorkspace}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const name = newWorkspaceName.trim() || 'Nuevo workspace';
                      if (!name || creatingWorkspace) return;
                      setWorkspaceError(null);
                      setCreatingWorkspace(true);
                      fetch('http://localhost:3001/api/workspaces', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name }),
                      })
                        .then(r => r.json().then((data: Workspace & { error?: string }) => ({ ok: r.ok, status: r.status, data })))
                        .then(({ ok, data }) => {
if (ok && data && typeof data.id === 'string') {
                          const created = data as Workspace;
                          setWorkspaces(prev => [...prev, created]);
                          setActiveWorkspaceId(created.id);
                          setActiveBoardId(null);
                          setNewWorkspaceName('');
                          setWorkspaceSelectorOpen(false);
                        } else {
                            setWorkspaceError((data as { error?: string })?.error || 'Error al crear workspace');
                          }
                        })
                        .catch(err => setWorkspaceError(err?.message || 'No se pudo conectar con el servidor'))
                        .finally(() => setCreatingWorkspace(false));
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-monday-blue text-white text-[12px] font-medium hover:bg-monday-blue/90 disabled:opacity-50"
                  >
                    <Plus size={14} />
                    Agregar workspace
                  </button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-2">
          {activePage === 'board' ? (
            <>
              {/* Header Area */}
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-[17px] font-bold text-monday-text tracking-tight flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-monday-blue to-[#1d60f5] flex items-center justify-center text-white text-xs shadow-sm">
                    M
                  </div>
                  {activeWorkspaceName}
                </h2>
                {currentUser?.role === 'ADMIN' && (
                  <button 
                    onClick={() => setShowAdminPanel(true)}
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-monday-bg text-monday-subtext hover:text-monday-blue transition-colors"
                    title="Gestión de Usuarios"
                  >
                    <Users size={16} />
                  </button>
                )}
              </div>

              {/* Board Search Box */}
              <div className="relative mb-3 group/search">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-monday-subtext group-hover/search:text-monday-text transition-colors" />
                <input
                  type="text"
                  placeholder="Buscar tableros..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-monday-input text-white text-[13px] placeholder-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
                  value={boardSearch}
                  onChange={(e) => setBoardSearch(e.target.value)}
                />
              </div>

              <p className="text-white/40 text-[11px] font-semibold px-2 mb-1 mt-2 uppercase tracking-wider">Tableros</p>
              <button
                onClick={() => setActiveBoardId(null)}
                className={`w-full flex items-center gap-2 text-[13px] px-2 py-1.5 rounded-lg transition-colors mb-0.5 ${activeBoardId === null ? 'bg-monday-blue/80 text-white font-medium' : 'text-white/60 hover:bg-monday-sidebarHover hover:text-white'}`}
              >
                <LayoutGrid size={14} className="shrink-0" />
                Vista general
              </button>
              {boards
                .filter(b => b && (!boardSearch.trim() || b.name.toLowerCase().includes(boardSearch.trim().toLowerCase())))
                .map((b) => b && (
                <button
                  key={b.id}
                  onClick={() => setActiveBoardId(b.id)}
                  className={`w-full flex items-center gap-2 text-[13px] px-2 py-1.5 rounded-lg transition-colors mb-0.5 ${activeBoardId === b.id ? 'bg-monday-blue/80 text-white font-medium' : 'text-white/60 hover:bg-monday-sidebarHover hover:text-white'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
                  {b.name}
                  {activeBoardId === b.id && <Star size={13} className="ml-auto opacity-50 text-monday-orange" />}
                </button>
              ))}
              <Popover.Root
                open={showAddBoard}
                onOpenChange={(open) => {
                  setShowAddBoard(open);
                  if (!open) setCreateBoardError(null);
                }}
              >
                <Popover.Trigger asChild>
                  <button type="button" className="w-full flex items-center gap-2 text-[12px] px-2 py-1.5 text-white/40 hover:text-white/70 transition-colors mt-1">
                    <Plus size={14} />
                    Agregar tablero
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[280px] rounded-xl shadow-monday-lg border border-white/10 bg-monday-sidebar p-0 overflow-hidden"
                    sideOffset={8}
                    align="start"
                    onOpenAutoFocus={(e) => {
                      e.preventDefault();
                      setTimeout(() => newBoardNameInputRef.current?.focus(), 0);
                    }}
                  >
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-[13px] font-semibold text-white/90">Nuevo tablero</p>
                      <p className="text-[12px] text-white/50 mt-0.5">Asigna un nombre a tu tablero</p>
                    </div>
                    <form
                      className="px-4 pb-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateBoard();
                      }}
                    >
                      <input
                        ref={newBoardNameInputRef}
                        type="text"
                        value={newBoardName}
                        onChange={e => setNewBoardName(e.target.value)}
                        placeholder="Nombre del tablero"
                        className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-monday-blue focus:border-transparent mb-4"
                        disabled={creatingBoard}
                        aria-describedby={createBoardError ? 'create-board-error' : undefined}
                      />
                      {createBoardError && (
                        <p id="create-board-error" className="text-red-400 text-[12px] mb-3" role="alert">
                          {createBoardError}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={creatingBoard}
                          onClick={() => { setShowAddBoard(false); setNewBoardName(''); setCreateBoardError(null); }}
                          className="px-3 py-2 text-[13px] text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={creatingBoard}
                          className="px-4 py-2 text-[13px] font-medium text-white bg-monday-blue hover:bg-monday-blue/90 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {creatingBoard ? 'Creando...' : 'Crear'}
                        </button>
                      </div>
                    </form>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </>
          ) : activePage === 'inbox' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Bandeja</p>
              <p className="text-white/60 text-[12px] px-2">Tareas asignadas a ti.</p>
            </div>
          ) : activePage === 'team' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Equipo</p>
              <p className="text-white/60 text-[12px] px-2">Miembros del workspace.</p>
            </div>
          ) : activePage === 'search' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Buscar</p>
              <p className="text-white/60 text-[12px] px-2">Busca en todos los tableros.</p>
            </div>
          ) : activePage === 'dashboard' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Panel</p>
              <p className="text-white/60 text-[12px] px-2">Resumen y estadísticas.</p>
            </div>
          ) : activePage === 'docs' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Docs</p>
              <p className="text-white/60 text-[12px] px-2">Documentación del equipo.</p>
            </div>
          ) : activePage === 'notifications' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Notificaciones</p>
              <p className="text-white/60 text-[12px] px-2">Actualizaciones recientes.</p>
            </div>
          ) : activePage === 'facturacion' ? (
            <div className="p-3">
              <p className="text-white/40 text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Facturación</p>
              <p className="text-white/60 text-[12px] px-2">Proyectos aprobados.</p>
            </div>
          ) : (
            <div className="p-4 text-center text-white/50 text-[13px]">
              Menú de {activePage}
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main Content ───────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 p-3 pl-0 bg-monday-bg overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-monday-sm border border-monday-border overflow-hidden">
          
          {activePage === 'board' && !activeBoardId ? (
            <WorkspaceOverviewPage
              workspace={workspaces.find(w => w.id === activeWorkspaceId) ?? null}
              boards={boards}
              onSelectBoard={setActiveBoardId}
              onWorkspaceUpdated={(updated) => {
                setWorkspaces(prev => prev.map(w => w.id === updated.id ? { ...w, ...updated } : w));
              }}
              onWorkspaceDeleted={() => {
                fetch('http://localhost:3001/api/workspaces')
                  .then(r => r.json())
                  .then((data: Workspace[]) => {
                    if (!Array.isArray(data)) return;
                    setWorkspaces(data);
                    const stillExists = data.some(w => w.id === activeWorkspaceId);
                    if (!stillExists) {
                      setActiveWorkspaceId(data[0]?.id ?? null);
                      setActiveBoardId(null);
                      setBoards([]);
                    }
                  })
                  .catch(() => {});
              }}
              onBoardDeleted={() => {
                const url = activeWorkspaceId
                  ? `http://localhost:3001/api/boards?workspaceId=${encodeURIComponent(
                      activeWorkspaceId
                    )}`
                  : 'http://localhost:3001/api/boards';

                fetch(url)
                  .then(r => r.json())
                  .then((data: Board[]) => {
                    if (!Array.isArray(data)) return;
                    setBoards(data);
                    setActiveBoardId(prev => {
                      if (!prev) return null;
                      const exists = data.some(b => b.id === prev);
                      return exists ? prev : data[0]?.id ?? null;
                    });
                  })
                  .catch(() => {});
              }}
            />
          ) : activePage === 'board' && boards.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-8">
              <p className="text-[15px] font-medium text-monday-text mb-2">No hay tableros</p>
              <p className="text-[13px] mb-4">Crea uno desde el menú de la izquierda con &quot;Agregar tablero&quot;.</p>
              <button
                onClick={() => setShowAddBoard(true)}
                className="px-4 py-2 bg-monday-blue text-white text-[13px] font-medium rounded-monday hover:bg-monday-blue/90"
              >
                <Plus size={16} className="inline mr-1.5 -mt-0.5" />
                Agregar tablero
              </button>
            </div>
          ) : activePage === 'board' && activeBoardId ? (
            <>
              <header className="shrink-0 border-b border-monday-border">
                <div className="h-[56px] flex items-center px-6 justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSidebarOpen(v => !v)} className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover transition-colors mr-1">
                      <ChevronRight size={18} className={`transition-transform ${sidebarOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </button>
                    {editingBoardName && activeBoardId ? (
                      <input
                        autoFocus
                        value={boardNameDraft}
                        onChange={e => setBoardNameDraft(e.target.value)}
                        onBlur={() => {
                          setEditingBoardName(false);
                          if (boardNameDraft.trim()) {
                            socket.emit('rename_board', { boardId: activeBoardId, name: boardNameDraft.trim() });
                            setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, name: boardNameDraft.trim() } : b));
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditingBoardName(false);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="text-[20px] font-semibold text-monday-text bg-monday-hover rounded px-1 py-0.5 outline-none border border-monday-blue min-w-[120px]"
                      />
                    ) : (
                      <h1
                        className="text-[20px] font-semibold text-monday-text cursor-pointer hover:bg-monday-hover rounded px-1 py-0.5 transition-colors"
                        onClick={() => {
                          const board = boards.find(b => b && b.id === activeBoardId);
                          if (board) {
                            setBoardNameDraft(board.name);
                            setEditingBoardName(true);
                          }
                        }}
                        title="Clic para editar nombre del tablero"
                      >
                        {boards.find(b => b && b.id === activeBoardId)?.name || 'Cargando...'}
                      </h1>
                    )}
                    <Star size={16} className="text-monday-subtext hover:text-monday-orange cursor-pointer transition-colors" />
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="toolbar-btn"><Users size={16} /><span>Invitar / {Object.keys(navIcons).length}</span></button>
                    <div className="w-px h-5 bg-monday-border" />
                    <button className="toolbar-btn"><Search size={16} /></button>
                  </div>
                </div>

                <div className="flex items-center px-6 gap-1 text-[13px]">
                  {[
                    { id: 'table' as const, label: '⊞ Tabla principal' },
                    { id: 'kanban' as const, label: '▦ Kanban' },
                    ...(enabledViews.includes('facturacion') ? [{ id: 'facturacion' as const, label: '🧾 Facturación' }] : []),
                    ...(enabledViews.includes('calendar') ? [{ id: 'calendar' as const, label: '📅 Calendario' }] : []),
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setCurrentView(tab.id)}
                      className={`py-2.5 px-3 border-b-2 transition-colors font-medium rounded-t-md ${currentView === tab.id ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text hover:bg-monday-hover'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <AddViewDropdown
                    enabledViews={enabledViews}
                    onAddView={(view) => {
                      if (!enabledViews.includes(view)) {
                        setEnabledViews([...enabledViews, view]);
                        setCurrentView(view);
                      }
                      setShowAddViewPopover(false);
                    }}
                    open={showAddViewPopover}
                    onOpenChange={setShowAddViewPopover}
                    canAddFacturacion={canSeeFacturacionView}
                  />
                </div>
              </header>

              <div className="flex-1 overflow-hidden relative">
                <BoardContainer boardId={activeBoardId} onRowClick={setSelectedItem} viewMode={currentView} />
              </div>
            </>
          ) : activePage === 'inbox' ? (
            <InboxPage onItemClick={setSelectedItem} />
          ) : activePage === 'notifications' ? (
            <NotificationsPage
              onOpenItem={(item, boardId) => {
                setActivePage('board');
                setActiveBoardId(boardId);
                setSelectedItem(item);
              }}
              onOpenInbox={() => setActivePage('inbox')}
              onNotificationsChange={fetchUnreadNotifications}
            />
          ) : activePage === 'search' ? (
            <SearchPage
              onItemClick={setSelectedItem}
              onResultClick={(item, boardId) => {
                setActivePage('board');
                setActiveBoardId(boardId);
                setSelectedItem(item);
              }}
            />
          ) : activePage === 'docs' ? (
            <DocsPage />
          ) : activePage === 'dashboard' ? (
            <DashboardPage />
          ) : activePage === 'team' ? (
            <TeamPage />
          ) : activePage === 'facturacion' ? (
            <FacturacionPage
              boards={boards}
              onOpenItem={(item, boardId) => {
                setActivePage('board');
                setActiveBoardId(boardId);
                setSelectedItem(item);
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext">
              <BarChart2 size={48} className="mb-4 opacity-50" />
              <h2 className="text-xl font-semibold text-monday-text mb-2">Próximamente</h2>
              <p className="text-[14px]">Esta vista "({activePage})" estará disponible en futuras actualizaciones.</p>
            </div>
          )}
        </div>
      </main>

      {/* ─── Item Details Panel ─────────────────────────────────── */}
      {selectedItem && (
        <div className="absolute top-0 right-0 h-full z-50 panel-slide-in">
          <ItemDetailsPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
        </div>
      )}
      
      <AdminUsersPanel open={showAdminPanel} onOpenChange={setShowAdminPanel} />
    </div>
  );
}

export default App;
