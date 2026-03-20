import React, { useMemo, useRef, useState } from 'react';
import { Group, BoardColumn, Item } from '../../types';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { SortableContext, verticalListSortingStrategy, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DraggableRow } from './DraggableRow';
import { GripVertical, MessageSquare, Plus, ChevronDown, MoreHorizontal, Pencil, Trash2, Tag } from 'lucide-react';
import { StatusCellRenderer } from './StatusCellRenderer';
import { ColumnTypePicker } from './ColumnTypePicker';
import { socket, emitMoveItem } from '../../store/socket';
import { AnimatedDialog } from '../AnimatedDialog';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { PersonCellRenderer } from './PersonCellRenderer';
import { DateCellRenderer } from './DateCellRenderer';
import { ContactCellRenderer } from './ContactCellRenderer';
import { ExcelCellRenderer } from './ExcelCellRenderer';
import { DocsCellRenderer } from './DocsCellRenderer';
import { BillingDocsCellRenderer } from './BillingDocsCellRenderer';
import { TimelineCellRenderer } from './TimelineCellRenderer';
import { FileCellRenderer } from './FileCellRenderer';
import { GroupColorPicker, GROUP_PALETTE } from './GroupColorPicker';
import { StatusLabelsEditor } from './StatusLabelsEditor';
import { HorizontalScrollArea } from '../HorizontalScrollArea';
import { useUser } from '../../store/UserContext';
import { can } from '../../authz/can';
import { motion } from 'framer-motion';
import { SwipeableItemCard } from './SwipeableItemCard';

interface Props {
  group: Group;
  allGroups?: Group[];
  columns: BoardColumn[];
  hiddenColumns?: string[];
  boardId: string;
  onRowClick: (item: Item) => void;
  /** Si false (ej. vista Taller), no se muestra la columna "+" para añadir columna */
  showAddColumn?: boolean;
  /** Si false (ej. vista Taller), no se muestra la fila "Agregar elemento" */
  showAddRow?: boolean;
  isSubgroup?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** IDs de elementos seleccionados (selección múltiple tipo Monday) */
  selectedItemIds?: Set<string>;
  onToggleItem?: (itemId: string, checked: boolean) => void;
  onToggleGroupAll?: (groupId: string, checked: boolean) => void;
  /** Índice para apilamiento: grupos con índice mayor se pintan encima al hacer scroll. */
  stackIndex?: number;
  /** Si true, el subgrupo ya está dentro de un contenedor indentado (v. tabla) y no se añade ml-6 al header. */
  indentFromParent?: boolean;
  /** En viewport &lt; 640px: mostrar lista de tarjetas en lugar de tabla horizontal. */
  useCardView?: boolean;
  enableSwipeActions?: boolean;

  onOptimisticUpdate?: (itemId: string, columnId: string, value: string) => void;
  onOptimisticDelete?: (itemId: string) => void;
}

const columnHelper = createColumnHelper<Item>();

// ── Editable text cell for text columns ───────────────────────────────────
const TextCell: React.FC<{ content: string; item: Item; column: BoardColumn }> = ({ content, item, column }) => {
  const { currentUser } = useUser();
  const isTaller = currentUser?.role === 'TALLER';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const inputRef = useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  // Para TALLER, los textos son solo lectura
  if (isTaller) {
    return (
      <div className="w-full h-full min-h-[38px] flex items-center px-2">
        <span className="text-[13px] text-monday-text truncate">
          {content || <span className="text-monday-subtext">—</span>}
        </span>
      </div>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== content) {
      socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: draft });
    } else {
      setDraft(content);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(content);
            setEditing(false);
          }
        }}
        onClick={e => e.stopPropagation()}
        className="w-full h-full min-h-[38px] bg-[var(--monday-surface)] border border-monday-blue rounded outline-none text-[13px] text-monday-text px-2"
      />
    );
  }
  return (
    <div
      className="w-full h-full min-h-[38px] flex items-center px-2 cursor-pointer hover:bg-monday-hover transition-colors"
      onClick={e => {
        e.stopPropagation();
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }}
    >
      <span className="text-[13px] text-monday-text truncate">
        {content || <span className="text-monday-subtext">—</span>}
      </span>
    </div>
  );
};

