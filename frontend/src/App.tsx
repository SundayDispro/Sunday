import React, { useEffect, useState } from 'react';
import { socket } from './store/socket';
import BoardContainer from './components/Board/BoardContainer';
import { ItemDetailsPanel } from './components/Board/ItemDetailsPanel';
import {
  Home, Bell, Search, Settings, ChevronDown, ChevronRight,
  LayoutGrid, Users, BookOpen, BarChart2, Inbox, Star, Plus, LogOut,
} from 'lucide-react';
import { Item, Board } from './types';
import { useUser } from './store/UserContext';
import { Login } from './components/Login';
import { AdminUsersPanel } from './components/AdminUsersPanel';

function App() {
  const { currentUser, logout } = useUser();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [currentView, setCurrentView] = useState<'table' | 'kanban'>('table');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Navigation state
  const [activePage, setActivePage] = useState<'home' | 'inbox' | 'notifications' | 'dashboard' | 'board'>('board');
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [boardSearch, setBoardSearch] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  useEffect(() => {
    if (currentUser) {
      // Fetch all boards for sidebar
      fetch('http://localhost:3001/api/boards/first')
        .then(r => r.json())
        .then(data => {
          if (data && data.id) {
            setBoards([data]); 
            if (!activeBoardId) setActiveBoardId(data.id);
          }
        })
        .catch(err => console.error('Error fetching boards:', err));
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
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-monday-orange via-monday-red to-monday-purple flex items-center justify-center shadow-monday-md mb-3">
          <span className="text-white font-bold text-[15px] tracking-tight">S</span>
        </div>

        {navIcons.map(({ id, icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => {
              if (['board', 'inbox', 'dashboard'].includes(id)) {
                setActivePage(id as any);
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
              <button className="w-full flex items-center gap-2 text-[12px] px-2 py-1.5 text-white/40 hover:text-white/70 transition-colors mt-1">
                <Plus size={14} />
                Agregar tablero
              </button>
            </>
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
          
          {activePage === 'board' && activeBoardId ? (
            <>
              <header className="shrink-0 border-b border-monday-border">
                <div className="h-[56px] flex items-center px-6 justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSidebarOpen(v => !v)} className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover transition-colors mr-1">
                      <ChevronRight size={18} className={`transition-transform ${sidebarOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </button>
                    <h1 className="text-[20px] font-semibold text-monday-text">{boards.find(b => b && b.id === activeBoardId)?.name || 'Cargando...'}</h1>
                    <Star size={16} className="text-monday-subtext hover:text-monday-orange cursor-pointer transition-colors" />
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="toolbar-btn"><Users size={16} /><span>Invitar / {Object.keys(navIcons).length}</span></button>
                    <div className="w-px h-5 bg-monday-border" />
                    <button className="toolbar-btn"><Search size={16} /></button>
                  </div>
                </div>

                <div className="flex items-center px-6 gap-1 text-[13px]">
                  {[{ id: 'table', label: '⊞ Tabla principal' }, { id: 'kanban', label: '▦ Kanban' }].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setCurrentView(tab.id as 'table' | 'kanban')}
                      className={`py-2.5 px-3 border-b-2 transition-colors font-medium rounded-t-md ${currentView === tab.id ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text hover:bg-monday-hover'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <button className="py-2.5 px-2 text-monday-subtext hover:text-monday-blue transition-colors"><Plus size={16} /></button>
                </div>
              </header>

              <div className="flex-1 overflow-hidden relative">
                <BoardContainer boardId={activeBoardId} onRowClick={setSelectedItem} viewMode={currentView} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext">
              {activePage === 'inbox' ? <Inbox size={48} className="mb-4 opacity-50" /> : <BarChart2 size={48} className="mb-4 opacity-50" />}
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
