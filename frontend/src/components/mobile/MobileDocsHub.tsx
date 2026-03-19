import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, LayoutTemplate, FileText, Sheet, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api';
import DocsPage from '../pages/DocsPage';
import type { Board } from '../../types';
import type { DocType as GlobalDocType } from '../../types';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

type Segment = 'explorar' | 'crear';

type DocType = 'text' | 'sheet' | 'cotizacion' | 'levantamiento' | 'hoja_trabajo';

function SegmentedControl({
  value,
  onChange,
}: {
  value: Segment;
  onChange: (v: Segment) => void;
}) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3 bg-monday-bg">
      <div className="mx-auto max-w-md rounded-3xl border border-monday-border bg-white/80 backdrop-blur-xl p-1">
        <div className="grid grid-cols-2 gap-1">
          {([
            { id: 'explorar' as const, label: 'Explorar' },
            { id: 'crear' as const, label: 'Crear' },
          ]).map((s) => {
            const active = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                className={[
                  'min-h-[44px] rounded-2xl text-[13px] font-semibold transition-colors',
                  active ? 'bg-white text-monday-text' : 'bg-transparent text-monday-subtext hover:text-monday-text',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildInitialContent(type: DocType): Record<string, unknown> {
  if (type === 'text') return { text: '<p></p>', headerImageUrl: null };
  if (type === 'sheet') return { table: [['']], cellStyles: {}, headerImageUrl: null };
  // Plantillas PDF: dejamos el contenido mínimo; el editor existente completará el resto.
  return {};
}

function defaultTitle(type: DocType) {
  if (type === 'text') return 'Nuevo doc';
  if (type === 'sheet') return 'Nueva hoja';
  if (type === 'cotizacion') return 'Cotización';
  if (type === 'levantamiento') return 'Levantamiento';
  return 'Hoja de trabajo';
}

export function MobileDocsHub({
  workspaceId,
  boards,
  initialCreateFromBoard,
  onConsumeInitialCreateFromBoard,
  initialOpenDocId,
  onConsumeInitialOpenDocId,
  initialCreateDocType,
  onConsumeInitialCreateDocType,
  onRequestOpenDoc,
  onAddReminderWidget,
}: {
  workspaceId: string | null;
  boards: Board[];
  initialCreateFromBoard: any;
  onConsumeInitialCreateFromBoard: () => void;
  initialOpenDocId: string | null;
  onConsumeInitialOpenDocId: () => void;
  initialCreateDocType?: GlobalDocType | null;
  onConsumeInitialCreateDocType?: () => void;
  onRequestOpenDoc: (id: string) => void;
  onAddReminderWidget?: () => void;
}) {
  const [segment, setSegment] = useState<Segment>('explorar');
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [docType, setDocType] = useState<DocType>('text');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveTitle = useMemo(() => title.trim() || defaultTitle(docType), [title, docType]);

  // En iOS/Safari es fácil quedarse “atascado” en la pestaña Crear.
  // Si llega una instrucción externa para abrir un doc (o crear desde tablero), forzamos volver a Explorar.
  useEffect(() => {
    if (initialOpenDocId || initialCreateFromBoard) {
      setSegment('explorar');
      setStep(0);
      setError(null);
    }
  }, [initialOpenDocId, initialCreateFromBoard]);

  useEffect(() => {
    if (!initialCreateDocType) return;
    setSegment('explorar');
    setStep(0);
    setError(null);
    onConsumeInitialCreateDocType?.();
  }, [initialCreateDocType, onConsumeInitialCreateDocType]);

  const createDoc = async () => {
    if (!workspaceId) {
      setError('Selecciona un workspace para poder crear documentos.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: effectiveTitle,
          type: docType,
          content: buildInitialContent(docType),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof (data as { error?: string })?.error === 'string' ? (data as { error: string }).error : 'No se pudo crear el documento.';
        throw new Error(msg);
      }
      const created = data as { id: string };
      onRequestOpenDoc(created.id);
      setSegment('explorar');
      setStep(0);
      setTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el documento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-monday-bg">
      <SegmentedControl value={segment} onChange={(v) => { setSegment(v); setError(null); }} />

      {segment === 'explorar' ? (
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-32 rounded-3xl"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          <div className="rounded-3xl border border-monday-border bg-white overflow-visible min-h-min">
            <DocsPage
              workspaceId={workspaceId}
              boards={boards}
              initialCreateFromBoard={initialCreateFromBoard}
              onConsumeInitialCreateFromBoard={onConsumeInitialCreateFromBoard}
              initialCreateDocType={initialCreateDocType}
              onConsumeInitialCreateDocType={onConsumeInitialCreateDocType}
              initialOpenDocId={initialOpenDocId}
              onConsumeInitialOpenDocId={onConsumeInitialOpenDocId}
              onAddReminderWidget={onAddReminderWidget}
              mobileLayout
              scrollListInParent
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto scroll-touch px-4 pb-24">
          <div className="mx-auto max-w-md">
            <div className="rounded-3xl border border-monday-border bg-white p-5">
              <div className="text-monday-text text-[16px] font-semibold mb-1 flex items-center gap-2">
                <FilePlus2 size={18} className="text-monday-subtext" />
                Crear documento
              </div>
              <div className="text-monday-subtext text-[13px] mb-4">
                Flujo por pasos, optimizado para pulgares (sin editor complejo en pantalla pequeña).
              </div>

              {error && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                  {error}
                </div>
              )}

              {step === 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => { setDocType('text'); setStep(1); }}
                    className="w-full min-h-[56px] rounded-2xl border border-monday-border bg-white hover:bg-monday-hover text-left px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-monday-pill border border-monday-border flex items-center justify-center text-monday-text">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-monday-text text-[14px] font-semibold">Doc de texto</div>
                        <div className="text-monday-subtext text-[12px]">Notas, instrucciones, contenido libre.</div>
                      </div>
                      <ChevronRight size={18} className="ml-auto text-monday-subtext" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setDocType('sheet'); setStep(1); }}
                    className="w-full min-h-[56px] rounded-2xl border border-monday-border bg-white hover:bg-monday-hover text-left px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-monday-pill border border-monday-border flex items-center justify-center text-monday-text">
                        <Sheet size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-monday-text text-[14px] font-semibold">Hoja</div>
                        <div className="text-monday-subtext text-[12px]">Tabla estilo Excel para cálculos rápidos.</div>
                      </div>
                      <ChevronRight size={18} className="ml-auto text-monday-subtext" />
                    </div>
                  </button>

                  <div className="pt-2">
                    <div className="text-monday-subtext text-[11px] font-semibold tracking-wider uppercase mb-2 flex items-center gap-2">
                      <LayoutTemplate size={14} className="text-monday-subtext" />
                      Plantillas PDF
                    </div>
                    {([
                      { id: 'cotizacion' as const, label: 'Cotización' },
                      { id: 'levantamiento' as const, label: 'Levantamiento' },
                      { id: 'hoja_trabajo' as const, label: 'Hoja de trabajo' },
                    ]).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setDocType(t.id); setStep(1); }}
                        className="w-full min-h-[52px] rounded-2xl border border-monday-border bg-white hover:bg-monday-hover text-left px-4 py-3 transition-colors mb-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-monday-pill border border-monday-border flex items-center justify-center text-monday-text">
                            <LayoutTemplate size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-monday-text text-[14px] font-semibold">{t.label}</div>
                            <div className="text-monday-subtext text-[12px]">Se completa en el editor existente.</div>
                          </div>
                          <ChevronRight size={18} className="ml-auto text-monday-subtext" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-monday-subtext text-[12px] font-semibold tracking-wide">
                    Paso 2 de 3
                  </div>

                  <div>
                    <label className="block text-monday-subtext text-[11px] font-semibold tracking-wider uppercase mb-2">
                      Título
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={defaultTitle(docType)}
                      className="w-full min-h-[52px] rounded-2xl border border-monday-border bg-white px-4 text-monday-text placeholder:text-monday-subtext/60 outline-none focus:ring-2 focus:ring-monday-blue/30"
                      style={{ fontSize: 16 }}
                    />
                    <div className="mt-2 text-[12px] text-monday-subtext">
                      Puedes dejarlo vacío y usamos un título por defecto.
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="flex-1 min-h-[52px] rounded-2xl border border-monday-border bg-transparent text-monday-subtext hover:bg-monday-hover font-semibold text-[13px] transition-colors"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="flex-1 min-h-[52px] rounded-2xl bg-monday-blue text-white hover:bg-monday-blue/90 font-semibold text-[13px] transition-colors"
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="text-monday-subtext text-[12px] font-semibold tracking-wide">
                    Paso 3 de 3
                  </div>
                  <div className="rounded-2xl border border-monday-border bg-white p-4">
                    <div className="text-monday-text text-[14px] font-semibold mb-1">
                      Confirmar creación
                    </div>
                    <div className="text-monday-subtext text-[13px]">
                      <div className="flex justify-between gap-3">
                        <span>Tipo</span>
                        <span className="text-monday-text font-medium">{docType}</span>
                      </div>
                      <div className="flex justify-between gap-3 mt-1">
                        <span>Título</span>
                        <span className="text-monday-text font-medium truncate max-w-[180px]">{effectiveTitle}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 min-h-[52px] rounded-2xl border border-monday-border bg-transparent text-monday-subtext hover:bg-monday-hover font-semibold text-[13px] transition-colors"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={createDoc}
                      disabled={submitting}
                      className="flex-1 min-h-[52px] rounded-2xl bg-monday-blue text-white hover:bg-monday-blue/90 font-semibold text-[13px] transition-colors disabled:opacity-60"
                    >
                      {submitting ? 'Creando…' : 'Crear'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