// ── Inline text cell (item name) ──────────────────────────────────────────
const InlineNameCell: React.FC<{
  item: Item;
  onOpen: () => void;
  allGroups?: Group[];
  currentGroupId: string;
}> = ({ item, onOpen, allGroups, currentGroupId }) => {
  const { currentUser } = useUser();
  const isTaller = currentUser?.role === 'TALLER';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== item.name) {
      socket.emit('update_item_name', { itemId: item.id, name: draft.trim() });
    } else {
      setDraft(item.name);
    }
  };

  const handleMoveToGroup = (targetGroupId: string) => {
    setMenuOpen(false);
    emitMoveItem({ itemId: item.id, newGroupId: targetGroupId, newPosition: 999999 });
  };

  // Para TALLER: el nombre es solo lectura, pero puede abrir el panel de detalles.
  if (isTaller) {
    return (
      <div className="flex items-center gap-2 group/item h-full w-full px-2">
        <button
          className="text-[13px] text-left text-monday-text hover:text-monday-blue transition-colors truncate flex-1 min-w-0"
          onClick={e => {
            e.stopPropagation();
            onOpen();
          }}
          title={item.name}
        >
          {item.name}
        </button>
        <button
          className="text-monday-border hover:text-monday-blue shrink-0 p-1 opacity-0 group-hover/item:opacity-100 transition-all"
          onClick={e => {
            e.stopPropagation();
            onOpen();
          }}
          title="Abrir panel de detalles"
        >
          <MessageSquare size={14} />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(item.name);
            setEditing(false);
          }
        }}
        onClick={e => e.stopPropagation()}
        className="w-full bg-[var(--monday-surface)] border border-monday-blue rounded-sm outline-none text-[13px] text-monday-text px-1 py-0.5 shadow-monday-sm"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 group/item h-full w-full px-2">
      <button
        className="text-[13px] text-left text-monday-text hover:text-monday-blue transition-colors truncate flex-1 min-w-0"
        onClick={e => {
          e.stopPropagation();
          setEditing(true);
          setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }, 0);
        }}
        title="Clic para editar nombre"
      >
        {item.name}
      </button>

      <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-all">
        <button
          className="text-monday-border hover:text-monday-blue shrink-0 p-1"
          onClick={e => {
            e.stopPropagation();
            onOpen();
          }}
          title="Abrir panel de detalles"
        >
          <MessageSquare size={14} />
        </button>

        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            <button
              className="text-monday-border hover:text-monday-blue shrink-0 p-1"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-[100] bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border w-48 p-1.5 fade-in box-border"
              sideOffset={5}
              align="start"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-[11px] font-semibold text-monday-subtext mb-1 px-2 uppercase tracking-wider">
                Mover a...
              </div>
              <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                {allGroups?.filter(g => g.id !== currentGroupId).map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleMoveToGroup(g.id)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-monday-hover rounded-monday transition-colors"
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="text-[13px] text-monday-text truncate">{g.name}</span>
                  </button>
                ))}
                {allGroups?.length === 1 && (
                  <div className="px-2 py-2 text-[12px] text-monday-subtext italic">
                    No hay otros grupos disponibles.
                  </div>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
};

// ── Column header with rename / delete + drag ─────────────────────────────
const ColumnHeader: React.FC<{ col: BoardColumn; onEditLabels?: (col: BoardColumn) => void }> = ({ col, onEditLabels }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(col.title);
  const { currentUser } = useUser();
  const canDeleteColumn = can(currentUser, 'column.delete');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'grab',
    opacity: isDragging ? 0.7 : 1,
  };

  const commitRename = () => {
    setRenaming(false);
    if (draft.trim() && draft !== col.title) {
      socket.emit('rename_column', { columnId: col.id, title: draft.trim() });
    } else {
      setDraft(col.title);
    }
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(col.title); setRenaming(false); } }}
        onClick={e => e.stopPropagation()}
        className="w-full bg-[var(--monday-surface)] border border-monday-blue rounded-sm outline-none text-[13px] text-monday-text px-1.5 py-0.5 text-center"
      />
    );
  }

  return (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-center gap-1 group/colhead w-full px-1"
      >
        <button
          {...attributes}
          {...listeners}
          className="text-monday-border hover:text-monday-subtext shrink-0 cursor-grab"
          onClick={e => e.stopPropagation()}
          title="Arrastrar para reordenar"
        >
          <GripVertical size={12} />
        </button>
        <span className="text-[12px] font-medium text-monday-subtext truncate">{col.title}</span>
        <Popover.Trigger asChild>
          <button
            className="opacity-0 group-hover/colhead:opacity-100 transition-opacity text-monday-subtext hover:text-monday-text shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          className="z-[100] bg-[var(--monday-surface)] rounded-xl shadow-monday-lg border border-monday-border w-44 p-1.5 fade-in"
          sideOffset={4}
          align="center"
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2.5 text-[13px] text-monday-text hover:bg-monday-hover px-3 py-2 rounded-monday"
            onClick={() => { setMenuOpen(false); setRenaming(true); setDraft(col.title); }}
          >
            <Pencil size={14} className="text-monday-subtext" />
            Renombrar
          </button>
          {(col.type === 'status' || col.type === 'priority') && onEditLabels && (
            <button
              className="w-full flex items-center gap-2.5 text-[13px] text-monday-text hover:bg-monday-hover px-3 py-2 rounded-monday"
              onClick={() => { setMenuOpen(false); onEditLabels(col); }}
            >
              <Tag size={14} className="text-monday-subtext" />
              Editar etiquetas
            </button>
          )}
          {canDeleteColumn && (
            <button
              className="w-full flex items-center gap-2.5 text-[13px] text-monday-red hover:bg-red-500/15 px-3 py-2 rounded-monday"
              onClick={() => { setMenuOpen(false); socket.emit('delete_column', { columnId: col.id }); }}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          )}
          <Popover.Arrow className="fill-[var(--monday-surface)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

// ── Main BoardGroup ────────────────────────────────────────────────────────
export const BoardGroup: React.FC<Props> = ({
  group,
  allGroups,
  columns,
  hiddenColumns,
  boardId,
  onRowClick,
  showAddColumn = true,
  showAddRow = true,
  isSubgroup = false,
  collapsed,
  onToggleCollapse,
  selectedItemIds = new Set(),
  onToggleItem,
  onToggleGroupAll,
  stackIndex = 0,
  indentFromParent = false,
  useCardView = false,
  enableSwipeActions = false,
  onOptimisticUpdate,
  onOptimisticDelete,
}) => {
  const [newTaskName, setNewTaskName] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(group.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [columnEditingLabels, setColumnEditingLabels] = useState<BoardColumn | null>(null);
  const [cardColumnsExpanded, setCardColumnsExpanded] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useUser();
  const isAdminOrVentas = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';
  const canDeleteGroup = can(currentUser, 'group.delete');
  const canDeleteItem = can(currentUser, 'item.delete');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  // Add haptic feedback on drag start
  React.useEffect(() => {
    if (isDragging && navigator.vibrate) {
      navigator.vibrate(15);
    }
  }, [isDragging]);

  const isCollapsed = collapsed ?? false;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };
  // No aplicar style al root: el transform rompe position:sticky del header.
  // Cuando isDragging, el grupo se oculta y BoardContainer muestra DragOverlay.

  const emitAddItem = (name: string) => {
    if (!name.trim()) return;
    const newPosition = group.items.length > 0
      ? group.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024
      : 1024;
    socket.emit('add_item', { groupId: group.id, name: name.trim(), position: newPosition });
    setNewTaskName('');
    setIsAddingTask(false);
  };

  const handleAddTask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') emitAddItem(newTaskName);
    else if (e.key === 'Escape') { setNewTaskName(''); setIsAddingTask(false); }
  };

  const startAdding = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAddingTask(true);
    setTimeout(() => addInputRef.current?.focus(), 0);
  };

  const handleAddColumn = (type: string, label: string) => {
    if (type === 'billing_docs' && !isAdminOrVentas) {
      return;
    }
    const newPosition = columns.length > 0
      ? columns.reduce((max, c) => Math.max(max, c.position), 0) + 1024
      : 1024;

    // Build sensible default settings based on type
    let settings: string | null = null;
    if (type === 'status') {
      settings = JSON.stringify({
        options: [
          { id: 'done',     label: 'Hecho',          color: '#00c875' },
          { id: 'working',  label: 'Trabajando en ello', color: '#fdab3d' },
          { id: 'stuck',    label: 'Pendiente',       color: '#e2445c' },
          { id: 'aprobado', label: 'Aprobado',       color: '#00c875' },
          { id: 'default',  label: '',                color: '#c4c4c4' },
        ]
      });
    } else if (type === 'priority') {
      settings = JSON.stringify({
        options: [
          { id: 'sin-respuesta', label: 'Sin respuesta', color: '#fdab3d' },
          { id: 'aprobado',      label: 'Aprobado',     color: '#00c875' },
          { id: 'default',      label: '',             color: '#c4c4c4' },
        ]
      });
    }

    const emitType = type === 'colocacion' ? 'date' : type === 'billing_docs' ? 'billing_docs' : type;
    const emitTitle =
      type === 'colocacion'
        ? 'Colocación'
        : type === 'billing_docs'
        ? 'Documentos Facturación'
        : label;
    socket.emit('add_column', { boardId, title: emitTitle, type: emitType, position: newPosition, settings });
  };

  const tableColumns = useMemo(() => {
    const baseCols = [
      columnHelper.display({
        id: 'dragHandler',
        header: () => null,
        cell: () => (
          <div className="text-monday-border hover:text-monday-subtext px-2 cursor-grab flex justify-center">
            <GripVertical size={14} />
          </div>
        ),
        size: 36,
      }),
      columnHelper.display({
        id: 'checkbox',
        header: () => {
          const allSelected = group.items.length > 0 && group.items.every(i => selectedItemIds.has(i.id));
          const someSelected = group.items.some(i => selectedItemIds.has(i.id));
          return (
            <div className="w-full flex justify-center" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                className="w-3.5 h-3.5 cursor-pointer accent-monday-blue rounded"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => onToggleGroupAll?.(group.id, !allSelected)}
                disabled={!onToggleGroupAll || group.items.length === 0}
              />
            </div>
          );
        },
        cell: (info) => {
          const item = info.row.original;
          const checked = selectedItemIds.has(item.id);
          return (
            <div className="w-full flex justify-center" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                className="w-3.5 h-3.5 cursor-pointer accent-monday-blue rounded"
                checked={checked}
                onChange={e => onToggleItem?.(item.id, e.target.checked)}
                disabled={!onToggleItem}
              />
            </div>
          );
        },
        size: 36,
      }),
      columnHelper.accessor('name', {
        header: () => <span className="ml-2 text-[12px] font-medium text-monday-subtext">Elemento</span>,
        cell: (info) => (
          <InlineNameCell 
            item={info.row.original} 
            onOpen={() => onRowClick(info.row.original)} 
            allGroups={allGroups}
            currentGroupId={group.id}
          />
        ),
        size: 220,
      }),
    ];

    const visibleColumns = columns.filter(col => !hiddenColumns?.includes(col.id));

    const dynamicCols = visibleColumns.map(col => columnHelper.display({
      id: col.id,
      header: () => <ColumnHeader col={col} onEditLabels={setColumnEditingLabels} />,
      cell: (info) => {
        const item = info.row.original;
        const cv = item.columnValues.find(v => v.columnId === col.id);

        if (col.type === 'status' || col.type === 'priority') {
          return <StatusCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'date') {
          return <DateCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'person') {
          return <PersonCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'timeline') {
          return <TimelineCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'text' || col.type === 'folio') {
          return <TextCell content={cv?.value ?? ''} item={item} column={col} />;
        }
        if (col.type === 'contact' || col.type === 'number') {
          return <ContactCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'excel') {
          return <ExcelCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'docs') {
          return <DocsCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'billing_docs') {
          return <BillingDocsCellRenderer item={item} column={col} value={cv} />;
        }
        if (col.type === 'file') {
          return <FileCellRenderer item={item} column={col} value={cv} />;
        }
        return (
          <div
            className="w-full h-full min-h-[38px] hover:bg-monday-hover cursor-pointer transition-colors"
            onClick={e => e.stopPropagation()}
          />
        );
      },
      size: col.type === 'folio' ? 100 : 140,
    }));

    // "+" add column button (oculto en vista Taller)
    const addCol = showAddColumn
      ? columnHelper.display({
          id: '__add_column__',
          header: () => (
            <ColumnTypePicker onSelect={handleAddColumn}>
              <button
                className="w-full h-full flex items-center justify-center text-monday-subtext hover:text-monday-blue hover:bg-monday-pill transition-colors"
                title="Agregar columna"
              >
                <Plus size={16} />
              </button>
            </ColumnTypePicker>
          ),
          cell: () => <div />,
          size: 44,
        })
      : null;

    return addCol ? [...baseCols, ...dynamicCols, addCol] : [...baseCols, ...dynamicCols];
  }, [columns, onRowClick, boardId, group.id, group.items, showAddColumn, selectedItemIds, onToggleItem, onToggleGroupAll]);

  const table = useReactTable({
    data: group.items,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const effectiveZIndex = (stackIndex + 1) * 10;
  return (
    <div
      ref={setNodeRef}
      className={`mb-6 relative ${isDragging ? 'opacity-0 pointer-events-none' : ''}`}
      style={{ zIndex: effectiveZIndex }}
    >
      {/* ── Group Header (sticky): siempre visible por encima de las filas; cada grupo tiene su propio scroll en vista tabla. */}
      <div
        className={`sticky top-0 z-10 isolate flex items-center gap-1.5 py-1.5 pt-2 pb-2 mb-1.5 bg-[var(--monday-surface)] border-b border-monday-border shadow-[0_2px_6px_0_rgba(0,0,0,0.08)] group/header ${isSubgroup && !indentFromParent ? 'ml-6' : ''}`}
        style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const }}
      >
        <div 
          {...attributes} 
          {...listeners} 
          className="text-transparent group-hover/header:text-monday-subtext hover:text-monday-text px-1 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical size={16} />
        </div>
        <button
          onClick={() => onToggleCollapse?.()}
          className="text-monday-subtext hover:text-monday-text transition-colors flex-shrink-0"
          title={isCollapsed ? 'Expandir' : 'Colapsar'}
        >
          <ChevronDown
            size={24}
            style={{ color: group.color }}
            className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
          />
        </button>

        {isRenamingGroup ? (
          <div className="flex items-center gap-2 min-w-0">
            <GroupColorPicker
              value={group.color}
              onChange={color => socket.emit('rename_group', { groupId: group.id, name: group.name, color })}
              swatchClassName="w-3 h-3 shrink-0"
            />
            <input
              autoFocus
              value={groupNameDraft}
              onChange={e => setGroupNameDraft(e.target.value)}
              onBlur={() => {
                setIsRenamingGroup(false);
                if (groupNameDraft.trim() && groupNameDraft !== group.name) {
                  socket.emit('rename_group', { groupId: group.id, name: groupNameDraft.trim(), color: group.color });
                } else setGroupNameDraft(group.name);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setGroupNameDraft(group.name); setIsRenamingGroup(false); }
              }}
              className="text-[26px] font-normal bg-transparent border-b-2 outline-none px-0 min-w-[120px] font-averta flex-1"
              style={{ color: group.color, borderColor: group.color }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <GroupColorPicker
              value={group.color}
              onChange={color => socket.emit('rename_group', { groupId: group.id, name: group.name, color })}
              swatchClassName="w-3 h-3 shrink-0"
            />
            <h3
              className="text-[26px] font-normal leading-tight cursor-pointer hover:opacity-80 transition-opacity select-none font-averta truncate"
              style={{ color: group.color }}
              onDoubleClick={() => setIsRenamingGroup(true)}
              title="Doble clic para renombrar"
            >
              {group.name}
            </h3>
          </div>
        )}

        <span className="text-[14px] text-monday-subtext font-normal">
          {group.items.length} {group.items.length === 1 ? 'elemento' : 'elementos'}
          {group.parentGroupId ? ' · subgrupo' : ''}
        </span>

        {!isSubgroup && (
          <button
            type="button"
            onClick={() => {
              const randomColor = GROUP_PALETTE[Math.floor(Math.random() * GROUP_PALETTE.length)];
              const newPosition = (group.position || 0) + 0.5;
              socket.emit('add_group', {
                boardId,
                name: 'Nuevo cliente',
                color: randomColor,
                position: newPosition,
                parentGroupId: group.id,
              });
            }}
            className="ml-2 px-2 py-1 text-[11px] rounded-md border border-monday-border text-monday-subtext hover:text-monday-blue hover:border-monday-blue transition-colors"
          >
            + Cliente
          </button>
        )}

        {canDeleteGroup && (
          <button
            onClick={e => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="ml-auto p-1.5 rounded-lg text-monday-subtext hover:text-monday-red hover:bg-red-500/15 transition-colors"
            title="Eliminar grupo"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Diálogo de confirmación eliminar grupo */}
      <AnimatedDialog open={canDeleteGroup && showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[100]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--monday-surface)] rounded-xl shadow-monday-xl border border-monday-border p-6 w-[400px] max-w-[90vw] z-[101]"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-lg font-bold text-monday-text mb-1">
            Eliminar grupo
          </Dialog.Title>
          <Dialog.Description className="text-[14px] text-monday-subtext mb-6">
            ¿Eliminar el grupo &quot;{group.name}&quot; y todas sus tareas? Esta acción no se puede deshacer.
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
              onClick={() => {
                socket.emit('delete_group', { groupId: group.id });
                setShowDeleteConfirm(false);
              }}
              className="px-4 py-2 text-[13px] font-medium text-white bg-monday-red hover:bg-red-600 rounded-lg transition-colors"
            >
              Eliminar
            </button>
          </div>
        </Dialog.Content>
      </AnimatedDialog>

      {columnEditingLabels && (
        <StatusLabelsEditor
          column={columnEditingLabels}
          open={!!columnEditingLabels}
          onOpenChange={open => !open && setColumnEditingLabels(null)}
        />
      )}

      {/* ── Vista tarjetas (móvil): columnas limitadas por defecto para muchas columnas ───────────────────────────────────────────────────── */}
      {!isCollapsed && useCardView && (() => {
        const visibleCols = columns.filter(col => !hiddenColumns?.includes(col.id));
        const maxColsDefault = 4;
        const hasMoreCols = visibleCols.length > maxColsDefault;
        const colsToShow = cardColumnsExpanded ? visibleCols : visibleCols.slice(0, maxColsDefault);
        return (
        <div className="space-y-3">
          {group.items.map((item) => {
            const statusCol = columns.find(c => c.type === 'status');
            const card = (
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => onRowClick(item)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(item); } }}
                className="bg-[var(--monday-surface)] border border-monday-border rounded-lg overflow-hidden text-left min-h-[48px] touch-manipulation active:bg-monday-hover/30"
              >
                <div className="flex items-start gap-2 p-3">
                  {onToggleItem && (
                    <div className="shrink-0 pt-0.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 cursor-pointer accent-monday-blue rounded"
                        checked={selectedItemIds.has(item.id)}
                        onChange={e => onToggleItem(item.id, e.target.checked)}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-monday-text text-[14px] mb-2 truncate">{item.name}</div>
                    <div className="flex flex-col gap-1.5">
                      {colsToShow.map((col) => {
                        const cv = item.columnValues.find(v => v.columnId === col.id);
                        return (
                          <div key={col.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2 text-[12px]">
                            <span className="text-monday-subtext shrink-0 font-medium">{col.title}</span>
                            <div className="min-w-0 [&_.min-h-\[38px\]]:min-h-0">
                              {col.type === 'status' || col.type === 'priority' ? (
                                <StatusCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'date' ? (
                                <DateCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'person' ? (
                                <PersonCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'timeline' ? (
                                <TimelineCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'text' || col.type === 'folio' ? (
                                <TextCell content={cv?.value ?? ''} item={item} column={col} />
                              ) : col.type === 'contact' || col.type === 'number' ? (
                                <ContactCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'excel' ? (
                                <ExcelCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'docs' ? (
                                <DocsCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'billing_docs' ? (
                                <BillingDocsCellRenderer item={item} column={col} value={cv} />
                              ) : col.type === 'file' ? (
                                <FileCellRenderer item={item} column={col} value={cv} />
                              ) : (
                                <span className="text-monday-subtext">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            );

            if (!enableSwipeActions) return <React.Fragment key={item.id}>{card}</React.Fragment>;

            return (
              <SwipeableItemCard
                key={item.id}
                onDelete={canDeleteItem ? () => {
                  onOptimisticDelete?.(item.id);
                  socket.emit('delete_item', { boardId, itemId: item.id });
                } : undefined}
                onComplete={() => {
                  if (statusCol) {
                    let optionId = 'listo';
                    try {
                      if (statusCol.settings) {
                        const settings = JSON.parse(statusCol.settings);
                        const doneOpt = settings.options?.find((o: any) => o.label.toLowerCase() === 'listo' || o.label.toLowerCase() === 'hecho' || o.id === 'done' || o.id === 'listo');
                        if (doneOpt) optionId = doneOpt.id;
                      }
                    } catch {}

                    const valueStr = JSON.stringify({ optionId });
                    onOptimisticUpdate?.(item.id, statusCol.id, valueStr);

                    socket.emit('update_column_value', {
                      itemId: item.id,
                      columnId: statusCol.id,
                      value: valueStr
                    });
                  }
                }}
              >
                {card}
              </SwipeableItemCard>
            );
          })}
          {hasMoreCols && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setCardColumnsExpanded((v) => !v); }}
              className="text-[13px] text-monday-blue hover:underline font-medium"
            >
              {cardColumnsExpanded ? 'Ver menos columnas' : `Ver más columnas (${visibleCols.length - maxColsDefault})`}
            </button>
          )}
          {showAddRow && (
            <div className="border border-dashed border-monday-border rounded-lg p-3 bg-monday-hover/20">
              {isAddingTask ? (
                <input
                  ref={addInputRef}
                  type="text"
                  placeholder="Nombre del elemento..."
                  value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  onKeyDown={handleAddTask}
                  onBlur={() => emitAddItem(newTaskName)}
                  onClick={e => e.stopPropagation()}
                  className="w-full bg-[var(--monday-surface)] border border-monday-border rounded-monday outline-none text-[13px] text-monday-text px-2 py-1.5"
                />
              ) : (
                <button
                  type="button"
                  onClick={startAdding}
                  className="flex items-center gap-1.5 text-[13px] text-monday-subtext hover:text-monday-blue transition-colors"
                >
                  <Plus size={14} />
                  Agregar elemento
                </button>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* ── Table (barra horizontal: desktop) ───────────────────────────────────────────────── */}
      {!isCollapsed && !useCardView && (
        <HorizontalScrollArea className="relative z-0 w-full rounded-l-md shadow-monday-sm border border-monday-border">
          <table className="w-max text-left border-collapse whitespace-nowrap table-fixed">
            {/* Header */}
            <thead>
              <SortableContext
                items={columns.filter(col => !hiddenColumns?.includes(col.id)).map(col => col.id)}
                strategy={horizontalListSortingStrategy}
              >
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="h-[34px] bg-monday-hover/60">
                    {headerGroup.headers.map((header, i) => (
                      <th
                        key={header.id}
                        className={`font-normal align-middle border-b border-r border-monday-border last:border-r-0 relative ${i === 2 ? 'border-l-[3px]' : ''}`}
                        style={{
                          width: header.getSize(),
                          borderLeftColor: i === 2 ? group.color : undefined,
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </SortableContext>
            </thead>

            {/* Rows */}
            <SortableContext items={group.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <DraggableRow
                    key={row.id}
                    row={row}
                    groupColor={group.color}
                    isSelected={selectedItemIds.has(row.original.id)}
                  />
                ))}

                {/* ── Add task row (oculta en vista Taller) ───────────────────────────────── */}
                {showAddRow && (
                <tr className="h-[38px] hover:bg-monday-hover/50 bg-[var(--monday-surface)]" onClick={e => e.stopPropagation()}>
                  <td colSpan={2} className="border-b border-r border-monday-border align-middle" />
                  <td
                    className="px-2 border-b border-r border-monday-border border-l-[3px] h-full"
                    style={{ borderLeftColor: group.color }}
                  >
                    {isAddingTask ? (
                      <input
                        ref={addInputRef}
                        type="text"
                        placeholder="Escribe el nombre del elemento..."
                        value={newTaskName}
                        onChange={e => setNewTaskName(e.target.value)}
                        onKeyDown={handleAddTask}
                        onBlur={() => emitAddItem(newTaskName)}
                        className="w-full bg-transparent outline-none text-[13px] text-monday-text placeholder:text-monday-border"
                      />
                    ) : (
                      <button
                        onClick={startAdding}
                        className="flex items-center gap-1.5 text-[13px] text-monday-subtext hover:text-monday-blue transition-colors w-full h-full"
                      >
                        <Plus size={14} />
                        Agregar elemento
                      </button>
                    )}
                  </td>
                  <td colSpan={columns.length + 1} className="border-b border-monday-border bg-monday-hover/20" />
                </tr>
                )}
              </tbody>
            </SortableContext>
          </table>
        </HorizontalScrollArea>
      )}

      {/* Collapsed summary bar */}
      {isCollapsed && (
        <button
          onClick={() => onToggleCollapse?.()}
          className="text-[12px] text-monday-subtext hover:text-monday-text flex items-center gap-1.5 mt-1 px-2 py-1 hover:bg-monday-hover rounded-monday transition-colors"
        >
          <ChevronDown size={14} className="-rotate-90" />
          {group.items.length} elemento{group.items.length !== 1 ? 's' : ''} ocultos
        </button>
      )}
    </div>
  );
};
