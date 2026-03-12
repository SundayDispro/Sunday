import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, GripVertical, ListOrdered } from 'lucide-react';
import {
  type PdfDocType,
  PDF_FIELDS,
  getPositionForField,
  getFieldPositions,
} from './pdfTemplateConfig';

const API_BASE = 'http://localhost:3001';

interface Props {
  docType: PdfDocType;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  docId: string;
}

const PAGE_ASPECT = 595 / 842; // A4

function getItems(value: Record<string, unknown>): { descripcion: string; cantidad: string; precio: string; total: string }[] {
  const items = value.items;
  if (Array.isArray(items) && items.length > 0)
    return items as { descripcion: string; cantidad: string; precio: string; total: string }[];
  return [{ descripcion: '', cantidad: '', precio: '', total: '' }];
}

export const PdfTemplateEditor: React.FC<Props> = ({ docType, value, onChange, docId }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null);
  const [showItemsEditor, setShowItemsEditor] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ fieldKey: string; startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);

  const update = useCallback(
    (updates: Record<string, unknown>) => onChange({ ...value, ...updates }),
    [value, onChange]
  );

  // Cargar URL de plantilla PDF para usarla como fondo
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    fetch(`${API_BASE}/api/templates/${docType}`)
      .then((res) => {
        if (!res.ok) {
          setTemplatePdfUrl(null);
          return;
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setTemplatePdfUrl(objectUrl);
      })
      .catch(() => setTemplatePdfUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docType]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleGeneratePdf = async (action: 'preview' | 'download') => {
    try {
      const res = await fetch(`${API_BASE}/api/templates/${docType}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al generar PDF');
      }
      const blob = await res.blob();
      if (action === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${docType}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const prev = previewUrl;
        setPreviewUrl(URL.createObjectURL(blob));
        if (prev) URL.revokeObjectURL(prev);
      }
    } catch (e) {
      console.error('PDF generate error', e);
      alert(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    }
  };

  const fields = PDF_FIELDS[docType];

  const handleBoxMouseDown = useCallback(
    (e: React.MouseEvent, fieldKey: string) => {
      e.preventDefault();
      const pos = getPositionForField(fieldKey, value, docType, fields.find((f) => f.key === fieldKey)!);
      setDragging({ fieldKey, startX: e.clientX, startY: e.clientY, startLeft: pos.x, startTop: pos.y });
    },
    [value, docType, fields]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dx = (e.clientX - dragging.startX) / w;
      const dy = (e.clientY - dragging.startY) / h;
      let nx = dragging.startLeft + dx;
      let ny = dragging.startTop + dy;
      nx = Math.max(0, Math.min(1 - 0.1, nx));
      ny = Math.max(0, Math.min(1 - 0.04, ny));
      setDragPreview({ x: nx, y: ny });
    };
    const onUp = () => {
      if (!dragging) return;
      if (dragPreview !== null) {
        const positions = getFieldPositions(value, docType);
        update({
          fieldPositions: { ...positions, [dragging.fieldKey]: { x: dragPreview.x, y: dragPreview.y } },
        });
      }
      setDragging(null);
      setDragPreview(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, dragPreview, value, docType, update]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-monday-bg/50">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
        <button
          type="button"
          onClick={() => handleGeneratePdf('preview')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover"
        >
          <Eye size={14} /> Vista previa PDF
        </button>
        <button
          type="button"
          onClick={() => handleGeneratePdf('download')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] hover:bg-monday-blue/90"
        >
          <Download size={14} /> Descargar PDF
        </button>
        {docType === 'cotizacion' && (
          <button
            type="button"
            onClick={() => setShowItemsEditor((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border text-[13px] ${showItemsEditor ? 'bg-monday-blue text-white border-monday-blue' : 'border-monday-border text-monday-text hover:bg-monday-hover'}`}
          >
            <ListOrdered size={14} /> {showItemsEditor ? 'Ocultar ítems' : 'Editar ítems'}
          </button>
        )}
        <span className="text-[11px] text-monday-subtext px-2">Documento</span>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-4">
        {/* Área de edición: PDF de fondo + cuadros de texto */}
        <div
          ref={containerRef}
          className="relative bg-white rounded-lg border border-monday-border shadow-monday-lg overflow-hidden"
          style={{ width: '100%', maxWidth: '21cm', aspectRatio: String(PAGE_ASPECT) }}
        >
          {/* Capa 1: Fondo (PDF o blanco) — detrás y sin recibir clics */}
          <div className="absolute inset-0 z-0">
            {templatePdfUrl ? (
              <iframe
                src={templatePdfUrl}
                title="Plantilla PDF"
                className="w-full h-full border-0 pointer-events-none select-none"
                tabIndex={-1}
              />
            ) : (
              <div className="w-full h-full bg-white flex items-center justify-center text-monday-subtext text-sm">
                Sin plantilla PDF. Coloca {docType}.pdf en backend/templates/
              </div>
            )}
          </div>
          {/* Capa 2: Cuadros de texto editables sobre el PDF — encima y con prioridad */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <div className="absolute inset-0 pointer-events-auto">
              {fields.map((fieldDef) => {
                const basePos = getPositionForField(fieldDef.key, value, docType, fieldDef);
                const pos =
                  dragging?.fieldKey === fieldDef.key && dragPreview
                    ? { ...basePos, x: dragPreview.x, y: dragPreview.y }
                    : basePos;
                const val = (value[fieldDef.key] as string) ?? '';
                const isTextarea = fieldDef.inputType === 'textarea';
                return (
                  <div
                    key={fieldDef.key}
                    className="absolute flex flex-col group box-border border border-dashed border-monday-blue/60 bg-white/70 hover:bg-white/90 focus-within:border-monday-blue focus-within:bg-white/95 focus-within:shadow-sm rounded-sm transition-all"
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      width: `${pos.width * 100}%`,
                      height: `${pos.height * 100}%`,
                      minHeight: '28px',
                    }}
                  >
                    <div
                      className="shrink-0 flex items-center justify-end h-5 px-1 opacity-50 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-monday-subtext hover:text-monday-blue border-b border-monday-border/30"
                      onMouseDown={(e) => handleBoxMouseDown(e, fieldDef.key)}
                      title="Arrastrar para reposicionar"
                    >
                      <GripVertical size={10} />
                    </div>
                    <div className="flex-1 min-h-0 flex items-center overflow-hidden">
                      {isTextarea ? (
                        <textarea
                          value={val}
                          onChange={(e) => update({ [fieldDef.key]: e.target.value })}
                          placeholder={fieldDef.label}
                          className="w-full h-full min-h-0 resize-none text-[11pt] text-black bg-transparent border-0 outline-none focus:ring-0 py-1 px-1.5 placeholder:text-monday-subtext"
                          onClick={(e) => e.stopPropagation()}
                          spellCheck="true"
                        />
                      ) : (
                        <input
                          type={fieldDef.inputType ?? 'text'}
                          value={val}
                          onChange={(e) => update({ [fieldDef.key]: e.target.value })}
                          placeholder={fieldDef.label}
                          className="w-full text-[11pt] text-black bg-transparent border-0 outline-none focus:ring-0 py-1 px-1.5 placeholder:text-monday-subtext"
                          onClick={(e) => e.stopPropagation()}
                          spellCheck="true"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Editor de ítems (solo cotización) */}
        {docType === 'cotizacion' && showItemsEditor && (
          <ItemsEditor value={value} update={update} />
        )}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => {
            setPreviewUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
          }}
        >
          <div
            className="bg-white rounded-xl overflow-hidden shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-monday-border">
              <span className="text-[13px] font-medium">Vista previa PDF</span>
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                }}
                className="text-[12px] text-monday-subtext hover:text-monday-text"
              >
                Cerrar
              </button>
            </div>
            <iframe src={previewUrl} title="Vista previa PDF" className="w-full flex-1 min-h-[480px]" />
          </div>
        </div>
      )}
    </div>
  );
};

