import React, { useEffect, useMemo, useState } from 'react';
import { Plus, PenSquare } from 'lucide-react';
import { apiFetch } from '../../api';
import { VectorEditor } from '../design/VectorEditor';
import type { Design } from '../design/designTypes';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface DesignPageProps {
  workspaceId: string | null;
}

export const DesignPage: React.FC<DesignPageProps> = ({ workspaceId }) => {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedDesign = useMemo(
    () => designs.find((d) => d.id === selectedId) ?? null,
    [designs, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setDesigns([]);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${API_BASE}/api/designs?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as Design[];
        if (!cancelled) {
          setDesigns(data);
        }
      } catch {
        if (!cancelled) setDesigns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handleCreate = async () => {
    if (!workspaceId) return;
    setCreating(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name: 'Nuevo diseño', content: {} }),
      });
      const data = (await res.json()) as Design & { error?: string };
      if (!res.ok || !data.id) return;
      setDesigns((prev) => [data, ...prev]);
      setSelectedId(data.id);
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (payload: { name: string; content: unknown }) => {
    if (!selectedDesign) return;
    const res = await apiFetch(`${API_BASE}/api/designs/${encodeURIComponent(selectedDesign.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.name, content: payload.content }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as Design;
    setDesigns((prev) => prev.map((d) => (d.id === data.id ? data : d)));
  };

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-monday-border bg-monday-bg flex flex-col">
        <div className="px-3 py-3 border-b border-monday-border flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
              Estudio
            </p>
            <p className="text-[12px] text-monday-subtext">
              Diseños vectoriales para el taller.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-monday-blue text-white text-[11px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
          >
            <Plus size={14} />
            Nuevo
          </button>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-1">
          {loading && (
            <p className="text-[12px] text-monday-subtext px-1 py-1.5">Cargando diseños…</p>
          )}
          {!loading && designs.length === 0 && (
            <p className="text-[12px] text-monday-subtext px-1 py-1.5">
              No hay diseños todavía. Crea uno nuevo para empezar.
            </p>
          )}
          {designs.map((design) => {
            const isActive = design.id === selectedId;
            return (
              <button
                key={design.id}
                type="button"
                onClick={() => setSelectedId(design.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] transition-colors ${
                  isActive ? 'bg-monday-blue text-white' : 'hover:bg-monday-hover text-monday-text'
                }`}
              >
                <div className="w-7 h-7 rounded-md bg-monday-blue/10 flex items-center justify-center text-monday-blue shrink-0">
                  <PenSquare size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{design.name}</p>
                  <p className="text-[11px] text-monday-subtext truncate">
                    {new Date(design.updatedAt).toLocaleString()}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-w-0 bg-monday-bg">
        {selectedDesign ? (
          <VectorEditor
            designId={selectedDesign.id}
            initialName={selectedDesign.name}
            initialContent={
              (selectedDesign.contentJson && typeof selectedDesign.contentJson === 'object' && (selectedDesign.contentJson as { json?: unknown }).json != null)
                ? (selectedDesign.contentJson as { json: unknown }).json
                : (selectedDesign.contentJson ?? {})
            }
            onChangeName={(name) =>
              setDesigns((prev) =>
                prev.map((d) => (d.id === selectedDesign.id ? { ...d, name } : d)),
              )
            }
            onSave={handleSave}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-monday-subtext text-[13px]">
            Selecciona un diseño o crea uno nuevo para empezar.
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignPage;

