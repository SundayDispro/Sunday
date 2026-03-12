import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FileText, Table2, Plus, Trash2, FileCheck, LayoutDashboard, List, Palette } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { Board, Doc, DocType } from '../../types';
import {
  getInitialContentForType,
  getDocTypeTitle,
  getDocTypeLabel,
  DOC_TYPE_OPTIONS,
  isPdfDocType,
} from './docs/docTypes';
import { PdfTemplateEditor } from './docs/PdfTemplateEditor';

const API_BASE = 'http://localhost:3001';

interface Props {
  workspaceId: string | null;
  boards: Board[];
}

export interface StickyNoteData {
  id: string;
  x: number;
  y: number;
  title: string;
  body: string;
  color?: string;
}

const NOTE_COLORS = [
  '#fef08a', '#fde047', '#facc15', // amarillos
  '#bbf7d0', '#86efac', '#4ade80', // verdes
  '#bfdbfe', '#93c5fd', '#60a5fa', // azules
  '#fbcfe8', '#f9a8d4', '#f472b6', // rosas
  '#e9d5ff', '#d8b4fe', '#c084fc', // violetas
  '#fed7aa', '#fdba74', '#fb923c', // naranjas
];
const DEFAULT_NOTE_COLOR = '#fef08a';

function isLightHex(hex: string): boolean {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 160;
}

function normalizeNote(raw: unknown): StickyNoteData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : crypto.randomUUID();
  const x = typeof o.x === 'number' ? o.x : 24;
  const y = typeof o.y === 'number' ? o.y : 24;
  const title = typeof o.title === 'string' ? o.title : 'Nueva nota';
  const body = typeof o.body === 'string' ? o.body : '';
  const color = typeof o.color === 'string' ? o.color : DEFAULT_NOTE_COLOR;
  return { id, x, y, title, body, color };
}

type DocContent = {
  text?: string;
  table?: string[][];
  [key: string]: unknown;
};

function parseContent(doc: Doc | null): DocContent {
  if (!doc?.content) return {};
  try {
    return JSON.parse(doc.content);
  } catch {
    return {};
  }
}

// Editor de documento tipo Word: barra de formato + área de documento
function WordLikeEditor({ textDraft, setTextDraft }: { textDraft: string; setTextDraft: (v: string) => void }) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (before: string, after: string) => {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = textDraft.slice(start, end);
    const newText = textDraft.slice(0, start) + before + selected + after + textDraft.slice(end);
    setTextDraft(newText);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length); }, 0);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#e8e8e8]">
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 bg-white border-b border-gray-200 shadow-sm">
        <button type="button" onClick={() => wrapSelection('**', '**')} className="p-1.5 rounded hover:bg-gray-100" title="Negrita">
          <span className="text-[14px] font-bold">B</span>
        </button>
        <button type="button" onClick={() => wrapSelection('_', '_')} className="p-1.5 rounded hover:bg-gray-100" title="Cursiva">
          <span className="text-[14px] italic font-serif">I</span>
        </button>
        <button type="button" onClick={() => wrapSelection('\n- ', '')} className="p-1.5 rounded hover:bg-gray-100" title="Lista">
          <span className="text-[14px]">•</span>
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <span className="text-[11px] text-gray-500 px-2">Documento</span>
      </div>
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-[21cm] min-h-[29.7cm] bg-white shadow-lg px-12 py-14">
          <textarea
            ref={textRef}
            value={textDraft}
            onChange={e => setTextDraft(e.target.value)}
            placeholder="Empieza a escribir..."
            className="w-full min-h-[calc(29.7cm-3.5rem)] resize-none border-0 outline-none text-[11pt] text-gray-800 leading-relaxed font-[Georgia] placeholder:text-gray-400"
            style={{ fontFamily: 'Georgia, serif' }}
          />
        </div>
      </div>
    </div>
  );
}

