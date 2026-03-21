import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DocType } from '../../../types';
import { DOC_TYPE_OPTIONS, getDocTypeLabel } from '../../pages/docs/docTypes';
import { DocTypeThumbnail } from './DocTypeThumbnail';

export type DocsCreateGalleryProps = {
  workspaceId: string | null;
  saving: boolean;
  error: string | null;
  onCreate: (type: DocType) => void | Promise<void>;
};

/**
 * Rejilla visual de tipos de documento (referencia Word iOS Crear).
 */
export function DocsCreateGallery({ workspaceId, saving, error, onCreate }: DocsCreateGalleryProps) {
  const [creating, setCreating] = useState<DocType | null>(null);

  const runCreate = async (type: DocType) => {
    if (!workspaceId || saving) return;
    setCreating(type);
    try {
      await onCreate(type);
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="pb-4">
      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {!workspaceId && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 mb-4">
          Selecciona un workspace para crear documentos.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!workspaceId || saving || creating !== null}
          onClick={() => runCreate('text')}
          className="rounded-2xl border border-monday-border bg-[var(--monday-surface)] overflow-hidden text-left shadow-sm disabled:opacity-50 touch-manipulation active:scale-[0.98] transition-transform flex flex-col"
        >
          <div className="p-2 flex-1 min-h-[128px] flex flex-col">
            {creating === 'text' ? (
              <div className="flex-1 min-h-[120px] flex items-center justify-center">
                <Loader2 className="animate-spin text-monday-blue" size={28} />
              </div>
            ) : (
              <DocTypeThumbnail type="text" className="w-full flex-1 min-h-[120px]" />
            )}
          </div>
          <div className="px-3 py-2 border-t border-monday-border">
            <p className="text-[13px] font-semibold text-monday-text leading-tight">En blanco</p>
            <p className="text-[11px] text-monday-subtext mt-0.5">Doc de texto</p>
          </div>
        </button>

        {DOC_TYPE_OPTIONS.filter((o) => o.id !== 'text').map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={!workspaceId || saving || creating !== null}
            onClick={() => runCreate(opt.id)}
            className="rounded-2xl border border-monday-border bg-[var(--monday-surface)] overflow-hidden text-left shadow-sm disabled:opacity-50 touch-manipulation active:scale-[0.98] transition-transform flex flex-col"
          >
            <div className="p-2 flex-1 min-h-[128px] flex flex-col">
              {creating === opt.id ? (
                <div className="flex-1 min-h-[120px] flex items-center justify-center">
                  <Loader2 className="animate-spin text-[#2b7fff]" size={28} />
                </div>
              ) : (
                <DocTypeThumbnail type={opt.id} className="w-full flex-1 min-h-[120px]" />
              )}
            </div>
            <div className="px-3 py-2 border-t border-monday-border">
              <p className="text-[13px] font-semibold text-monday-text leading-tight">{getDocTypeLabel(opt.id)}</p>
              <p className="text-[11px] text-monday-subtext mt-0.5 line-clamp-2">{opt.label}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
