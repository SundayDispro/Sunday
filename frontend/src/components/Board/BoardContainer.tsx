import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Board, Group, BoardColumn, Item } from '../../types';
import { socket, emitMoveItem } from '../../store/socket';
import { BoardGroup } from './BoardGroup';
import {
  Plus, Search, Filter, ArrowUpDown, EyeOff, ChevronDown, X, Folder,
  Copy, Download, Archive, Trash2, ArrowRightLeft, Circle, ListOrdered, FileText,
  MoreHorizontal, Tag, UserCircle2, LayoutGrid, UserCheck,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  useDndContext,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { GROUP_PALETTE } from './GroupColorPicker';
import { KanbanView } from './KanbanView';
import CalendarView, { type CalendarEventKind } from './CalendarView';
import { FacturacionBoardView } from './FacturacionBoardView';
import { ResumenBoardView } from './ResumenBoardView';
import { ArchivosBoardView } from './ArchivosBoardView';
import { TimelineBoardView } from './TimelineBoardView';
import { useUser } from '../../store/UserContext';
import { useToast } from '../Toast';
import { AnimatedDialog } from '../AnimatedDialog';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useHideOnScroll } from '../../hooks/useHideOnScroll';
import { useViewport } from '../../hooks/useViewport';
import { apiFetch, parseResponse } from '../../api';
import { can } from '../../authz/can';
import { EmptyState } from '../EmptyState';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

interface Props {
  boardId: string;
  onRowClick: (item: Item) => void;
  viewMode: 'table' | 'kanban' | 'calendar' | 'facturacion' | 'resumen' | 'archivos' | 'miTrabajo' | 'timeline';
  /**
   * Entrega el tablero ya cargado (con `groups/items`) para búsquedas Ctrl/Cmd+K.
   */
  onBoardData?: (board: Board) => void;
  /** En móvil: solo calendario a pantalla completa, sin toolbar completo ni tabs */
  mobileCalendarOnly?: boolean;
  /** Vista de tablero optimizada para móvil: toolbar de una fila (Nuevo elemento, Buscar, Más) */
  mobileOptimized?: boolean;
  /** Pestaña Calendario exclusiva (web): solo barra compacta + calendario, sin header de tablero de 2 filas */
  calendarStandalone?: boolean;
  /** Solo móvil: notifica a App para ocultar MobileBoardHeader al hacer scroll hacia abajo */
  onHeaderVisibilityChange?: (isHidden: boolean) => void;
  /** Si true, se aplica hide-on-scroll a la toolbar y se llama onHeaderVisibilityChange */
  isMobile?: boolean;
}

function GroupDragOverlay({ groups }: { groups: Group[] }) {
  const { active } = useDndContext();
  const group = active?.id ? groups.find(g => g.id === active.id) : null;
  if (!group) return null;
  return (
    <DragOverlay>
      <div
        className="bg-[var(--monday-surface)] rounded-lg border border-monday-border shadow-monday-lg px-4 py-3 flex items-center gap-3 min-w-[200px]"
        style={{ borderLeftWidth: 4, borderLeftColor: group.color }}
      >
        <span className="font-medium text-monday-text truncate">{group.name}</span>
        <span className="text-monday-subtext text-[13px] shrink-0">{group.items.length} elementos</span>
      </div>
    </DragOverlay>
  );
}

