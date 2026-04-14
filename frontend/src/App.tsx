import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from './store/socket';
import BoardContainer from './components/Board/BoardContainer';
import { ItemDetailsPanel } from './components/Board/ItemDetailsPanel';
import {
  Home, Search, ChevronDown, ChevronRight,
  Users, BookOpen, BarChart2, Inbox, Star, Plus, Receipt, Calendar, Folder, PieChart, FolderOpen, UserCheck, GanttChart, Check, AlertCircle, X, Sun, Moon, Sparkles, LayoutGrid, Menu, ChevronLeft, Globe, GripVertical,
  FileText,
  ListTodo,
  Copy, ClipboardPaste, Delete,
} from 'lucide-react';
import { Item, Board, Workspace, User, DocType } from './types';
import type { CotizacionDocsPrefill } from './types/cotizacion';
import { useUser } from './store/UserContext';
import { AnimatedLogo } from './components/AnimatedLogo';
import { Login } from './components/Login';
import {
  type AppTheme,
  SIDEBAR_THEME_IDS,
  THEME_COLORS,
  THEME_LABELS,
  THEME_SWATCHES,
  normalizeStoredTheme,
} from './theme';
import { AdminUsersPanel } from './components/AdminUsersPanel';
import { UserPanel } from './components/UserPanel';
import { InboxPage } from './components/pages/InboxPage';
import { NotificationsPage } from './components/pages/NotificationsPage';
import { BandejaUnificadaPage } from './components/pages/BandejaUnificadaPage';
import { SearchPage } from './components/pages/SearchPage';
const DocsPageLazy = lazy(() => import('./components/pages/DocsPage'));
const MobileDocsHubLazy = lazy(() =>
  import('./components/mobile/MobileDocsHub').then((m) => ({ default: m.MobileDocsHub }))
);
import DocsExportPreviewPage from './components/pages/docs/DocsExportPreviewPage';
import DocsPdfPreviewPage from './components/pages/docs/DocsPdfPreviewPage';
import { TeamPage } from './components/pages/TeamPage';
import { FacturacionPage } from './components/pages/FacturacionPage';
import { TasksPage } from './components/pages/TasksPage';
import { WorkspaceOverviewPage } from './components/pages/WorkspaceOverviewPage';
import { MiTrabajoPage } from './components/pages/MiTrabajoPage';
import { TodayPage } from './components/pages/TodayPage';
import { type MobileBottomTab } from './components/MobileBottomNav';
import { MobileLayout } from './components/layout/MobileLayout';
import { CommandPalette, type CommandPaletteItemEntry } from './components/CommandPalette';
import { NotificationDropdown } from './components/NotificationDropdown';
import { exportBoardToExcel } from './utils/exportBoardToExcel';
import { MobileBoardHeaderMinimal } from './components/MobileBoardHeaderMinimal';
import { BoardViewBottomSheet } from './components/Board/BoardViewBottomSheet';
import { MobileMoreDrawer } from './components/MobileMoreDrawer';
import { AnimatedDialog } from './components/AnimatedDialog';
import { useToast } from './components/Toast';
import { MobileHomePage } from './components/mobile/MobileHomePage';
import { MobileBoardsOverview } from './components/mobile/MobileBoardsOverview';
import { useViewport, isDocsMobileViewport } from './hooks/useViewport';
import { useOrientationViewportFix } from './hooks/useOrientationViewportFix';
import { useMobileState } from './hooks/useMobileState';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const THEME_STORAGE_KEY = 'sunday-theme';

/** Cotizaciones ocultas en v1.0; reactivar import de CotizacionPage y entrada en nav al retomar la feature. */
const SHOW_COTIZACIONES_NAV = false;

function ThemeSidebarGlyph({ theme, size = 20 }: { theme: AppTheme; size?: number }) {
  if (theme === 'light') return <Sun size={size} strokeWidth={2.25} />;
  if (theme === 'dark') return <Moon size={size} strokeWidth={2.25} />;
  return <Sparkles size={size} strokeWidth={2.25} />;
}

type ViewMode = 'table' | 'kanban' | 'calendar' | 'facturacion' | 'resumen' | 'archivos' | 'miTrabajo' | 'timeline';

const VIEW_LABELS: Record<ViewMode, string> = {
  table: 'Tabla principal',
  kanban: 'Kanban',
  calendar: 'Calendario',
  facturacion: 'Facturación',
  resumen: 'Resumen',
  archivos: 'Archivos',
  miTrabajo: 'Mi trabajo',
  timeline: 'Timeline',
};
const VIEW_TAB_META: Record<ViewMode, string> = {
  table: '\u{1F4CB} Tabla principal',
  kanban: '\u{25A6} Kanban',
  calendar: '\u{1F4C5} Calendario',
  facturacion: '\u{1F4B3} Facturación',
  resumen: '\u{1F4CA} Resumen',
  archivos: '\u{1F4C1} Archivos',
  miTrabajo: '\u{1F464} Mi trabajo',
  timeline: '\u{1F4C8} Timeline',
};

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
  const canAddResumen = !enabledViews.includes('resumen');
  const canAddTimeline = !enabledViews.includes('timeline');
  const hasAny = canAddCalendar || canAddFact || canAddResumen || canAddTimeline;
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
          className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-52 p-2 fade-in max-h-[70vh] overflow-y-auto scroll-touch"
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
          {canAddResumen && (
            <button
              onClick={() => onAddView('resumen')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
            >
              <PieChart size={16} className="text-monday-blue shrink-0" />
              Resumen
            </button>
          )}
          {canAddTimeline && (
            <button
              onClick={() => onAddView('timeline')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
            >
              <GanttChart size={16} className="text-monday-blue shrink-0" />
              Timeline
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

function SortableBoardTab({
  tabId,
  label,
  isActive,
  onSelect,
}: {
  tabId: ViewMode;
  label: string;
  isActive: boolean;
  onSelect: (view: ViewMode) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tabId });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 shrink-0 group rounded-t-md ${isDragging ? 'opacity-70' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelect(tabId)}
        className={`min-h-[44px] py-2.5 px-3 border-b-2 transition-colors font-medium rounded-t-md flex items-center shrink-0 ${isActive ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text hover:bg-monday-hover'}`}
      >
        {label}
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded border border-monday-border text-monday-subtext hover:bg-monday-hover flex items-center justify-center cursor-grab active:cursor-grabbing"
        title="Arrastra para reordenar vista"
        aria-label="Arrastrar vista"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim();
import { apiFetch } from './api';
import { can } from './authz/can';

type ExportManifestFile = {
  zipPath: string;
  url: string;
  filename: string;
  size?: number;
};

const EXPORT_DB_NAME = 'sunday-export-db';
const EXPORT_DB_VERSION = 1;
const EXPORT_STORE = 'folders';

function getFolderKey(boardId: string): string {
  return `sunday-export-folder-${boardId}`;
}

function openExportDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(EXPORT_DB_NAME, EXPORT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EXPORT_STORE)) {
        db.createObjectStore(EXPORT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openExportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPORT_STORE, 'readonly');
    const store = tx.objectStore(EXPORT_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error ?? new Error('Error leyendo IndexedDB'));
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openExportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPORT_STORE, 'readwrite');
    const store = tx.objectStore(EXPORT_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Error guardando en IndexedDB'));
  });
}

function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function ensureDirPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const handleAny = handle as any;
  if (typeof handleAny.queryPermission !== 'function' || typeof handleAny.requestPermission !== 'function') {
    return true;
  }
  const readWrite = { mode: 'readwrite' };
  if ((await handleAny.queryPermission(readWrite)) === 'granted') return true;
  return (await handleAny.requestPermission(readWrite)) === 'granted';
}

async function getOrCreateDir(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

async function getExportRootHandle(boardId: string): Promise<FileSystemDirectoryHandle> {
  if (!supportsDirectoryPicker()) {
    throw new Error('Esta función requiere Chrome o Edge en escritorio');
  }

  const key = getFolderKey(boardId);
  let handle = await idbGet<FileSystemDirectoryHandle>(key);
  if (handle) {
    const granted = await ensureDirPermission(handle);
    if (granted) return handle;
  }

  const picker = (window as any).showDirectoryPicker as (
    opts?: { mode?: 'read' | 'readwrite' }
  ) => Promise<FileSystemDirectoryHandle>;

  handle = await picker({ mode: 'readwrite' });
  const granted = await ensureDirPermission(handle);
  if (!granted) {
    throw new Error('No se concedió permiso de escritura a la carpeta seleccionada');
  }
  await idbSet(key, handle);
  return handle;
}

async function saveOneFileIfMissing(
  rootHandle: FileSystemDirectoryHandle,
  file: ExportManifestFile
): Promise<'copied' | 'skipped'> {
  const parts = file.zipPath.split('/').filter(Boolean);
  if (parts.length === 0) return 'skipped';
  const filename = parts[parts.length - 1];
  const folders = parts.slice(0, -1);

  let current = rootHandle;
  for (const folder of folders) {
    current = await getOrCreateDir(current, folder);
  }

  try {
    await current.getFileHandle(filename, { create: false });
    return 'skipped';
  } catch {
    // no existe -> descargar y crear
  }

  const fileRes = await apiFetch(`${API_BASE}${file.url}`);
  if (!fileRes.ok) {
    throw new Error(`No se pudo descargar ${file.filename}`);
  }
  const blob = await fileRes.blob();
  const fileHandle = await current.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return 'copied';
}

function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadBase64Url = parts[1];
    const base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64 + padding);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    const expSec =
      typeof payload.exp === 'number'
        ? payload.exp
        : typeof payload.exp === 'string'
          ? Number(payload.exp)
          : NaN;
    if (!Number.isFinite(expSec)) return null;
    return expSec * 1000;
  } catch {
    return null;
  }
}