// Vista general: panel de control con doc cards + notas adhesivas
function DocsOverviewPanel({
  docs,
  workspaceId,
  onOpenDoc,
  getDocTypeLabel,
  isPdfDocType,
}: {
  docs: Doc[];
  workspaceId: string | null;
  onOpenDoc: (id: string) => void;
  getDocTypeLabel: (t: DocType) => string;
  isPdfDocType: (t: DocType) => boolean;
}) {
  const [panelNotes, setPanelNotes] = useState<StickyNoteData[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef({ x: 0, y: 0, noteX: 0, noteY: 0 });
  const notesRef = useRef<StickyNoteData[]>([]);
  notesRef.current = panelNotes;

  useEffect(() => {
    if (!workspaceId) { setPanelNotes([]); return; }
    setLoadingNotes(true);
    fetch(`${API_BASE}/api/workspaces/${workspaceId}/panel-notes`)
      .then(r => r.json())
      .then(data => {
        const raw = Array.isArray(data?.panelNotes) ? data.panelNotes : [];
        const normalized = raw.map((item: unknown) => normalizeNote(item)).filter((n): n is StickyNoteData => n !== null);
        setPanelNotes(normalized);
      })
      .catch(() => setPanelNotes([]))
      .finally(() => setLoadingNotes(false));
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (workspaceId && notesRef.current.length >= 0) {
        fetch(`${API_BASE}/api/workspaces/${workspaceId}/panel-notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ panelNotes: notesRef.current }),
        }).catch(() => {});
      }
    };
  }, [workspaceId]);

  const savePanelNotes = useCallback((notes: StickyNoteData[]) => {
    if (!workspaceId) return;
    const toSave = notes.map(n => ({ id: n.id, x: n.x, y: n.y, title: n.title, body: n.body, color: n.color ?? DEFAULT_NOTE_COLOR }));
    fetch(`${API_BASE}/api/workspaces/${workspaceId}/panel-notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panelNotes: toSave }),
    })
      .then(res => { if (!res.ok) throw new Error('Error al guardar notas'); })
      .catch(err => console.error('Panel notes save failed:', err));
  }, [workspaceId]);

  const addNote = useCallback(() => {
    const count = panelNotes.length;
    const col = count % 4;
    const row = Math.floor(count / 4);
    const newNote: StickyNoteData = {
      id: crypto.randomUUID(),
      x: 24 + col * 220,
      y: 24 + row * 200,
      title: 'Nueva nota',
      body: '',
      color: DEFAULT_NOTE_COLOR,
    };
    const next = [...panelNotes, newNote];
    setPanelNotes(next);
    savePanelNotes(next);
  }, [panelNotes, savePanelNotes]);

  const updateNote = useCallback((id: string, patch: Partial<StickyNoteData>, skipSave?: boolean) => {
    setPanelNotes(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, ...patch } : n));
      if (!skipSave) savePanelNotes(next);
      return next;
    });
  }, [savePanelNotes]);

  const removeNote = useCallback((id: string) => {
    setPanelNotes(prev => {
      const next = prev.filter(n => n.id !== id);
      savePanelNotes(next);
      return next;
    });
  }, [savePanelNotes]);

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    e.preventDefault();
    const note = panelNotes.find(n => n.id === id);
    if (!note) return;
    setDraggingId(id);
    dragRef.current = { x: e.clientX, y: e.clientY, noteX: note.x, noteY: note.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [panelNotes]);

  const onPointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (draggingId !== id) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const newX = Math.max(0, dragRef.current.noteX + dx);
    const newY = Math.max(0, dragRef.current.noteY + dy);
    updateNote(id, { x: newX, y: newY }, true);
    dragRef.current = { x: e.clientX, y: e.clientY, noteX: newX, noteY: newY };
  }, [draggingId, updateNote]);

  const onPointerUp = useCallback((e: React.PointerEvent, id: string) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDraggingId(null);
    const { noteX, noteY } = dragRef.current;
    setPanelNotes(prev => {
      const next = prev.map(n => (n.id === id ? { ...n, x: noteX, y: noteY } : n));
      savePanelNotes(next);
      return next;
    });
  }, [savePanelNotes]);

  if (!workspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-monday-subtext text-[13px]">
        Selecciona un workspace en la barra lateral.
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-auto bg-[#f0f2f5] p-6">
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={addNote}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#5034ff] text-white text-[13px] hover:bg-[#4030dd]"
        >
          <Plus size={16} />
          Agregar nota adhesiva
        </button>
        {loadingNotes && <span className="text-[12px] text-monday-subtext">Cargando notas…</span>}
      </div>

      <p className="text-[12px] text-monday-subtext mb-3">Documentos del workspace</p>
      <div className="flex flex-wrap gap-3 mb-8">
        {docs.map(doc => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onOpenDoc(doc.id)}
            className="flex items-center gap-3 w-56 p-4 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-monday-blue/40 transition-all text-left"
          >
            {doc.type === 'sheet' ? (
              <Table2 size={24} className="text-monday-blue shrink-0" />
            ) : isPdfDocType(doc.type as DocType) ? (
              <FileCheck size={24} className="text-monday-blue shrink-0" />
            ) : (
              <FileText size={24} className="text-monday-blue shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-monday-text text-[13px]">{doc.title}</p>
              <p className="text-[11px] text-monday-subtext">{getDocTypeLabel(doc.type as DocType)}</p>
            </div>
          </button>
        ))}
        {docs.length === 0 && (
          <p className="text-[13px] text-monday-subtext">No hay documentos. Usa &quot;Agregar&quot; para crear uno.</p>
        )}
      </div>

      <p className="text-[12px] text-monday-subtext mb-2">Notas adhesivas (arrastra para mover)</p>
      <div className="relative min-h-[200px]" style={{ pointerEvents: 'none' }}>
        {panelNotes.map(note => {
          const bg = note.color ?? DEFAULT_NOTE_COLOR;
          const isLight = isLightHex(bg);
          return (
            <div
              key={note.id}
              className="absolute w-52 rounded-lg border shadow-md overflow-hidden"
              style={{
                left: note.x,
                top: note.y,
                pointerEvents: 'auto',
                backgroundColor: bg,
                borderColor: 'rgba(0,0,0,0.12)',
              }}
              onPointerDown={e => onPointerDown(e, note.id)}
              onPointerMove={e => onPointerMove(e, note.id)}
              onPointerUp={e => onPointerUp(e, note.id)}
              onPointerLeave={e => onPointerUp(e, note.id)}
            >
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-black/10 cursor-grab active:cursor-grabbing" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
                <input
                  type="text"
                  value={note.title}
                  onChange={e => updateNote(note.id, { title: e.target.value })}
                  placeholder="Título"
                  className={`flex-1 min-w-0 bg-transparent text-[12px] font-medium outline-none placeholder:opacity-70 ${isLight ? 'text-gray-900' : 'text-white placeholder:text-white/80'}`}
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button type="button" className={`p-0.5 rounded hover:bg-black/10 ${isLight ? 'text-gray-700' : 'text-white/90'}`} title="Color">
                        <Palette size={12} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className="z-[200] bg-white rounded-lg border border-gray-200 shadow-lg p-2" sideOffset={4}>
                        <div className="grid grid-cols-6 gap-1">
                          {NOTE_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => updateNote(note.id, { color: c })}
                              className="w-6 h-6 rounded border-2 border-gray-300 hover:scale-110"
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          ))}
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                  <button type="button" onClick={() => removeNote(note.id)} className={`p-0.5 rounded hover:bg-red-500/30 ${isLight ? 'text-gray-700 hover:text-red-600' : 'text-white/90'}`} title="Eliminar">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <textarea
                value={note.body}
                onChange={e => updateNote(note.id, { body: e.target.value })}
                placeholder="Contenido..."
                rows={3}
                className={`w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[12px] outline-none placeholder:opacity-70 ${isLight ? 'text-gray-900' : 'text-white placeholder:text-white/80'}`}
                style={{ backgroundColor: 'transparent' }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Editor de hoja tipo Excel: letras de columna, números de fila, barra de fórmula
function ExcelLikeSheet({
  tableDraft,
  setTableDraft,
  ensureTableSize,
}: {
  tableDraft: string[][];
  setTableDraft: React.Dispatch<React.SetStateAction<string[][]>>;
  ensureTableSize: (rows: number, cols: number) => void;
}) {
  const cols = tableDraft[0]?.length ?? 1;
  const [focusedCell, setFocusedCell] = useState<{ r: number; c: number } | null>(null);
  const displayValue = focusedCell
    ? (tableDraft[focusedCell.r]?.[focusedCell.c] ?? '')
    : '';

  const colLetters = (n: number) => {
    let s = '';
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s || 'A';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#e8e8e8]">
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-200 shadow-sm">
        <span className="text-[11px] text-gray-500 font-mono w-16">fx</span>
        <input
          type="text"
          value={displayValue}
          readOnly
          className="flex-1 max-w-md px-2 py-1 text-[12px] font-mono bg-gray-50 border border-gray-200 rounded"
          placeholder="Celda seleccionada"
        />
        {focusedCell != null && (
          <span className="text-[11px] text-gray-500 font-mono">
            {colLetters(focusedCell.c)}{focusedCell.r + 1}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="inline-block bg-white rounded-sm shadow-md border border-gray-300 overflow-hidden">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-10 h-7 bg-[#f3f3f3] border border-gray-300 text-[11px] text-gray-600 font-medium" />
                {Array.from({ length: cols }, (_, i) => (
                  <th key={i} className="min-w-[100px] h-7 px-1 bg-[#f3f3f3] border border-gray-300 text-[11px] text-gray-600 font-medium">
                    {colLetters(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableDraft.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td className="w-10 h-7 px-0 bg-[#f3f3f3] border border-gray-300 text-[11px] text-gray-600 text-center">
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="border border-gray-300 p-0">
                      <input
                        value={cell}
                        onChange={e => {
                          const v = e.target.value;
                          setTableDraft(prev => {
                            const next = prev.map(r => [...r]);
                            next[rIdx][cIdx] = v;
                            return next;
                          });
                        }}
                        onFocus={() => setFocusedCell({ r: rIdx, c: cIdx })}
                        onBlur={() => setFocusedCell(null)}
                        className="w-full min-w-[100px] h-7 px-2 text-[12px] outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-2 text-[12px]">
          <button type="button" onClick={() => ensureTableSize(tableDraft.length + 1, tableDraft[0]?.length || 1)} className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50">+ Fila</button>
          <button type="button" onClick={() => ensureTableSize(tableDraft.length, (tableDraft[0]?.length || 0) + 1)} className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50">+ Columna</button>
        </div>
      </div>
    </div>
  );
}

export const DocsPage: React.FC<Props> = ({ workspaceId, boards }) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const selectedDoc = useMemo(
    () => docs.find(d => d.id === selectedId) ?? null,
    [docs, selectedId]
  );
  const parsed = useMemo(() => parseContent(selectedDoc), [selectedDoc]);
  const [textDraft, setTextDraft] = useState(parsed.text ?? '');
  const [tableDraft, setTableDraft] = useState<string[][]>(parsed.table ?? [['']]);
  const [pdfFormDraft, setPdfFormDraft] = useState<Record<string, unknown>>({});
  const [viewMode, setViewMode] = useState<'docs' | 'overview'>('overview');
  const [deleteConfirm, setDeleteConfirm] = useState<{ docId: string } | null>(null);

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
    if (selectedDoc && isPdfDocType(selectedDoc.type as DocType)) {
      const initial = getInitialContentForType(selectedDoc.type as DocType);
      setPdfFormDraft({ ...initial, ...(parsed as Record<string, unknown>) });
    }
  }, [parsed, selectedId, selectedDoc?.type]);

  const handleCreate = async (type: DocType) => {
    if (!workspaceId) {
      setError('Selecciona un workspace en la barra lateral para poder crear documentos.');
      return;
    }
    const initialContent = getInitialContentForType(type);
    const title = type === 'text' ? 'Nuevo doc' : type === 'sheet' ? 'Nueva hoja' : getDocTypeTitle(type);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title,
          type,
          content: initialContent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 404
            ? 'La ruta /api/docs no existe en el backend. Reinicia el backend desde la carpeta Sunday/backend con: npm run dev'
            : typeof data?.error === 'string'
              ? data.error
              : 'Error al crear el documento';
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
          : isPdfDocType(selectedDoc.type as DocType)
            ? pdfFormDraft
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

  const handleDeleteClick = (id: string) => setDeleteConfirm({ docId: id });

  const handleDeleteConfirm = async () => {
    const id = deleteConfirm?.docId;
    if (!id) return;
    setDeleteConfirm(null);
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
      <Dialog.Root open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[151] bg-white rounded-xl shadow-xl border border-monday-border p-5 w-[320px]">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text">Eliminar documento</Dialog.Title>
            <p className="text-[13px] text-monday-subtext mt-1">¿Eliminar este documento? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[13px] hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="p-4 border-b border-monday-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
            <BookOpen size={22} className="text-monday-blue" />
            Documentos
          </h1>
          <div className="flex rounded-lg border border-monday-border overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setViewMode('docs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors ${viewMode === 'docs' ? 'bg-monday-blue text-white' : 'text-monday-subtext hover:bg-monday-hover'}`}
            >
              <List size={14} />
              Documentos
            </button>
            <button
              type="button"
              onClick={() => setViewMode('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors ${viewMode === 'overview' ? 'bg-monday-blue text-white' : 'text-monday-subtext hover:bg-monday-hover'}`}
            >
              <LayoutDashboard size={14} />
              Vista general
            </button>
          </div>
        </div>
        <Popover.Root open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={!workspaceId || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#5034ff] text-white text-[13px] font-medium hover:bg-[#4030dd] disabled:opacity-50 transition-colors h-9 min-w-[100px]"
            >
              <span className="flex items-center justify-center w-7 h-7 rounded bg-white/20 shrink-0">
                <Plus size={16} strokeWidth={2.5} />
              </span>
              Agregar
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-[100] bg-white rounded-lg border border-gray-200 shadow-[0_4px_20px_rgba(0,0,0,0.08)] w-56 py-1.5 fade-in"
              sideOffset={8}
              align="end"
            >
              {DOC_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    handleCreate(opt.id);
                    setCreateMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-100 text-left text-[13px] text-gray-800 transition-colors"
                >
                  {opt.id === 'sheet' ? (
                    <Table2 size={18} className="text-gray-600 shrink-0" />
                  ) : opt.id === 'text' ? (
                    <FileText size={18} className="text-gray-600 shrink-0" />
                  ) : (
                    <FileCheck size={18} className="text-gray-600 shrink-0" />
                  )}
                  <span className="font-normal">{opt.label}</span>
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      {viewMode === 'overview' ? (
        <DocsOverviewPanel
          docs={docs}
          workspaceId={workspaceId}
          onOpenDoc={id => { setViewMode('docs'); setSelectedId(id); }}
          getDocTypeLabel={getDocTypeLabel}
          isPdfDocType={isPdfDocType}
        />
      ) : (
      <div className="flex-1 flex overflow-hidden">
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
                No hay documentos aún. Usa &quot;Agregar&quot; para añadir uno.
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
                  ) : isPdfDocType(doc.type as DocType) ? (
                    <FileCheck size={16} className="text-monday-blue shrink-0" />
                  ) : (
                    <FileText size={16} className="text-monday-blue shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-monday-text">{doc.title}</p>
                    <p className="text-[11px] text-monday-subtext truncate">
                      {getDocTypeLabel(doc.type as DocType)} · {new Date(doc.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteClick(doc.id);
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

              {isPdfDocType(selectedDoc.type as DocType) ? (
                <div className="flex-1 overflow-auto custom-scrollbar p-4 bg-monday-bg/40">
                  <PdfTemplateEditor
                    docType={selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'}
                    value={pdfFormDraft}
                    onChange={setPdfFormDraft}
                    docId={selectedDoc.id}
                  />
                </div>
              ) : selectedDoc.type === 'sheet' ? (
                <ExcelLikeSheet
                  tableDraft={tableDraft}
                  setTableDraft={setTableDraft}
                  ensureTableSize={ensureTableSize}
                />
              ) : (
                <WordLikeEditor textDraft={textDraft} setTextDraft={setTextDraft} />
              )}
            </>
          )}
        </section>
      </div>
      )}
    </div>
  );
};
