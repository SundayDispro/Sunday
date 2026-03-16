import React, { useState } from 'react';
import { Search, MoreHorizontal, ChevronDown, Star, Folder, Receipt, Calendar, PieChart, FolderOpen, GanttChart } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';

export type ViewMode = 'table' | 'kanban' | 'calendar' | 'facturacion' | 'resumen' | 'archivos' | 'miTrabajo' | 'timeline';

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

interface MobileBoardHeaderProps {
  boardName: string;
  boardId: string;
  onRename: () => void;
  /** Si true, mostrar input para editar nombre; si no, mostrar botón con nombre */
  editingName?: boolean;
  nameDraft?: string;
  onNameDraftChange?: (value: string) => void;
  onFinishEditName?: () => void;
  currentView: ViewMode;
  onChangeView: (view: ViewMode) => void;
  enabledViews: ViewMode[];
  onAddView: (view: ViewMode) => void;
  canSeeFacturacion: boolean;
  isTaller: boolean;
  onOpenSearch: () => void;
  onExportFolders: () => void;
  exportingFolders: boolean;
  onToggleStar?: () => void;
  /** Si true, no mostrar selector de vista (ej. en Mi trabajo con tablero) */
  hideViewSelector?: boolean;
  /** Callback para abrir popover "Añadir vista" desde fuera (opcional) */
  showAddViewPopover?: boolean;
  onAddViewPopoverChange?: (open: boolean) => void;
}

