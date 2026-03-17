import React from 'react';
import { LayoutGrid } from 'lucide-react';

interface MobileBoardHeaderMinimalProps {
  boardName: string;
  onRename?: () => void;
  /** Si true, mostrar input para editar nombre */
  editingName?: boolean;
  nameDraft?: string;
  onNameDraftChange?: (value: string) => void;
  onFinishEditName?: () => void;
  onOpenVistaSheet: () => void;
  /** Vista actual para mostrar en el botón (opcional) */
  currentViewLabel?: string;
  /** Landscape: fila más compacta */
  compact?: boolean;
}

export function MobileBoardHeaderMinimal({
  boardName,
  onRename,
  editingName = false,
  nameDraft = '',
  onNameDraftChange,
  onFinishEditName,
  onOpenVistaSheet,
  currentViewLabel,
  compact = false,
}: MobileBoardHeaderMinimalProps) {
  return (
    <div className={`shrink-0 border-b border-monday-border bg-white ${compact ? 'mobile-header-landscape' : ''}`}>
      <div className={`flex items-center gap-2 ${compact ? 'min-h-[40px] px-2 gap-1.5' : 'min-h-[44px] px-3 sm:px-4 gap-2'}`}>
        {editingName && onNameDraftChange && onFinishEditName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => onNameDraftChange(e.target.value)}
            onBlur={onFinishEditName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') onFinishEditName();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-[16px] font-semibold text-monday-text bg-monday-hover rounded px-2 py-1.5 outline-none border border-monday-blue"
          />
        ) : (
          <button
            type="button"
            onClick={() => onRename?.()}
            className={`flex-1 min-w-0 text-left font-semibold text-monday-text truncate active:bg-monday-hover rounded px-1 -mx-1 ${compact ? 'text-[14px] py-1.5' : 'text-[16px] py-2'}`}
          >
            {boardName || 'Cargando...'}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenVistaSheet}
          className={`shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-monday border border-monday-border bg-monday-pill/50 hover:bg-monday-hover font-medium text-monday-text ${compact ? 'min-h-[40px] px-2.5 text-[13px]' : 'text-[14px]'}`}
          aria-label="Cambiar vista"
        >
          <LayoutGrid size={18} className="shrink-0" />
          <span className="truncate max-w-[100px]">{currentViewLabel ?? 'Vista'}</span>
        </button>
      </div>
    </div>
  );
}