function App() {
  const { currentUser, logout } = useUser();
  /** isDocsMobile = ≤1024px: shell móvil completo (inicio con cabecera lateral en landscape, tablero compacto, docs Word iOS). */
  const { isDocsMobile, isLandscapeShort, isLandscape } = useViewport();
  useOrientationViewportFix();
  const { mobileState, updateMobileState } = useMobileState('home');
  const { toast } = useToast();
  const [jwtIsExpiringSoon, setJwtIsExpiringSoon] = useState(false);
  const [jwtIsExpired, setJwtIsExpired] = useState(false);
  const [jwtMinutesLeft, setJwtMinutesLeft] = useState<number | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);

  const [selectedItemIdState, setSelectedItemIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      try {
        const saved = localStorage.getItem('sunday_mobile_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.selectedItemId) return parsed.selectedItemId;
        }
      } catch {}
    }
    return null;
  });

  const [selectedItemObj, setSelectedItemObj] = useState<Item | null>(null);

  // Tablero activo con `groups/items` (lo entrega BoardContainer para que Ctrl/Cmd+K pueda buscar elementos).
  const [activeBoardData, setActiveBoardData] = useState<Board | null>(null);

  // Computed selectedItem based on selectedItemIdState and the current board's items
  const selectedItem = useMemo(() => {
    if (selectedItemObj) return selectedItemObj;
    if (!selectedItemIdState) return null;

    // Preferimos el tablero activo cargado (con items) para búsquedas desde Ctrl/Cmd+K.
    if (activeBoardData) {
      for (const g of activeBoardData.groups) {
        const found = g.items.find(i => i.id === selectedItemIdState);
        if (found) return found;
      }
    }

    if (!boards.length) return null;
    for (const b of boards) {
      for (const g of b.groups) {
        const found = g.items.find(i => i.id === selectedItemIdState);
        if (found) return found;
      }
    }
    return null;
  }, [selectedItemObj, selectedItemIdState, activeBoardData, boards]);

  const commandPaletteItems = useMemo((): CommandPaletteItemEntry[] => {
    if (!activeBoardData) return [];
    const out: CommandPaletteItemEntry[] = [];
    for (const g of activeBoardData.groups) {
      for (const it of g.items) {
        out.push({ itemId: it.id, name: it.name, boardId: activeBoardData.id, boardName: activeBoardData.name });
      }
    }
    return out;
  }, [activeBoardData]);

  const setSelectedItem = (item: Item | null) => {
    setSelectedItemObj(item);
    setSelectedItemIdState(item?.id || null);
  };

  useEffect(() => {
    if (isDocsMobile) {
      updateMobileState({ selectedItemId: selectedItemIdState });
    }
  }, [selectedItemIdState, isDocsMobile]);
  const canSeeFacturacionView = can(currentUser, 'billing.view');
  const canCreateBoard = can(currentUser, 'board.create');
  const isTaller = currentUser?.role === 'TALLER';

  const defaultViewsForRole = isTaller ? (['table', 'calendar'] as ViewMode[]) : (['table', 'kanban'] as ViewMode[]);

  const [currentView, setCurrentViewState] = useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem('sunday-views');
      if (!raw) return 'table';
      const parsed = JSON.parse(raw) as { currentView?: ViewMode; enabledViews?: ViewMode[] };
      const allowedViews = ['table', 'kanban', 'calendar', 'facturacion', 'resumen', 'timeline'];
      const stored = parsed.currentView && allowedViews.includes(parsed.currentView) ? parsed.currentView : 'table';
      if (isTaller && !['table', 'calendar'].includes(stored)) return 'table';
      if (!canSeeFacturacionView && stored === 'facturacion') return 'table';
      return stored;
    } catch { /* ignore */ }
    return 'table';
  });
  const [enabledViews, setEnabledViewsState] = useState<ViewMode[]>(() => {
    try {
      const raw = localStorage.getItem('sunday-views');
      if (!raw) return defaultViewsForRole;
      const parsed = JSON.parse(raw) as { currentView?: ViewMode; enabledViews?: ViewMode[] };
      if (Array.isArray(parsed.enabledViews) && parsed.enabledViews.length > 0) {
        const allowedViews: ViewMode[] = ['table', 'kanban', 'calendar', 'facturacion', 'resumen', 'timeline'];
        const valid = parsed.enabledViews.filter((v): v is ViewMode => allowedViews.includes(v));
        let forRole = isTaller ? valid.filter(v => v === 'table' || v === 'calendar') : valid;
        if (!canSeeFacturacionView) {
          forRole = forRole.filter(v => v !== 'facturacion');
        }
        if (forRole.length > 0) return forRole;
      }
    } catch { /* ignore */ }
    return defaultViewsForRole;
  });
  const [pendingCreateDocType, setPendingCreateDocType] = useState<DocType | null>(null);
  const [pendingCotizacionDocsPrefill, setPendingCotizacionDocsPrefill] = useState<CotizacionDocsPrefill | null>(null);

  const setCurrentView = (v: ViewMode) => {
    let allowed: ViewMode = isTaller ? (v === 'table' || v === 'calendar' ? v : 'table') : v;
    if (!canSeeFacturacionView && allowed === 'facturacion') {
      allowed = 'table';
    }
    setCurrentViewState(allowed);
    try {
      const raw = localStorage.getItem('sunday-views');
      const prev = raw ? JSON.parse(raw) as { currentView?: ViewMode; enabledViews?: ViewMode[] } : {};
      localStorage.setItem('sunday-views', JSON.stringify({ ...prev, currentView: allowed }));
    } catch { /* ignore */ }
  };
  const DISABLED_VIEWS: ViewMode[] = ['archivos', 'miTrabajo'];
  const setEnabledViews = (v: ViewMode[] | ((prev: ViewMode[]) => ViewMode[])) => {
    setEnabledViewsState(prev => {
      let next = typeof v === 'function' ? v(prev) : v;
      next = next.filter(x => !DISABLED_VIEWS.includes(x));
      if (isTaller) next = next.filter(x => x === 'table' || x === 'calendar');
      if (!canSeeFacturacionView) next = next.filter(x => x !== 'facturacion');
      try {
        const raw = localStorage.getItem('sunday-views');
        const data = raw ? JSON.parse(raw) as { currentView?: ViewMode; enabledViews?: ViewMode[] } : {};
        localStorage.setItem('sunday-views', JSON.stringify({ ...data, enabledViews: next }));
      } catch { /* ignore */ }
      return next;
    });
  };
  const orderedBoardTabs = useMemo(() => {
    const base = [...enabledViews];
    if (!base.includes('table')) base.unshift('table');
    if (!isTaller && !base.includes('kanban')) base.splice(1, 0, 'kanban');
    return base
      .filter(v => !DISABLED_VIEWS.includes(v))
      .filter(v => (isTaller ? (v === 'table' || v === 'calendar') : true))
      .filter(v => (v === 'facturacion' ? canSeeFacturacionView : true));
  }, [enabledViews, isTaller, canSeeFacturacionView]);

  const boardTabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
  const handleBoardTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id) as ViewMode;
    const overId = String(over.id) as ViewMode;
    setEnabledViews((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // Rol TALLER: forzar solo tabla y calendario (vista y pestaÃƒÂ±as permitidas)
  useEffect(() => {
    if (!isTaller) return;
    setCurrentViewState(prev => (prev === 'table' || prev === 'calendar' ? prev : 'table'));
    setEnabledViewsState(prev => {
      const next = prev.filter(v => v === 'table' || v === 'calendar');
      return next.length > 0 ? next : ['table', 'calendar'];
    });
  }, [isTaller]);

  // Si el rol no puede ver facturación, limpiar vista/pestaña de facturación
  useEffect(() => {
    if (canSeeFacturacionView) return;
    setCurrentViewState(prev => (prev === 'facturacion' ? 'table' : prev));
    setEnabledViewsState(prev => prev.filter(v => v !== 'facturacion'));
  }, [canSeeFacturacionView]);

  // UI proactiva ante expiracion del JWT (lee exp sin verificar firma).
  useEffect(() => {
    const updateJwtUi = () => {
      let token: string | null = null;
      try {
        token = localStorage.getItem('sunday_token');
      } catch {
        token = null;
      }

      if (!token) {
        setJwtIsExpiringSoon(false);
        setJwtIsExpired(false);
        setJwtMinutesLeft(null);
        return;
      }

      const expMs = decodeJwtExpMs(token);
      if (!expMs) {
        setJwtIsExpiringSoon(false);
        setJwtIsExpired(false);
        setJwtMinutesLeft(null);
        return;
      }

      const now = Date.now();
      const diffMs = expMs - now;
      if (diffMs <= 0) {
        setJwtIsExpired(true);
        setJwtIsExpiringSoon(false);
        setJwtMinutesLeft(null);
        return;
      }

      const minutesLeft = Math.ceil(diffMs / 60000);
      setJwtMinutesLeft(minutesLeft);
      setJwtIsExpired(false);
      setJwtIsExpiringSoon(diffMs <= 60 * 60 * 1000); // <= 60 minutos
    };

    updateJwtUi();
    const intervalId = window.setInterval(updateJwtUi, 30000);

    const onSessionExpired = () => {
      setJwtIsExpired(true);
      setJwtIsExpiringSoon(false);
      setJwtMinutesLeft(null);
    };
    window.addEventListener('session-expired', onSessionExpired);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('session-expired', onSessionExpired);
    };
  }, [currentUser?.id]);

  const [showAddViewPopover, setShowAddViewPopover] = useState(false);
  const [calendarBoardPickerOpen, setCalendarBoardPickerOpen] = useState(false);
  const [boardVistaSheetOpen, setBoardVistaSheetOpen] = useState(() => {
    if (typeof window !== 'undefined' && isDocsMobileViewport()) {
      try {
        const saved = localStorage.getItem('sunday_mobile_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          return !!parsed.bottomSheetOpen;
        }
      } catch {}
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && isDocsMobileViewport()) {
      const ms = localStorage.getItem('sunday_mobile_state');
      if (ms) {
        try {
          const parsed = JSON.parse(ms);
          parsed.bottomSheetOpen = boardVistaSheetOpen;
          localStorage.setItem('sunday_mobile_state', JSON.stringify(parsed));
        } catch {}
      }
    }
  }, [boardVistaSheetOpen]);

  const [lastMainTab, setLastMainTab] = useState<'home' | 'board' | 'calendar'>('home');
  const [mobileHeaderHidden, setMobileHeaderHidden] = useState(false);
  /** Altura real del subencabezado (Ejemplo + Tabla principal); evitar 120px iniciales que dejan hueco vacío hasta el primer ResizeObserver. */
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(52);
  const mobileHeaderRef = useRef<HTMLDivElement>(null);
  const [exportingFolders, setExportingFolders] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      const normalized = normalizeStoredTheme(raw);
      if (normalized) return normalized;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [themeSelectorOpen, setThemeSelectorOpen] = useState(false);
  /** Oculta rail + sidebar + header (desktop). */
  const [focusMode, setFocusMode] = useState(false);
  /** Lista de docs para la paleta (/doc). */
  const [paletteDocs, setPaletteDocs] = useState<{ id: string; title: string }[]>([]);
  const hasMountedRef = useRef(false);
  const prevUserRef = useRef<User | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    const t = window.setTimeout(() => {
      apiFetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { theme } }),
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(t);
  }, [theme, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.preferences) return;
    const raw = (currentUser.preferences as { theme?: string }).theme;
    const n = normalizeStoredTheme(raw ?? null);
    if (n) setTheme(n);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
    }
    prevUserRef.current = currentUser;
  }, [currentUser]);
  
  // Navigation state
  const [activePage, setActivePage] = useState<
    'home'
    | 'inbox'
    | 'notifications'
    | 'board'
    | 'calendar'
    | 'search'
    | 'docs'
    | 'team'
    | 'facturacion'
    | 'cotizacion'
    | 'tasks'
    | 'miTrabajo'
  >(() => {
    if (typeof window === 'undefined') return 'board';
    try {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get('tab');
      if (tab === 'notifications') return 'notifications';
      if (tab === 'inbox') return 'inbox';
      if (tab === 'home') return 'home';
    } catch {
      // ignore
    }
    const isDocsMobileInitial =
      window.innerWidth <= 1024 || (window.matchMedia?.('(orientation: landscape) and (max-height: 500px)')?.matches ?? false);
    if (isDocsMobileInitial && mobileState.activePage) {
      return mobileState.activePage as any;
    }
    return isDocsMobileInitial ? 'home' : 'board';
  });

  // Sync mobile state
  useEffect(() => {
    if (isDocsMobile) {
      updateMobileState({ activePage });
    }
  }, [activePage, isDocsMobile]);

  useEffect(() => {
    if (activePage === 'cotizacion' && !SHOW_COTIZACIONES_NAV) setActivePage('board');
  }, [activePage]);

  /** Calendario en móvil horizontal: menos chrome en la barra superior para ganar área útil. */
  const calendarMinimalChrome = isDocsMobile && activePage === 'calendar' && isLandscape;

  // Deep-link desde notificaciones push:
  // `/?tab=notifications` / `/?tab=inbox` (limpiamos el query param tras cargar).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get('tab');
      if (!tab) return;
      url.searchParams.delete('tab');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // ignore
    }
  }, []);

  // Animación del logo:
  // - Al entrar a una pestaña, se asigna un par (sol/rayos).
  // - Se mantiene hasta que se cambie de pestaña (activePage).
  // Nota: usamos sessionStorage para evitar el "doble effect" de React StrictMode en DEV.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    if (prefersReduced) return;

    const root = document.documentElement;
    const sunAnims: string[] = [
      'sun-pulse',
      'sun-spin',
      'sun-shimmer',
      'sun-morph',
      'sun-drift',
      'sun-bloom',
      'sun-breathe',
    ];

    const pairIndexKey = 'sunday-logo-pair-index';
    const lastPageKey = 'sunday-logo-last-active-page';

    let lastPage: string | null = null;
    try {
      lastPage = sessionStorage.getItem(lastPageKey);
    } catch {
      // ignore
    }

    // Si StrictMode dispara el effect dos veces con el mismo activePage en DEV,
    // evitamos reasignar el par y generar un "salto" perceptible.
    if (lastPage === activePage) return;

    let i = 0;
    try {
      i = Number(sessionStorage.getItem(pairIndexKey) ?? '0');
      if (!Number.isFinite(i) || i < 0) i = 0;
    } catch {
      // ignore
    }

    root.setAttribute('data-logo-sun-anim', sunAnims[i % sunAnims.length]);
    root.setAttribute('data-logo-rays-anim', sunAnims[(i + 2) % sunAnims.length]);

    try {
      sessionStorage.setItem(pairIndexKey, String(i + 1));
      sessionStorage.setItem(lastPageKey, activePage);
    } catch {
      // ignore
    }
  }, [activePage]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      try {
        const saved = localStorage.getItem('sunday_mobile_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.activeBoardId) return parsed.activeBoardId;
        }
      } catch {}
    }
    return null;
  });

  useEffect(() => {
    if (isDocsMobile) {
      updateMobileState({ activeBoardId });
    }
  }, [activeBoardId, isDocsMobile]);
  const [boardSearch, setBoardSearch] = useState('');
  const handleExportFolders = useCallback(async () => {
    if (!currentUser || !activeBoardId) return;
    if (isDocsMobile) return;

    if (!supportsDirectoryPicker()) {
      toast('Esta función requiere Chrome o Edge en escritorio', 'info');
      return;
    }

    try {
      setExportingFolders(true);
      const qs = new URLSearchParams({
        boardId: activeBoardId,
        userId: currentUser.id,
      });
      const manifestRes = await apiFetch(`${API_BASE}/api/export/folders/files?${qs.toString()}`);
      if (!manifestRes.ok) {
        const data = await manifestRes.json().catch(() => ({} as { error?: string }));
        throw new Error(data.error || 'No se pudo obtener el manifiesto de exportación');
      }

      const payload = (await manifestRes.json()) as {
        ok: boolean;
        files: ExportManifestFile[];
        total: number;
      };
      const files = Array.isArray(payload.files) ? payload.files : [];
      if (files.length === 0) {
        toast('No hay archivos asignados a ti para exportar en este tablero.', 'info');
        return;
      }

      const rootHandle = await getExportRootHandle(activeBoardId);
      let copied = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const file of files) {
        try {
          const result = await saveOneFileIfMissing(rootHandle, file);
          if (result === 'copied') copied += 1;
          else skipped += 1;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      toast(`${copied} archivos nuevos guardados, ${skipped} sin cambios`, 'success');
      if (errors.length > 0) {
        console.warn('Export sync errors:', errors);
        toast(`${errors.length} archivos no se pudieron sincronizar`, 'error');
      }
    } catch (e) {
      console.error('Error exporting folders', e);
      toast(e instanceof Error ? e.message : 'No se pudo sincronizar la carpeta.', 'error');
    } finally {
      setExportingFolders(false);
    }
  }, [activeBoardId, currentUser, isDocsMobile, toast]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  /** Mismo fallback que DocsPage / MobileDocsHub: si aún no hay workspace activo, el primero de la lista. */
  const effectiveDocsWorkspaceId = activeWorkspaceId ?? workspaces[0]?.id ?? null;
  const [workspaceSelectorOpen, setWorkspaceSelectorOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const newWorkspaceInputRef = useRef<HTMLInputElement>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [createBoardError, setCreateBoardError] = useState<string | null>(null);
  const newBoardNameInputRef = useRef<HTMLInputElement>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  /** Notificación no leída creada hace < 2 min (badge “reciente” en campana). */
  const [recentUnreadNotif, setRecentUnreadNotif] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showCreateBoardModal, setShowCreateBoardModal] = useState(false);
  const [composeToUser, setComposeToUser] = useState<User | null>(null);
  const [pendingInboxPostId, setPendingInboxPostId] = useState<string | null>(null);
  const [pendingDocFromBoard, setPendingDocFromBoard] = useState<{
    type: 'cotizacion' | 'levantamiento' | 'hoja_trabajo' | 'text' | 'sheet';
    boardId: string;
    itemId: string;
    columnId: string;
  } | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    setMobileHeaderHidden(false);
  }, [activeBoardId, activePage]);

  const shellBoardView = isDocsMobile && (activePage === 'board' && activeBoardId || activePage === 'miTrabajo' && activeBoardId);

  /** Calendario horizontal con tablero: sin barra global ni bottom nav; ancho completo del viewport. */
  const calendarImmersiveLandscape =
    isDocsMobile && activePage === 'calendar' && isLandscape && activeBoardId != null;
  /** Móvil en horizontal: sin barra inferior fija para ganar altura (navegación vía header / menú). */
  const mobileLandscapeChrome = isDocsMobile && isLandscape;
  const hideMobileMainBottomPad =
    activePage === 'docs' || calendarImmersiveLandscape || mobileLandscapeChrome;
  useEffect(() => {
    if (!shellBoardView) return;
    const el = mobileHeaderRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setMobileHeaderHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [shellBoardView]);

  const [calculatorExpression, setCalculatorExpression] = useState('');
  const [calculatorResult, setCalculatorResult] = useState<string | null>(null);
  const [calculatorError, setCalculatorError] = useState<string | null>(null);
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);

  // Tareas personales (panel-notes) por workspace, visibles en Docs
  interface TaskItem {
    id: string;
    text: string;
    done: boolean;
    important?: boolean;
  }
  interface ReminderItem {
    id: string;
    title: string;
    dueAt: string;
    done: boolean;
  }

  interface TaskWindow {
    id: string;
    title: string;
    ownerId?: string;
    color?: string;
    tasks: TaskItem[];
    reminders?: ReminderItem[];
    reminderDraftTitle?: string;
    reminderDraftDueAt?: string;
    // UI-only: controla si el formulario de añadir aparece colapsado o no
    reminderComposerOpen?: boolean;
    kind?: 'tasks' | 'calculator' | 'reminders';
  }

  const TASK_WINDOW_COLORS = [
    '#fef08a', '#fde047', '#facc15', '#bbf7d0', '#86efac', '#4ade80',
    '#bfdbfe', '#93c5fd', '#60a5fa', '#fbcfe8', '#f9a8d4', '#e9d5ff', '#d8b4fe',
    '#fed7aa', '#fdba74', '#fb923c',
  ];
  const DEFAULT_TASK_WINDOW_COLOR = '#fef08a';

  const pickContrastingTextColor = (bg?: string) => {
    const raw = (bg ?? '').trim();
    const hex = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#0b1220';
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.55 ? '#0b1220' : '#fafafa';
  };

  const isLightNoteBackground = (bg?: string) => {
    const raw = (bg ?? '').trim();
    const hex = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return true;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.55;
  };

  const formatReminderDueAt = (dueAt: string) => {
    const s = String(dueAt ?? '').trim();
    if (!s) return '';
    const dt = new Date(s);
    if (!Number.isFinite(dt.getTime())) return s;
    // Formato corto tipo “dd/mm/aaaa --:--”
    const date = dt.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} ${time}`;
  };

  /** Valor para input datetime-local (YYYY-MM-DDTHH:mm) desde texto o ISO guardado. */
  const toDatetimeLocalValue = (raw: string): string => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [taskWindows, setTaskWindows] = useState<TaskWindow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const taskWindowsRef = useRef<TaskWindow[]>([]);
  taskWindowsRef.current = taskWindows;
  const reminderDatetimeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const savePanelNotesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnreadNotifications = React.useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const userId = currentUser.id;

      const getMentionsReadAtKey = (uid: string) => `sunday_mentions_read_at_${uid}`;
      const getMentionsReadAt = (uid: string) => {
        try {
          const raw = localStorage.getItem(getMentionsReadAtKey(uid));
          const parsed = raw == null ? 0 : Number(raw);
          return Number.isFinite(parsed) ? parsed : 0;
        } catch {
          return 0;
        }
      };

      const mentionsReadAt = getMentionsReadAt(userId);
      const isMentionRead = (createdAt: string) => {
        const ts = new Date(createdAt).getTime();
        if (!Number.isFinite(ts)) return true;
        return ts <= mentionsReadAt;
      };

      const [summaryRes, mentionsRes] = await Promise.all([
        apiFetch(`${API_BASE}/api/notifications/unread-summary`, { silent: true }),
        apiFetch(`${API_BASE}/api/feed?filter=mentions&userId=${encodeURIComponent(userId)}`),
      ]);

      let unreadAssignments = 0;
      if (summaryRes.ok) {
        const s = await summaryRes.json();
        unreadAssignments = typeof s.unreadCount === 'number' ? s.unreadCount : 0;
        setRecentUnreadNotif(Boolean(s.recentUnread));
      } else {
        setRecentUnreadNotif(false);
      }

      let unreadMentions = 0;
      if (mentionsRes.ok) {
        const data = await mentionsRes.json();
        const mentions = Array.isArray(data) ? data : [];
        unreadMentions = mentions.filter((m: { createdAt?: string }) => {
          if (!m.createdAt) return false;
          return !isMentionRead(m.createdAt);
        }).length;
      }

      setUnreadNotifCount(unreadAssignments + unreadMentions);
    } catch {
      // ignore
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchUnreadNotifications();
  }, [fetchUnreadNotifications]);

  useEffect(() => {
    if (!currentUser) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentUser]);

  // iOS/Android (cuando el navegador soporta Badging API):
  // mostrar contador en el ícono de la app con notificaciones sin leer.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const navAny = navigator as any;
    const setAppBadge = typeof navAny.setAppBadge === 'function' ? navAny.setAppBadge : null;
    const clearAppBadge = typeof navAny.clearAppBadge === 'function' ? navAny.clearAppBadge : null;
    if (!setAppBadge && !clearAppBadge) return;

    const count = Math.max(0, unreadNotifCount ?? 0);
    try {
      if (count === 0 && clearAppBadge) {
        clearAppBadge.call(navAny).catch(() => {});
      } else if (setAppBadge) {
        Promise.resolve(setAppBadge.call(navAny, count)).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [unreadNotifCount]);

  useEffect(() => {
    if (!currentUser?.id) return;
    // FIX 1: socket.off(event) sin handler borra listeners de otros componentes (p. ej. NotificationDropdown).
    const onNotificationCreated = (notif: { userId: string }) => {
      if (notif.userId === currentUser.id) fetchUnreadNotifications();
    };
    socket.on('notification_created', onNotificationCreated);
    return () => {
      socket.off('notification_created', onNotificationCreated);
    };
  }, [currentUser?.id, fetchUnreadNotifications]);

  // Carga y guardado de tareas (panel-notes) por workspace; solo las del usuario actual
  const savePanelNotesToApi = React.useCallback((notes: TaskWindow[], wid: string) => {
    if (!currentUser?.id) return;
    const toSave = notes.map(n => ({
      id: n.id,
      title: n.title,
      kind: n.kind ?? 'tasks',
      ownerId: n.ownerId ?? currentUser.id,
      color: n.color,
      tasks: (n.tasks ?? []).map(t => ({
        id: t.id,
        text: t.text,
        done: t.done,
        important: t.important,
      })),
      reminders: (n.reminders ?? []).map(r => ({
        id: r.id,
        title: r.title,
        dueAt: r.dueAt,
        done: r.done,
      })),
      reminderDraftTitle: n.reminderDraftTitle ?? '',
      reminderDraftDueAt: n.reminderDraftDueAt ?? '',
    }));
    apiFetch(`${API_BASE}/api/workspaces/${wid}/panel-notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panelNotes: toSave, userId: currentUser.id }),
    }).catch(err => console.error('Panel notes save failed:', err));
  }, [currentUser?.id]);

  const scheduleSavePanelNotes = React.useCallback(() => {
    if (!effectiveDocsWorkspaceId) return;
    if (savePanelNotesTimeoutRef.current) {
      clearTimeout(savePanelNotesTimeoutRef.current);
    }
    savePanelNotesTimeoutRef.current = setTimeout(() => {
      savePanelNotesTimeoutRef.current = null;
      if (effectiveDocsWorkspaceId) {
        savePanelNotesToApi(taskWindowsRef.current, effectiveDocsWorkspaceId);
      }
    }, 500);
  }, [effectiveDocsWorkspaceId, savePanelNotesToApi]);

  useEffect(() => {
    if (!effectiveDocsWorkspaceId || !currentUser?.id) {
      setTaskWindows([]);
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    const url = `${API_BASE}/api/workspaces/${effectiveDocsWorkspaceId}/panel-notes?userId=${encodeURIComponent(currentUser.id)}`;
    apiFetch(url)
      .then(r => r.json())
      .then(data => {
        const raw = Array.isArray(data?.panelNotes) ? data.panelNotes : [];
        const normalized: TaskWindow[] = raw
          .filter((item: any) => !item || !item.ownerId || String(item.ownerId) === currentUser.id)
          .map((item: any, index: number) => ({
            id: typeof item.id === 'string' ? item.id : `w-${index}`,
            title: typeof item.title === 'string' ? item.title : 'Mis tareas',
            ownerId: typeof item.ownerId === 'string' ? item.ownerId : currentUser.id,
            color: typeof item.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : DEFAULT_TASK_WINDOW_COLOR,
            kind: item.kind === 'calculator' ? 'calculator' : item.kind === 'reminders' ? 'reminders' : 'tasks',
            tasks: Array.isArray(item.tasks)
              ? item.tasks.map((t: any, i: number) => ({
                  id: typeof t.id === 'string' ? t.id : `t-${i}`,
                  text: typeof t.text === 'string' ? t.text : '',
                  done: !!t.done,
                  important: !!t.important,
                }))
              : [],
            reminders: Array.isArray(item.reminders)
              ? item.reminders.map((r: any, i: number) => ({
                  id: typeof r.id === 'string' ? r.id : `r-${i}`,
                  title: typeof r.title === 'string' ? r.title : '',
                  dueAt: typeof r.dueAt === 'string' ? r.dueAt : '',
                  done: !!r.done,
                }))
              : [],
            reminderDraftTitle: typeof item.reminderDraftTitle === 'string' ? item.reminderDraftTitle : '',
            reminderDraftDueAt: typeof item.reminderDraftDueAt === 'string' ? item.reminderDraftDueAt : '',
          }));
        setTaskWindows(normalized);
      })
      .catch(() => setTaskWindows([]))
      .finally(() => setTasksLoading(false));
  }, [effectiveDocsWorkspaceId, currentUser?.id]);

  // Flush de tareas al cambiar workspace o cerrar pestaÃƒÂ±a
  useEffect(() => {
    return () => {
      if (savePanelNotesTimeoutRef.current) {
        clearTimeout(savePanelNotesTimeoutRef.current);
        savePanelNotesTimeoutRef.current = null;
      }
      if (effectiveDocsWorkspaceId && taskWindowsRef.current.length >= 0) {
        savePanelNotesToApi(taskWindowsRef.current, effectiveDocsWorkspaceId);
      }
    };
  }, [effectiveDocsWorkspaceId, savePanelNotesToApi]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (effectiveDocsWorkspaceId && taskWindowsRef.current.length >= 0) {
        savePanelNotesToApi(taskWindowsRef.current, effectiveDocsWorkspaceId);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [effectiveDocsWorkspaceId, savePanelNotesToApi]);

  // Navegación desde columnas de Docs / Facturación hacia la pestaña interna de Docs
  useEffect(() => {
    const handler = (event: Event) => {
      const ev = event as CustomEvent<{
        type: 'cotizacion' | 'levantamiento' | 'hoja_trabajo' | 'text' | 'sheet';
        boardId: string;
        itemId: string;
        columnId: string;
      }>;
      setActivePage('docs');
      if (ev.detail?.boardId) {
        setActiveBoardId(ev.detail.boardId);
      }
      if (ev.detail?.columnId) {
        setPendingDocFromBoard(ev.detail);
      }
    };
    window.addEventListener('sunday:create-doc-from-board', handler as EventListener);
    return () => window.removeEventListener('sunday:create-doc-from-board', handler as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const createType = url.searchParams.get('docsCreate');
    if (!createType) return;
    const validTypes: DocType[] = ['text', 'sheet', 'cotizacion', 'levantamiento', 'hoja_trabajo'];
    if (!validTypes.includes(createType as DocType)) return;
    setActivePage('docs');
    setPendingCreateDocType(createType as DocType);
    url.searchParams.delete('docsCreate');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const ev = event as CustomEvent<{ docId: string }>;
      if (ev.detail?.docId) {
        setActivePage('docs');
        setOpenDocId(ev.detail.docId);
      }
    };
    window.addEventListener('sunday:open-doc', handler as EventListener);
    return () => window.removeEventListener('sunday:open-doc', handler as EventListener);
  }, []);

  /** Cotizador → crear doc de cotización en Docs con las mismas líneas. */
  useEffect(() => {
    const handler = (event: Event) => {
      const ev = event as CustomEvent<CotizacionDocsPrefill>;
      const d = ev.detail;
      if (!d?.id || !Array.isArray(d.items) || d.items.length === 0) return;
      setActivePage('docs');
      setPendingCotizacionDocsPrefill(d);
    };
    window.addEventListener('sunday:cotizacion-to-docs', handler as EventListener);
    return () => window.removeEventListener('sunday:cotizacion-to-docs', handler as EventListener);
  }, []);

  const hydrateFromBootstrap = React.useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/api/bootstrap`);
    if (!res.ok) return null;
    const payload = (await res.json()) as { workspaces?: Workspace[]; boards?: Board[] };
    const ws = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    const bs = Array.isArray(payload.boards) ? payload.boards : [];
    return { workspaces: ws, boards: bs };
  }, []);

  // Load workspaces once user is available (ruta relativa en DEV para usar proxy Vite → backend)
  useEffect(() => {
    if (!currentUser) {
      setWorkspacesLoaded(false);
      return;
    }
    apiFetch(`${API_BASE}/api/workspaces`)
      .then(r => (r.ok ? r.json() : Promise.resolve(null)))
      .then(async (data: Workspace[] | null) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setWorkspaces(data);
          setActiveWorkspaceId(prev => {
            if (prev && data.some(w => w.id === prev)) return prev;
            return data[0]?.id ?? null;
          });
          return;
        }

        // Fallback agresivo para móvil: si /api/workspaces falla o llega vacío,
        // hidratar desde /api/bootstrap y no dejar la UI en blanco.
        const fallback = await hydrateFromBootstrap().catch(() => null);
        if (!fallback) {
          setWorkspaces([]);
          return;
        }
        setWorkspaces(fallback.workspaces);
        if (fallback.boards.length > 0) {
          setBoards(fallback.boards);
          setActiveBoardId(prev => (prev && fallback.boards.some(b => b.id === prev) ? prev : fallback.boards[0]?.id ?? null));
        }
        setActiveWorkspaceId(prev => {
          if (prev && fallback.workspaces.some(w => w.id === prev)) return prev;
          if (fallback.workspaces[0]?.id) return fallback.workspaces[0].id;
          return fallback.boards[0]?.workspaceId ?? null;
        });
      })
      .catch(async err => {
        console.error('Error fetching workspaces:', err);
        const fallback = await hydrateFromBootstrap().catch(() => null);
        if (fallback) {
          setWorkspaces(fallback.workspaces);
          if (fallback.boards.length > 0) {
            setBoards(fallback.boards);
            setActiveBoardId(prev => (prev && fallback.boards.some(b => b.id === prev) ? prev : fallback.boards[0]?.id ?? null));
          }
          setActiveWorkspaceId(prev => {
            if (prev && fallback.workspaces.some(w => w.id === prev)) return prev;
            if (fallback.workspaces[0]?.id) return fallback.workspaces[0].id;
            return fallback.boards[0]?.workspaceId ?? null;
          });
        } else {
          setWorkspaces([]);
        }
      })
      .finally(() => {
        setWorkspacesLoaded(true);
      });
  }, [currentUser, hydrateFromBootstrap]);

  // Persistir última visita y recientes para "Retoma" y carrusel "Visitado recientemente" (móvil / Inicio)
  const RECENT_VISITS_KEY = 'sunday-recent-visits';
  const LAST_BOARD_KEY = 'sunday-last-board';
  const LAST_WORKSPACE_KEY = 'sunday-last-workspace';
  useEffect(() => {
    if (!activeWorkspaceId) return;
    try {
      if (activeBoardId) {
        localStorage.setItem(LAST_BOARD_KEY, activeBoardId);
        localStorage.setItem(LAST_WORKSPACE_KEY, activeWorkspaceId);
        const raw = localStorage.getItem(RECENT_VISITS_KEY);
        const prev = raw ? JSON.parse(raw) as { boardIds?: string[]; workspaceIds?: string[] } : {};
        const boardIds = Array.isArray(prev.boardIds) ? prev.boardIds : [];
        const nextBoardIds = [activeBoardId, ...boardIds.filter(id => id !== activeBoardId)].slice(0, 12);
        const workspaceIds = Array.isArray(prev.workspaceIds) ? prev.workspaceIds : [];
        const nextWorkspaceIds = [activeWorkspaceId, ...workspaceIds.filter(id => id !== activeWorkspaceId)].slice(0, 12);
        localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify({ boardIds: nextBoardIds, workspaceIds: nextWorkspaceIds }));
      } else {
        localStorage.setItem(LAST_WORKSPACE_KEY, activeWorkspaceId);
        const raw = localStorage.getItem(RECENT_VISITS_KEY);
        const prev = raw ? JSON.parse(raw) as { boardIds?: string[]; workspaceIds?: string[] } : {};
        const workspaceIds = Array.isArray(prev.workspaceIds) ? prev.workspaceIds : [];
        const nextWorkspaceIds = [activeWorkspaceId, ...workspaceIds.filter(id => id !== activeWorkspaceId)].slice(0, 12);
        localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify({ ...prev, workspaceIds: nextWorkspaceIds }));
      }
    } catch { /* ignore */ }
  }, [activeBoardId, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId || !currentUser) {
      setPaletteDocs([]);
      return;
    }
    apiFetch(`${API_BASE}/api/docs?workspaceId=${encodeURIComponent(activeWorkspaceId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; title: string }[]) => {
        if (Array.isArray(data)) {
          setPaletteDocs(data.map((d) => ({ id: d.id, title: d.title })));
        }
      })
      .catch(() => setPaletteDocs([]));
  }, [activeWorkspaceId, currentUser?.id]);

  // Load boards for active workspace (ruta relativa en DEV para usar proxy Vite → backend)
  useEffect(() => {
    if (!currentUser) {
      setBoardsLoaded(false);
      return;
    }
    const url = activeWorkspaceId
      ? `${API_BASE}/api/boards?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
      : `${API_BASE}/api/boards`;

    setBoardsLoaded(false);
    apiFetch(url)
      .then(r => (r.ok ? r.json() : Promise.resolve(null)))
      .then(async (data: Board[] | null) => {
        if (data && Array.isArray(data)) {
          setBoards(data);
          setActiveBoardId(prev => {
            if (data.length === 0) return null;
            const exists = prev && data.some(b => b.id === prev);
            return exists ? prev : null;
          });
          return;
        }
        const fallback = await hydrateFromBootstrap().catch(() => null);
        const fbBoards = fallback?.boards ?? [];
        const filtered = activeWorkspaceId ? fbBoards.filter((b) => b.workspaceId === activeWorkspaceId) : fbBoards;
        if (filtered.length > 0) {
          setBoards(filtered);
          setActiveBoardId(prev => (prev && filtered.some(b => b.id === prev) ? prev : filtered[0]?.id ?? null));
        }
      })
      .catch(async err => {
        console.error('Error fetching boards:', err);
        const fallback = await hydrateFromBootstrap().catch(() => null);
        const fbBoards = fallback?.boards ?? [];
        const filtered = activeWorkspaceId ? fbBoards.filter((b) => b.workspaceId === activeWorkspaceId) : fbBoards;
        if (filtered.length > 0) {
          setBoards(filtered);
          setActiveBoardId(prev => (prev && filtered.some(b => b.id === prev) ? prev : filtered[0]?.id ?? null));
        }
      })
      .finally(() => {
        setBoardsLoaded(true);
      });

    const onBoardRenamed = (updated: Board) => {
      setBoards(prev => prev.map(b => b.id === updated.id ? { ...b, name: updated.name } : b));
    };
    const onBoardAdded = (newBoard: Board) => {
      // Sólo añadimos automáticamente si pertenece al workspace activo (o si no hay ninguno activo)
      if (!activeWorkspaceId || newBoard.workspaceId === activeWorkspaceId) {
        setBoards(prev => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
      }
    };
    socket.on('board_renamed', onBoardRenamed);
    socket.on('board_added', onBoardAdded);
    return () => {
      socket.off('board_renamed', onBoardRenamed);
      socket.off('board_added', onBoardAdded);
    };
  }, [currentUser, activeWorkspaceId, hydrateFromBootstrap]);

  useEffect(() => {
    if (!currentUser) {
      setIsBootstrapping(false);
      return;
    }
    if (workspacesLoaded && boardsLoaded) {
      setIsBootstrapping(false);
    }
  }, [currentUser, workspacesLoaded, boardsLoaded]);

  if (!currentUser) {
    return <Login theme={theme} layout="vertical" />;
  }

  const activeWorkspaceName =
    workspaces.find(w => w.id === activeWorkspaceId)?.name || 'Main Workspace';
  const activeWorkspaceInitial =
    workspaces.find(w => w.id === activeWorkspaceId)?.name.charAt(0).toUpperCase() || 'M';

  const mobileCanGoBack =
    (activePage === 'board' && activeBoardId !== null) ||
    (activePage === 'miTrabajo' && activeBoardId !== null) ||
    activePage === 'calendar' ||
    activePage === 'docs' ||
    ['search', 'team', 'notifications', 'facturacion', 'cotizacion', 'tasks', 'inbox'].includes(activePage);

  const navIconSize = 22;
  const railAvatarSrc =
    currentUser?.avatarUrl != null && String(currentUser.avatarUrl).trim() !== ''
      ? currentUser.avatarUrl.startsWith('http')
        ? currentUser.avatarUrl
        : `${API_BASE}${currentUser.avatarUrl}`
      : null;

  const navIconsAll = [
    { id: 'board', icon: <Home size={navIconSize} strokeWidth={2.25} />, label: 'Inicio' },
    { id: 'calendar', icon: <Calendar size={navIconSize} strokeWidth={2.25} />, label: 'Calendario' },
    { id: 'inbox', icon: <Inbox size={navIconSize} strokeWidth={2.25} />, label: 'Bandeja' },
    { id: 'search', icon: <Search size={navIconSize} strokeWidth={2.25} />, label: 'Buscar' },
    { id: 'docs', icon: <BookOpen size={navIconSize} strokeWidth={2.25} />, label: 'Docs' },
    ...(SHOW_COTIZACIONES_NAV
      ? [{ id: 'cotizacion' as const, icon: <FileText size={navIconSize} strokeWidth={2.25} />, label: 'Cotizaciones' }]
      : []),
    { id: 'tasks', icon: <ListTodo size={navIconSize} strokeWidth={2.25} />, label: 'Tareas' },
    { id: 'team', icon: <Users size={navIconSize} strokeWidth={2.25} />, label: 'Equipo' },
  ];
  const navIcons = isTaller
    ? navIconsAll.filter(n => n.id === 'board' || n.id === 'calendar' || n.id === 'tasks')
    : navIconsAll;

  const handleCreateBoard = async () => {
    if (!canCreateBoard) return;
    const name = newBoardName.trim() || 'Nuevo tablero';
    if (!name) return;
    setCreatingBoard(true);
    setCreateBoardError(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/boards`, {
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
      setShowCreateBoardModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear el tablero';
      const isNetwork =
        err instanceof TypeError ||
        (typeof message === 'string' && (message.includes('fetch') || message.includes('network')));
      setCreateBoardError(
        isNetwork
          ? 'No se pudo conectar con el servidor. Comprueba que el backend estÃƒÂ© en marcha (puerto 3001).'
          : message
      );
      console.error('Error creating board:', err);
    } finally {
      setCreatingBoard(false);
    }
  };

  const addTaskWindow = () => {
    if (!effectiveDocsWorkspaceId || !currentUser?.id) return;
    const newWindow: TaskWindow = {
      id: crypto.randomUUID(),
      title: 'Mis tareas',
      kind: 'tasks',
      ownerId: currentUser.id,
      color: DEFAULT_TASK_WINDOW_COLOR,
      tasks: [],
    };
    setTaskWindows(prev => [...prev, newWindow]);
    scheduleSavePanelNotes();
  };

  const updateTaskWindow = (id: string, patch: Partial<TaskWindow>) => {
    setTaskWindows(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, ...patch } : n));
      scheduleSavePanelNotes();
      return next;
    });
  };

  const removeTaskWindow = (id: string) => {
    setTaskWindows(prev => {
      const next = prev.filter(n => n.id !== id);
      scheduleSavePanelNotes();
      return next;
    });
  };

  const ensureCalculatorVisible = () => {
    if (!currentUser?.id) return;
    setTaskWindows(prev => {
      const alreadyHasCalculator = prev.some(
        w => (w.kind === 'calculator') && (w.ownerId ?? currentUser.id) === currentUser.id,
      );
      if (alreadyHasCalculator) return prev;
      const calcWindow: TaskWindow = {
        id: crypto.randomUUID(),
        title: 'Calculadora',
        kind: 'calculator',
        ownerId: currentUser.id,
        color: '#ffffff',
        tasks: [],
      };
      const next = [...prev, calcWindow];
      scheduleSavePanelNotes();
      return next;
    });
  };

  const ensureReminderWidgetVisible = () => {
    if (!currentUser?.id) return;
    setTaskWindows(prev => {
      const alreadyHasReminder = prev.some(
        w => (w.kind === 'reminders') && (w.ownerId ?? currentUser.id) === currentUser.id,
      );
      if (alreadyHasReminder) return prev;
      const reminderWindow: TaskWindow = {
        id: crypto.randomUUID(),
        title: 'Recordatorios',
        kind: 'reminders',
        ownerId: currentUser.id,
        color: DEFAULT_TASK_WINDOW_COLOR,
        tasks: [],
        reminders: [],
        reminderDraftTitle: '',
        reminderDraftDueAt: '',
        reminderComposerOpen: false,
      };
      const next = [...prev, reminderWindow];
      scheduleSavePanelNotes();
      return next;
    });
  };

  const evaluateCalculator = () => {
    const raw = calculatorExpression.trim();
    if (!raw) {
      setCalculatorResult(null);
      setCalculatorError(null);
      return;
    }

    const expr = raw.replace(/,/g, '.').replace(/\s+/g, '');
    if (!/^[0-9+\-*/().]+$/.test(expr)) {
      setCalculatorResult('Error');
      setCalculatorError('Solo se permiten números, +, -, *, / y paréntesis.');
      return;
    }

    try {
      const tokens: string[] = [];
      let rest = expr;
      while (rest.length > 0) {
        const numMatch = rest.match(/^\d+(?:\.\d+)?/);
        const opMatch = rest.match(/^([+\-*/()])/);
        if (numMatch) {
          tokens.push(numMatch[0]);
          rest = rest.slice(numMatch[0].length);
        } else if (opMatch) {
          tokens.push(opMatch[1]);
          rest = rest.slice(1);
        } else {
          setCalculatorResult('Error');
          setCalculatorError('Expresión no válida.');
          return;
        }
      }

      const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
      const output: string[] = [];
      const ops: string[] = [];

      for (const t of tokens) {
        if (t === '(') {
          ops.push(t);
        } else if (t === ')') {
          while (ops.length && ops[ops.length - 1] !== '(') {
            output.push(ops.pop()!);
          }
          ops.pop();
        } else if (precedence[t] != null) {
          while (ops.length && precedence[ops[ops.length - 1]] >= precedence[t]) {
            output.push(ops.pop()!);
          }
          ops.push(t);
        } else {
          output.push(t);
        }
      }
      while (ops.length) output.push(ops.pop()!);

      const stack: number[] = [];
      for (const t of output) {
        if (t === '+' || t === '-' || t === '*' || t === '/') {
          const b = stack.pop();
          const a = stack.pop();
          if (a == null || b == null) {
            setCalculatorResult('Error');
            setCalculatorError('Expresión incompleta.');
            return;
          }
          if (t === '+') stack.push(a + b);
          if (t === '-') stack.push(a - b);
          if (t === '*') stack.push(a * b);
          if (t === '/') {
            if (b === 0) {
              setCalculatorResult('Error');
              setCalculatorError('No se puede dividir entre 0.');
              return;
            }
            stack.push(a / b);
          }
        } else {
          const n = parseFloat(t);
          if (Number.isNaN(n)) {
            setCalculatorResult('Error');
            setCalculatorError('Número no válido.');
            return;
          }
          stack.push(n);
        }
      }

      if (stack.length !== 1) {
        setCalculatorResult('Error');
        setCalculatorError('Expresión no válida.');
        return;
      }

      const result = stack[0];
      if (!Number.isFinite(result)) {
        setCalculatorResult('Error');
        setCalculatorError('Resultado no válido.');
        return;
      }

      const display =
        Number.isInteger(result) ? result.toString() : result.toFixed(4).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
      setCalculatorExpression(display);
      setCalculatorResult(null);
      setCalculatorError(null);
    } catch {
      setCalculatorResult('Error');
      setCalculatorError('No se pudo evaluar la expresión.');
    }
  };

  const isPdfPreviewRoute = typeof window !== 'undefined' && window.location.pathname === '/docs/pdf-preview';
  if (isPdfPreviewRoute) {
    return (
      <div className="min-h-screen bg-gray-100" style={{ margin: 0, padding: 0 }}>
        <DocsPdfPreviewPage />
      </div>
    );
  }

  const exportRouteParams = (() => {
    if (typeof window === 'undefined') return null;
    if (window.location.pathname !== '/docs/export') return null;
    const p = new URLSearchParams(window.location.search);
    const docId = p.get('docId');
    const token = p.get('token');
    const contentKey = p.get('contentKey') || null;
    const scaleParam = p.get('scale');
    const exportScale = scaleParam != null && !Number.isNaN(Number(scaleParam)) ? Number(scaleParam) : null;
    return docId && token ? { docId, token, contentKey, exportScale } : null;
  })();

  if (exportRouteParams) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" style={{ margin: 0, padding: 0 }}>
        <DocsExportPreviewPage
          docId={exportRouteParams.docId}
          token={exportRouteParams.token}
          contentKey={exportRouteParams.contentKey}
          exportScale={exportRouteParams.exportScale}
        />
      </div>
    );
  }

  const routeTree = (
    <>
          {activePage === 'home' ? (
            isDocsMobile ? (
              <MobileHomePage
                userName={currentUser?.name ?? currentUser?.username ?? null}
                onOpenSearch={() => {
                  setActivePage('search');
                  setSidebarOpen(false);
                }}
                onOpenKanban={() => {
                  if (!activeBoardId && boards.length > 0) setActiveBoardId(boards[0].id);
                  setCurrentView('kanban');
                  setActivePage('board');
                  setSidebarOpen(false);
                }}
                onOpenBoardsOverview={() => {
                  setActiveBoardId(null);
                  setActivePage('board');
                  setSidebarOpen(false);
                }}
                onOpenDocs={() => {
                  setActivePage('docs');
                  setSidebarOpen(false);
                }}
              />
            ) : (
              <TodayPage
                onGoSearch={() => {
                  setActivePage('search');
                  setSidebarOpen(false);
                }}
                onGoKanban={() => {
                  // En Inicio, abrir directamente el Kanban del tablero actual (o el primero disponible).
                  if (!activeBoardId && boards.length > 0) {
                    setActiveBoardId(boards[0].id);
                  }
                  setCurrentView('kanban');
                  setActivePage('board');
                  setSidebarOpen(false);
                }}
                onGoInbox={() => {
                  setActivePage('inbox');
                  setSidebarOpen(false);
                }}
                onGoDocs={() => {
                  setActivePage('docs');
                  setSidebarOpen(false);
                }}
              />
            )
          ) : activePage === 'calendar' && !isDocsMobile ? (
            <>
              <header className="shrink-0 border-b border-monday-border bg-white">
                <div className="h-14 flex items-center px-4 sm:px-6 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar size={20} className="text-monday-blue shrink-0" />
                    <span className="text-[18px] font-semibold text-monday-text truncate">Calendario</span>
                  </div>
                  <Popover.Root open={calendarBoardPickerOpen} onOpenChange={setCalendarBoardPickerOpen}>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-2 rounded-monday border border-monday-border bg-monday-pill/50 hover:bg-monday-hover text-[13px] font-medium text-monday-text min-w-0 max-w-[220px] sm:max-w-[280px]"
                      >
                        <span className="truncate">
                          {activeBoardId ? (boards.find(b => b?.id === activeBoardId)?.name ?? 'Tablero') : 'Seleccionar tablero'}
                        </span>
                        <ChevronDown size={16} className="shrink-0 text-monday-subtext" />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-64 max-h-[60vh] overflow-y-auto p-1"
                        sideOffset={6}
                        align="start"
                      >
                        {boards.length === 0 ? (
                          <p className="px-3 py-2 text-[13px] text-monday-subtext">No hay tableros en este espacio.</p>
                        ) : (
                          boards.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => { setActiveBoardId(b.id); setCalendarBoardPickerOpen(false); }}
                              className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                                activeBoardId === b.id ? 'bg-monday-blue text-white' : 'text-monday-text hover:bg-monday-hover'
                              }`}
                            >
                              {b.name}
                            </button>
                          ))
                        )}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </header>
              {activeBoardId ? (
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <BoardContainer
                    boardId={activeBoardId}
                    onRowClick={setSelectedItem}
                    viewMode="calendar"
                    calendarStandalone
                    onBoardData={setActiveBoardData}
                  />
                </div>
              ) : boards.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-8">
                  <Calendar size={48} className="text-monday-subtext/50 mb-4" />
                  <p className="text-[15px] font-medium text-monday-text mb-2">No hay tableros</p>
                  <p className="text-[13px] text-center max-w-sm">Crea un tablero desde Inicio o el menú lateral para usar el calendario.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-8">
                  <Calendar size={48} className="text-monday-subtext/50 mb-4" />
                  <p className="text-[13px]">Selecciona un tablero en la barra superior para ver el calendario.</p>
                </div>
              )}
            </>
          ) : activePage === 'calendar' && isDocsMobile ? (
            activeBoardId ? (
              <div className="flex-1 flex flex-col min-h-0">
                <BoardContainer
                  boardId={activeBoardId}
                  onRowClick={setSelectedItem}
                  viewMode="calendar"
                  mobileCalendarOnly
                  isMobile={isDocsMobile}
                  onBoardData={setActiveBoardData}
                />
              </div>
            ) : boards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-6">
                <p className="text-[15px] font-medium text-monday-text mb-2">No hay tableros</p>
                <p className="text-[13px]">Crea un tablero desde el menú Más para usar el calendario.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-6">
                <p className="text-[13px]">Selecciona un tablero desde Inicio o el menú (icono de menú).</p>
              </div>
            )
          ) : isDocsMobile && !isBootstrapping && (activePage === 'board' && activeBoardId || activePage === 'miTrabajo' && activeBoardId) ? (
            <>
              <motion.div
                className="min-h-0 overflow-hidden shrink-0"
                animate={{ height: mobileHeaderHidden ? 0 : mobileHeaderHeight }}
                initial={false}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <div ref={mobileHeaderRef}>
                  <MobileBoardHeaderMinimal
                    boardName={boards.find(b => b?.id === activeBoardId)?.name ?? ''}
                    onRename={() => {
                      const board = boards.find(b => b?.id === activeBoardId);
                      if (board) { setBoardNameDraft(board.name); setEditingBoardName(true); }
                    }}
                    editingName={editingBoardName}
                    nameDraft={boardNameDraft}
                    onNameDraftChange={setBoardNameDraft}
                    onFinishEditName={() => {
                      setEditingBoardName(false);
                      if (boardNameDraft.trim() && activeBoardId) {
                        socket.emit('rename_board', { boardId: activeBoardId, name: boardNameDraft.trim() });
                        setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, name: boardNameDraft.trim() } : b));
                      }
                    }}
                    onOpenVistaSheet={() => setBoardVistaSheetOpen(true)}
                    currentViewLabel={VIEW_LABELS[activePage === 'miTrabajo' ? 'miTrabajo' : currentView]}
                    compact={isLandscapeShort}
                  />
                </div>
              </motion.div>
              {/* IMPORTANTE (scroll móvil): Cualquier wrapper nuevo que envuelva este contenido debe llevar min-h-0 para no romper la cadena flex/overflow y el scroll vertical. */}
              <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
                <BoardContainer
                  boardId={activeBoardId!}
                  onRowClick={setSelectedItem}
                  viewMode={activePage === 'miTrabajo' ? 'miTrabajo' : currentView}
                  mobileOptimized
                  isMobile={isDocsMobile}
                  onHeaderVisibilityChange={setMobileHeaderHidden}
                />
              </div>
              <BoardViewBottomSheet
                open={boardVistaSheetOpen}
                onOpenChange={setBoardVistaSheetOpen}
                currentView={activePage === 'miTrabajo' ? 'miTrabajo' : currentView}
                onChangeView={setCurrentView}
                enabledViews={enabledViews}
                onAddView={(view) => {
                  if (!enabledViews.includes(view)) {
                    setEnabledViews([...enabledViews, view]);
                    setCurrentView(view);
                  }
                }}
                canSeeFacturacion={!!canSeeFacturacionView}
                isTaller={!!isTaller}
                onToggleStar={undefined}
                onOpenSearch={() => { setActivePage('search'); }}
              />
            </>
          ) : activePage === 'miTrabajo' ? (
            <MiTrabajoPage
              workspace={workspaces.find(w => w.id === activeWorkspaceId) ?? null}
              workspaces={workspaces}
              boards={boards}
              activeBoardId={activeBoardId}
              onSelectBoard={setActiveBoardId}
              onRowClick={setSelectedItem}
            />
          ) : activePage === 'board' && !activeBoardId ? (
            isDocsMobile ? (
              <MobileBoardsOverview
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                boards={boards}
                onSelectWorkspace={(id) => {
                  setActiveWorkspaceId(id);
                  setActiveBoardId(null);
                }}
                onSelectBoard={(id) => {
                  setActiveBoardId(id);
                }}
              />
            ) : (
              <WorkspaceOverviewPage
                workspace={workspaces.find(w => w.id === activeWorkspaceId) ?? null}
                workspaces={workspaces}
                boards={boards}
                showAsHome
                onOpenSearch={() => setActivePage('search')}
                onRequestAddBoard={() => setShowAddBoard(true)}
                onSelectBoard={setActiveBoardId}
                onSelectWorkspace={(id) => {
                  setActiveWorkspaceId(id);
                  setActiveBoardId(null);
                }}
                onWorkspaceUpdated={(updated) => {
                  setWorkspaces(prev => prev.map(w => w.id === updated.id ? { ...w, ...updated } : w));
                }}
                onWorkspaceDeleted={() => {
                  apiFetch(`${API_BASE}/api/workspaces`)
                    .then(r => (r.ok ? r.json() : Promise.resolve(null)))
                    .then((data: Workspace[] | null) => {
                      if (!data || !Array.isArray(data)) return;
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
                    ? `${API_BASE}/api/boards?workspaceId=${encodeURIComponent(
                        activeWorkspaceId
                      )}`
                    : `${API_BASE}/api/boards`;

                  apiFetch(url)
                    .then(r => (r.ok ? r.json() : Promise.resolve(null)))
                    .then((data: Board[] | null) => {
                      if (!data || !Array.isArray(data)) return;
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
            )
          ) : activePage === 'board' && boards.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-8">
              <p className="text-[15px] font-medium text-monday-text mb-2">No hay tableros</p>
              <p className="text-[13px] mb-4 text-center max-w-sm">
                {canCreateBoard
                  ? 'Crea uno desde el menú de la izquierda con «Agregar tablero».'
                  : 'Pide a un administrador o al equipo de ventas que cree un tablero en este espacio.'}
              </p>
              {canCreateBoard && (
                <button
                  type="button"
                  onClick={() => setShowAddBoard(true)}
                  className="px-4 py-2 bg-monday-blue text-white text-[13px] font-medium rounded-monday hover:bg-monday-blue/90"
                >
                  <Plus size={16} className="inline mr-1.5 -mt-0.5" />
                  Agregar tablero
                </button>
              )}
            </div>
          ) : activePage === 'board' && activeBoardId ? (
            <>
              <header className="shrink-0 border-b border-monday-border">
                <div className="h-[56px] flex items-center px-4 sm:px-6 justify-between gap-2">
                  <div className="flex items-center gap-2">
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
                        className="text-[18px] sm:text-[20px] font-semibold text-monday-text cursor-pointer hover:bg-monday-hover rounded px-1 py-0.5 transition-colors truncate min-w-0 max-w-[180px] sm:max-w-none"
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
                    <button
                      type="button"
                      onClick={handleExportFolders}
                      disabled={!activeBoardId || exportingFolders}
                      className="toolbar-btn btn-export-folders"
                      title="Exportar estructura de carpetas del tablero"
                    >
                      <Folder size={16} />
                      <span>{exportingFolders ? 'Exportando...' : 'Exportar carpetas'}</span>
                    </button>
                    <div className="w-px h-5 bg-monday-border" />
                    <button
                      type="button"
                      onClick={() => { setActivePage('search'); }}
                      className="toolbar-btn"
                      title="Buscar en la aplicación"
                    >
                      <Search size={16} />
                      <span>Buscar</span>
                    </button>
                  </div>
                </div>

                <div
                  className="flex items-center px-4 sm:px-6 gap-1 text-[13px] min-w-0 overflow-x-auto overflow-y-hidden scroll-touch custom-scrollbar pr-2"
                  style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}
                >
                  <div className="flex gap-1 flex-nowrap pb-px min-h-[44px] items-center">
                  <DndContext sensors={boardTabSensors} collisionDetection={closestCenter} onDragEnd={handleBoardTabDragEnd}>
                    <SortableContext items={orderedBoardTabs} strategy={horizontalListSortingStrategy}>
                      {orderedBoardTabs.map((tabId, idx) => (
                        <div key={tabId} className="flex items-center gap-1">
                          <SortableBoardTab
                            tabId={tabId}
                            label={VIEW_TAB_META[tabId]}
                            isActive={currentView === tabId}
                            onSelect={setCurrentView}
                          />
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>
                  {!isTaller && (
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
                  )}
                  </div>
                </div>
              </header>

              <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
                <BoardContainer
                  boardId={activeBoardId}
                  onRowClick={setSelectedItem}
                  viewMode={currentView}
                  onBoardData={setActiveBoardData}
                />
              </div>
            </>
          ) : activePage === 'inbox' ? (
            <InboxPage
              onItemClick={setSelectedItem}
              initialUser={composeToUser}
              onClearInitialUser={() => setComposeToUser(null)}
              initialPostId={pendingInboxPostId}
              onClearInitialPostId={() => setPendingInboxPostId(null)}
            />
          ) : activePage === 'notifications' ? (
            <NotificationsPage
              onOpenItem={(item, boardId) => {
                setActivePage('board');
                setActiveBoardId(boardId);
                setSelectedItem(item);
              }}
              onOpenInbox={(opts) => {
                if (opts?.postId) setPendingInboxPostId(opts.postId);
                setActivePage('inbox');
              }}
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
            isDocsMobile ? (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center py-20 text-[13px] text-monday-subtext gap-2">
                    <div className="w-5 h-5 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
                    Cargando documentos…
                  </div>
                }
              >
                <MobileDocsHubLazy
                  workspaceId={activeWorkspaceId ?? workspaces[0]?.id ?? null}
                  boards={boards}
                  initialCreateFromBoard={pendingDocFromBoard}
                  onConsumeInitialCreateFromBoard={() => setPendingDocFromBoard(null)}
                  initialCreateDocType={pendingCreateDocType}
                  onConsumeInitialCreateDocType={() => setPendingCreateDocType(null)}
                  initialCotizacionCartPrefill={pendingCotizacionDocsPrefill}
                  onConsumeInitialCotizacionCartPrefill={() => setPendingCotizacionDocsPrefill(null)}
                  initialOpenDocId={openDocId}
                  onConsumeInitialOpenDocId={() => setOpenDocId(null)}
                  onAddReminderWidget={ensureReminderWidgetVisible}
                />
              </Suspense>
            ) : (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center py-20 text-[13px] text-monday-subtext">
                    Cargando documentos…
                  </div>
                }
              >
                <DocsPageLazy
                  workspaceId={activeWorkspaceId ?? workspaces[0]?.id ?? null}
                  boards={boards}
                  initialCreateFromBoard={pendingDocFromBoard}
                  onConsumeInitialCreateFromBoard={() => setPendingDocFromBoard(null)}
                  initialCreateDocType={pendingCreateDocType}
                  onConsumeInitialCreateDocType={() => setPendingCreateDocType(null)}
                  initialCotizacionCartPrefill={pendingCotizacionDocsPrefill}
                  onConsumeInitialCotizacionCartPrefill={() => setPendingCotizacionDocsPrefill(null)}
                  initialOpenDocId={openDocId}
                  onConsumeInitialOpenDocId={() => setOpenDocId(null)}
                  onAddTaskList={addTaskWindow}
                  onAddCalculatorWidget={ensureCalculatorVisible}
                  onAddReminderWidget={ensureReminderWidgetVisible}
                />
              </Suspense>
            )
          ) : activePage === 'team' ? (
            <TeamPage
              onOpenInboxForUser={(user) => {
                setComposeToUser(user);
                setActivePage('inbox');
              }}
            />
          ) : activePage === 'tasks' ? (
            <TasksPage />
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
              <p className="text-[14px]">Esta vista ({activePage}) estará disponible en futuras actualizaciones.</p>
            </div>
          )}

    </>
  );

  const chromeHidden = focusMode && !isDocsMobile;

  return (
    <div
      className={[
        'flex min-h-[100dvh] h-screen max-h-[100dvh] bg-monday-bg overflow-hidden font-sans',
        calendarImmersiveLandscape || mobileLandscapeChrome
          ? 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-0 pr-0'
          : 'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
      ].join(' ')}
    >
      {jwtIsExpiringSoon && !jwtIsExpired && (
        <div className="fixed top-0 left-0 right-0 z-[2100] flex justify-center pointer-events-none">
          <div className="mt-3 mx-3 pointer-events-auto bg-[#111827]/95 text-white border border-white/10 rounded-xl px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
            <div className="text-[13px] font-semibold">Aviso de sesión</div>
            <div className="text-[12px] mt-1 text-white/90">
              Tu sesión caduca en aprox. {jwtMinutesLeft ?? 'menos de 60'} min. Guarda tu trabajo.
            </div>
          </div>
        </div>
      )}

      {currentUser && (
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          boardNames={boards.map((b) => ({ id: b.id, name: b.name }))}
          workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
          docs={paletteDocs}
          itemEntries={commandPaletteItems}
          activeBoardId={activeBoardId}
          currentUser={{
            name: currentUser.name,
            username: currentUser.username,
            role: currentUser.role,
          }}
          currentTheme={theme}
          onSelectTheme={setTheme}
          onToggleLightDark={() => {
            setTheme((t) => (t === 'dark' || t === 'night' ? 'light' : 'dark'));
          }}
          onSelectBoard={(id) => {
            setActiveBoardId(id);
            setActivePage('board');
          }}
          onSelectItem={(itemId, boardId) => {
            setActiveBoardId(boardId);
            setActivePage('board');
            setSelectedItemObj(null);
            setSelectedItemIdState(itemId);
          }}
          onSelectDoc={(id) => {
            setOpenDocId(id);
            setActivePage('docs');
          }}
          onSelectWorkspace={(id) => {
            setActiveWorkspaceId(id);
            setActiveBoardId(null);
          }}
          onNavigate={(page) => {
            if (page === 'home') {
              setActivePage('home');
              setActiveBoardId(null);
            }
            if (page === 'notifications') setActivePage('notifications');
            if (page === 'inbox') setActivePage('inbox');
            if (page === 'search') setActivePage('search');
            if (page === 'docs') setActivePage('docs');
            if (page === 'calendar') {
              setActivePage('calendar');
              if (boards.length > 0 && !activeBoardId) setActiveBoardId(boards[0].id);
            }
            if (page === 'miTrabajo') setActivePage('miTrabajo');
            if (page === 'team') setActivePage('team');
          }}
          onQuickNav={(dest) => {
            if (dest === 'inicio') {
              setActivePage('home');
              setActiveBoardId(null);
            }
            if (dest === 'calendario') {
              setActivePage('calendar');
              if (boards.length > 0 && !activeBoardId) setActiveBoardId(boards[0].id);
            }
            if (dest === 'mi-trabajo') setActivePage('miTrabajo');
            if (dest === 'docs') setActivePage('docs');
          }}
          onNewItem={() => {
            window.dispatchEvent(new CustomEvent('sunday-fab-add-item'));
          }}
          onOpenAccount={() => setShowUserPanel(true)}
          onExportBoard={() => {
            const src = activeBoardData ?? boards.find((b) => b.id === activeBoardId);
            if (src && src.groups?.length >= 0) {
              exportBoardToExcel(src);
            } else {
              toast('No hay tablero cargado para exportar.', 'info');
            }
          }}
          onGlobalSearch={(q) => {
            try {
              sessionStorage.setItem('sunday-search-prefill', q);
            } catch {
              /* ignore */
            }
            setActivePage('search');
          }}
          onLogout={() => {
            logout();
          }}
          canOpenAdmin={currentUser?.role === 'ADMIN'}
          onOpenAdmin={() => setShowAdminPanel(true)}
        />
      )}

      {jwtIsExpired && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-black/10 overflow-hidden">
            <div className="p-5 bg-[#111827] text-white">
              <div className="text-[14px] font-semibold">Sesión expirada</div>
              <div className="text-[12px] opacity-90 mt-1">Inicia sesión nuevamente para continuar.</div>
            </div>
            <div className="p-5">
              <div className="text-[13px] text-[#111827]/80 leading-relaxed">
                Por seguridad, tu sesión expiró. Guarda tu información y vuelve a entrar.
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  className="px-4 py-2 rounded-lg border border-black/10 text-[#111827] bg-white hover:bg-[#f3f4f6]"
                  onClick={() => {
                    try { sessionStorage.setItem('logout_reason', 'session_expired'); } catch {/* ignore */}
                    try { window.location.href = '/'; } catch {/* ignore */}
                  }}
                >
                  Ir a login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drawer "Más" en móvil (sustituye sidebar + rail) */}
      {isDocsMobile && (
        <MobileMoreDrawer
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          activeWorkspaceName={activeWorkspaceName}
          onSelectWorkspace={(id) => {
            setActiveWorkspaceId(id);
            setActiveBoardId(null);
          }}
          theme={theme}
          onThemeChange={setTheme}
          userPanelTrigger={
            currentUser ? (
              <button
                type="button"
                className="w-full flex items-center gap-2 min-h-[44px] px-2.5 rounded-2xl text-monday-text hover:bg-monday-hover/80 active:bg-monday-hover transition-colors text-left"
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                  style={{ backgroundColor: currentUser.color }}
                >
                  {currentUser.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-monday-subtext uppercase tracking-wide leading-tight">
                    Cuenta
                  </div>
                  <div className="text-[13px] font-semibold text-monday-text truncate leading-snug">
                    {currentUser.name || currentUser.username}
                  </div>
                </div>
              </button>
            ) : (
              <span />
            )
          }
          userPanelOpen={showUserPanel}
          onUserPanelOpenChange={setShowUserPanel}
          boardsCount={boards.length}
          workspaceName={activeWorkspaceName}
          onOpenAdmin={() => setShowAdminPanel(true)}
          onOpenCommandPalette={() => {
            window.setTimeout(() => setCommandPaletteOpen(true), 200);
          }}
          boards={boards}
          boardSearch={boardSearch}
          onBoardSearchChange={setBoardSearch}
          activeBoardId={activeBoardId}
          onSelectBoard={setActiveBoardId}
          onNavigate={(page) => {
            if (page === 'docs') setActivePage('docs');
            else if (page === 'team') setActivePage('team');
            else if (page === 'facturacion') setActivePage('facturacion');
            else if (page === 'tasks') setActivePage('tasks');
          }}
          canSeeFacturacion={!!canSeeFacturacionView}
          isTaller={!!isTaller}
          canCreateBoard={canCreateBoard}
          onRequestAddBoard={() => setShowAddBoard(true)}
          reserveBottomNavSpace={activePage !== 'docs' && !mobileLandscapeChrome}
        />
      )}
      {/* Left Nav Rail (solo desktop) */}
      {!isDocsMobile && (
      <aside
        className={`w-[56px] min-w-[56px] bg-black flex flex-col items-center py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] gap-1 z-30 ${chromeHidden ? 'hidden' : ''}`}
      >
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 overflow-hidden">
          <AnimatedLogo size={40} color="#f8fafc" />
        </div>
        <div className="w-8 h-px bg-white/10 mb-3" />

        {!isDocsMobile &&
          navIcons.map(({ id, icon, label }) => (
            <button
              key={id}
              title={label}
              onClick={() => {
                if (id === 'board') {
                  setActivePage('board');
                  setActiveBoardId(null);
                } else if (id === 'calendar') {
                  setActivePage('calendar');
                  if (boards.length > 0 && !activeBoardId) setActiveBoardId(boards[0].id);
                } else if (id === 'inbox') setActivePage('inbox');
                else if (id === 'search') setActivePage('search');
                else if (id === 'docs') setActivePage('docs');
                else if (id === 'tasks') setActivePage('tasks');
                else if (id === 'team') setActivePage('team');
                else if (id === 'cotizacion' && SHOW_COTIZACIONES_NAV) setActivePage('cotizacion');
              }}
              className={`relative flex items-center justify-center rounded-lg transition-all duration-150 min-h-[44px] min-w-[44px] w-11 h-11 ${
                activePage === id
                  ? 'bg-monday-sidebarHover text-white shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-monday-sidebarHover'
              }`}
            >
              {icon}
            </button>
          ))}

        {/* Spacer + tema + avatar */}
        <div className="flex-1" />
        <div className="w-full flex flex-col items-center justify-center gap-1 pb-1">
          <Popover.Root open={themeSelectorOpen} onOpenChange={setThemeSelectorOpen}>
            <Popover.Trigger asChild>
              <button
                title={`Tema ${THEME_LABELS[theme].toLowerCase()}`}
                className="min-h-[44px] min-w-[44px] w-11 h-11 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-monday-sidebarHover transition-all duration-150"
              >
                <ThemeSidebarGlyph theme={theme} size={20} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-44 max-h-[70vh] overflow-y-auto custom-scrollbar p-2 fade-in"
                sideOffset={8}
                align="end"
                side="bottom"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[11px] font-semibold text-monday-subtext px-2 mb-1.5 uppercase tracking-wider">
                  Tema
                </p>
                {SIDEBAR_THEME_IDS.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTheme(t); setThemeSelectorOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] ${theme === t ? 'bg-monday-pill text-monday-text' : 'text-monday-text'}`}
                  >
                    <span className="shrink-0"><ThemeSidebarGlyph theme={t} size={16} /></span>
                    <span className="flex-1">{THEME_LABELS[t]}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border border-monday-border" style={{ backgroundColor: THEME_SWATCHES[t][0] }} />
                      <span className="w-2.5 h-2.5 rounded-full border border-monday-border" style={{ backgroundColor: THEME_SWATCHES[t][1] }} />
                    </span>
                  </button>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <UserPanel
            open={showUserPanel}
            onOpenChange={setShowUserPanel}
            trigger={
              <button
                type="button"
                title={currentUser.name}
                className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold shadow-sm hover:opacity-90 transition-opacity ring-2 ring-white/20 overflow-hidden p-0"
                style={railAvatarSrc ? undefined : { backgroundColor: currentUser.color }}
              >
                {railAvatarSrc ? (
                  <img src={railAvatarSrc} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[12px]">{currentUser.initials}</span>
                )}
              </button>
            }
            boardsCount={boards.length}
            workspaceName={activeWorkspaceName}
            onOpenAdmin={() => setShowAdminPanel(true)}
          />
        </div>
      </aside>
      )}

      {/* Panel lateral workspace + tableros (escritorio) */}
      {!isDocsMobile && (
      <aside
        className={`${sidebarOpen ? 'w-[232px] min-w-[232px]' : 'w-0 min-w-0'} ${chromeHidden ? 'hidden' : ''} bg-monday-sidebarPanel flex flex-col overflow-hidden transition-all duration-200 z-20 border-r border-l border-monday-border ${sidebarOpen ? 'shadow-monday-xl' : ''}`}
      >
        <div className="px-3 py-3 border-b border-monday-border">
          <Popover.Root open={workspaceSelectorOpen} onOpenChange={setWorkspaceSelectorOpen}>
            <Popover.Trigger asChild>
              <button className="w-full flex items-center gap-2.5 text-monday-text hover:bg-monday-hover rounded-lg px-2.5 py-2 transition-colors shadow-sm" title={`Workspace: ${activeWorkspaceName}`}>
                <div className="w-7 h-7 rounded-lg bg-monday-blue flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Folder size={16} />
                </div>
                <span className="text-[13px] font-semibold flex-1 text-left text-monday-text truncate min-w-0">{activeWorkspaceName}</span>
                <ChevronDown size={16} className="text-monday-subtext shrink-0" strokeWidth={2.5} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 w-64 rounded-xl shadow-monday-lg border border-monday-border bg-white p-2"
                sideOffset={8}
                align="start"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[11px] font-semibold text-monday-subtext px-1.5 mb-1.5 uppercase tracking-wider">
                  Workspaces
                </p>
                <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto custom-scrollbar scroll-touch">
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                        ws.id === activeWorkspaceId
                          ? 'bg-monday-blue/15 text-monday-blue font-medium'
                          : 'text-monday-text hover:bg-monday-hover'
                      }`}
                      onClick={() => {
                        setActiveWorkspaceId(ws.id);
                        setActiveBoardId(null);
                        setWorkspaceSelectorOpen(false);
                      }}
                    >
                      <div className="w-6 h-6 rounded-md bg-monday-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {ws.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-left truncate">{ws.name}</span>
                    </button>
                  ))}
                  {workspaces.length === 0 && (
                    <p className="text-[12px] text-monday-subtext px-2 py-1.5">
                      No hay workspaces disponibles.
                    </p>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-monday-border">
                  <input
                    ref={newWorkspaceInputRef}
                    type="text"
                    value={newWorkspaceName}
                    onChange={e => { setNewWorkspaceName(e.target.value); setWorkspaceError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                    placeholder="Nuevo workspace"
                    className="w-full px-2 py-1.5 rounded-lg bg-monday-bg border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-1 focus:ring-monday-blue mb-1.5"
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
                      apiFetch(`${API_BASE}/api/workspaces`, {
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

        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar scroll-touch py-2 px-2 min-w-0">
          {(activePage === 'board' || activePage === 'home' || activePage === 'miTrabajo') ? (
            <div className="min-w-max">
              {/* Header Area */}
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-[17px] font-bold text-monday-text tracking-tight flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-monday-blue to-[#1d60f5] flex items-center justify-center text-white text-xs shadow-sm">
                    {activeWorkspaceInitial}
                  </div>
                  {activeWorkspaceName}
                </h2>
              </div>

              {/* Board Search Box */}
              <div className="relative mb-3 group/search">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-monday-subtext group-hover/search:text-monday-text transition-colors" />
                <input
                  type="text"
                  placeholder="Buscar tableros..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
                  value={boardSearch}
                  onChange={(e) => setBoardSearch(e.target.value)}
                />
              </div>

              <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-1 mt-2 uppercase tracking-wider">Tableros</p>
              <button
                onClick={() => {
                  setActiveBoardId(null);
                  if (activePage === 'home') setActivePage('board');
                }}
                className={`w-full flex items-center gap-2 text-[13px] px-2.5 py-2 rounded-lg transition-colors mb-0.5 ${activeBoardId === null ? 'bg-monday-blue text-white font-medium' : 'text-monday-text hover:bg-monday-hover'}`}
              >
                <LayoutGrid size={15} className="shrink-0" strokeWidth={2.25} />
                Vista general
              </button>
              {boards
                .filter(b => b && (!boardSearch.trim() || b.name.toLowerCase().includes(boardSearch.trim().toLowerCase()) || activeWorkspaceName.toLowerCase().includes(boardSearch.trim().toLowerCase())))
                .map((b) => b && (
                <button
                  key={b.id}
                  type="button"
                  title={`${activeWorkspaceName} › ${b.name}`}
                  onClick={() => {
                    setActiveBoardId(b.id);
                    setCurrentView('table');
                    if (activePage === 'home') setActivePage('board');
                  }}
                  className={`w-full min-w-max flex items-start gap-2 text-[13px] px-2.5 py-2 rounded-lg transition-colors mb-0.5 text-left ${activeBoardId === b.id ? 'bg-monday-blue text-white font-medium' : 'text-monday-text hover:bg-monday-hover'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0 mt-1.5" />
                  <span className="flex flex-col min-w-0 gap-0.5">
                    <span className="whitespace-nowrap font-medium">{b.name}</span>
                    <span className={`text-[10px] leading-tight truncate ${activeBoardId === b.id ? 'text-white/80' : 'text-monday-subtext'}`}>
                      {activeWorkspaceName}
                    </span>
                  </span>
                  {activeBoardId === b.id && <Star size={13} className="ml-auto opacity-50 text-monday-orange shrink-0 mt-0.5" />}
                </button>
              ))}
              {canCreateBoard && (
              <Popover.Root
                open={showAddBoard}
                onOpenChange={(open) => {
                  setShowAddBoard(open);
                  if (!open) setCreateBoardError(null);
                }}
              >
                <Popover.Trigger asChild>
                  <button type="button" className="w-full flex items-center gap-2 text-[12px] px-2 py-1.5 text-monday-subtext hover:text-monday-text hover:bg-monday-hover transition-colors mt-1 rounded-lg">
                    <Plus size={14} />
                    Agregar tablero
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[280px] rounded-xl shadow-monday-lg border border-monday-border bg-white p-0 overflow-hidden"
                    sideOffset={8}
                    align="start"
                    onOpenAutoFocus={(e) => {
                      e.preventDefault();
                      setTimeout(() => newBoardNameInputRef.current?.focus(), 0);
                    }}
                  >
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-[13px] font-semibold text-monday-text">Nuevo tablero</p>
                      <p className="text-[12px] text-monday-subtext mt-0.5">Asigna un nombre a tu tablero</p>
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
                        className="w-full px-3 py-2.5 rounded-lg bg-monday-bg border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue focus:border-transparent mb-4"
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
              )}
            </div>
          ) : activePage === 'inbox' ? (
            <div className="p-3">
              <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">Bandeja</p>
              <p className="text-monday-text text-[12px] px-2">
                {composeToUser ? `Enviar mensaje a ${composeToUser.name}` : 'Tareas asignadas a ti.'}
              </p>
            </div>
          ) : activePage === 'tasks' ? (
            <div className="p-3">
              <p className="text-monday-subtext text-[11px] font-semibold px-2 mb-2 uppercase tracking-wider">
                Tareas
              </p>
              <p className="text-[12px] text-monday-text px-2 leading-relaxed">
                Lista personal por usuario. Marca completadas, añade notas y fecha de vencimiento; todo se guarda en tu cuenta.
              </p>
            </div>
          ) : activePage === 'team' ||
            activePage === 'search' ||
            activePage === 'notifications' ||
            activePage === 'facturacion' ? (
            <div className="p-3">
              <p className="text-[12px] text-monday-subtext px-2 leading-relaxed">
                Vista principal en el panel central. <span className="font-medium text-monday-text">Ctrl+K</span> comandos
                y búsqueda global.
              </p>
            </div>
          ) : activePage === 'docs' ? (
            <>
              {!isDocsMobile && (
                <>
                  <div className="px-3 pt-3 pb-2">
                    <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">Widgets en Docs</p>
                  </div>
                  {tasksLoading && (
                    <p className="text-[12px] text-monday-subtext px-2 mb-2">Cargando tareas...</p>
                  )}
                  {!tasksLoading && taskWindows.length === 0 && (
                    <p className="text-[12px] text-monday-subtext px-2 mb-2">No hay widgets. Usa &quot;Añadir widget&quot; en Docs.</p>
                  )}
                  <div className="space-y-1.5 mb-2 px-2">
                    {taskWindows.map(win => (
            <div
              key={win.id}
              draggable={false}
              onDragOver={e => {
                e.preventDefault();
                if (!draggingWidgetId || draggingWidgetId === win.id) return;
                setTaskWindows(prev => {
                  const fromIndex = prev.findIndex(w => w.id === draggingWidgetId);
                  const toIndex = prev.findIndex(w => w.id === win.id);
                  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
                  const next = [...prev];
                  const [moved] = next.splice(fromIndex, 1);
                  next.splice(toIndex, 0, moved);
                  scheduleSavePanelNotes();
                  return next;
                });
              }}
              className="relative group/widget"
            >
              {/* Handle de drag: esquina inferior derecha para no tapar selector/título (antes top-left bloqueaba clics) */}
              <div
                draggable
                aria-hidden
                className="absolute bottom-2 right-2 w-6 h-6 cursor-grab opacity-0 z-[2]"
                onDragStart={() => setDraggingWidgetId(win.id)}
                onDragEnd={() => setDraggingWidgetId(null)}
              />
              {win.kind === 'calculator' ? (
                <div
                  className="max-w-[208px] w-full mx-auto rounded-[14px] bg-zinc-900 shadow-[0_10px_28px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] border border-zinc-800/90 overflow-hidden transition-all duration-200 group-hover/widget:shadow-[0_14px_34px_rgba(0,0,0,0.42)]"
                  tabIndex={0}
                  onClick={e => {
                    (e.currentTarget as HTMLDivElement).focus();
                    setCalculatorError(null);
                  }}
                  onKeyDown={e => {
                    const key = e.key;
                    if (key === 'Enter') {
                      e.preventDefault();
                      evaluateCalculator();
                      return;
                    }
                    if (key === 'Escape') {
                      e.preventDefault();
                      setCalculatorExpression('');
                      setCalculatorResult(null);
                      setCalculatorError(null);
                      return;
                    }
                    if (key === 'Backspace') {
                      e.preventDefault();
                      setCalculatorResult((r) => (r === 'Error' ? null : r));
                      setCalculatorExpression(prev => (prev ?? '').slice(0, -1));
                      setCalculatorError(null);
                      return;
                    }
                    if (key === 'Delete') {
                      e.preventDefault();
                      setCalculatorExpression('');
                      setCalculatorResult(null);
                      setCalculatorError(null);
                      return;
                    }
                    if (/^[0-9.+\-*/() ]$/.test(key)) {
                      e.preventDefault();
                      setCalculatorResult((r) => (r === 'Error' ? null : r));
                      setCalculatorExpression((prev) => (prev ?? '') + key);
                      setCalculatorError(null);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-1.5 px-2 pt-2 pb-1">
                    <p className="text-[10px] font-semibold tracking-wide text-zinc-400">
                      Calculadora
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskWindows(prev => prev.filter(w => w.id !== win.id));
                        scheduleSavePanelNotes();
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                      title="Quitar widget"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* Pantalla: una sola línea grande (expresión al escribir, resultado tras Enter) */}
                  <div className="mx-2 mb-1.5 rounded-xl bg-zinc-950/90 px-2 py-2 min-h-[52px] flex flex-col justify-center shadow-[inset_0_3px_12px_rgba(0,0,0,0.5)] border border-zinc-800/80">
                    <motion.div
                      key={`${calculatorExpression}|${calculatorResult}|${calculatorError ?? ''}`}
                      initial={{ opacity: 0.85 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.08 }}
                      className={`text-right text-[22px] sm:text-[24px] font-semibold tabular-nums leading-tight tracking-tight break-all ${
                        calculatorResult === 'Error' || calculatorError ? 'text-red-400' : 'text-zinc-50'
                      }`}
                    >
                      {calculatorResult === 'Error' || calculatorError
                        ? 'Error'
                        : calculatorExpression.trim() !== ''
                          ? calculatorExpression
                          : '0'}
                    </motion.div>
                    {calculatorError && (
                      <p className="text-[9px] text-red-400/95 leading-tight mt-1 text-right line-clamp-2">{calculatorError}</p>
                    )}
                  </div>

                  <div className="px-2 pb-1.5 flex gap-2">
                    <button
                      type="button"
                      className="flex-1 h-9 flex items-center justify-center text-[10px] font-semibold rounded-full bg-zinc-100 text-zinc-900 shadow-[0_3px_0_#18181b,inset_0_1px_0_rgba(255,255,255,0.5)] hover:brightness-105 active:translate-y-px active:shadow-[0_1px_0_#18181b] transition-all"
                      onClick={() => {
                        setCalculatorExpression(prev => (prev ? `(${prev})*1.16` : '1*1.16'));
                        setCalculatorResult(null);
                        setCalculatorError(null);
                      }}
                      title="+IVA 16%"
                    >
                      +IVA
                    </button>
                    <button
                      type="button"
                      className="flex-1 h-9 flex items-center justify-center text-[10px] font-semibold rounded-full bg-zinc-100 text-zinc-900 shadow-[0_3px_0_#18181b,inset_0_1px_0_rgba(255,255,255,0.5)] hover:brightness-105 active:translate-y-px active:shadow-[0_1px_0_#18181b] transition-all"
                      onClick={() => {
                        setCalculatorExpression(prev => (prev ? `(${prev})/1.16` : '0'));
                        setCalculatorResult(null);
                        setCalculatorError(null);
                      }}
                      title="−IVA 16%"
                    >
                      −IVA
                    </button>
                  </div>

                  <div className="px-2 pb-2 grid grid-cols-3 gap-2 justify-items-center">
                    <button
                      type="button"
                      className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-[0_4px_0_#18181b,inset_0_2px_0_rgba(255,255,255,0.45)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#18181b] transition-all"
                      onClick={() => {
                        const txt = calculatorExpression.trim() || '0';
                        void navigator.clipboard.writeText(txt);
                      }}
                      title="Copiar"
                      aria-label="Copiar"
                    >
                      <Copy size={16} strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-[0_4px_0_#18181b,inset_0_2px_0_rgba(255,255,255,0.45)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#18181b] transition-all"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text.trim()) setCalculatorExpression(prev => (prev ?? '') + text.trim());
                          setCalculatorResult(null);
                          setCalculatorError(null);
                        } catch {
                          /* ignore */
                        }
                      }}
                      title="Pegar"
                      aria-label="Pegar"
                    >
                      <ClipboardPaste size={16} strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-900 text-[10px] font-bold shadow-[0_4px_0_#18181b,inset_0_2px_0_rgba(255,255,255,0.45)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#18181b] transition-all"
                      onClick={() => {
                        setCalculatorExpression('');
                        setCalculatorResult(null);
                        setCalculatorError(null);
                      }}
                      title="Borrar todo (AC)"
                    >
                      AC
                    </button>
                    <button
                      type="button"
                      className="col-span-2 w-full h-11 flex items-center justify-center gap-1.5 rounded-full bg-zinc-100 text-zinc-900 text-[11px] font-semibold shadow-[0_4px_0_#18181b,inset_0_2px_0_rgba(255,255,255,0.45)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#18181b] transition-all"
                      onClick={() => {
                        setCalculatorExpression(prev => (prev ?? '').slice(0, -1));
                        setCalculatorResult(null);
                        setCalculatorError(null);
                      }}
                      title="Borrar último carácter"
                    >
                      <Delete size={15} strokeWidth={2} className="opacity-80" aria-hidden />
                      Borrar
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      className="w-11 h-11 flex items-center justify-center rounded-full bg-red-500 text-white text-lg font-bold shadow-[0_4px_0_#991b1b,inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-red-400 active:translate-y-0.5 active:shadow-[0_2px_0_#991b1b]"
                      onClick={evaluateCalculator}
                      title="Calcular (=)"
                      aria-label="Calcular"
                    >
                      =
                    </motion.button>
                  </div>
                </div>
              ) : win.kind === 'reminders' ? (
                <div className="max-w-[208px] w-full mx-auto rounded-[14px] bg-zinc-900 shadow-[0_10px_28px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] border border-zinc-800/90 overflow-hidden transition-all duration-200 group-hover/widget:shadow-[0_14px_34px_rgba(0,0,0,0.42)] p-2">
                  <div className="flex items-center justify-between gap-1.5 px-1 pt-0.5 pb-1.5">
                    <p className="text-[10px] font-semibold tracking-wide text-zinc-400">
                      Recordatorios
                    </p>
                    <button
                      type="button"
                      onClick={() => removeTaskWindow(win.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                      title="Eliminar widget"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="px-0 pb-1">
                    <AnimatePresence initial={false}>
                      {!win.reminderComposerOpen ? (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.99 }}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="w-full h-8 flex items-center justify-center text-[10px] font-semibold rounded-full bg-zinc-100 text-zinc-900 shadow-[0_3px_0_#18181b,inset_0_1px_0_rgba(255,255,255,0.5)] hover:brightness-105 active:translate-y-px transition-all"
                          onClick={() => updateTaskWindow(win.id, { reminderComposerOpen: true })}
                        >
                          Añadir recordatorio
                        </motion.button>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.18 }}
                          className="space-y-1.5"
                        >
                          <input
                            type="text"
                            value={win.reminderDraftTitle ?? ''}
                            onChange={(e) => updateTaskWindow(win.id, { reminderDraftTitle: e.target.value })}
                            placeholder="Título…"
                            className="w-full px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-950/90 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                          />
                          <div className="relative flex items-center gap-1">
                            <input
                              ref={(el) => {
                                if (el) reminderDatetimeInputRefs.current[win.id] = el;
                                else delete reminderDatetimeInputRefs.current[win.id];
                              }}
                              type="datetime-local"
                              value={toDatetimeLocalValue(win.reminderDraftDueAt ?? '')}
                              onChange={(e) => updateTaskWindow(win.id, { reminderDraftDueAt: e.target.value })}
                              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-950/90 text-[11px] text-zinc-100 focus:outline-none focus:ring-1 focus:ring-red-500/50 [color-scheme:dark]"
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                const title = String(win.reminderDraftTitle ?? '').trim();
                                const dueAt = String(win.reminderDraftDueAt ?? '').trim();
                                if (!title || !dueAt) return;
                                updateTaskWindow(win.id, {
                                  reminders: [...(win.reminders ?? []), { id: crypto.randomUUID(), title, dueAt, done: false }],
                                  reminderDraftTitle: '',
                                  reminderDraftDueAt: '',
                                  reminderComposerOpen: false,
                                });
                              }}
                            />
                            <button
                              type="button"
                              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-[0_3px_0_#18181b,inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-105 active:translate-y-px transition-all"
                              title="Abrir calendario"
                              aria-label="Abrir calendario"
                              onClick={() => {
                                const el = reminderDatetimeInputRefs.current[win.id];
                                if (el && typeof el.showPicker === 'function') {
                                  try {
                                    el.showPicker();
                                  } catch {
                                    el.focus();
                                  }
                                } else if (el) {
                                  el.focus();
                                }
                              }}
                            >
                              <Calendar size={16} strokeWidth={2.25} aria-hidden />
                            </button>
                          </div>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.99 }}
                            onClick={() => {
                              const title = String(win.reminderDraftTitle ?? '').trim();
                              const dueAt = String(win.reminderDraftDueAt ?? '').trim();
                              if (!title || !dueAt) return;
                              updateTaskWindow(win.id, {
                                reminders: [...(win.reminders ?? []), { id: crypto.randomUUID(), title, dueAt, done: false }],
                                reminderDraftTitle: '',
                                reminderDraftDueAt: '',
                                reminderComposerOpen: false,
                              });
                            }}
                            className="w-full h-8 flex items-center justify-center text-[11px] font-semibold rounded-full bg-red-500 text-white shadow-[0_3px_0_#991b1b,inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-red-400 active:translate-y-px transition-all"
                          >
                            Añadir
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="px-0 pb-0 pt-1">
                    {(win.reminders ?? []).length === 0 ? (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-2 py-1.5">
                        <p className="text-[10px] text-zinc-500 text-center">Sin recordatorios.</p>
                      </div>
                    ) : (
                      <div className="max-h-24 overflow-auto pr-1 custom-scrollbar">
                        <AnimatePresence initial={false}>
                          {(win.reminders ?? []).map((r) => (
                            <motion.div
                              key={r.id}
                              layout
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                              className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-md hover:bg-zinc-800/60 transition-colors"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateTaskWindow(win.id, {
                                    reminders: (win.reminders ?? []).map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)),
                                  })
                                }
                                className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                                  r.done
                                    ? 'bg-red-500 border-red-500 text-white'
                                    : 'border-zinc-500 text-transparent hover:border-zinc-400'
                                }`}
                                aria-label={r.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
                              >
                                <Check size={10} />
                              </button>

                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-[11px] leading-snug truncate ${
                                    r.done ? 'line-through text-zinc-500' : 'text-zinc-100'
                                  }`}
                                >
                                  {r.title}
                                </p>
                                <p className="block text-[10px] text-zinc-400 leading-none truncate">
                                  {formatReminderDueAt(r.dueAt)}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  updateTaskWindow(win.id, {
                                    reminders: (win.reminders ?? []).filter((x) => x.id !== r.id),
                                  })
                                }
                                className="text-zinc-500 hover:text-red-400 text-[11px] px-1 py-0.5"
                                title="Eliminar"
                              >
                                ×
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                (() => {
                  const noteBg = win.color ?? DEFAULT_TASK_WINDOW_COLOR;
                  const noteFg = pickContrastingTextColor(noteBg);
                  const light = isLightNoteBackground(noteBg);
                  const rowHover = light ? 'hover:bg-black/12' : 'hover:bg-white/14';
                  const btnAdd = light
                    ? 'bg-black/12 hover:bg-black/18 border-black/20 text-current'
                    : 'bg-white/18 hover:bg-white/25 border-white/25 text-current';
                  return (
                <div
                  className="max-w-[220px] w-full mx-auto rounded-lg overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.22)] border border-zinc-400/35 transition-all duration-200 group-hover/widget:shadow-[0_14px_32px_rgba(0,0,0,0.28)] relative z-10"
                >
                  <div className="flex items-center gap-2 px-2.5 py-2 bg-zinc-800 border-b border-zinc-900/60">
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          className="shrink-0 w-3.5 h-3.5 rounded-full border border-zinc-400/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:ring-2 hover:ring-white/40 transition-shadow"
                          style={{ backgroundColor: noteBg }}
                          title="Color de la nota"
                          aria-label="Elegir color de la nota"
                        />
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-[100] p-2 rounded-lg shadow-lg border border-monday-border bg-white"
                          sideOffset={6}
                          collisionPadding={8}
                        >
                          <p className="text-[10px] font-semibold text-monday-subtext px-0.5 mb-1.5">Color de la nota</p>
                          <div className="grid grid-cols-4 gap-1">
                            {TASK_WINDOW_COLORS.map(c => (
                              <Popover.Close key={c} asChild>
                                <button
                                  type="button"
                                  className="w-6 h-6 rounded border border-monday-border hover:ring-2 ring-monday-blue transition-shadow"
                                  style={{ backgroundColor: c }}
                                  onClick={() => updateTaskWindow(win.id, { color: c })}
                                />
                              </Popover.Close>
                            ))}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                    <input
                      type="text"
                      value={win.title}
                      onChange={e => updateTaskWindow(win.id, { title: e.target.value })}
                      className="flex-1 min-w-0 text-[12px] font-semibold bg-transparent border-0 outline-none text-white placeholder:text-zinc-500"
                      placeholder="Mis tareas"
                    />
                    <button
                      type="button"
                      onClick={() => removeTaskWindow(win.id)}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                      title="Quitar widget"
                      aria-label="Quitar widget"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div
                    className="px-2.5 pt-2.5 pb-2.5 transition-colors"
                    style={{ backgroundColor: noteBg, color: noteFg }}
                  >
                    <div className="space-y-0.5">
                      <AnimatePresence initial={false}>
                        {(win.tasks ?? []).map(task => (
                          <motion.div
                            key={task.id}
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className={`flex items-start gap-2 group/task py-0.5 px-1 rounded-md ${rowHover} transition-colors overflow-hidden`}
                          >
                            <motion.button
                              type="button"
                              role="checkbox"
                              aria-checked={!!task.done}
                              onClick={() =>
                                updateTaskWindow(win.id, {
                                  tasks: (win.tasks ?? []).map(t =>
                                    t.id === task.id ? { ...t, done: !t.done } : t,
                                  ),
                                })
                              }
                              whileTap={{ scale: 0.9 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                              className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border shadow-sm transition-colors duration-200 ${
                                task.done
                                  ? 'border-red-800/40 text-white bg-red-600'
                                  : light
                                    ? 'border-black/35 text-transparent hover:border-black/50 bg-white/35'
                                    : 'border-white/45 text-transparent hover:border-white/65 bg-black/15'
                              }`}
                            >
                              <motion.span
                                initial={false}
                                animate={{ opacity: task.done ? 1 : 0, scale: task.done ? 1 : 0.75 }}
                                transition={{ duration: 0.2 }}
                              >
                                <Check size={10} strokeWidth={3} />
                              </motion.span>
                            </motion.button>
                            <textarea
                              value={task.text ?? ''}
                              onChange={e => {
                                updateTaskWindow(win.id, {
                                  tasks: (win.tasks ?? []).map(t =>
                                    t.id === task.id ? { ...t, text: e.target.value } : t,
                                  ),
                                });
                              }}
                              rows={Math.max(2, Math.min(6, (String(task.text ?? '').match(/\n/g)?.length ?? 0) + 2))}
                              className={`flex-1 min-w-0 text-[12px] border-0 bg-transparent outline-none resize-none overflow-hidden placeholder:text-current placeholder:opacity-50 transition-opacity duration-200 ${
                                task.done ? 'opacity-55 line-through' : ''
                              }`}
                              style={{ color: noteFg }}
                              placeholder="Nueva tarea..."
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateTaskWindow(win.id, {
                                  tasks: (win.tasks ?? []).filter(t => t.id !== task.id),
                                })
                              }
                              className="text-current text-[11px] opacity-0 group-hover/task:opacity-100 hover:text-red-600 transition-opacity p-0.5 rounded"
                            >
                              ×
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      <button
                        type="button"
                        onClick={() =>
                          updateTaskWindow(win.id, {
                            tasks: [
                              ...(win.tasks ?? []),
                              { id: crypto.randomUUID(), text: '', done: false },
                            ],
                          })
                        }
                        className={`mt-2 w-full text-[11px] font-semibold border px-2 py-1.5 rounded-md transition-colors ${btnAdd}`}
                      >
                        + Añadir tarea
                      </button>
                    </div>
                  </div>
                </div>
                  );
                })()
              )}
            </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="p-4 text-center text-monday-subtext text-[13px]">
              Menú de {activePage}
            </div>
          )}
        </div>
      </aside>
      )}

      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
      <main
        className={[
          'flex-1 flex flex-col min-w-0 overflow-hidden min-h-0',
          isDocsMobile ? 'p-0 bg-monday-bg' : 'p-2 sm:p-3 pl-0 bg-monday-bg',
          /* Sin padding inferior cuando no hay barra (Docs / calendario horizontal inmersivo). */
          isDocsMobile && !hideMobileMainBottomPad
            ? isLandscapeShort
              ? 'pb-[52px] main-mobile main-mobile-landscape'
              : 'pb-[80px] main-mobile'
            : '',
        ].join(' ')}
      >
        <div
          className={[
            'flex-1 flex flex-col min-h-0 overflow-hidden',
            isDocsMobile ? 'bg-monday-bg' : 'bg-white rounded-xl sm:rounded-2xl shadow-monday-sm border border-monday-border',
          ].join(' ')}
        >
          {/* Barra común: ocultar/mostrar panel lateral en todas las vistas */}
          <header
            className={[
              'shrink-0 h-14 flex items-center gap-2 px-3 sm:px-4',
              isDocsMobile
                ? 'border-b border-monday-border bg-[var(--monday-surface)] backdrop-blur-xl'
                : 'border-b border-monday-border',
              chromeHidden ? 'hidden' : '',
            ].join(' ')}
          >
            {isDocsMobile ? (
              mobileCanGoBack ? (
                <button
                  type="button"
                  onClick={() => {
                    if (activePage === 'board' && activeBoardId !== null) setActiveBoardId(null);
                    else if (activePage === 'miTrabajo' && activeBoardId !== null) setActiveBoardId(null);
                    else if (activePage === 'calendar') setActivePage('home');
                    else if (activePage === 'docs') setActivePage('home');
                    else if (['search', 'team', 'facturacion', 'cotizacion', 'tasks'].includes(activePage)) setActivePage('board');
                    else if (activePage === 'inbox' || activePage === 'notifications') setActivePage(lastMainTab);
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-2xl text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                  aria-label="Volver"
                >
                  <ChevronLeft size={22} />
                </button>
              ) : activePage === 'home' && mobileLandscapeChrome ? (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-2xl text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                  aria-label="Menú"
                >
                  <Menu size={22} />
                </button>
              ) : activePage === 'home' ? (
                <span className="min-h-[44px] min-w-[44px] shrink-0" aria-hidden />
              ) : (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-2xl text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                  aria-label="Menú"
                >
                  <Menu size={22} />
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setSidebarOpen(v => !v)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
                aria-label={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
              >
                <ChevronRight size={20} className={`transition-transform ${sidebarOpen ? 'rotate-180' : 'rotate-0'}`} />
              </button>
            )}
            <span
              className={
                calendarMinimalChrome
                  ? 'sr-only'
                  : 'flex-1 text-[15px] font-semibold text-monday-text truncate'
              }
            >
              {activePage === 'calendar'
                ? 'Calendario'
                : activePage === 'board' && activeBoardId
                  ? (boards.find(b => b?.id === activeBoardId)?.name ?? 'Tableros')
                  : activePage === 'board'
                    ? 'Tableros'
                    : activePage === 'inbox'
                    ? 'Bandeja'
                    : activePage === 'notifications'
                      ? 'Notificaciones'
                      : activePage === 'search'
                        ? 'Buscar'
                        : activePage === 'docs'
                          ? 'Docs'
                            : activePage === 'team'
                            ? 'Equipo'
                            : activePage === 'tasks'
                              ? 'Tareas'
                              : activePage === 'cotizacion'
                              ? 'Cotizaciones'
                              : activePage === 'facturacion'
                              ? 'Facturación'
                              : activePage === 'miTrabajo'
                                ? 'Mi trabajo'
                                : activePage === 'home'
                                  ? 'Inicio'
                                  : 'Inicio'}
            </span>
            {!isDocsMobile && (
              <div className="shrink-0 ml-auto flex items-center pr-0.5">
                <NotificationDropdown
                  variant="header"
                  unreadCount={unreadNotifCount}
                  recentPulse={recentUnreadNotif}
                  isActive={activePage === 'notifications'}
                  onNotificationsChange={fetchUnreadNotifications}
                  onOpenFullPage={() => {
                    setActivePage('notifications');
                    fetchUnreadNotifications();
                  }}
                  onOpenItem={(item, boardId) => {
                    setActivePage('board');
                    setActiveBoardId(boardId);
                    setSelectedItem(item);
                  }}
                />
              </div>
            )}
            {isDocsMobile && !calendarMinimalChrome && (
              <div className="shrink-0">
                <AnimatedLogo size={26} color="currentColor" />
              </div>
            )}
          </header>

          {isDocsMobile && isBootstrapping ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key="__bootstrap__"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <div className="flex-1 flex items-center justify-center text-monday-subtext text-[13px] gap-2">
                    <div className="w-5 h-5 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
                    Cargando Sunday...
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : isDocsMobile ? (
            <MobileLayout
              pageKey={`${activePage}:${activeBoardId ?? ''}`}
              hideBottomNav={activePage === 'docs' || mobileLandscapeChrome}
              showFAB={
                !isBootstrapping &&
                (activePage === 'home' || activePage === 'board' || activePage === 'calendar') &&
                mobileHeaderHidden &&
                !calendarImmersiveLandscape &&
                !mobileLandscapeChrome
              }
              onFABClick={() => window.dispatchEvent(new CustomEvent('sunday-fab-add-item'))}
              isLandscapeShort={isLandscapeShort}
              activeTab={
                activePage === 'notifications'
                  ? 'notifications'
                  : activePage === 'inbox'
                    ? 'inbox'
                    : activePage === 'calendar'
                      ? 'calendar'
                      : (activePage === 'board' && !activeBoardId) ||
                          activePage === 'docs' ||
                          activePage === 'team' ||
                          activePage === 'facturacion' ||
                          activePage === 'cotizacion' ||
                          activePage === 'tasks'
                        ? 'more'
                        : 'home'
              }
              onNavigate={(tab: MobileBottomTab) => {
                if (tab === 'home') {
                  setLastMainTab('home');
                  setActivePage('home');
                  setActiveBoardId(null);
                  setSidebarOpen(false);
                  return;
                }
                if (tab === 'notifications') {
                  setLastMainTab(
                    activePage === 'home' || activePage === 'board' || activePage === 'calendar'
                      ? (activePage as 'home' | 'board' | 'calendar')
                      : 'home'
                  );
                  setActivePage('notifications');
                  return;
                }
                if (tab === 'inbox') {
                  setLastMainTab(
                    activePage === 'home' || activePage === 'board' || activePage === 'calendar'
                      ? (activePage as 'home' | 'board' | 'calendar')
                      : 'home'
                  );
                  setActivePage('inbox');
                  return;
                }
                if (tab === 'calendar') {
                  setLastMainTab('calendar');
                  setActivePage('calendar');
                  if (boards.length > 0 && !activeBoardId) setActiveBoardId(boards[0].id);
                  return;
                }
                if (tab === 'more') {
                  setSidebarOpen((open) => !open);
                }
              }}
              compact={isLandscapeShort}
              unreadNotifCount={unreadNotifCount}
              recentUnreadNotif={recentUnreadNotif}
            >
            {routeTree}
            </MobileLayout>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
            {routeTree}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {!isDocsMobile && selectedItem && (
        <motion.aside
          key={selectedItem.id}
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative z-40 flex h-full w-[480px] shrink-0 flex-col overflow-hidden border-l border-monday-border bg-[var(--monday-surface)] shadow-monday-panel"
        >
          <ItemDetailsPanel
            embedded
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            board={(() => {
              const byActive = boards.find((b) => b.id === activeBoardId);
              if (byActive) return byActive;
              const byGroup = boards.find(
                (b) => Array.isArray(b.groups) && b.groups.some((g) => g.id === selectedItem.groupId),
              );
              if (byGroup) return byGroup;
              return (
                boards.find(
                  (b) =>
                    Array.isArray(b.groups) &&
                    b.groups.some(
                      (gr) => Array.isArray(gr.items) && gr.items.some((it) => it.id === selectedItem.id),
                    ),
                ) ?? null
              );
            })()}
          />
        </motion.aside>
      )}
      </div>

      {/* Item Details Panel móvil */}
      {isDocsMobile && selectedItem && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedItem(null)} aria-hidden />
          <div className="absolute left-0 right-0 bottom-0 max-h-[90dvh] flex flex-col panel-slide-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <ItemDetailsPanel
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
              variant="sheet"
              board={(() => {
                const byActive = boards.find(b => b.id === activeBoardId);
                if (byActive) return byActive;
                const byGroup = boards.find(b =>
                  Array.isArray(b.groups) && b.groups.some(g => g.id === selectedItem.groupId)
                );
                if (byGroup) return byGroup;
                const byItem = boards.find(b =>
                  Array.isArray(b.groups) &&
                  b.groups.some(gr => Array.isArray(gr.items) && gr.items.some(it => it.id === selectedItem.id))
                );
                return byItem ?? null;
              })()}
            />
          </div>
        </div>
      )}
      
      <AdminUsersPanel open={showAdminPanel} onOpenChange={setShowAdminPanel} />

      {isDocsMobile && (
        <AnimatedDialog
          open={showCreateBoardModal}
          onOpenChange={(open) => {
            setShowCreateBoardModal(open);
            if (!open) setCreateBoardError(null);
          }}
        >
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[100]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-md bg-white rounded-xl shadow-xl border border-monday-border p-5">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text mb-1">Nuevo tablero</Dialog.Title>
            <Dialog.Description className="sr-only">Asigna un nombre a tu nuevo tablero</Dialog.Description>
            <p className="text-[13px] text-monday-subtext mb-4">Asigna un nombre a tu tablero</p>
            <input
              type="text"
              value={newBoardName}
              onChange={(e) => { setNewBoardName(e.target.value); setCreateBoardError(null); }}
              placeholder="Nombre del tablero"
              className="w-full px-3 py-2.5 rounded-lg bg-monday-bg border border-monday-border text-[16px] sm:text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue mb-3"
              disabled={creatingBoard}
              aria-describedby={createBoardError ? 'create-board-error' : undefined}
            />
            {createBoardError && (
              <p id="create-board-error" className="text-red-400 text-[12px] mb-3" role="alert">{createBoardError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={creatingBoard}
                  className="px-3 py-2 text-[13px] text-monday-subtext hover:text-monday-text hover:bg-monday-hover rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={creatingBoard}
                onClick={() => handleCreateBoard()}
                className="px-4 py-2 text-[13px] font-medium text-white bg-monday-blue hover:bg-monday-blue/90 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {creatingBoard ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </Dialog.Content>
        </AnimatedDialog>
      )}
    </div>
  );
}

export default App;
