import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileText, Table2, Plus, Trash2 } from 'lucide-react';
import { Board, Doc } from '../../types';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

interface Props {
  workspaceId: string | null;
  boards: Board[];
}

type DocContent = {
  text?: string;
  table?: string[][];
};

function parseContent(doc: Doc | null): DocContent {
  if (!doc?.content) return {};
  try {
    return JSON.parse(doc.content);
  } catch {
    return {};
  }
}

export const DocsPage: React.FC<Props> = ({ workspaceId, boards }) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDoc = useMemo(
    () => docs.find(d => d.id === selectedId) ?? null,
    [docs, selectedId]
  );
  const parsed = useMemo(() => parseContent(selectedDoc), [selectedDoc]);
  const [textDraft, setTextDraft] = useState(parsed.text ?? '');
  const [tableDraft, setTableDraft] = useState<string[][]>(parsed.table ?? [['']]);

  useEffect(() => {
    if (!workspaceId) {
      setDocs([]);
      setSelectedId(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/docs?workspaceId=${encodeURIComponent(workspaceId)}`);
        const data = await res.json().catch(() => []);
        if (Array.isArray(data)) {
          setDocs(data);
          setSelectedId(prev => prev && data.some((d: Doc) => d.id === prev) ? prev : data[0]?.id ?? null);
        }
      } catch (e) {
        console.error('Error fetching docs', e);
        setError('No se pudieron cargar los documentos.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId]);

  useEffect(() => {
    setTextDraft(parsed.text ?? '');
    setTableDraft(parsed.table ?? [['']]);
  }, [parsed.text, parsed.table, selectedId]);

  const handleCreate = async (type: 'text' | 'sheet') => {
    if (!workspaceId) {
      setError('Selecciona un workspace en la barra lateral para poder crear documentos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const initialContent: DocContent =
        type === 'text' ? { text: '' } : { table: [['']] };
      const res = await fetch(`${API_BASE}/api/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title: type === 'text' ? 'Nuevo doc' : 'Nueva hoja',
          type,
          content: initialContent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Error al crear el documento';
        throw new Error(msg);
      }
      setDocs(prev => [data, ...prev]);
      setSelectedId(data.id);
    } catch (e) {
      console.error('Error creating doc', e);
      const msg = e instanceof Error ? e.message : 'No se pudo crear el documento.';
      const hint = msg.includes('fetch') || msg.includes('Failed to fetch') || msg === 'No se pudo crear el documento.'
        ? ' Comprueba que el backend esté en marcha (puerto 3001).'
        : '';
      setError(msg + hint);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    setError(null);
    try {
      const content: DocContent =
        selectedDoc.type === 'sheet'
          ? { table: tableDraft }
          : { text: textDraft };
      const res = await fetch(`${API_BASE}/api/docs/${selectedDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Error al guardar';
        throw new Error(msg);
      }
      setDocs(prev => prev.map(d => (d.id === data.id ? data : d)));
    } catch (e) {
      console.error('Error saving doc', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el documento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este documento?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/docs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      setDocs(prev => prev.filter(d => d.id !== id));
      setSelectedId(prev => (prev === id ? null : prev));
    } catch (e) {
      console.error('Error deleting doc', e);
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el documento.');
    }
  };

  const ensureTableSize = (rows: number, cols: number) => {
    setTableDraft(prev => {
      const next = [...prev];
      while (next.length < rows) next.push(new Array(cols).fill(''));
      return next.map(r => {
        const row = [...r];
        while (row.length < cols) row.push('');
        return row;
      });
    });
  };

  const currentBoard = boards.find(b => b.id === selectedDoc?.boardId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
            <BookOpen size={22} className="text-monday-blue" />
            Documentos
          </h1>
          <p className="text-[13px] text-monday-subtext mt-1">
            Crea documentos rápidos o hojas tipo sheet vinculadas a tu workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCreate('text')}
            disabled={!workspaceId || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] hover:bg-monday-blue/90 disabled:opacity-50"
          >
            <Plus size={14} />
            Nuevo doc
          </button>
          <button
            type="button"
            onClick={() => handleCreate('sheet')}
            disabled={!workspaceId || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover disabled:opacity-50"
          >
            <Plus size={14} />
            Nueva hoja
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo: lista de docs */}
        <aside className="w-72 border-r border-monday-border flex flex-col">
          <div className="px-3 py-2 border-b border-monday-border bg-monday-hover/40">
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wide">
              Documentos
            </p>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="p-4 text-[13px] text-monday-subtext">Cargando documentos…</div>
            )}
            {!workspaceId && (
              <div className="p-4 text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg mx-2 mt-2">
                Selecciona un workspace en la barra lateral para crear documentos.
              </div>
            )}
            {!loading && workspaceId && docs.length === 0 && (
              <div className="p-4 text-[13px] text-monday-subtext">
                No hay documentos aún. Usa &quot;Nuevo doc&quot; o &quot;Nueva hoja&quot; arriba.
              </div>
            )}
            {!loading &&
              docs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] border-b border-monday-border/60 hover:bg-monday-hover transition-colors ${
                    selectedId === doc.id ? 'bg-monday-hover' : 'bg-white'
                  }`}
                >
                  {doc.type === 'sheet' ? (
                    <Table2 size={16} className="text-monday-blue shrink-0" />
                  ) : (
                    <FileText size={16} className="text-monday-blue shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-monday-text">{doc.title}</p>
                    <p className="text-[11px] text-monday-subtext truncate">
                      {doc.type === 'sheet' ? 'Hoja' : 'Texto'} ·{' '}
                      {new Date(doc.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                    className="p-1 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </button>
              ))}
          </div>
        </aside>

        {/* Panel derecho: editor */}
        <section className="flex-1 flex flex-col">
          {error && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-[13px] border-b border-red-200">
              {error}
            </div>
          )}

          {!selectedDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-monday-subtext">
              <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4">
                <BookOpen size={28} className="opacity-60" />
              </div>
              <p className="text-[15px] font-medium text-monday-text">Selecciona o crea un documento</p>
              <p className="text-[13px] mt-1 max-w-sm text-center">
                Usa el panel izquierdo para elegir un doc existente o crea uno nuevo.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-monday-border bg-monday-hover/30">
                <div className="flex flex-col">
                  <h2 className="text-[16px] font-semibold text-monday-text truncate">
                    {selectedDoc.title}
                  </h2>
                  {currentBoard && (
                    <p className="text-[12px] text-monday-subtext">
                      Vinculado al tablero: <span className="font-medium">{currentBoard.name}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>

              {selectedDoc.type === 'sheet' ? (
                <div className="flex-1 overflow-auto custom-scrollbar p-4 bg-monday-bg/40">
                  <div className="inline-block bg-white rounded-xl shadow-monday-sm border border-monday-border overflow-hidden">
                    <table className="border-collapse">
                      <tbody>
                        {tableDraft.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="border border-monday-border">
                                <input
                                  value={cell}
                                  onChange={e => {
                                    const value = e.target.value;
                                    setTableDraft(prev => {
                                      const next = prev.map(r => [...r]);
                                      next[rIdx][cIdx] = value;
                                      return next;
                                    });
                                  }}
                                  className="w-32 px-2 py-1 text-[12px] outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex gap-2 text-[12px]">
                    <button
                      type="button"
                      onClick={() => ensureTableSize(tableDraft.length + 1, tableDraft[0]?.length || 1)}
                      className="px-2 py-1 rounded border border-monday-border hover:bg-monday-hover"
                    >
                      + Fila
                    </button>
                    <button
                      type="button"
                      onClick={() => ensureTableSize(tableDraft.length, (tableDraft[0]?.length || 0) + 1)}
                      className="px-2 py-1 rounded border border-monday-border hover:bg-monday-hover"
                    >
                      + Columna
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 p-4 bg-monday-bg/40">
                  <textarea
                    value={textDraft}
                    onChange={e => setTextDraft(e.target.value)}
                    placeholder="Escribe aquí la documentación de tu equipo..."
                    className="w-full h-full resize-none rounded-xl border border-monday-border bg-white px-3 py-2 text-[13px] text-monday-text outline-none focus:ring-2 focus:ring-monday-blue"
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
