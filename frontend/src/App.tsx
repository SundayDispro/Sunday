import React, { useEffect, useState } from 'react';
import { socket } from './store/socket';
import BoardContainer from './components/Board/BoardContainer';
import { ItemDetailsPanel } from './components/Board/ItemDetailsPanel';
import {
  Home, Bell, Search, Settings, ChevronDown, ChevronRight,
  LayoutGrid, Users, BookOpen, BarChart2, Inbox, Star, Plus,
} from 'lucide-react';
import { Item, Board } from './types';
import { useUser } from './store/UserContext';
import { Login } from './components/Login';
import { AdminUsersPanel } from './components/AdminUsersPanel';
import { InboxPage } from './components/pages/InboxPage';
import { NotificationsPage } from './components/pages/NotificationsPage';
import { SearchPage } from './components/pages/SearchPage';
import { DocsPage } from './components/pages/DocsPage';
import { DashboardPage } from './components/pages/DashboardPage';
import { TeamPage } from './components/pages/TeamPage';
import * as Popover from '@radix-ui/react-popover';
import { Calendar } from 'lucide-react';

type ViewMode = 'table' | 'kanban' | 'calendar';

function AddViewDropdown({
  enabledViews,
  onAddView,
  open,
  onOpenChange,
}: {
  enabledViews: ViewMode[];
  onAddView: (view: ViewMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canAddCalendar = !enabledViews.includes('calendar');
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
          {canAddCalendar && (
            <button
              onClick={() => onAddView('calendar')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
            >
              <Calendar size={16} className="text-monday-blue shrink-0" />
              Calendario
            </button>
          )}
          {!canAddCalendar && (
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
  const [currentView, setCurrentView] = useState<ViewMode>('table');
  const [enabledViews, setEnabledViews] = useState<ViewMode[]>(['table', 'kanban']);
  const [showAddViewPopover, setShowAddViewPopover] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Navigation state
  const [activePage, setActivePage] = useState<'home' | 'inbox' | 'notifications' | 'dashboard' | 'board' | 'search' | 'docs' | 'team'>('board');
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  useEffect(() => {
    if (currentUser) {
      fetch('http://localhost:3001/api/boards')
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
        setBoards(prev => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
      });
      return () => {
        socket.off('board_renamed');
        socket.off('board_added');
      };
    }
  }, [currentUser]);

  if (!currentUser) {
    return <Login />;
  }

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

  return (
    <div className="flex h-screen bg-monday-bg overflow-hidden font-sans">
      {/* ─── Left Nav Rail ─────────────────────────────────────── */}
      <aside className="w-[56px] min-w-[56px] bg-monday-sidebar flex flex-col items-center py-3 gap-1 z-30">
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-monday-md mb-3 overflow-hidden">
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
              }
            }}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 ${activePage === id ? 'bg-monday-sidebarHover text-white' : 'text-white/50 hover:text-white hover:bg-monday-sidebarHover'}`}
          >
            {icon}
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
          <button className="w-full flex items-center gap-2 text-white/90 hover:bg-monday-sidebarHover rounded-lg px-2 py-1.5 transition-colors">
            <div className="w-6 h-6 rounded bg-monday-purple/80 flex items-center justify-center text-white text-xs font-bold">E</div>
            <span className="text-[13px] font-semibold flex-1 text-left">Mi Equipo</span>
            <ChevronDown size={15} className="text-white/50" />
          </button>
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
                  Main Workspace
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
              {boards.map((b) => b && (
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
              <Popover.Root open={showAddBoard} onOpenChange={setShowAddBoard}>
                <Popover.Trigger asChild>
                  <button className="w-full flex items-center gap-2 text-[12px] px-2 py-1.5 text-white/40 hover:text-white/70 transition-colors mt-1">
                    <Plus size={14} />
                    Agregar tablero
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-64 p-3"
                    sideOffset={8}
                    align="start"
                  >
                    <p className="text-[12px] font-semibold text-monday-subtext mb-2">Nuevo tablero</p>
                    <input
                      type="text"
                      value={newBoardName}
                      onChange={e => setNewBoardName(e.target.value)}
                      placeholder="Nombre del tablero"
                      className="w-full px-3 py-2 rounded-monday border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue mb-3"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const name = newBoardName.trim() || 'Nuevo tablero';
                          socket.emit('add_board', { name });
                          setNewBoardName('');
                          setShowAddBoard(false);
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setShowAddBoard(false); setNewBoardName(''); }}
                        className="px-3 py-1.5 text-[13px] text-monday-subtext hover:text-monday-text rounded-monday"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          const name = newBoardName.trim() || 'Nuevo tablero';
                          socket.emit('add_board', { name });
                          setNewBoardName('');
                          setShowAddBoard(false);
                        }}
                        className="px-3 py-1.5 text-[13px] font-medium text-white bg-monday-blue rounded-monday hover:bg-monday-blue/90"
                      >
                        Crear
                      </button>
                    </div>
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
          
          {activePage === 'board' && boards.length === 0 ? (
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
            <NotificationsPage />
          ) : activePage === 'search' ? (
            <SearchPage onItemClick={setSelectedItem} />
          ) : activePage === 'docs' ? (
            <DocsPage />
          ) : activePage === 'dashboard' ? (
            <DashboardPage />
          ) : activePage === 'team' ? (
            <TeamPage />
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
