import React, { useEffect, useState, useMemo } from 'react';
import { Board, Group, BoardColumn, Item } from '../../types';
import { socket } from '../../store/socket';
import { BoardGroup } from './BoardGroup';
import {
  Plus, Search, Filter, ArrowUpDown, EyeOff, ChevronDown, X,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { KanbanView } from './KanbanView';
import { useUser } from '../../store/UserContext';
import * as Popover from '@radix-ui/react-popover';

interface Props {
  boardId: string;
  onRowClick: (item: Item) => void;
  viewMode: 'table' | 'kanban';
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
    socket.on('column_deleted', ({ columnId }: { columnId: string }) => {
      setBoard(prev => prev ? { ...prev, columns: prev.columns.filter(c => c.id !== columnId) } : prev);
    });

    return () => {
      socket.off('column_value_updated');
      socket.off('group_added');
      socket.off('item_added');
      socket.off('item_updated');
      socket.off('item_moved');
      socket.off('column_added');
      socket.off('column_renamed');
      socket.off('column_deleted');
    };
  }, [boardId]);

  const handleAddGroup = () => {
    if (!board) return;
    const colors = ['#00c875', '#fdab3d', '#e2445c', '#5559df', '#6e3cbb', '#0073ea'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !board) return;

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

  // ─── Client-side search + sort filter ─────────────────────────────────────
  const filteredGroups = useMemo(() => {
    if (!board) return [];
    
    // 1. Filter by search query
    let result = board.groups;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result
        .map(g => ({
          ...g,
          items: g.items.filter(i => i.name.toLowerCase().includes(q)),
        }))
        .filter(g => g.items.length > 0);
    }

    // 2. Sort by column
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
  }, [board, searchQuery, sortConfig]);

  const toggleHideColumn = (colId: string) => {
    setHiddenColumns(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  if (!board) return (
    <div className="flex items-center justify-center h-full text-monday-subtext text-sm gap-2">
      <div className="w-5 h-5 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
      Cargando tablero...
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* ── Action Toolbar ─────────────────────────────────────── */}
      <div className="px-6 py-2.5 border-b border-monday-border flex items-center gap-2 shrink-0 bg-white">
        {/* Primary CTA */}
        <div className="flex items-center bg-monday-blue rounded-monday shadow-monday-sm mr-2">
          <button
            onClick={handleAddItemFromToolbar}
            className="text-white text-[13px] font-semibold px-3.5 py-1.5 hover:bg-monday-blue/90 rounded-l-monday transition-colors"
          >
            + Nuevo elemento
          </button>
          <div className="w-px h-5 bg-white/30" />
          <button className="text-white px-2 py-1.5 hover:bg-monday-blue/90 rounded-r-monday transition-colors">
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="w-px h-5 bg-monday-border" />

        {/* Search */}
        {showSearch ? (
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
        )}

        <button className="toolbar-btn">
          <Filter size={15} />
          <span>Filtrar</span>
        </button>

        {/* Sort Popover */}
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

        {/* Hide Popover */}
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
      </div>

      {/* ── Board Content ───────────────────────────────────────── */}
      <div className="flex-1 overflow-auto custom-scrollbar px-6 py-5">
        {viewMode === 'kanban' ? (
          <KanbanView board={board} onRowClick={onRowClick} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-8">
              <SortableContext items={filteredGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
                {filteredGroups.map(group => (
                  <BoardGroup
                    key={group.id}
                    group={group}
                    allGroups={board.groups}
                    columns={board.columns}
                    hiddenColumns={hiddenColumns}
                    boardId={board.id}
                    onRowClick={onRowClick}
                  />
                ))}
              </SortableContext>

              {searchQuery.trim() === '' && (
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
        )}
      </div>
    </div>
  );
};

export default BoardContainer;