export function MobileBoardHeader({
  boardName,
  onRename,
  editingName = false,
  nameDraft = '',
  onNameDraftChange,
  onFinishEditName,
  currentView,
  onChangeView,
  enabledViews,
  onAddView,
  canSeeFacturacion,
  isTaller,
  onOpenSearch,
  onExportFolders,
  exportingFolders,
  onToggleStar,
  hideViewSelector = false,
  showAddViewPopover = false,
  onAddViewPopoverChange,
}: MobileBoardHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewSelectorOpen, setViewSelectorOpen] = useState(false);

  const viewTabs = [
    { id: 'table' as const, label: VIEW_LABELS.table },
    ...(!isTaller ? [{ id: 'kanban' as const, label: VIEW_LABELS.kanban }] : []),
    ...(enabledViews.includes('facturacion') && canSeeFacturacion ? [{ id: 'facturacion' as const, label: VIEW_LABELS.facturacion }] : []),
    ...(enabledViews.includes('calendar') ? [{ id: 'calendar' as const, label: VIEW_LABELS.calendar }] : []),
    ...(enabledViews.includes('resumen') ? [{ id: 'resumen' as const, label: VIEW_LABELS.resumen }] : []),
    ...(enabledViews.includes('archivos') ? [{ id: 'archivos' as const, label: VIEW_LABELS.archivos }] : []),
    ...(enabledViews.includes('miTrabajo') ? [{ id: 'miTrabajo' as const, label: VIEW_LABELS.miTrabajo }] : []),
    ...(enabledViews.includes('timeline') ? [{ id: 'timeline' as const, label: VIEW_LABELS.timeline }] : []),
  ];

  const canAddCalendar = !enabledViews.includes('calendar');
  const canAddFact = canSeeFacturacion && !enabledViews.includes('facturacion');
  const canAddResumen = !enabledViews.includes('resumen');
  const canAddTimeline = !enabledViews.includes('timeline');
  const hasAnyToAdd = canAddCalendar || canAddFact || canAddResumen || canAddTimeline;

  return (
    <div className="shrink-0 border-b border-monday-border bg-white">
      {/* Fila única: nombre + Buscar + menú (…) */}
      <div className="min-h-[44px] flex items-center px-3 sm:px-4 gap-2">
        {editingName && onNameDraftChange && onFinishEditName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => onNameDraftChange(e.target.value)}
            onBlur={onFinishEditName}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') onFinishEditName(); }}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 text-[16px] font-semibold text-monday-text bg-monday-hover rounded px-2 py-1.5 outline-none border border-monday-blue"
          />
        ) : (
          <button
            type="button"
            onClick={onRename}
            className="flex-1 min-w-0 text-left text-[16px] font-semibold text-monday-text truncate py-2 active:bg-monday-hover rounded px-1 -mx-1"
          >
            {boardName || 'Cargando...'}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSearch}
          className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-monday-subtext hover:text-monday-text hover:bg-monday-hover rounded-monday"
          aria-label="Buscar"
        >
          <Search size={20} />
        </button>
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-monday-subtext hover:text-monday-text hover:bg-monday-hover rounded-monday"
              aria-label="Más opciones"
            >
              <MoreHorizontal size={20} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-[min(280px,90vw)] max-h-[70vh] overflow-y-auto custom-scrollbar scroll-touch p-2 fade-in"
              sideOffset={6}
              align="end"
            >
              <div className="text-[12px] font-semibold text-monday-subtext px-2 py-1.5 uppercase tracking-tight border-b border-monday-border/60 mb-2">
                Tablero
              </div>
              {onToggleStar && (
                <button
                  type="button"
                  onClick={() => { onToggleStar(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                >
                  <Star size={18} className="shrink-0" />
                  Favorito
                </button>
              )}
              <button
                type="button"
                onClick={() => { onExportFolders(); setMenuOpen(false); }}
                disabled={exportingFolders}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text disabled:opacity-50"
              >
                <Folder size={18} className="shrink-0" />
                {exportingFolders ? 'Exportando...' : 'Exportar carpetas'}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      {/* Selector de vista: botón "Vista: [actual]" que abre lista */}
      {!hideViewSelector && (
        <div className="px-3 sm:px-4 pb-2.5">
          <Popover.Root open={viewSelectorOpen} onOpenChange={setViewSelectorOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3 py-2.5 rounded-monday border border-monday-border bg-monday-pill/50 hover:bg-monday-hover text-[14px] font-medium text-monday-text"
              >
                <span className="truncate">Vista: {VIEW_LABELS[currentView]}</span>
                <ChevronDown size={18} className="shrink-0 text-monday-subtext" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border w-[min(280px,90vw)] max-h-[70vh] overflow-y-auto custom-scrollbar scroll-touch p-2 fade-in"
                sideOffset={6}
                align="start"
              >
                <div className="text-[12px] font-semibold text-monday-subtext px-2 py-1.5 uppercase tracking-tight border-b border-monday-border/60 mb-2">
                  Cambiar vista
                </div>
                {viewTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { onChangeView(tab.id); setViewSelectorOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday transition-colors text-left text-[13px] ${currentView === tab.id ? 'bg-monday-pill text-monday-blue font-medium' : 'hover:bg-monday-hover text-monday-text'}`}
                  >
                    {currentView === tab.id && <span className="w-1.5 h-1.5 rounded-full bg-monday-blue shrink-0" />}
                    {tab.label}
                  </button>
                ))}
                {!isTaller && hasAnyToAdd && (
                  <>
                    <div className="text-[12px] font-semibold text-monday-subtext px-2 py-1.5 uppercase tracking-tight border-b border-monday-border/60 mt-2 mb-2">
                      Añadir vista
                    </div>
                    {canAddFact && (
                      <button
                        type="button"
                        onClick={() => { onAddView('facturacion'); setViewSelectorOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <Receipt size={16} className="text-monday-blue shrink-0" />
                        Facturación
                      </button>
                    )}
                    {canAddCalendar && (
                      <button
                        type="button"
                        onClick={() => { onAddView('calendar'); setViewSelectorOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <Calendar size={16} className="text-monday-blue shrink-0" />
                        Calendario
                      </button>
                    )}
                    {canAddResumen && (
                      <button
                        type="button"
                        onClick={() => { onAddView('resumen'); setViewSelectorOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <PieChart size={16} className="text-monday-blue shrink-0" />
                        Resumen
                      </button>
                    )}
                    {canAddTimeline && (
                      <button
                        type="button"
                        onClick={() => { onAddView('timeline'); setViewSelectorOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <GanttChart size={16} className="text-monday-blue shrink-0" />
                        Timeline
                      </button>
                    )}
                  </>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
    </div>
  );
}
