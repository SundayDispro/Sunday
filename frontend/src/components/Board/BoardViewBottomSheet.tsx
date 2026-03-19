import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Star,
  Folder,
  Search,
  Receipt,
  Calendar,
  PieChart,
  GanttChart,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

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

interface BoardViewBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentView: ViewMode;
  onChangeView: (view: ViewMode) => void;
  enabledViews: ViewMode[];
  onAddView: (view: ViewMode) => void;
  onMoveView?: (view: ViewMode, direction: 'left' | 'right') => void;
  canSeeFacturacion: boolean;
  isTaller: boolean;
  onToggleStar?: () => void;
  onExportFolders: () => void;
  exportingFolders: boolean;
  onOpenSearch: () => void;
}

export function BoardViewBottomSheet({
  open,
  onOpenChange,
  currentView,
  onChangeView,
  enabledViews,
  onAddView,
  onMoveView,
  canSeeFacturacion,
  isTaller,
  onToggleStar,
  onExportFolders,
  exportingFolders,
  onOpenSearch,
}: BoardViewBottomSheetProps) {
  const viewTabs = enabledViews
    .filter((v) => (isTaller ? (v === 'table' || v === 'calendar') : true))
    .filter((v) => (v === 'facturacion' ? canSeeFacturacion : true))
    .map((id) => ({ id, label: VIEW_LABELS[id] }));

  const canAddCalendar = !enabledViews.includes('calendar');
  const canAddFact = canSeeFacturacion && !enabledViews.includes('facturacion');
  const canAddResumen = !enabledViews.includes('resumen');
  const canAddTimeline = !enabledViews.includes('timeline');
  const hasAnyToAdd = canAddCalendar || canAddFact || canAddResumen || canAddTimeline;

  const handleSelectView = (view: ViewMode) => {
    onChangeView(view);
    onOpenChange(false);
  };

  const handleAddView = (view: ViewMode) => {
    if (!enabledViews.includes(view)) {
      onAddView(view);
      onChangeView(view);
    }
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[45] bg-black/30"
            aria-hidden
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-0 right-0 bottom-0 z-[46] bg-[var(--monday-surface)] rounded-t-2xl shadow-monday-xl border-t border-monday-border flex flex-col max-h-[58vh]"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            aria-label="Vista del tablero"
          >
            <div className="shrink-0 flex items-center justify-between min-h-[52px] px-4 border-b border-monday-border">
              <span className="text-[15px] font-semibold text-monday-text">Vista</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch py-2">
              <div className="px-2">
                <p className="text-[11px] font-semibold text-monday-subtext px-2 py-1.5 uppercase tracking-wider">
                  Cambiar vista
                </p>
                {viewTabs.map((tab, idx) => (
                  <div key={tab.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelectView(tab.id)}
                      className={`flex-1 flex items-center gap-2.5 px-3 min-h-[48px] py-2.5 rounded-monday transition-colors text-left text-[14px] touch-manipulation ${
                        currentView === tab.id ? 'bg-monday-pill text-monday-blue font-medium' : 'hover:bg-monday-hover text-monday-text'
                      }`}
                    >
                      {currentView === tab.id ? <Check size={18} className="shrink-0 text-monday-blue" /> : <span className="w-[18px] shrink-0" />}
                      {tab.label}
                    </button>
                    {!!onMoveView && viewTabs.length > 1 && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onMoveView(tab.id, 'left')}
                          disabled={idx === 0}
                          className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-md border border-monday-border text-monday-subtext hover:bg-monday-hover disabled:opacity-35 disabled:cursor-not-allowed"
                          title="Mover a la izquierda"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveView(tab.id, 'right')}
                          disabled={idx === viewTabs.length - 1}
                          className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-md border border-monday-border text-monday-subtext hover:bg-monday-hover disabled:opacity-35 disabled:cursor-not-allowed"
                          title="Mover a la derecha"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {!isTaller && hasAnyToAdd && (
                  <>
                    <p className="text-[11px] font-semibold text-monday-subtext px-2 py-1.5 mt-2 uppercase tracking-wider border-t border-monday-border/60 pt-3">
                      Añadir vista
                    </p>
                    {canAddFact && (
                      <button
                        type="button"
                        onClick={() => handleAddView('facturacion')}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <Receipt size={18} className="text-monday-blue shrink-0" />
                        Facturación
                      </button>
                    )}
                    {canAddCalendar && (
                      <button
                        type="button"
                        onClick={() => handleAddView('calendar')}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <Calendar size={18} className="text-monday-blue shrink-0" />
                        Calendario
                      </button>
                    )}
                    {canAddResumen && (
                      <button
                        type="button"
                        onClick={() => handleAddView('resumen')}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <PieChart size={18} className="text-monday-blue shrink-0" />
                        Resumen
                      </button>
                    )}
                    {canAddTimeline && (
                      <button
                        type="button"
                        onClick={() => handleAddView('timeline')}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                      >
                        <GanttChart size={18} className="text-monday-blue shrink-0" />
                        Timeline
                      </button>
                    )}
                  </>
                )}

                <p className="text-[11px] font-semibold text-monday-subtext px-2 py-1.5 mt-2 uppercase tracking-wider border-t border-monday-border/60 pt-3">
                  Acciones
                </p>
                {onToggleStar && (
                  <button
                    type="button"
                    onClick={() => { onToggleStar(); onOpenChange(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                  >
                    <Star size={18} className="shrink-0" />
                    Favorito
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { onExportFolders(); onOpenChange(false); }}
                  disabled={exportingFolders}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text disabled:opacity-50"
                >
                  <Folder size={18} className="shrink-0" />
                  {exportingFolders ? 'Exportando...' : 'Exportar carpetas'}
                </button>
                <button
                  type="button"
                  onClick={() => { onOpenSearch(); onOpenChange(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors text-left text-[13px] text-monday-text"
                >
                  <Search size={18} className="shrink-0" />
                  Buscar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