function ItemsEditor({
  value,
  update,
}: {
  value: Record<string, unknown>;
  update: (u: Record<string, unknown>) => void;
}) {
  const items = getItems(value);
  const setItem = (index: number, field: string, val: string) => {
    const next = [...items];
    if (!next[index]) next[index] = { descripcion: '', cantidad: '', precio: '', total: '' };
    (next[index] as Record<string, string>)[field] = val;
    if (field === 'cantidad' || field === 'precio') {
      const q = parseFloat(field === 'cantidad' ? val : next[index].cantidad) || 0;
      const p = parseFloat(field === 'precio' ? val : next[index].precio) || 0;
      next[index].total = (q * p).toFixed(2);
    }
    update({ items: next });
  };
  const addRow = () =>
    update({ items: [...items, { descripcion: '', cantidad: '', precio: '', total: '' }] });
  const removeRow = (i: number) => {
    if (items.length > 1) update({ items: items.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="w-full max-w-3xl bg-white rounded-lg border border-monday-border shadow p-4">
      <h3 className="text-sm font-semibold text-monday-text mb-3">Ítems de la cotización</h3>
      <table className="w-full border-collapse text-[11pt] mb-4">
        <thead>
          <tr className="border-b border-monday-border">
            <th className="text-left py-2 font-medium text-monday-subtext">Descripción</th>
            <th className="text-right py-2 font-medium text-monday-subtext w-24">Cant.</th>
            <th className="text-right py-2 font-medium text-monday-subtext w-24">Precio</th>
            <th className="text-right py-2 font-medium text-monday-subtext w-24">Total</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i} className="border-b border-monday-border/50">
              <td className="py-1">
                <input
                  value={row.descripcion}
                  onChange={(e) => setItem(i, 'descripcion', e.target.value)}
                  className="w-full px-2 py-1 border-b border-monday-border/60 outline-none focus:border-monday-blue text-[11pt] bg-transparent"
                />
              </td>
              <td className="py-1 text-right">
                <input
                  type="number"
                  min={0}
                  value={row.cantidad}
                  onChange={(e) => setItem(i, 'cantidad', e.target.value)}
                  className="w-20 px-2 py-1 border-b border-monday-border/60 outline-none focus:border-monday-blue text-right text-[11pt] bg-transparent"
                />
              </td>
              <td className="py-1 text-right">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={row.precio}
                  onChange={(e) => setItem(i, 'precio', e.target.value)}
                  className="w-20 px-2 py-1 border-b border-monday-border/60 outline-none focus:border-monday-blue text-right text-[11pt] bg-transparent"
                />
              </td>
              <td className="py-1 text-right text-monday-subtext">{row.total || '0.00'}</td>
              <td className="py-1">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={items.length <= 1}
                  className="text-[10pt] text-monday-subtext hover:text-monday-red disabled:opacity-40"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="text-[11pt] text-monday-blue hover:underline"
      >
        + Añadir ítem
      </button>
    </div>
  );
}