const BoardContainer: React.FC<Props> = ({ boardId, onRowClick, viewMode, onBoardData, mobileCalendarOnly = false, mobileOptimized = false, calendarStandalone = false, onHeaderVisibilityChange, isMobile = false }) => {
  const { currentUser, users } = useUser();
  const canDeleteItem = can(currentUser, 'item.delete');
  const { useCardView, isLandscapeShort, isLandscape, isPortrait, isMobile: isViewportMobile } = useViewport();
  const { toast, dismiss } = useToast();
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const [socketRowHighlight, setSocketRowHighlight] = useState<Set<string>>(new Set());
  const flashRowFromSocket = useCallback((itemId: string) => {
    setSocketRowHighlight((prev) => new Set(prev).add(itemId));
    window.setTimeout(() => {
      setSocketRowHighlight((prev) => {
        const n = new Set(prev);
        n.delete(itemId);
        return n;
      });
    }, 2000);
  }, []);
  const pendingDeleteRef = useRef<
    Map<string, { toastId: number; snapshot: Item; groupId: string }>
  >(new Map());
  const [board, setBoard] = useState<Board | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);
  
  // Toolbar states
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ columnId: string, direction: 'asc' | 'desc' } | null>(null);
  const [showSort, setShowSort] = useState(false);
  const [showHide, setShowHide] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterByStatusOptionId, setFilterByStatusOptionId] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showMultiSelectHint, setShowMultiSelectHint] = useState(() => {
    try { return localStorage.getItem('sunday-multiselect-hint') !== 'dismissed'; } catch { return true; }
  });
  const [showMovePopover, setShowMovePopover] = useState(false);
  const [showBulkStatusPopover, setShowBulkStatusPopover] = useState(false);
  const [showBulkAssignPopover, setShowBulkAssignPopover] = useState(false);
  const [showDeleteItemsConfirm, setShowDeleteItemsConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [itemTextFilter, setItemTextFilter] = useState('');
  const [mobileQuickFilter, setMobileQuickFilter] = useState<string | null>(null);
  const [addToProjectOpen, setAddToProjectOpen] = useState(false);
  const [addToProjectGroupId, setAddToProjectGroupId] = useState<string>('');
  const [addToProjectAfterItemId, setAddToProjectAfterItemId] = useState<string>('');
  const [addToProjectName, setAddToProjectName] = useState('');
  const [addToProjectSubmitting, setAddToProjectSubmitting] = useState(false);
  const deleteItemsCancelRef = useRef<HTMLButtonElement>(null);

  /** FAB móvil: abrir menú "Nuevo elemento" desde fuera */
  useEffect(() => {
    const handler = () => {
      if (!board || board.groups.length === 0) return;
      setAddToProjectGroupId(board.groups[0].id);
      setAddToProjectAfterItemId('');
      setAddToProjectName('');
      setAddToProjectOpen(true);
    };
    window.addEventListener('sunday-fab-add-item', handler);
    return () => window.removeEventListener('sunday-fab-add-item', handler);
  }, [board]);

  /** Ref para abrir el modal de evento de calendario con tipo (desde la barra en vista calendario). */
  const openCalendarEventRef = useRef<((opts: { date: Date; eventType: CalendarEventKind }) => void) | null>(null);
  const registerOpenCalendarEvent = useCallback((open: (opts: { date: Date; eventType: CalendarEventKind }) => void) => {
    openCalendarEventRef.current = open;
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollContainerEl, setScrollContainerEl] = useState<HTMLDivElement | null>(null);
  const setScrollContainerRef = useCallback((el: HTMLDivElement | null) => {
    (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setScrollContainerEl(el);
  }, []);
  const toolbarRef = useRef<HTMLDivElement>(null);
  /** Sin hide-on-scroll en tablero móvil principal: la animación de altura del toolbar provoca saltos al desplazar (Docs no colapsa esa barra). */
  const hideOnScrollTarget = isMobile && mobileOptimized ? null : scrollContainerEl;
  const { isHidden: scrollHidden } = useHideOnScroll(hideOnScrollTarget, 10, 40);
  const headerHidden = isMobile ? scrollHidden : false;
  const [toolbarHeight, setToolbarHeight] = useState(56);

  const [calendarScrollEl, setCalendarScrollEl] = useState<HTMLDivElement | null>(null);
  const setCalendarScrollRef = useCallback((el: HTMLDivElement | null) => setCalendarScrollEl(el), []);
  const { isHidden: calendarBarHidden } = useHideOnScroll(calendarScrollEl, 10, 40);
  const [calendarBarHeight, setCalendarBarHeight] = useState(48);
  const calendarBarRef = useRef<HTMLDivElement>(null);
  const [calendarBarEl, setCalendarBarRef] = useState<HTMLDivElement | null>(null);
  const setCalendarBarRefCallback = useCallback((el: HTMLDivElement | null) => {
    (calendarBarRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setCalendarBarRef(el);
  }, []);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setItemTextFilter('');
    setMobileQuickFilter(null);
  }, [boardId]);

  useEffect(() => {
    if (isMobile && onHeaderVisibilityChange) onHeaderVisibilityChange(headerHidden);
  }, [isMobile, headerHidden, onHeaderVisibilityChange]);

  useEffect(() => {
    if (!isMobile) return;
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setToolbarHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  useEffect(() => {
    const el = calendarBarEl;
    if (!el) return;
    // No observar cuando es layout móvil solo calendario (no hay barra que medir)
    if (isMobile && (mobileCalendarOnly || calendarStandalone) && viewMode === 'calendar') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setCalendarBarHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [calendarBarEl, isMobile, mobileCalendarOnly, calendarStandalone, viewMode]);

  const fetchBoard = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/boards/${boardId}`);
      if (res.ok) {
        const data = await res.json();
        setBoard(data);
        onBoardData?.(data);
      }
    } catch (err) {
      console.error('Error fetching board:', err);
    }
  };

  useEffect(() => {
    if (!onBoardData) return;
    if (!board) return;
    onBoardData(board);
  }, [onBoardData, board]);

  useEffect(() => {
    // Unirse a la sala del tablero en Socket.IO
    socket.emit('join_board', { boardId });
    const handleSocketConnect = () => {
      socket.emit('join_board', { boardId });
    };
    socket.on('connect', handleSocketConnect);

    const onActionDenied = (payload: { event?: string; reason?: string }) => {
      const reason = payload?.reason;
      const ev = payload?.event ?? '';
      let msg = 'No se pudo completar la acción.';
      if (reason === 'unauthenticated') {
        msg = 'Sesión no válida o caducada. Cierra sesión y vuelve a entrar.';
      } else if (reason === 'unauthorized') {
        if (ev === 'add_group' || ev === 'rename_group' || ev === 'move_group' || ev === 'reorder_groups') {
          msg = 'Tu rol no permite modificar grupos en este tablero.';
        } else if (ev === 'add_item' || ev === 'move_item' || ev === 'update_item_name') {
          msg = 'Tu rol no permite modificar elementos en este tablero.';
        } else {
          msg = 'No tienes permiso para esta acción.';
        }
      }
      toast(msg, 'error');
    };
    socket.on('action_denied', onActionDenied);

    const onGroupAddFailed = (payload: { error?: string }) => {
      toast(payload?.error || 'No se pudo crear el grupo.', 'error');
    };
    socket.on('group_add_failed', onGroupAddFailed);

    fetchBoard();

    socket.on('column_value_updated', (updatedValue) => {
      flashRowFromSocket(updatedValue.itemId);
      setBoard((prev) => {
        if (!prev) return prev;
        const newGroups = prev.groups.map(g => ({
          ...g,
          items: g.items.map(i => {
            if (i.id === updatedValue.itemId) {
              const idx = i.columnValues.findIndex(cv => cv.columnId === updatedValue.columnId);
              let newCv = [...i.columnValues];
              if (idx !== -1) newCv[idx] = updatedValue;
              else newCv.push(updatedValue);
              return { ...i, columnValues: newCv };
            }
            return i;
          })
        }));
        return { ...prev, groups: newGroups };
      });
    });

    socket.on('group_added', (newGroup) => {
      setBoard(prev => prev ? { ...prev, groups: [...prev.groups, newGroup] } : prev);
    });

    socket.on('item_added', (newItem) => {
      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map(g =>
            g.id === newItem.groupId ? { ...g, items: [...g.items, newItem] } : g
          )
        };
      });
    });

    socket.on('item_updated', (updatedItem) => {
      flashRowFromSocket(updatedItem.id);
      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map(g => ({
            ...g,
            items: g.items.map(i => i.id === updatedItem.id ? { ...i, ...updatedItem } : i)
          }))
        };
      });
    });

    socket.on('item_moved', (movedItem) => {
      flashRowFromSocket(movedItem.id);
      setBoard(prev => {
        if (!prev) return prev;
        let newGroups = [...prev.groups];
        for (let g of newGroups) g.items = g.items.filter(i => i.id !== movedItem.id);
        let tg = newGroups.find(g => g.id === movedItem.groupId);
        if (tg) {
          tg.items.push(movedItem);
          tg.items.sort((a, b) => a.position - b.position);
        }
        return { ...prev, groups: newGroups };
      });
    });

    socket.on('column_added', (col: BoardColumn) => {
      setBoard(prev => prev ? { ...prev, columns: [...prev.columns, col] } : prev);
    });
    socket.on('column_renamed', (col: BoardColumn) => {
      setBoard(prev => prev ? { ...prev, columns: prev.columns.map(c => c.id === col.id ? col : c) } : prev);
    });
    socket.on('column_settings_updated', (col: BoardColumn) => {
      setBoard(prev => prev ? { ...prev, columns: prev.columns.map(c => c.id === col.id ? col : c) } : prev);
    });
    socket.on('column_deleted', ({ columnId }: { columnId: string }) => {
      setBoard(prev => prev ? { ...prev, columns: prev.columns.filter(c => c.id !== columnId) } : prev);
    });

    socket.on('item_deleted', ({ itemId }: { itemId: string }) => {
      const pending = pendingDeleteRef.current.get(itemId);
      if (pending) {
        pendingDeleteRef.current.delete(itemId);
        dismissRef.current(pending.toastId, { runExpire: false });
      }
      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map(g => ({
            ...g,
            items: g.items.filter(i => i.id !== itemId),
          })),
        };
      });
      setSelectedItemIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    });

    socket.on('group_renamed', (updated: { id: string; name: string; color: string }) => {
      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map(g =>
            g.id === updated.id ? { ...g, name: updated.name, color: updated.color } : g
          ),
        };
      });
    });

    socket.on('group_deleted', ({ groupId }: { groupId: string }) => {
      setBoard(prev => prev ? { ...prev, groups: prev.groups.filter(g => g.id !== groupId) } : prev);
    });
    socket.on('groups_reordered', (payload: { boardId: string; groups: Array<{ id: string; position: number }> }) => {
      if (!payload || payload.boardId !== boardId || !Array.isArray(payload.groups)) return;
      setBoard(prev => {
        if (!prev) return prev;
        const posById = new Map(payload.groups.map(g => [g.id, g.position]));
        const groups = prev.groups
          .map(g => ({ ...g, position: posById.get(g.id) ?? g.position }))
          .sort((a, b) => a.position - b.position);
        return { ...prev, groups };
      });
    });

    return () => {
      socket.emit('leave_board', { boardId });
      socket.off('connect', handleSocketConnect);
      socket.off('action_denied', onActionDenied);
      socket.off('group_add_failed', onGroupAddFailed);
      socket.off('column_value_updated');
      socket.off('group_added');
      socket.off('item_added');
      socket.off('item_updated');
      socket.off('item_moved');
      socket.off('column_added');
      socket.off('column_renamed');
      socket.off('column_settings_updated');
      socket.off('column_deleted');
      socket.off('item_deleted');
      socket.off('group_renamed');
      socket.off('group_deleted');
      socket.off('groups_reordered');
    };
  }, [boardId, flashRowFromSocket]);

  const toggleItemSelection = (itemId: string, checked: boolean) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const toggleGroupAll = (groupId: string, checked: boolean) => {
    if (!board) return;
    const group = board.groups.find(g => g.id === groupId);
    if (!group) return;
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      group.items.forEach(i => {
        if (checked) next.add(i.id);
        else next.delete(i.id);
      });
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
    setShowMovePopover(false);
  };

  const handleDuplicateSelected = () => {
    if (!board || selectedItemIds.size === 0) return;
    selectedItemIds.forEach(itemId => {
      const group = board.groups.find(g => g.items.some(i => i.id === itemId));
      if (!group) return;
      const item = group.items.find(i => i.id === itemId);
      if (!item) return;
      const newPosition = group.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024;
      socket.emit('add_item', { groupId: group.id, name: `Copia de ${item.name}`, position: newPosition });
    });
    clearSelection();
  };

  const openDeleteConfirm = () => {
    if (!canDeleteItem) return;
    if (selectedItemIds.size === 0) return;
    setShowDeleteItemsConfirm(true);
  };

  const confirmDeleteSelected = () => {
    if (!canDeleteItem) return;
    if (selectedItemIds.size === 0 || !board) return;
    const idsToDelete = Array.from(selectedItemIds);

    // Actualización optimista: quitar los elementos del estado de inmediato
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map(g => ({
          ...g,
          items: g.items.filter(i => !idsToDelete.includes(i.id)),
        })),
      };
    });
    clearSelection();
    setShowDeleteItemsConfirm(false);

    // Enviar al backend para persistir (REST + socket para tiempo real)
    idsToDelete.forEach(itemId => {
      socket.emit('delete_item', { itemId });
      apiFetch(`${API_BASE}/api/items/${itemId}`, { method: 'DELETE' }).catch((err) =>
        console.error('Error persistiendo eliminación de item', itemId, err)
      );
    });
  };

  const handleMoveSelected = (targetGroupId: string) => {
    if (!board || selectedItemIds.size === 0) return;
    const targetGroup = board.groups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;
    let position = targetGroup.items.length > 0
      ? targetGroup.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024
      : 1024;
    selectedItemIds.forEach(itemId => {
      socket.emit('move_item', { itemId, newGroupId: targetGroupId, newPosition: position });
      position += 1024;
    });
    clearSelection();
  };

  const handleExportSelected = () => {
    if (selectedItemIds.size === 0) return;
    toast(`Exportar ${selectedItemIds.size} elemento(s): puedes ampliar esta función para descargar CSV o JSON.`, 'info');
  };

  const handleArchiveSelected = () => {
    if (selectedItemIds.size === 0) return;
    toast('Archivar: crea un grupo "Archivados" y usa Mover para llevar los elementos allí.', 'info');
  };

  const dismissMultiSelectHint = () => {
    setShowMultiSelectHint(false);
    try { localStorage.setItem('sunday-multiselect-hint', 'dismissed'); } catch {}
  };

  const mergeGroupIntoBoard = useCallback((created: Group) => {
    setBoard((prev) => {
      if (!prev) return prev;
      if (prev.groups.some((g) => g.id === created.id)) return prev;
      const groups = [...prev.groups, created].sort((a, b) => a.position - b.position);
      return { ...prev, groups };
    });
  }, []);

  const handleAddGroup = async () => {
    if (!board) return;
    const randomColor = GROUP_PALETTE[Math.floor(Math.random() * GROUP_PALETTE.length)];
    const newPosition =
      board.groups.length > 0
        ? board.groups.reduce((max, g) => Math.max(max, g.position), 0) + 1024
        : 1024;
    try {
      const res = await apiFetch(`${API_BASE}/api/boards/${board.id}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Nuevo grupo',
          color: randomColor,
          position: newPosition,
        }),
      });
      const created = await parseResponse<Group>(res);
      if (created) mergeGroupIntoBoard(created);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el grupo', 'error');
    }
  };

  const handleAddItemFromToolbar = () => {
    if (!board || board.groups.length === 0) return;
    const firstGroup = board.groups[0];
    const newPosition = firstGroup.items.length > 0
      ? firstGroup.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024
      : 1024;
    socket.emit('add_item', { groupId: firstGroup.id, name: 'Nueva tarea', position: newPosition });
  };

  const openAddToProject = () => {
    setNewMenuOpen(false);
    if (!board || board.groups.length === 0) return;
    setAddToProjectGroupId(board.groups[0].id);
    setAddToProjectAfterItemId('');
    setAddToProjectName('');
    setAddToProjectOpen(true);
  };

  const handleAddToProjectSubmit = () => {
    if (!board || !addToProjectGroupId || !addToProjectName.trim()) return;
    const group = board.groups.find(g => g.id === addToProjectGroupId);
    if (!group) return;
    let newPosition: number;
    if (addToProjectAfterItemId) {
      const afterItem = group.items.find(i => i.id === addToProjectAfterItemId);
      newPosition = afterItem ? afterItem.position + 512 : (group.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024);
    } else {
      newPosition = group.items.length > 0 ? Math.min(...group.items.map(i => i.position)) - 512 : 1024;
      if (newPosition < 0) newPosition = group.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024;
    }
    setAddToProjectSubmitting(true);
    socket.emit('add_item', { groupId: addToProjectGroupId, name: addToProjectName.trim(), position: newPosition });
    setAddToProjectOpen(false);
    setAddToProjectName('');
    setAddToProjectSubmitting(false);
  };

  const selectedGroupForProject = board?.groups.find(g => g.id === addToProjectGroupId);

  const sensors = useSensors(
    ...(isMobile
      ? [useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })]
      : [useSensor(PointerSensor, { activationConstraint: { distance: 5 } })]),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !board) return;

    // Column reordering (horizontal)
    const isActiveColumn = board.columns.some(c => c.id === active.id);
    const isOverColumn = board.columns.some(c => c.id === over.id);
    if (isActiveColumn && isOverColumn) {
      const oldIndex = board.columns.findIndex(c => c.id === active.id);
      const newIndex = board.columns.findIndex(c => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = [...board.columns];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      const updates = reordered.map((c, idx) => ({
        id: c.id,
        position: (idx + 1) * 1024,
      }));

      const withPositions = reordered.map((c, idx) => ({
        ...c,
        position: updates[idx].position,
      }));

      setBoard(prev => (prev ? { ...prev, columns: withPositions } : prev));

      apiFetch(`${API_BASE}/api/boards/${board.id}/columns/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      }).catch(err => {
        console.error('Error persisting column reorder:', err);
      });

      return;
    }

    // Check if we are dragging a group or an item.
    // Assuming groups and items don't share IDs.
    const isActiveGroup = board.groups.some(g => g.id === active.id);
    const isOverGroup = board.groups.some(g => g.id === over.id);

    if (isActiveGroup && isOverGroup) {
      // Reordering groups
      const oldIndex = board.groups.findIndex(g => g.id === active.id);
      const newIndex = board.groups.findIndex(g => g.id === over.id);
      
      let newGroups = [...board.groups];
      const [movedGroup] = newGroups.splice(oldIndex, 1);
      newGroups.splice(newIndex, 0, movedGroup);

      // Recalculate positions based on new order
      newGroups.forEach((g, idx) => {
        g.position = (idx + 1) * 1024;
      });

      setBoard(prev => prev ? { ...prev, groups: newGroups } : prev);
      
      // Emit socket event to update group order on backend
      socket.emit('reorder_groups', { 
        boardId: board.id, 
        updates: newGroups.map(g => ({ id: g.id, position: g.position }))
      });
      return;
    }

    // Otherwise, handle item dragging...
    let movedItemId = active.id as string;
    let targetId = over.id as string;
    let sourceGroupIdx = board.groups.findIndex(g => g.items.some(i => i.id === movedItemId));
    let targetGroupIdx = board.groups.findIndex(g => g.items.some(i => i.id === targetId));
    if (sourceGroupIdx === -1 || targetGroupIdx === -1) {
      // If we dropped an item over an empty group header (or just a group id)
      targetGroupIdx = board.groups.findIndex(g => g.id === targetId);
      if(sourceGroupIdx === -1 || targetGroupIdx === -1) return;
    }

    let oldGroupId = board.groups[sourceGroupIdx].id;
    let newGroupId = board.groups[targetGroupIdx].id;
    let finalPosition = 0;
    setBoard((prev) => {
      if (!prev) return prev;
      let newGroups = JSON.parse(JSON.stringify(prev.groups));
      let sGroup = newGroups[sourceGroupIdx];
      let tGroup = newGroups[targetGroupIdx];
      let itemIdx = sGroup.items.findIndex((i: Item) => i.id === movedItemId);
      let [movedItem] = sGroup.items.splice(itemIdx, 1);
      
      let targetItemIdx = tGroup.items.findIndex((i: Item) => i.id === targetId);
      if (targetItemIdx === -1) targetItemIdx = tGroup.items.length;
      
      let prevItem = tGroup.items[targetItemIdx - 1];
      let nextItem = tGroup.items[targetItemIdx];
      if (prevItem && nextItem) finalPosition = (prevItem.position + nextItem.position) / 2;
      else if (prevItem) finalPosition = prevItem.position + 1024;
      else if (nextItem) finalPosition = nextItem.position / 2;
      else finalPosition = 1024;
      
      movedItem.groupId = newGroupId;
      movedItem.position = finalPosition;
      tGroup.items.splice(targetItemIdx, 0, movedItem);
      return { ...prev, groups: newGroups };
    });
    emitMoveItem({ itemId: movedItemId, newGroupId, newPosition: finalPosition });
  };

  const handleOptimisticUpdate = (itemId: string, columnId: string, value: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const newGroups = prev.groups.map(g => ({
        ...g,
        items: g.items.map(i => {
          if (i.id === itemId) {
            const idx = i.columnValues.findIndex(cv => cv.columnId === columnId);
            const newCv = [...i.columnValues];
            if (idx !== -1) newCv[idx] = { ...newCv[idx], value };
            else newCv.push({ id: crypto.randomUUID(), itemId, columnId, value });
            return { ...i, columnValues: newCv };
          }
          return i;
        })
      }));
      return { ...prev, groups: newGroups };
    });
  };

  const handleOptimisticDelete = (itemId: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map((g) => ({
          ...g,
          items: g.items.filter((i) => i.id !== itemId),
        })),
      };
    });
  };

  const cancelPendingDelete = useCallback((itemId: string) => {
    const p = pendingDeleteRef.current.get(itemId);
    if (!p) return;
    pendingDeleteRef.current.delete(itemId);
    dismiss(p.toastId, { runExpire: false });
  }, [dismiss]);

  const commitDeleteItem = useCallback((itemId: string) => {
    pendingDeleteRef.current.delete(itemId);
    socket.emit('delete_item', { itemId });
    apiFetch(`${API_BASE}/api/items/${itemId}`, { method: 'DELETE', silent: true }).catch((err) =>
      console.error('Error persistiendo eliminación de item', itemId, err)
    );
  }, []);

  const restoreItemSnapshot = useCallback((snapshot: Item, groupId: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map((g) => {
          if (g.id !== groupId) return g;
          if (g.items.some((i) => i.id === snapshot.id)) return g;
          const items = [...g.items, snapshot].sort((a, b) => a.position - b.position);
          return { ...g, items };
        }),
      };
    });
  }, []);

  /** Borrado con toast Deshacer (un ítem); usado desde vista tarjeta / swipe. */
  const handleDeleteItemWithUndo = useCallback(
    (itemId: string) => {
      if (!board || !canDeleteItem) return;
      const group = board.groups.find((g) => g.items.some((i) => i.id === itemId));
      if (!group) return;
      const item = group.items.find((i) => i.id === itemId);
      if (!item) return;
      const snapshot: Item = JSON.parse(JSON.stringify(item));
      const groupId = group.id;

      handleOptimisticDelete(itemId);

      const toastId = toast({
        message: 'Elemento eliminado',
        variant: 'success',
        action: {
          label: 'Deshacer',
          onClick: () => {
            cancelPendingDelete(itemId);
            restoreItemSnapshot(snapshot, groupId);
          },
        },
        onExpire: () => {
          commitDeleteItem(itemId);
        },
      });

      pendingDeleteRef.current.set(itemId, { toastId, snapshot, groupId });
    },
    [board, canDeleteItem, toast, commitDeleteItem, restoreItemSnapshot, cancelPendingDelete]
  );

  const isTaller = currentUser?.role === 'TALLER';
  const isAdminOrVentas = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';
  const statusColumnIds = useMemo(
    () => {
      const cols = board?.columns ?? [];
      // Preferir la(s) columna(s) cuyo título es exactamente "Estado" para filtros
      const estadoCols = cols.filter(c => c.type === 'status' && c.title === 'Estado');
      if (estadoCols.length > 0) return estadoCols.map(c => c.id);
      return cols.filter(c => c.type === 'status').map(c => c.id);
    },
    [board?.columns]
  );
  /** Columnas de estatus o seguimiento (priority) para detectar Aprobado */
  const statusOrPriorityColumnIds = useMemo(
    () => (board?.columns ?? []).filter(c => c.type === 'status' || c.type === 'priority').map(c => c.id),
    [board?.columns]
  );

  /** Opciones de estado para el filtro (columna "Estado" si existe, si no la primera de tipo status) */
  const filterStatusOptions = useMemo(() => {
    if (!board) return [];
    const statusCol =
      board.columns.find(c => c.type === 'status' && c.title === 'Estado') ||
      board.columns.find(c => c.type === 'status');
    if (!statusCol?.settings) return [];
    try {
      const s = JSON.parse(statusCol.settings);
      const opts = (s?.options ?? []) as { id: string; label: string; color?: string }[];
      return opts;
    } catch {
      return [];
    }
  }, [board]);
  const isItemApproved = useMemo(() => {
    return (item: Item) =>
      statusOrPriorityColumnIds.some(cid => {
        const cv = item.columnValues.find(v => v.columnId === cid);
        if (!cv?.value) return false;
        try {
          const p = JSON.parse(cv.value);
          return (p?.optionId ?? cv.value) === 'aprobado';
        } catch {
          return cv.value === 'aprobado';
        }
      });
  }, [statusOrPriorityColumnIds]);

  // Columnas visibles: para TALLER nombre, estatus, fecha colocación, periodo producción, archivos, hoja de trabajo (docs)
  const visibleColumns = useMemo(() => {
    if (!board) return [];
    if (isTaller) {
      // Para TALLER: ocultar la columna "Estado" (estado general) y dejar visibles:
      // - Docs (hoja de trabajo)
      // - Archivos (Drive)
      // - Fechas y timelines (solo lectura en los renderers)
      // - Estado Taller (status/priority identificado por título)
      return board.columns.filter(c => {
        if (c.title === 'Estado') return false;
        if (['docs', 'file', 'date', 'timeline'].includes(c.type)) return true;
        if ((c.type === 'status' || c.type === 'priority') && c.title === 'Estado Taller') return true;
        return false;
      });
    }
    return board.columns
      .filter(c => !hiddenColumns.includes(c.id))
      .filter(c => {
        // Estado Taller solo visible para TALLER
        if (c.title === 'Estado Taller') return false;
        // Estado Facturación y Documentos Facturación: solo para ADMIN/VENTAS
        if (c.title === 'Estado Facturación' || c.type === 'billing_docs' || c.title === 'Documentos Facturación') {
          return isAdminOrVentas;
        }
        return true;
      });
  }, [board, hiddenColumns, isTaller, isAdminOrVentas]);

  // ─── Client-side search + sort filter ─────────────────────────────────────
  const filteredGroups = useMemo(() => {
    if (!board) return [];

    let result = board.groups;
    if (isTaller) {
      result = result
        .map(g => ({ ...g, items: g.items.filter(isItemApproved) }))
        .filter(g => g.items.length > 0);
    }

    // 1. Filter by search query (debounced 300ms)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result
        .map(g => ({
          ...g,
          items: g.items.filter(i => i.name.toLowerCase().includes(q)),
        }))
        .filter(g => g.items.length > 0);
    }

    // 2. Filter by status (si hay columna de estado y se eligió una opción)
    if (filterByStatusOptionId && statusColumnIds.length > 0) {
      result = result
        .map(g => ({
          ...g,
          items: g.items.filter(i =>
            statusColumnIds.some(cid => {
              const cv = i.columnValues.find(v => v.columnId === cid)?.value;
              if (!cv) return filterByStatusOptionId === '__sin_estado__';
              try {
                const p = JSON.parse(cv);
                return (p?.optionId ?? cv) === filterByStatusOptionId;
              } catch {
                return cv === filterByStatusOptionId;
              }
            })
          ),
        }))
        .filter(g => g.items.length > 0);
    }

    // 3. Sort by column
    if (sortConfig) {
      result = result.map(g => {
        const sortedItems = [...g.items].sort((a, b) => {
          if (sortConfig.columnId === 'name') {
            return sortConfig.direction === 'asc'
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name);
          }

          const aVal = a.columnValues.find(v => v.columnId === sortConfig.columnId)?.value || '';
          const bVal = b.columnValues.find(v => v.columnId === sortConfig.columnId)?.value || '';

          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
        return { ...g, items: sortedItems };
      });
    }

    return result;
  }, [board, debouncedSearch, sortConfig, filterByStatusOptionId, statusColumnIds, isTaller, isItemApproved]);

  const rootFilteredGroups = useMemo(
    () => filteredGroups.filter(g => !g.parentGroupId),
    [filteredGroups]
  );

  const toggleHideColumn = (colId: string) => {
    setHiddenColumns(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  // Vista "Mi trabajo": solo elementos asignados al usuario actual (columna Personas/Responsable).
  const groupsForView = useMemo(() => {
    if (viewMode !== 'miTrabajo' || !currentUser || !board) return filteredGroups;
    const personCol = board.columns.find(c => c.type === 'person');
    if (!personCol) return filteredGroups;
    return filteredGroups
      .map(g => ({
        ...g,
        items: g.items.filter(item => {
          const cv = item.columnValues.find(v => v.columnId === personCol.id);
          if (!cv?.value) return false;
          try {
            const ids = JSON.parse(cv.value) as string[];
            return Array.isArray(ids) && ids.includes(currentUser.id);
          } catch {
            return cv.value === currentUser.id;
          }
        }),
      }))
      .filter(g => g.items.length > 0);
  }, [viewMode, currentUser, filteredGroups, board]);

  // Board con grupos filtrados; para vista de calendario usamos siempre todas las columnas originales
  // para que pueda seguir accediendo a columnas ocultas (ej. "Estado") al calcular aprobados/producción.
  const boardForView = useMemo(
    () =>
      board
        ? {
            ...board,
            groups: viewMode === 'miTrabajo' ? groupsForView : filteredGroups,
            columns: viewMode === 'calendar' ? board.columns : visibleColumns,
          }
        : null,
    [board, filteredGroups, visibleColumns, viewMode, groupsForView]
  );

  const displayGroups = viewMode === 'miTrabajo' ? groupsForView : filteredGroups;
  const rootDisplayGroups = useMemo(
    () => displayGroups.filter(g => !g.parentGroupId),
    [displayGroups]
  );

  const totalItemCount = useMemo(
    () => (board ? board.groups.reduce((acc, g) => acc + g.items.length, 0) : 0),
    [board]
  );
  /** Solo sin grupos: la vista vacía completa. Si hay grupos pero sin ítems, se muestran los grupos con filas vacías. */
  const noGroupsInBoard = Boolean(board && board.groups.length === 0);
  const hasFiltersOrSearch = Boolean(searchQuery.trim() || filterByStatusOptionId);

  // Asegurar que exista una columna "Estado Taller" con las opciones específicas.
  useEffect(() => {
    if (!board) return;
    const hasTallerStatus = board.columns.some(
      c => (c.type === 'status' || c.type === 'priority') && c.title === 'Estado Taller'
    );
    if (hasTallerStatus) return;

    const newPosition =
      board.columns.length > 0
        ? board.columns.reduce((max, c) => Math.max(max, c.position), 0) + 1024
        : 1024;

    const settings = JSON.stringify({
      options: [
        { id: 'en_proceso', label: 'En proceso', color: '#fdab3d' },
        { id: 'fabricado', label: 'Fabricado', color: '#579bfc' },
        { id: 'colocado', label: 'Colocado', color: '#00c875' },
        { id: 'default', label: '', color: '#c4c4c4' },
      ],
    });

    socket.emit('add_column', {
      boardId: board.id,
      title: 'Estado Taller',
      type: 'status',
      position: newPosition,
      settings,
    });
  }, [board]);
  // Asegurar columnas de facturación (solo Admin / Ventas)
  useEffect(() => {
    if (!board || !isAdminOrVentas) return;

    // Estado Facturación
    const hasEstadoFacturacion = board.columns.some(
      c => c.type === 'status' && c.title === 'Estado Facturación'
    );
    if (!hasEstadoFacturacion) {
      const newPosition =
        board.columns.length > 0
          ? board.columns.reduce((max, c) => Math.max(max, c.position), 0) + 1024
          : 1024;
      const settings = JSON.stringify({
        options: [
          { id: 'pendiente_factura', label: 'Pendiente de facturar', color: '#fdab3d' },
          { id: 'facturado', label: 'Facturado', color: '#579bfc' },
          { id: 'cobrado', label: 'Cobrado', color: '#00c875' },
          { id: 'default', label: '', color: '#c4c4c4' },
        ],
      });
      socket.emit('add_column', {
        boardId: board.id,
        title: 'Estado Facturación',
        type: 'status',
        position: newPosition,
        settings,
      });
    }

    // Documentos Facturación
    const hasBillingDocs = board.columns.some(
      c => c.type === 'billing_docs' || c.title === 'Documentos Facturación'
    );
    if (!hasBillingDocs) {
      const newPosition =
        board.columns.length > 0
          ? board.columns.reduce((max, c) => Math.max(max, c.position), 0) + 1024
          : 1024;
      socket.emit('add_column', {
        boardId: board.id,
        title: 'Documentos Facturación',
        type: 'billing_docs',
        position: newPosition,
        settings: null,
      });
    }
  }, [board, isAdminOrVentas]);
  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const bulkStatusColumn = useMemo(() => {
    if (!board) return null;
    return (
      board.columns.find((c) => c.type === 'status' && c.title === 'Estado') ||
      board.columns.find((c) => c.type === 'status') ||
      null
    );
  }, [board]);

  const bulkPersonColumn = useMemo(() => {
    if (!board) return null;
    return board.columns.find((c) => c.type === 'person') || null;
  }, [board]);

  const bulkStatusOptions = useMemo(() => {
    if (!bulkStatusColumn?.settings) return [] as { id: string; label: string; color?: string }[];
    try {
      const s = JSON.parse(bulkStatusColumn.settings);
      return (s?.options ?? []) as { id: string; label: string; color?: string }[];
    } catch {
      return [];
    }
  }, [bulkStatusColumn]);

  const applyBulkStatus = (optionId: string) => {
    if (!board || !bulkStatusColumn || selectedItemIds.size === 0) return;
    const valueStr = JSON.stringify({ optionId });
    selectedItemIds.forEach((itemId) => {
      handleOptimisticUpdate(itemId, bulkStatusColumn.id, valueStr);
      socket.emit('update_column_value', {
        itemId,
        columnId: bulkStatusColumn.id,
        value: valueStr,
      });
    });
    setShowBulkStatusPopover(false);
    clearSelection();
  };

  const applyBulkAssign = (userId: string | null) => {
    if (!board || !bulkPersonColumn || selectedItemIds.size === 0) return;
    const valueStr = userId ?? '';
    selectedItemIds.forEach((itemId) => {
      handleOptimisticUpdate(itemId, bulkPersonColumn.id, valueStr);
      socket.emit('update_column_value', {
        itemId,
        columnId: bulkPersonColumn.id,
        value: valueStr,
      });
    });
    setShowBulkAssignPopover(false);
    clearSelection();
  };

  if (!board) return (
    <div className="flex flex-col items-center justify-center h-full w-full p-6">
      <div className="w-full max-w-3xl space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 rounded-lg bg-monday-hover/80 animate-pulse border border-monday-border/40"
          />
        ))}
      </div>
      <p className="mt-4 text-[13px] text-monday-subtext">Cargando tablero…</p>
    </div>
  );

  const isCalendarOnlyLayout = (mobileCalendarOnly || calendarStandalone) && viewMode === 'calendar' && boardForView;
  if (isCalendarOnlyLayout) {
    // Móvil: sin barra "Crear Tarea" (el tap en el día abre el modal de opciones). Desktop: barra con hide-on-scroll.
    if (isMobile) {
      return (
        <div className="h-full w-full min-w-0 flex flex-col min-h-0">
          <div
            ref={setCalendarScrollRef}
            className="flex-1 min-h-0 w-full min-w-0 overflow-auto overflow-x-auto custom-scrollbar scroll-touch"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <CalendarView
              board={boardForView}
              onRowClick={onRowClick}
              isTallerView={isTaller}
              isMobile={isMobile}
              isLandscapeShort={isLandscapeShort}
              isMobileLandscape={isMobile && isLandscape}
              onOpenAddToProject={() => setAddToProjectOpen(true)}
              onRegisterOpenCalendarEvent={registerOpenCalendarEvent}
              defaultViewType={calendarStandalone ? 'week' : undefined}
            />
          </div>
        </div>
      );
    }
    const calendarBarHeightVisible = calendarBarHidden ? 0 : Math.max(calendarBarHeight, 48);
    return (
      <div className="h-full flex flex-col min-h-0">
        <motion.div
          className="min-h-0 overflow-hidden shrink-0"
          animate={{ height: calendarBarHeightVisible }}
          initial={false}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <div ref={setCalendarBarRefCallback} className="shrink-0 px-3 sm:px-6 py-2.5 border-b border-monday-border bg-[var(--monday-surface)] flex items-center gap-2">
            {!isTaller && (
              <div className="flex items-center bg-monday-blue rounded-monday shadow-monday-sm">
                <button
                  onClick={openAddToProject}
                  className="text-white text-[13px] font-semibold px-3.5 py-1.5 hover:bg-monday-blue/90 rounded-l-monday transition-colors"
                >
                  Crear Tarea
                </button>
                <Popover.Root open={newMenuOpen} onOpenChange={setNewMenuOpen}>
                  <Popover.Trigger asChild>
                    <button className="text-white px-2 py-1.5 hover:bg-monday-blue/90 rounded-r-monday transition-colors">
                      <ChevronDown size={14} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-50 bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border w-44 p-1 mt-1"
                      sideOffset={4}
                      align="start"
                    >
                      <button type="button" onClick={() => { setNewMenuOpen(false); openCalendarEventRef.current?.({ date: new Date(), eventType: 'levantamiento' }); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2" style={{ borderLeft: '3px solid #6e3cbb' }}>Levantamiento</button>
                      <button type="button" onClick={() => { setNewMenuOpen(false); openCalendarEventRef.current?.({ date: new Date(), eventType: 'pendiente' }); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2" style={{ borderLeft: '3px solid #ec4899' }}>Pendiente</button>
                      <button type="button" onClick={() => { setNewMenuOpen(false); openCalendarEventRef.current?.({ date: new Date(), eventType: 'colocacion' }); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2" style={{ borderLeft: '3px solid #0f766e' }}>Entrega</button>
                      <button type="button" onClick={openAddToProject} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2">Crear Tarea</button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            )}
          </div>
        </motion.div>
        <div
          ref={setCalendarScrollRef}
          className="flex-1 min-h-0 overflow-auto overflow-x-auto custom-scrollbar scroll-touch"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <CalendarView
            board={boardForView}
            onRowClick={onRowClick}
            isTallerView={isTaller}
            isMobile={isMobile}
            isLandscapeShort={isLandscapeShort}
            isMobileLandscape={isMobile && isLandscape}
            onOpenAddToProject={() => setAddToProjectOpen(true)}
            onRegisterOpenCalendarEvent={registerOpenCalendarEvent}
            defaultViewType={calendarStandalone ? 'week' : undefined}
          />
        </div>
      </div>
    );
  }

  const toolbarClass = `min-w-0 px-4 sm:px-6 ${isMobile && mobileOptimized ? 'py-1.5' : 'py-2.5'} border-b border-monday-border flex items-center gap-x-2 gap-y-2 shrink-0 bg-[var(--monday-surface)] ${mobileOptimized ? 'flex-nowrap' : 'flex-wrap'}`;
  const ToolbarWrapper = isMobile ? motion.div : 'div';
  // En móvil aseguramos que la toolbar sea visible inicialmente en lugar de height 0 (causa colapso)
  const toolbarHeightVisible = headerHidden ? 0 : 'auto';
  const toolbarWrapperProps = isMobile
    ? {
        className: 'min-h-0 overflow-hidden shrink-0',
        animate: { height: toolbarHeightVisible } as const,
        initial: false,
        transition: { duration: 0.25, ease: 'easeInOut' as const },
      }
    : { className: toolbarClass };

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* ── Action Toolbar: hide-on-scroll en móvil (altura animada para reclamar espacio) ─────────────────────────────────────── */}
      <ToolbarWrapper {...toolbarWrapperProps}>
        <div ref={isMobile ? toolbarRef : undefined} className={toolbarClass}>
          {/* Quick Filters (Píldoras) en móvil */}
          {isMobile && (
            <div className="flex-1 min-w-0 flex items-center gap-2 py-0.5">
              <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto hide-scrollbar scroll-touch max-w-[48%] sm:max-w-none">
                <button
                  type="button"
                  onClick={() => setMobileQuickFilter(mobileQuickFilter === 'mis tareas' ? null : 'mis tareas')}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                    mobileQuickFilter === 'mis tareas' ? 'bg-monday-blue text-white border-monday-blue' : 'bg-[var(--monday-surface)] text-monday-text border-monday-border hover:bg-monday-hover'
                  }`}
                >
                  Mis tareas
                </button>
                <button
                  type="button"
                  onClick={() => setMobileQuickFilter(mobileQuickFilter === 'pendiente' ? null : 'pendiente')}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                    mobileQuickFilter === 'pendiente' ? 'bg-monday-blue text-white border-monday-blue' : 'bg-[var(--monday-surface)] text-monday-text border-monday-border hover:bg-monday-hover'
                  }`}
                >
                  Pendientes
                </button>
              </div>
              <div className="relative flex-1 min-w-0 group/msearch">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-monday-subtext pointer-events-none" aria-hidden />
                <input
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={itemTextFilter}
                  onChange={(e) => setItemTextFilter(e.target.value)}
                  placeholder="Buscar en tabla…"
                  className="w-full min-w-0 min-h-[36px] pl-8 pr-2.5 rounded-full border border-monday-border bg-[var(--monday-surface)] text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue/35"
                  style={{ fontSize: 16 }}
                  aria-label="Buscar elementos en el tablero"
                />
              </div>
            </div>
          )}
        </div>
      </ToolbarWrapper>

      {hasFiltersOrSearch && (
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 border-b border-monday-border/70 bg-[var(--monday-bg)] shrink-0">
          {searchQuery.trim() !== '' && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="inline-flex items-center gap-1 rounded-full border border-monday-border bg-[var(--monday-surface)] px-2.5 py-1 text-[11px] text-monday-text hover:bg-monday-hover"
            >
              Búsqueda: <span className="max-w-[140px] truncate font-medium">{searchQuery}</span>
              <X size={12} className="opacity-70" aria-hidden />
            </button>
          )}
          {filterByStatusOptionId && (
            <button
              type="button"
              onClick={() => setFilterByStatusOptionId(null)}
              className="inline-flex items-center gap-1 rounded-full border border-monday-border bg-[var(--monday-surface)] px-2.5 py-1 text-[11px] text-monday-text hover:bg-monday-hover"
            >
              Estado:{' '}
              {bulkStatusOptions.find((o) => o.id === filterByStatusOptionId)?.label ?? filterByStatusOptionId}
              <X size={12} className="opacity-70" aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* ── Board Content: min-h-0 para que el flex permita scroll; touch para desplazamiento en móvil/horizontal ───────────────────────────────────────── */}
      <div
        ref={setScrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-touch overscroll-y-contain relative z-0 ${
          isMobile ? 'overflow-x-clip' : 'overflow-x-hidden'
        } ${
          isMobile && mobileOptimized
            ? isPortrait
              ? 'px-4 sm:px-6 pt-1 pb-4'
              : isLandscapeShort
                ? 'px-2 sm:px-3 py-1.5'
                : 'px-2 sm:px-4 pt-1 pb-3'
            : isPortrait
              ? 'px-4 sm:px-6 py-5'
              : isLandscapeShort
                ? 'px-2 sm:px-3 py-2'
                : 'px-2 sm:px-4 py-3'
        }`}
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
      >
        {viewMode === 'kanban' && boardForView ? (
          <KanbanView board={boardForView} onRowClick={onRowClick} isMobile={isMobile} isLandscapeShort={isLandscapeShort} />
        ) : viewMode === 'calendar' && boardForView ? (
          <CalendarView
            board={boardForView}
            onRowClick={onRowClick}
            isTallerView={isTaller}
            isMobile={isMobile}
            isLandscapeShort={isLandscapeShort}
            isMobileLandscape={isMobile && isLandscape}
            onOpenAddToProject={() => setAddToProjectOpen(true)}
            onRegisterOpenCalendarEvent={registerOpenCalendarEvent}
          />
        ) : viewMode === 'facturacion' && board ? (
          <FacturacionBoardView board={board} onRowClick={onRowClick} isMobile={isMobile} isLandscapeShort={isLandscapeShort} />
        ) : viewMode === 'resumen' && board ? (
          <ResumenBoardView board={board} onRowClick={onRowClick} isMobile={isMobile} isLandscapeShort={isLandscapeShort} />
        ) : viewMode === 'archivos' && board ? (
          <ArchivosBoardView board={board} onRowClick={onRowClick} isMobile={isMobile} isLandscapeShort={isLandscapeShort} />
        ) : viewMode === 'timeline' && board ? (
          <TimelineBoardView board={board} onRowClick={onRowClick} isMobile={isMobile} isLandscapeShort={isLandscapeShort} />
        ) : (viewMode === 'table' || viewMode === 'miTrabajo') && board ? (
          noGroupsInBoard ? (
            <EmptyState
              icon={LayoutGrid}
              title="Este tablero aún no tiene grupos"
              description="Crea un grupo para empezar a añadir tareas. Usa el botón de abajo o el de la barra si está visible."
              action={{
                label: 'Agregar grupo',
                onClick: () => void handleAddGroup(),
              }}
              className="py-16"
            />
          ) : hasFiltersOrSearch && rootDisplayGroups.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description="Ningún elemento coincide con la búsqueda o el filtro de estado. Prueba otras palabras o ajusta el filtro."
              action={{
                label: 'Limpiar búsqueda y filtro',
                onClick: () => {
                  setSearchQuery('');
                  setFilterByStatusOptionId(null);
                },
              }}
              className="py-16"
            />
          ) : viewMode === 'miTrabajo' && rootDisplayGroups.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="Mi trabajo vacío"
              description="No tienes elementos asignados en este tablero (columna Personas/Responsable)."
              className="py-16"
            />
          ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <GroupDragOverlay groups={displayGroups} />
            <div className="flex flex-col">
              <SortableContext items={rootDisplayGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
                {rootDisplayGroups.map((group, idx) => {
                  const isCollapsed = !!collapsedGroups[group.id];
                  const childGroups = !isCollapsed
                    ? displayGroups.filter(g => g.parentGroupId === group.id)
                    : [];

                  return (
                    <React.Fragment key={group.id}>
                      {/* Vista tabla / Mi trabajo: una sección por grupo raíz. Scroll único en el panel (sin scroll por grupo). */}
                      <section
                        className={`min-h-0 min-w-0 flex flex-col mb-6 ${useCardView ? '' : 'rounded-lg border border-monday-border'}`}
                      >
                        <BoardGroup
                          group={group}
                          allGroups={displayGroups}
                          columns={visibleColumns}
                          hiddenColumns={isTaller ? [] : hiddenColumns}
                          boardId={board.id}
                          onRowClick={onRowClick}
                          showAddColumn={!isTaller}
                          showAddRow={!isTaller}
                          collapsed={isCollapsed}
                          onToggleCollapse={() => toggleGroupCollapse(group.id)}
                          selectedItemIds={selectedItemIds}
                          onToggleItem={toggleItemSelection}
                          onToggleGroupAll={toggleGroupAll}
                          stackIndex={idx}
                          useCardView={useCardView}
                          enableSwipeActions={useCardView && isViewportMobile}
                          onOptimisticUpdate={handleOptimisticUpdate}
                          onOptimisticDelete={handleOptimisticDelete}
                          onDeleteItemWithUndo={handleDeleteItemWithUndo}
                          socketHighlightIds={socketRowHighlight}
                        />
                        {childGroups.map(sub => (
                          <div
                            key={sub.id}
                            className="ml-6 mt-2 pl-4 border-l-2 border-monday-border/60 bg-monday-hover/20 rounded-r-md py-1"
                            style={{ borderLeftColor: group.color }}
                          >
                            <BoardGroup
                              group={sub}
                              allGroups={displayGroups}
                              columns={visibleColumns}
                              hiddenColumns={isTaller ? [] : hiddenColumns}
                              boardId={board.id}
                              onRowClick={onRowClick}
                              showAddColumn={!isTaller}
                              showAddRow={!isTaller}
                              isSubgroup
                              indentFromParent
                              collapsed={!!collapsedGroups[sub.id]}
                              onToggleCollapse={() => toggleGroupCollapse(sub.id)}
                              selectedItemIds={selectedItemIds}
                              onToggleItem={toggleItemSelection}
                              onToggleGroupAll={toggleGroupAll}
                              stackIndex={idx}
                              useCardView={useCardView}
                              enableSwipeActions={useCardView && isViewportMobile}
                              onOptimisticUpdate={handleOptimisticUpdate}
                              onOptimisticDelete={handleOptimisticDelete}
                              onDeleteItemWithUndo={handleDeleteItemWithUndo}
                              socketHighlightIds={socketRowHighlight}
                            />
                          </div>
                        ))}
                      </section>
                    </React.Fragment>
                  );
                })}
              </SortableContext>

              {!mobileQuickFilter && !itemTextFilter.trim() && !isTaller && (
                <button
                  type="button"
                  onClick={() => void handleAddGroup()}
                  className="toolbar-btn border border-dashed border-monday-border hover:border-monday-blue w-max px-4 py-2 rounded-monday text-[13px] mt-2 group"
                >
                  <div className="bg-monday-hover group-hover:bg-blue-100 p-1 rounded-md transition-colors">
                    <Plus size={16} className="text-monday-subtext group-hover:text-monday-blue" />
                  </div>
                  Agregar grupo nuevo
                </button>
              )}
            </div>
          </DndContext>
          )
        ) : null}

        {/* Hint: selección múltiple (solo primera vez) */}
        {(viewMode === 'table' || viewMode === 'miTrabajo') && showMultiSelectHint && selectedItemIds.size > 0 && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={dismissMultiSelectHint}>
            <div
              className="bg-[var(--monday-surface)] rounded-xl shadow-monday-xl border border-monday-border p-6 max-w-sm mx-4 text-center"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-[16px] font-semibold text-monday-text mb-2">
                Actualiza elementos múltiples de una sola vez
              </h3>
              <p className="text-[13px] text-monday-subtext mb-4">
                Selecciona elementos para actualizar valores, duplicar, mover o eliminar con un solo clic.
              </p>
              <button
                type="button"
                onClick={dismissMultiSelectHint}
                className="px-4 py-2 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90"
              >
                Entiendo
              </button>
            </div>
          </div>
        )}

        {/* Barra flotante de acciones múltiples (sin IA) */}
        {(viewMode === 'table' || viewMode === 'miTrabajo') && selectedItemIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-4 py-3 bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border">
            <span className="text-[13px] font-medium text-monday-text whitespace-nowrap">
              {selectedItemIds.size} elemento{selectedItemIds.size !== 1 ? 's' : ''} seleccionado{selectedItemIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDuplicateSelected}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-text hover:bg-monday-hover"
                title="Duplicar"
              >
                <Copy size={14} />
                Duplicar
              </button>
              <button
                type="button"
                onClick={handleExportSelected}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-text hover:bg-monday-hover"
                title="Exportar"
              >
                <Download size={14} />
                Exportar
              </button>
              <button
                type="button"
                onClick={handleArchiveSelected}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-text hover:bg-monday-hover"
                title="Archivar"
              >
                <Archive size={14} />
                Archivar
              </button>
              {canDeleteItem && (
                <button
                  type="button"
                  onClick={openDeleteConfirm}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-red hover:bg-red-500/15"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              )}
              {bulkStatusColumn && bulkStatusOptions.length > 0 && (
                <Popover.Root open={showBulkStatusPopover} onOpenChange={setShowBulkStatusPopover}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-text hover:bg-monday-hover"
                      title="Cambiar estado"
                    >
                      <Tag size={14} />
                      Estado
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-[110] bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border w-56 p-2 max-h-64 overflow-y-auto"
                      sideOffset={8}
                      side="top"
                    >
                      <div className="text-[11px] font-semibold text-monday-subtext px-2 py-1 uppercase">Estado</div>
                      {bulkStatusOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => applyBulkStatus(opt.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-monday text-[13px] text-left hover:bg-monday-hover"
                        >
                          {opt.color && (
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                          )}
                          <span className="truncate">{opt.label || opt.id}</span>
                        </button>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
              {bulkPersonColumn && (
                <Popover.Root open={showBulkAssignPopover} onOpenChange={setShowBulkAssignPopover}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-text hover:bg-monday-hover"
                      title="Asignar"
                    >
                      <UserCircle2 size={14} />
                      Asignar
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-[110] bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border w-56 p-2 max-h-64 overflow-y-auto"
                      sideOffset={8}
                      side="top"
                    >
                      <div className="text-[11px] font-semibold text-monday-subtext px-2 py-1 uppercase">Persona</div>
                      <button
                        type="button"
                        onClick={() => applyBulkAssign(null)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-monday text-[13px] text-left text-monday-red hover:bg-red-500/10"
                      >
                        Quitar asignación
                      </button>
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => applyBulkAssign(u.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-monday text-[13px] text-left hover:bg-monday-hover"
                        >
                          <span
                            className="w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center font-semibold shrink-0"
                            style={{ backgroundColor: u.color }}
                          >
                            {u.initials}
                          </span>
                          <span className="truncate">{u.name}</span>
                        </button>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
              <Popover.Root open={showMovePopover} onOpenChange={setShowMovePopover}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-text hover:bg-monday-hover"
                    title="Mover"
                  >
                    <ArrowRightLeft size={14} />
                    Mover
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-[110] bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border w-52 p-2 max-h-64 overflow-y-auto"
                    sideOffset={8}
                    side="top"
                  >
                    <div className="text-[11px] font-semibold text-monday-subtext px-2 py-1 uppercase">Mover a grupo</div>
                    {board?.groups.filter(g => !g.parentGroupId).map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => { handleMoveSelected(g.id); setShowMovePopover(false); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-monday text-[13px] text-left hover:bg-monday-hover"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </button>
                    ))}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="p-1.5 rounded-monday text-monday-subtext hover:bg-monday-hover hover:text-monday-text"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Diálogo de confirmación eliminar elementos (interno, estilo app) */}
        <AnimatedDialog open={showDeleteItemsConfirm} onOpenChange={setShowDeleteItemsConfirm}>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--monday-surface)] rounded-xl shadow-monday-xl border border-monday-border p-6 w-[400px] max-w-[90vw] z-[151]"
            onCloseAutoFocus={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              deleteItemsCancelRef.current?.focus();
            }}
          >
            <Dialog.Title className="text-lg font-bold text-monday-text mb-1">
              Eliminar elementos
            </Dialog.Title>
            <Dialog.Description className="text-[14px] text-monday-subtext mb-6">
              ¿Eliminar {selectedItemIds.size} elemento{selectedItemIds.size !== 1 ? 's' : ''} seleccionado{selectedItemIds.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  ref={deleteItemsCancelRef}
                  type="button"
                  className="px-4 py-2 text-[13px] font-medium text-monday-text bg-monday-hover hover:bg-monday-border rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={confirmDeleteSelected}
                className="px-4 py-2 text-[13px] font-medium text-white bg-monday-red hover:bg-red-600 rounded-lg transition-colors"
              >
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </AnimatedDialog>

        {/* Modal Añadir a proyecto / Crear Tarea: unificado en todas las vistas; adaptativo por viewMode */}
        <Dialog.Root open={addToProjectOpen} onOpenChange={(open) => { setAddToProjectOpen(open); if (!open) setAddToProjectName(''); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--monday-surface)] rounded-xl shadow-monday-xl border border-monday-border p-6 w-[400px] max-w-[90vw] z-[151] sm:w-[400px]"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <Dialog.Title className="text-[18px] font-bold text-monday-text">
                  {viewMode === 'facturacion' ? 'Añadir elemento a proyecto' : 'Agregar Elemento'}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="p-1 rounded-monday text-monday-subtext hover:bg-monday-hover hover:text-monday-text">
                    <X size={20} />
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="text-[13px] text-monday-subtext mb-1 sr-only">
                Elige grupo, posición y nombre del elemento a crear.
              </Dialog.Description>

              <div className="flex flex-col gap-4">
                {/* Grupo */}
                <div className="flex items-center gap-3">
                  <Circle size={18} className="text-amber-500 shrink-0" fill="currentColor" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-[12px] font-medium text-monday-subtext mb-1">Grupo</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-monday-border rounded-lg bg-monday-hover/20">
                      {selectedGroupForProject && (
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: selectedGroupForProject.color }}
                        />
                      )}
                      <select
                        value={addToProjectGroupId}
                        onChange={(e) => { setAddToProjectGroupId(e.target.value); setAddToProjectAfterItemId(''); }}
                        className="flex-1 min-w-0 bg-transparent text-[13px] text-monday-text outline-none focus:ring-0 border-0 p-0 cursor-pointer"
                      >
                        {board?.groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Insertar después de */}
                <div className="flex items-center gap-3">
                  <ListOrdered size={18} className="text-monday-subtext shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-[12px] font-medium text-monday-subtext mb-1">Insertar después de</label>
                    <select
                      value={addToProjectAfterItemId}
                      onChange={(e) => setAddToProjectAfterItemId(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                    >
                      <option value="">Al inicio del grupo</option>
                      {selectedGroupForProject?.items.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Nombre */}
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-monday-subtext shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-[12px] font-medium text-monday-subtext mb-1">Nombre del elemento</label>
                    <input
                      type="text"
                      value={addToProjectName}
                      onChange={(e) => setAddToProjectName(e.target.value)}
                      placeholder="Ej. Nueva tarea"
                      className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text placeholder:text-monday-subtext outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-monday-border">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="px-4 py-2 text-[13px] font-medium text-monday-subtext hover:bg-monday-hover rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={handleAddToProjectSubmit}
                  disabled={addToProjectSubmitting || !addToProjectName.trim()}
                  className="px-4 py-2 text-[13px] font-medium text-white bg-monday-blue hover:bg-monday-blue/90 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addToProjectSubmitting ? 'Creando…' : (viewMode === 'facturacion' ? 'Añadir' : 'Crear Tarea')}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
};

export default BoardContainer;
