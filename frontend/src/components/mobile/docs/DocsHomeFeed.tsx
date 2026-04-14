import React, { useMemo, useState } from 'react';
import { MoreVertical, Trash2, FileText, Table2, FileCheck } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import type { Doc, DocType } from '../../../types';
import { getDocTypeLabel, isPdfDocType } from '../../pages/docs/docTypes';
import { DocTypeThumbnail } from './DocTypeThumbnail';

export type DocsHomeFeedProps = {
  docs: Doc[];
  selectedId: string | null;
  onOpenDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
  loading?: boolean;
};

/** Pestañas alineadas al flujo Sunday: recientes, plantillas PDF, texto y hojas. */
export type DocsHomeFilterTab = 'recientes' | 'plantillas' | 'texto_hojas';

function formatRelative(dateIso: string): string {
  const d = new Date(dateIso);
  if (!Number.isFinite(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return 'Hace un momento';
  if (diff < day) return `Hace ${Math.floor(diff / (60 * 60 * 1000)) || 1} h`;
  if (diff < 7 * day) return `Hace ${Math.floor(diff / day)} d`;
  return d.toLocaleDateString();
}

function TypeIcon({ type }: { type: DocType }) {
  if (type === 'sheet') return <Table2 size={16} className="text-monday-blue shrink-0" />;
  if (isPdfDocType(type)) return <FileCheck size={16} className="text-monday-blue shrink-0" />;
  return <FileText size={16} className="text-monday-blue shrink-0" />;
}

const TAB_META: { id: DocsHomeFilterTab; label: string; short: string }[] = [
  { id: 'recientes', label: 'Recientes', short: 'Recientes' },
  { id: 'plantillas', label: 'Plantillas PDF', short: 'PDF' },
  { id: 'texto_hojas', label: 'Texto y hojas', short: 'Texto' },
];

/**
 * Lista estilo Word iOS: tarjetas con miniatura y metadatos.
 */
export function DocsHomeFeed({
  docs,
  selectedId,
  onOpenDoc,
  onDeleteDoc,
  loading,
}: DocsHomeFeedProps) {
  const [filterTab, setFilterTab] = useState<DocsHomeFilterTab>('recientes');

  const sorted = useMemo(() => {
    return [...docs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [docs]);

  const listForTab = useMemo(() => {
    if (filterTab === 'recientes') return sorted.slice(0, 10);
    if (filterTab === 'plantillas') return sorted.filter((d) => isPdfDocType(d.type as DocType)).slice(0, 40);
    return sorted.filter((d) => d.type === 'text' || d.type === 'sheet').slice(0, 40);
  }, [sorted, filterTab]);

  const emptyCopy: Record<DocsHomeFilterTab, { title: string; hint: string }> = {
    recientes: {
      title: 'Sin documentos recientes',
      hint: 'Usa la pestaña Crear para empezar un documento o plantilla.',
    },
    plantillas: {
      title: 'Sin cotizaciones ni plantillas',
      hint: 'Crea una cotización, levantamiento o hoja de trabajo desde Crear.',
    },
    texto_hojas: {
      title: 'Sin documentos de texto ni hojas',
      hint: 'Crea un documento en blanco o una hoja desde Crear.',
    },
  };

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between gap-3 mb-4 px-1">
        <h1 className="text-[26px] font-bold text-monday-text tracking-tight">Documentos</h1>
      </div>

      <div className="flex rounded-2xl bg-monday-hover/50 p-1 mb-4 border border-monday-border/40 gap-0.5">
        {TAB_META.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilterTab(t.id)}
            className={[
              'flex-1 min-h-[40px] rounded-xl text-[11px] sm:text-[12px] font-semibold transition-colors px-0.5 leading-tight',
              filterTab === t.id
                ? 'bg-[var(--monday-surface)] text-monday-text shadow-sm border border-monday-border/50'
                : 'text-monday-subtext hover:text-monday-text',
            ].join(' ')}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-[13px] text-monday-subtext px-1 py-6">Cargando documentos…</p>
      )}

      {!loading && listForTab.length === 0 && (
        <div className="rounded-2xl border border-dashed border-monday-border bg-monday-hover/30 px-4 py-10 text-center">
          <p className="text-[15px] font-medium text-monday-text">{emptyCopy[filterTab].title}</p>
          <p className="text-[13px] text-monday-subtext mt-1">{emptyCopy[filterTab].hint}</p>
        </div>
      )}

      <div className="space-y-4">
        {!loading &&
          listForTab.map((doc) => (
            <article
              key={doc.id}
              className={[
                'rounded-2xl border border-monday-border bg-[var(--monday-surface)] shadow-sm overflow-hidden',
                selectedId === doc.id ? 'ring-2 ring-monday-blue/40' : '',
              ].join(' ')}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenDoc(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenDoc(doc.id);
                  }
                }}
                className="w-full text-left touch-manipulation active:bg-monday-hover/50"
              >
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <div className="w-8 h-8 rounded-full bg-monday-hover flex items-center justify-center text-[11px] font-bold text-monday-subtext">
                    {(doc.title || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-monday-subtext">
                      {filterTab === 'recientes' ? 'Se abrió recientemente' : 'Documento'}
                    </p>
                    <p className="text-[11px] text-monday-subtext/80">{formatRelative(doc.updatedAt)}</p>
                  </div>
                </div>
                <div className="px-3 pb-2">
                  <div className="rounded-xl overflow-hidden max-h-[200px] min-h-[120px] bg-monday-hover/15">
                    <DocTypeThumbnail type={doc.type as DocType} className="w-full min-h-[118px]" />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 pb-3 pt-1 border-t border-monday-border">
                  <TypeIcon type={doc.type as DocType} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-monday-text truncate">{doc.title || 'Sin título'}</p>
                    <p className="text-[12px] text-monday-subtext truncate">
                      {getDocTypeLabel(doc.type as DocType)} · {formatRelative(doc.updatedAt)}
                    </p>
                  </div>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="p-2 rounded-xl text-monday-subtext hover:bg-monday-hover touch-manipulation shrink-0"
                        aria-label="Más opciones"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={20} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-50 p-1 rounded-xl shadow-lg border border-monday-border bg-[var(--monday-surface)] w-44"
                        sideOffset={6}
                        align="end"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-[13px] text-red-600 text-left"
                          onClick={() => onDeleteDoc(doc.id)}
                        >
                          <Trash2 size={16} />
                          Eliminar
                        </button>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>
            </article>
          ))}
      </div>
    </div>
  );
}
