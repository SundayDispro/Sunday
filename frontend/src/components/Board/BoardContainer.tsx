import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Board, Group, BoardColumn, Item } from '../../types';
import { socket } from '../../store/socket';
import { BoardGroup } from './BoardGroup';
import {
  Plus, Search, Filter, ArrowUpDown, EyeOff, ChevronDown, X, Folder,
  Copy, Download, Archive, Trash2, ArrowRightLeft, Circle, ListOrdered, FileText,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';

interface Props {
  boardId: string;
  onRowClick: (item: Item) => void;
  viewMode: 'table' | 'kanban' | 'calendar' | 'facturacion' | 'resumen' | 'archivos' | 'miTrabajo' | 'timeline';
}

function GroupDragOverlay({ groups }: { groups: Group[] }) {
  const { active } = useDndContext();
  const group = active?.id ? groups.find(g => g.id === active.id) : null;
  if (!group) return null;
  return (
    <DragOverlay>
      <div
        className="bg-white rounded-lg border border-monday-border shadow-monday-lg px-4 py-3 flex items-center gap-3 min-w-[200px]"
        style={{ borderLeftWidth: 4, borderLeftColor: group.color }}
      >
        <span className="font-medium text-monday-text truncate">{group.name}</span>
        <span className="text-monday-subtext text-[13px] shrink-0">{group.items.length} elementos</span>
      </div>
    </DragOverlay>
  );
}

const BoardContainer: React.FC<Props> = ({ boardId, onRowClick, viewMode }) => {
  const { currentUser } = useUser();
  const [board, setBoard] = useState<Board | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
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
  const [showDeleteItemsConfirm, setShowDeleteItemsConfirm] = useState(false);
  const [addToProjectOpen, setAddToProjectOpen] = useState(false);
  const [addToProjectGroupId, setAddToProjectGroupId] = useState<string>('');
  const [addToProjectAfterItemId, setAddToProjectAfterItemId] = useState<string>('');
  const [addToProjectName, setAddToProjectName] = useState('');
  const [addToProjectSubmitting, setAddToProjectSubmitting] = useState(false);

  /** Ref para abrir el modal de evento de calendario con tipo (desde la barra en vista calendario). */
  const openCalendarEventRef = useRef<((opts: { date: Date; eventType: CalendarEventKind }) => void) | null>(null);
  const registerOpenCalendarEvent = useCallback((open: (opts: { date: Date; eventType: CalendarEventKind }) => void) => {
    openCalendarEventRef.current = open;
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchBoard = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/boards/${boardId}`);
      if (res.ok) {
        const data = await res.json();
        setBoard(data);
      }
    } catch (err) {
      console.error('Error fetching board:', err);
    }
  };

  useEffect(() => {
    fetchBoard();

    socket.on('column_value_updated', (updatedValue) => {
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

    return () => {
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
    };
  }, [boardId]);

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
    if (selectedItemIds.size === 0) return;
    setShowDeleteItemsConfirm(true);
  };

  const confirmDeleteSelected = () => {
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
      fetch(`http://localhost:3001/api/items/${itemId}`, { method: 'DELETE' }).catch(err =>
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
    alert(`Exportar ${selectedItemIds.size} elemento(s): puedes ampliar esta función para descargar CSV o JSON.`);
  };

  const handleArchiveSelected = () => {
    if (selectedItemIds.size === 0) return;
    alert('Archivar: crea un grupo "Archivados" y usa Mover para llevar los elementos allí.');
  };

  const dismissMultiSelectHint = () => {
    setShowMultiSelectHint(false);
    try { localStorage.setItem('sunday-multiselect-hint', 'dismissed'); } catch {}
  };

  const handleAddGroup = () => {
    if (!board) return;
    const randomColor = GROUP_PALETTE[Math.floor(Math.random() * GROUP_PALETTE.length)];
    const newPosition = board.groups.length > 0 ? board.groups.reduce((max, g) => Math.max(max, g.position), 0) + 1024 : 1024;
    socket.emit('add_group', { boardId: board.id, name: 'Nuevo grupo', color: randomColor, position: newPosition });
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

      fetch(`http://localhost:3001/api/boards/${board.id}/columns/reorder`, {
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
    socket.emit('move_item', { itemId: movedItemId, newGroupId, newPosition: finalPosition });
  };

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
          return (p?.optionId ?? cv) === 'aprobado';
        } catch {
          return cv === 'aprobado';
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
        // Estado Facturación y Documentos Facturación solo en vista Facturación, no en vista general
        if (c.title === 'Estado Facturación') return false;
        if (c.type === 'billing_docs' || c.title === 'Documentos Facturación') return false;
        return true;
      });
  }, [board, hiddenColumns, isTaller]);

  // ─── Client-side search + sort filter ─────────────────────────────────────
  const filteredGroups = useMemo(() => {
    if (!board) return [];

    let result = board.groups;
    if (isTaller) {
      result = result
        .map(g => ({ ...g, items: g.items.filter(isItemApproved) }))
        .filter(g => g.items.length > 0);
    }

    // 1. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
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
  }, [board, searchQuery, sortConfig, filterByStatusOptionId, statusColumnIds, isTaller, isItemApproved]);

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


  if (!board) return (
    <div className="flex items-center justify-center h-full text-monday-subtext text-sm gap-2">
      <div className="w-5 h-5 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
      Cargando tablero...
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* ── Action Toolbar: adaptada por vista (tabla = todo; kanban = filtrar y ordenar; calendario = Crear Tarea + eventos; facturación = Crear Tarea) ─────────────────────────────────────── */}
      <div className="px-6 py-2.5 border-b border-monday-border flex items-center gap-2 shrink-0 bg-white flex-wrap">
        {/* Primary CTA: en tabla "+ Nuevo elemento", en calendario "Crear Tarea"; oculto en Kanban y Facturación. */}
        {!isTaller && viewMode !== 'kanban' && viewMode !== 'facturacion' && viewMode !== 'resumen' && viewMode !== 'archivos' && viewMode !== 'timeline' && (
        <div className="flex items-center bg-monday-blue rounded-monday shadow-monday-sm mr-2">
          <button
            onClick={openAddToProject}
            className="text-white text-[13px] font-semibold px-3.5 py-1.5 hover:bg-monday-blue/90 rounded-l-monday transition-colors"
          >
            {viewMode === 'calendar' ? 'Crear Tarea' : '+ Nuevo elemento'}
          </button>
          <div className="w-px h-5 bg-white/30" />
          <Popover.Root open={newMenuOpen} onOpenChange={setNewMenuOpen}>
            <Popover.Trigger asChild>
              <button className="text-white px-2 py-1.5 hover:bg-monday-blue/90 rounded-r-monday transition-colors">
                <ChevronDown size={14} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-44 p-1 mt-1"
                sideOffset={4}
                align="start"
              >
                {viewMode === 'table' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        handleAddItemFromToolbar();
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md"
                    >
                      Nuevo elemento
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        handleAddGroup();
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md"
                    >
                      Nuevo grupo
                    </button>
                  </>
                )}
                {viewMode === 'calendar' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        openCalendarEventRef.current?.({ date: new Date(), eventType: 'levantamiento' });
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2"
                      style={{ borderLeft: '3px solid #6e3cbb' }}
                    >
                      Levantamiento
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        openCalendarEventRef.current?.({ date: new Date(), eventType: 'pendiente' });
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2"
                      style={{ borderLeft: '3px solid #ec4899' }}
                    >
                      Pendiente
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        openCalendarEventRef.current?.({ date: new Date(), eventType: 'colocacion' });
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2"
                      style={{ borderLeft: '3px solid #0f766e' }}
                    >
                      Entrega
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={openAddToProject}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-hover rounded-md flex items-center gap-2"
                >
                  <Folder size={14} className="text-monday-subtext shrink-0" />
                  Añadir a proyecto
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        )}

        <div className="w-px h-5 bg-monday-border" />

        {/* Búsqueda: vista tabla y Mi trabajo */}
        {(viewMode === 'table' || viewMode === 'miTrabajo') && (showSearch ? (
          <div className="flex items-center gap-1.5 bg-monday-hover border border-monday-border rounded-monday px-2.5 py-1 fade-in">
            <Search size={14} className="text-monday-subtext shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar elemento..."
              className="bg-transparent outline-none text-[13px] text-monday-text w-40 placeholder:text-monday-subtext"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-monday-subtext hover:text-monday-text">
                <X size={13} />
              </button>
            )}
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-monday-subtext hover:text-monday-text ml-1">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowSearch(true)} className="toolbar-btn">
            <Search size={15} />
            <span>Buscar</span>
          </button>
        ))}

        {/* Filtrar: tabla, kanban y Mi trabajo (por estado) */}
        {(viewMode === 'table' || viewMode === 'kanban' || viewMode === 'miTrabajo') && (
        <Popover.Root open={showFilter} onOpenChange={setShowFilter}>
          <Popover.Trigger asChild>
            <button className={`toolbar-btn ${filterByStatusOptionId ? 'bg-blue-50 text-monday-blue border-blue-200' : ''}`}>
              <Filter size={15} />
              <span>Filtrar {filterByStatusOptionId && <span className="w-1.5 h-1.5 rounded-full bg-monday-blue ml-1 inline-block" />}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-52 p-2 fade-in mt-1" sideOffset={5}>
              <div className="text-[12px] font-semibold text-monday-subtext px-2 py-1 uppercase tracking-tight">Filtrar por estado</div>
              <button
                type="button"
                onClick={() => { setFilterByStatusOptionId(null); setShowFilter(false); }}
                className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors ${!filterByStatusOptionId ? 'bg-blue-50 text-monday-blue font-medium' : 'hover:bg-monday-hover text-monday-text'}`}
              >
                Todos los estados
              </button>
              {filterStatusOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setFilterByStatusOptionId(opt.id); setShowFilter(false); }}
                  className={`w-full text-left px-2 py-1.5 text-[13px] rounded-md transition-colors flex items-center gap-2 ${filterByStatusOptionId === opt.id ? 'bg-blue-50 text-monday-blue font-medium' : 'hover:bg-monday-hover text-monday-text'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color ?? '#c4c4c4' }} />
                  {opt.label}
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        )}

        {/* Sort Popover: tabla, kanban y Mi trabajo */}
        {(viewMode === 'table' || viewMode === 'kanban' || viewMode === 'miTrabajo') && (
        <>
        <Popover.Root open={showSort} onOpenChange={setShowSort}>
          <Popover.Trigger asChild>
            <button className={`toolbar-btn ${sortConfig ? 'bg-blue-50 text-monday-blue border-blue-200' : ''}`}>
              <ArrowUpDown size={15} />
              <span>Ordenar {sortConfig && <span className="w-1.5 h-1.5 rounded-full bg-monday-blue ml-1 inline-block" />}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-56 p-2 fade-in mt-1" sideOffset={5}>
              <div className="text-[12px] font-semibold text-monday-subtext mb-2 px-2 uppercase tracking-tight">Ordenar por</div>
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto custom-scrollbar">
                
                {/* Clear sort */}
                {sortConfig && (
                  <button onClick={() => setSortConfig(null)} className="w-full text-left px-2 py-1.5 text-[13px] text-monday-red hover:bg-red-50 rounded-md transition-colors font-medium">
                    Limpiar orden
                  </button>
                )}

                {/* Name Sort */}
                <div className="flex items-center gap-1 px-1">
                  <button 
                    onClick={() => setSortConfig({ columnId: 'name', direction: 'asc' })}
                    className={`flex-1 text-left px-2 py-1.5 text-[13px] hover:bg-monday-hover rounded-md transition-colors ${sortConfig?.columnId === 'name' && sortConfig.direction === 'asc' ? 'bg-blue-50 text-monday-blue font-medium' : 'text-monday-text'}`}
                  >
                    Nombre (A-Z)
                  </button>
                  <button 
                    onClick={() => setSortConfig({ columnId: 'name', direction: 'desc' })}
                    className={`px-2 py-1.5 text-[13px] hover:bg-monday-hover rounded-md transition-colors ${sortConfig?.columnId === 'name' && sortConfig.direction === 'desc' ? 'bg-blue-50 text-monday-blue font-medium' : 'text-monday-subtext'}`}
                    title="Z-A"
                  >
                    ↓
                  </button>
                </div>

                {/* Dynamic Columns Sort */}
                {board.columns.map(col => (
                  <div key={col.id} className="flex items-center gap-1 px-1">
                    <button 
                      onClick={() => setSortConfig({ columnId: col.id, direction: 'asc' })}
                      className={`flex-1 text-left px-2 py-1.5 text-[13px] hover:bg-monday-hover rounded-md transition-colors truncate ${sortConfig?.columnId === col.id && sortConfig.direction === 'asc' ? 'bg-blue-50 text-monday-blue font-medium' : 'text-monday-text'}`}
                    >
                      {col.title}
                    </button>
                    <button 
                      onClick={() => setSortConfig({ columnId: col.id, direction: 'desc' })}
                      className={`px-2 py-1.5 text-[13px] hover:bg-monday-hover rounded-md transition-colors ${sortConfig?.columnId === col.id && sortConfig.direction === 'desc' ? 'bg-blue-50 text-monday-blue font-medium' : 'text-monday-subtext'}`}
                      title="Descendente"
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* Ocultar columnas: vista tabla y Mi trabajo */}
        {(viewMode === 'table' || viewMode === 'miTrabajo') && (
        <Popover.Root open={showHide} onOpenChange={setShowHide}>
          <Popover.Trigger asChild>
            <button className={`toolbar-btn ${hiddenColumns.length > 0 ? 'bg-blue-50 text-monday-blue border-blue-200' : ''}`}>
              <EyeOff size={15} />
              <span>Ocultar {hiddenColumns.length > 0 && `(${hiddenColumns.length})`}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-56 p-2 fade-in mt-1" sideOffset={5}>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-[12px] font-semibold text-monday-subtext uppercase tracking-tight">Ocultar columnas</span>
                {hiddenColumns.length > 0 && (
                  <button onClick={() => setHiddenColumns([])} className="text-[11px] text-monday-blue hover:underline">
                    Mostar todas
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto custom-scrollbar">
                {board.columns.map(col => (
                  <label key={col.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-monday-hover rounded-md cursor-pointer transition-colors group">
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 accent-monday-blue cursor-pointer"
                      checked={!hiddenColumns.includes(col.id)}
                      onChange={() => toggleHideColumn(col.id)}
                    />
                    <span className={`text-[13px] group-hover:text-monday-text transition-colors ${hiddenColumns.includes(col.id) ? 'text-monday-subtext line-through' : 'text-monday-text'}`}>
                      {col.title}
                    </span>
                  </label>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        )}
        </>
        )}

      </div>

      {/* ── Board Content ───────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto custom-scrollbar px-6 py-5">
        {viewMode === 'kanban' && boardForView ? (
          <KanbanView board={boardForView} onRowClick={onRowClick} />
        ) : viewMode === 'calendar' && boardForView ? (
          <CalendarView
            board={boardForView}
            onRowClick={onRowClick}
            isTallerView={isTaller}
            onOpenAddToProject={() => setAddToProjectOpen(true)}
            onRegisterOpenCalendarEvent={registerOpenCalendarEvent}
          />
        ) : viewMode === 'facturacion' && board ? (
          <FacturacionBoardView board={board} onRowClick={onRowClick} />
        ) : viewMode === 'resumen' && board ? (
          <ResumenBoardView board={board} onRowClick={onRowClick} />
        ) : viewMode === 'archivos' && board ? (
          <ArchivosBoardView board={board} onRowClick={onRowClick} />
        ) : viewMode === 'timeline' && board ? (
          <TimelineBoardView board={board} onRowClick={onRowClick} />
        ) : (viewMode === 'table' || viewMode === 'miTrabajo') && board ? (
          rootDisplayGroups.length === 0 && viewMode === 'miTrabajo' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-monday-subtext text-[13px]">
              <p className="font-medium text-monday-text">Mi trabajo</p>
              <p className="mt-1">No tienes elementos asignados en este tablero (columna Personas/Responsable).</p>
            </div>
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
                      {/* Vista tabla / Mi trabajo: una sección por grupo raíz */}
                      <section
                        className="min-h-0 flex flex-col max-h-[calc(100vh-180px)] overflow-y-auto custom-scrollbar mb-6 rounded-lg border border-monday-border"
                        style={{ contain: 'layout' }}
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
                            />
                          </div>
                        ))}
                      </section>
                    </React.Fragment>
                  );
                })}
              </SortableContext>

              {searchQuery.trim() === '' && !isTaller && (
                <button
                  onClick={handleAddGroup}
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
              className="bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 max-w-sm mx-4 text-center"
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
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-4 py-3 bg-white rounded-xl shadow-monday-lg border border-monday-border">
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
              <button
                type="button"
                onClick={openDeleteConfirm}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday text-[12px] text-monday-red hover:bg-red-50"
                title="Eliminar"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
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
                    className="z-[110] bg-white rounded-xl shadow-monday-lg border border-monday-border w-52 p-2 max-h-64 overflow-y-auto"
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
        <Dialog.Root open={showDeleteItemsConfirm} onOpenChange={setShowDeleteItemsConfirm}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150] fade-in" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 w-[400px] max-w-[90vw] z-[151] zoom-in"
              onCloseAutoFocus={(e) => e.preventDefault()}
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
          </Dialog.Portal>
        </Dialog.Root>

        {/* Modal Añadir a proyecto / Crear Tarea: unificado en todas las vistas; adaptativo por viewMode */}
        <Dialog.Root open={addToProjectOpen} onOpenChange={(open) => { setAddToProjectOpen(open); if (!open) setAddToProjectName(''); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 w-[400px] max-w-[90vw] z-[151] sm:w-[400px]"
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
