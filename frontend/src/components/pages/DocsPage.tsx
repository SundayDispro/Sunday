import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  FileText,
  Table2,
  Plus,
  Trash2,
  FileCheck,
  LayoutDashboard,
  List,
  Palette,
  Calculator,
  CheckSquare,
  Circle,
  CheckCircle,
  Star,
  StarOff,
  ChevronDown,
  Download,
  X,
  Upload,
  Loader2,
  Pencil,
} from 'lucide-react';
import { GROUP_PALETTE } from '../Board/GroupColorPicker';
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
import type { TemplateConfigState } from './docs/pdfTemplateConfig';
import { PdfTemplateEditor } from './docs/PdfTemplateEditor';
import { TextFormatBarForEditor } from '../docs/TextFormatBar';
import { useUser } from '../../store/UserContext';

const API_BASE = 'http://localhost:3001';

interface Props {
  workspaceId: string | null;
  boards: Board[];
  initialCreateFromBoard?: {
    type: DocType;
    boardId: string;
    itemId: string;
  } | null;
  onConsumeInitialCreateFromBoard?: () => void;
  onAddTaskList?: () => void;
  onAddCalculatorWidget?: () => void;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  important?: boolean;
}

export interface TaskWindow {
  id: string;
  title: string;
  color?: string;
  ownerId?: string;
  tasks: TaskItem[];
}

// Grupos personalizados de documentos (por usuario/workspace, persistidos en API doc-groups)
export type DocCustomGroup = { id: string; name: string };

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

function normalizeNote(raw: unknown): TaskWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : crypto.randomUUID();
  const title = typeof o.title === 'string' ? o.title : 'Mis tareas';
  const color = typeof o.color === 'string' ? o.color : DEFAULT_NOTE_COLOR;
  const ownerId = typeof o.ownerId === 'string' ? o.ownerId : undefined;
  const rawTasks = Array.isArray(o.tasks) ? o.tasks : [];
  const tasks: TaskItem[] =
    rawTasks.length > 0
      ? rawTasks.map((t, index) => {
          const r = (t ?? {}) as Record<string, unknown>;
          const tid = typeof r.id === 'string' ? r.id : `${id}-t${index}`;
          const text = typeof r.text === 'string' ? r.text : '';
          const done = typeof r.done === 'boolean' ? r.done : false;
          const important = typeof r.important === 'boolean' ? r.important : false;
          return { id: tid, text, done, important };
        })
      : [];
  return { id, title, color, ownerId, tasks };
}

type DocContent = {
  text?: string;
  table?: string[][];
  headerImageUrl?: string | null;
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

/** Aplica formato en línea (negrita, cursiva, tachado, subrayado, código) a texto ya escapado. */
function inlineFormat(escaped: string): string {
  return escaped
    .replace(/&lt;u&gt;/g, '<u>')
    .replace(/&lt;\/u&gt;/g, '</u>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code class="bg-monday-hover px-1 rounded text-sm">$1</code>');
}

/** Convierte el markdown simple del doc a HTML para que el formato se vea (negrita, cursiva, etc.). */
function renderDocMarkdownToHtml(text: string): string {
  if (!text.trim()) return '';
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (/^###\s/.test(trimmed)) {
      const content = inlineFormat(escape(trimmed.replace(/^###\s*/, '')));
      out.push(`<h3 class="text-base font-bold mt-3 mb-1 font-averta">${content}</h3>`);
      continue;
    }
    if (/^##\s/.test(trimmed)) {
      const content = inlineFormat(escape(trimmed.replace(/^##\s*/, '')));
      out.push(`<h2 class="text-lg font-bold mt-4 mb-1 font-averta">${content}</h2>`);
      continue;
    }
    if (/^#\s/.test(trimmed)) {
      const content = inlineFormat(escape(trimmed.replace(/^#\s*/, '')));
      out.push(`<h1 class="text-xl font-bold mt-4 mb-2 font-averta">${content}</h1>`);
      continue;
    }
    if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const content = inlineFormat(escape(trimmed.replace(/^[-*]\s|^\d+\.\s/, '')));
      out.push(`<li class="ml-4 list-disc font-averta">${content}</li>`);
      continue;
    }
    const escaped = escape(lines[i]);
    const content = inlineFormat(escaped);
    out.push(content ? `<p class="mb-1 font-averta">${content}</p>` : '<br/>');
  }
  return out.join('');
}

/** Si el texto guardado es HTML lo devuelve; si es markdown legacy lo convierte a HTML. */
function getInitialHtml(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return '<p><br></p>';
  if (/^<[\w-]/m.test(t) || t.includes('</')) return t;
  const html = renderDocMarkdownToHtml(text);
  return html || '<p><br></p>';
}

// Editor WYSIWYG: contentEditable + barra de formato compartida (fuente, negrita, cursiva, tamaño, listas)
function WordLikeEditor({
  textDraft,
  setTextDraft,
  headerImageUrl,
  setHeaderImageUrl,
}: {
  textDraft: string;
  setTextDraft: (v: string) => void;
  headerImageUrl: string | null;
  setHeaderImageUrl: (v: string | null) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSyncedRef = useRef<string>(textDraft);
  const headerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (textDraft !== lastSyncedRef.current) {
      el.innerHTML = textDraft || '<p><br></p>';
      lastSyncedRef.current = textDraft;
    }
  }, [textDraft]);

  const reportContent = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastSyncedRef.current = html;
    setTextDraft(html);
  }, [setTextDraft]);

  const previewUrl = useCallback((url: string) => (url.trim().startsWith('/') ? API_BASE + url : url), []);

  const handleHeaderFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setHeaderError(null);
      if (!/^image\/jpe?g$/i.test(file.type)) {
        setHeaderError('Solo se aceptan imágenes JPG.');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      setUploadingHeader(true);
      try {
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const text = await res.text();
        let data: { error?: string; url?: string } = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {
            error:
              res.status === 404
                ? 'Servidor no disponible. ¿Está corriendo el backend en el puerto 3001?'
                : `Error del servidor (${res.status})`,
          };
        }
        if (!res.ok) {
          throw new Error(data.error || `Error al subir (${res.status})`);
        }
        setHeaderImageUrl(data.url ?? null);
        if (headerFileInputRef.current) headerFileInputRef.current.value = '';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
        const isNetwork = msg === 'Failed to fetch' || msg.includes('NetworkError');
        setHeaderError(
          isNetwork ? 'No se pudo conectar con el servidor. Comprueba que el backend esté corriendo (puerto 3001).' : msg,
        );
      } finally {
        setUploadingHeader(false);
      }
    },
    [setHeaderImageUrl],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-monday-bg/50">
      <div className="border-b border-monday-border bg-white">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <TextFormatBarForEditor editorRef={editorRef} reportContent={reportContent} />
          <div className="shrink-0 flex items-center gap-2 pr-2">
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday border border-monday-border text-[11px] text-monday-subtext hover:bg-monday-hover"
                >
                  <Palette size={12} className="text-monday-subtext" />
                  <span>Encabezado</span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 p-3 rounded-lg shadow-lg border border-monday-border bg-white w-72"
                  sideOffset={6}
                  onOpenAutoFocus={e => e.preventDefault()}
                >
                  <p className="text-[12px] text-monday-subtext mb-2">
                    Sube un archivo <span className="font-semibold">JPG</span> que se mostrará como encabezado del documento.
                  </p>
                  <input
                    ref={headerFileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg"
                    className="hidden"
                    id="docs-header-file"
                    onChange={handleHeaderFileChange}
                  />
                  <div className="flex items-center gap-2 mb-2">
                    <label
                      htmlFor="docs-header-file"
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-monday bg-monday-blue text-white text-[12px] cursor-pointer hover:bg-monday-blue/90"
                    >
                      {uploadingHeader ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Subiendo…</span>
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          <span>Elegir JPG</span>
                        </>
                      )}
                    </label>
                    {headerImageUrl && (
                      <button
                        type="button"
                        onClick={() => setHeaderImageUrl(null)}
                        className="text-[11px] text-monday-subtext hover:text-monday-red"
                      >
                        Quitar encabezado
                      </button>
                    )}
                  </div>
                  {headerError && (
                    <p className="text-[11px] text-red-600 mb-2" role="alert">
                      {headerError}
                    </p>
                  )}
                  {headerImageUrl && (
                    <div className="mt-1 rounded-md border border-monday-border bg-monday-hover/40 p-1 flex justify-center">
                      <img
                        src={previewUrl(headerImageUrl)}
                        alt="Vista previa encabezado"
                        className="max-h-20 w-auto object-contain"
                      />
                    </div>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-[21cm] min-h-[29.7cm] bg-white rounded-lg border border-monday-border shadow-monday-lg px-12 py-10 font-averta">
          {headerImageUrl && (
            <div className="mb-4 flex justify-center">
              <img
                src={headerImageUrl}
                alt="Encabezado"
                className="max-h-32 w-auto object-contain"
              />
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Empieza a escribir..."
            onInput={reportContent}
            onBlur={reportContent}
            className="w-full min-h-[calc(29.7cm-3.5rem)] outline-none text-[11pt] text-monday-text leading-relaxed font-averta [&:empty::before]:content-[attr(data-placeholder)] [&:empty::before]:text-monday-subtext [&_span]:font-averta [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1 [&_li]:pl-0.5"
            style={{ backgroundColor: 'transparent' }}
          />
        </div>
      </div>
    </div>
  );
}

function TaskWindowCard({
  window,
  onUpdateWindow,
  onRemoveWindow,
}: {
  window: TaskWindow;
  onUpdateWindow: (id: string, patch: Partial<TaskWindow>) => void;
  onRemoveWindow: (id: string) => void;
}) {
  const bg = window.color ?? DEFAULT_NOTE_COLOR;
  const light = isLightHex(bg);
  const tasks = window.tasks ?? [];
  const [showCompleted, setShowCompleted] = React.useState(false);

  const activeTasks = tasks.filter((t) => !t.done);
  const completedTasks = tasks.filter((t) => t.done);

  const updateTasks = (next: TaskItem[]) => onUpdateWindow(window.id, { tasks: next });

  const toggleDone = (taskId: string) => {
    const next = tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t,
    );
    updateTasks(next);
  };

  const toggleImportant = (taskId: string) => {
    const next = tasks.map((t) =>
      t.id === taskId ? { ...t, important: !t.important } : t,
    );
    updateTasks(next);
  };

  const updateText = (taskId: string, text: string) => {
    const next = tasks.map((t) =>
      t.id === taskId ? { ...t, text } : t,
    );
    updateTasks(next);
  };

  const removeTask = (taskId: string) => {
    const next = tasks.filter((t) => t.id !== taskId);
    updateTasks(next);
  };

  const addTask = () => {
    const next = [
      ...(tasks ?? []),
      { id: crypto.randomUUID(), text: '', done: false, important: false },
    ];
    updateTasks(next);
  };

  const handleTextChange = (taskId: string) => (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const el = e.currentTarget;
    // Auto-ajustar altura al contenido
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    updateText(taskId, e.target.value);
  };

  const renderTaskRow = (task: TaskItem, isCompletedSection: boolean) => {
    const isDone = !!task.done;
    const isImportant = !!task.important;
    return (
      <div key={task.id} className="flex items-start gap-2 py-1 group">
        <button
          type="button"
          onClick={() => toggleDone(task.id)}
          className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-monday-blue bg-transparent hover:bg-monday-hover/60 border border-monday-border"
        >
          {isDone ? <CheckCircle size={14} /> : <Circle size={14} className="text-monday-subtext" />}
        </button>
        <textarea
          value={task.text}
          onChange={handleTextChange(task.id)}
          rows={1}
          style={{ minHeight: '24px', overflow: 'hidden' }}
          className={`flex-1 resize-none border-0 bg-transparent text-[12px] outline-none px-1 py-0.5 rounded hover:bg-monday-hover/40 ${
            isDone ? 'text-monday-subtext line-through' : 'text-monday-text'
          }`}
          placeholder="Nueva tarea..."
        />
        <button
          type="button"
          onClick={() => toggleImportant(task.id)}
          className="p-0.5 rounded text-monday-subtext hover:text-monday-blue"
          title={isImportant ? 'Quitar destacado' : 'Marcar como importante'}
        >
          {isImportant ? <Star size={12} className="fill-current" /> : <StarOff size={12} />}
        </button>
        <button
          type="button"
          onClick={() => removeTask(task.id)}
          className="p-0.5 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar tarea"
        >
          <Trash2 size={11} />
        </button>
      </div>
    );
  };

  return (
    <div
      className="rounded-xl border shadow-sm bg-white flex flex-col overflow-hidden"
    >
      <div
        className="flex items-center justify-between gap-1 px-3 py-2 border-b border-black/5"
        style={{ backgroundColor: bg, color: light ? '#111827' : 'white' }}
      >
        <input
          type="text"
          value={window.title}
          onChange={(e) => onUpdateWindow(window.id, { title: e.target.value })}
          placeholder="Lista sin título"
          className={`flex-1 min-w-0 bg-transparent text-[12px] font-medium outline-none placeholder:opacity-70 ${
            light ? 'text-gray-900' : 'text-white placeholder:text-white/80'
          }`}
        />
        <div className="flex items-center gap-0.5">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={`p-0.5 rounded ${
                  light
                    ? 'text-gray-700 hover:bg-black/5'
                    : 'text-white/90 hover:bg-white/10'
                }`}
                title="Color"
              >
                <Palette size={12} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-[200] bg-white rounded-lg border border-gray-200 shadow-lg p-2"
                sideOffset={4}
              >
                <div className="grid grid-cols-6 gap-1">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onUpdateWindow(window.id, { color: c })}
                      className="w-6 h-6 rounded border-2 border-gray-300 hover:scale-110"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            onClick={() => onRemoveWindow(window.id)}
            className={`p-0.5 rounded ${
              light
                ? 'text-gray-700 hover:bg-red-100 hover:text-red-600'
                : 'text-white/90 hover:bg-red-500/40'
            }`}
            title="Eliminar lista"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1">
        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <p className="text-[12px] text-monday-subtext py-1">
            No hay tareas. Añade la primera abajo.
          </p>
        )}
        {activeTasks.map((task) => renderTaskRow(task, false))}
        {completedTasks.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowCompleted((s) => !s)}
              className="flex items-center gap-1 text-[11px] text-monday-subtext hover:text-monday-text"
            >
              <ChevronDown
                size={12}
                className={`transition-transform ${
                  showCompleted ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <span>
                Completadas ({completedTasks.length})
              </span>
            </button>
            {showCompleted && (
              <div className="mt-1 space-y-1">
                {completedTasks.map((task) => renderTaskRow(task, true))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-monday-border/60 bg-monday-bg/40">
        <button
          type="button"
          onClick={addTask}
          className="inline-flex items-center gap-1 text-[12px] text-monday-blue hover:underline"
        >
          <Plus size={12} />
          Añadir una tarea
        </button>
      </div>
    </div>
  );
}

// Fila de documento en el sidebar (estilo tabla principal: bordes, hover)
function DocSidebarRow({
  doc,
  selectedId,
  onSelect,
  onDelete,
  customGroups,
  assignment,
  onAssign,
  getDocTypeLabel,
  isPdfDocType,
}: {
  doc: Doc;
  selectedId: string | null;
  onSelect: () => void;
  onDelete: () => void;
  customGroups: DocCustomGroup[];
  assignment: string | undefined;
  onAssign: (groupId: string | null) => void;
  getDocTypeLabel: (t: DocType) => string;
  isPdfDocType: (t: DocType) => boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex items-center gap-2 px-3 py-2 text-left text-[13px] border-b border-monday-border/60 last:border-b-0 hover:bg-monday-hover transition-colors cursor-pointer ${
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
        <p className="truncate text-monday-text font-averta">{doc.title}</p>
        <p className="text-[11px] text-monday-subtext truncate">
          {getDocTypeLabel(doc.type as DocType)} · {new Date(doc.updatedAt).toLocaleString()}
        </p>
      </div>
      <select
        value={assignment ?? ''}
        onChange={(e) => onAssign(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
        className="text-[11px] border border-monday-border rounded-monday px-1.5 py-0.5 bg-white text-monday-subtext min-w-0 max-w-[100px]"
        title="Grupo personalizado"
      >
        <option value="">—</option>
        {customGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50 shrink-0"
        title="Eliminar"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// Cabecera de grupo personalizado con nombre editable y eliminar
function DocCustomGroupHeader({
  name,
  onRename,
  onRemove,
}: {
  name: string;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);
  return (
    <div className="px-3 py-2 bg-monday-hover/60 border-b border-monday-border flex items-center gap-2 group">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft.trim() && draft !== name) onRename(draft.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="flex-1 text-[12px] font-medium text-monday-subtext bg-white border border-monday-border rounded-monday px-2 py-1 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="text-[12px] font-medium text-monday-subtext flex-1 truncate">{name}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-0.5 rounded text-monday-subtext hover:text-monday-blue opacity-0 group-hover:opacity-100"
            title="Renombrar"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-0.5 rounded text-monday-subtext hover:text-monday-red opacity-0 group-hover:opacity-100"
            title="Eliminar grupo"
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}

// Colores por tipo de documento (alineados con la ventana principal)
const DOC_TYPE_GROUP_COLORS: Record<string, string> = {
  text: '#579bfc',
  sheet: '#00c875',
  cotizacion: '#f5ca00',
  levantamiento: '#ff9d00',
  hoja_trabajo: '#5559df',
};

// Sección de grupo tipo ventana principal: cabecera con chevron, color, nombre, contador, tabla
function DocGroupSection({
  id,
  title,
  color,
  collapsed,
  onToggleCollapse,
  onRemove,
  docs,
  selectedId,
  onSelectDoc,
  onDeleteDoc,
  customGroups,
  assignments,
  onAssign,
  getDocTypeLabel,
  isPdfDocType,
  docType,
  subgroups = [],
  subgroupAssignments = {},
  onAddSubgroup,
  onRenameSubgroup,
  onRemoveSubgroup,
  onAssignSubgroup,
}: {
  id: string;
  title: string;
  color: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemove?: () => void;
  docs: Doc[];
  selectedId: string | null;
  onSelectDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
  customGroups: DocCustomGroup[];
  assignments: Record<string, string>;
  onAssign: (docId: string, groupId: string | null) => void;
  getDocTypeLabel: (t: DocType) => string;
  isPdfDocType: (t: DocType) => boolean;
  docType?: string;
  subgroups?: DocCustomGroup[];
  subgroupAssignments?: Record<string, string>;
  onAddSubgroup?: (docType: string) => void;
  onRenameSubgroup?: (docType: string, subgroupId: string, newName: string) => void;
  onRemoveSubgroup?: (docType: string, subgroupId: string) => void;
  onAssignSubgroup?: (docId: string, subgroupId: string | null) => void;
}) {
  const showSubgroups = !!docType && !!onAddSubgroup;
  return (
    <section className="mb-6 rounded-lg border border-monday-border bg-white shadow-[0_2px_6px_0_rgba(0,0,0,0.08)] overflow-hidden min-h-0">
      {/* Cabecera tipo BoardGroup: chevron, color, nombre, contador, añadir subgrupo, eliminar */}
      <div
        className="flex items-center gap-1.5 py-1.5 pt-2 pb-2 px-3 border-b border-monday-border bg-white"
        style={{ boxShadow: '0 2px 6px 0 rgba(0,0,0,0.08)' }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="text-monday-subtext hover:text-monday-text transition-colors flex-shrink-0"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          <ChevronDown
            size={24}
            style={{ color }}
            className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          />
        </button>
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <h3 className="text-[26px] font-normal leading-tight font-averta truncate min-w-0" style={{ color }}>
          {title}
        </h3>
        <span className="text-[14px] text-monday-subtext font-normal whitespace-nowrap">
          {docs.length} {docs.length === 1 ? 'elemento' : 'elementos'}
        </span>
        {showSubgroups && docType && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAddSubgroup(docType)}
              className="flex items-center gap-1 px-2 py-1 rounded-monday border border-dashed border-monday-border text-[12px] text-monday-subtext hover:text-monday-blue hover:border-monday-blue transition-colors"
            >
              <Plus size={14} />
              Añadir subgrupo
            </button>
            {subgroups.length > 0 && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1 rounded-monday border border-monday-border text-[12px] text-monday-subtext hover:bg-monday-hover"
                  >
                    <span>Subgrupos ({subgroups.length})</span>
                    <ChevronDown size={12} />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="z-50 p-2 rounded-lg border border-monday-border bg-white shadow-lg min-w-[180px]" sideOffset={6}>
                    <p className="text-[11px] font-semibold text-monday-subtext uppercase mb-2">Gestionar subgrupos</p>
                    {subgroups.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 py-1 group">
                        <span className="text-[13px] text-monday-text truncate">{s.name}</span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const n = window.prompt('Nuevo nombre', s.name);
                              if (n != null && n.trim()) onRenameSubgroup?.(docType, s.id, n.trim());
                            }}
                            className="p-1 rounded text-monday-subtext hover:text-monday-blue hover:bg-monday-hover"
                            title="Renombrar"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveSubgroup?.(docType, s.id)}
                            className="p-1 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50"
                            title="Eliminar subgrupo"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
          </div>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="ml-auto p-1.5 rounded-lg text-monday-subtext hover:text-monday-red hover:bg-red-50 transition-colors"
            title="Eliminar grupo"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="relative z-0 w-full overflow-x-auto">
          <table className="w-full text-left border-collapse font-averta">
            <thead>
              <tr className="h-[34px] bg-monday-hover/60">
                <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[1%]" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                  Nombre
                </th>
                <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[120px]">
                  Tipo
                </th>
                {showSubgroups && (
                  <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[130px]">
                    Subgrupo
                  </th>
                )}
                <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[140px]">
                  Grupo personalizado
                </th>
                <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[140px]">
                  Última modificación
                </th>
                <th className="font-normal text-[12px] text-monday-subtext border-b border-monday-border px-2 py-2 w-[44px]">
                  {' '}
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={showSubgroups ? 6 : 5} className="px-3 py-3 text-[13px] text-monday-subtext border-b border-monday-border">
                    Ningún documento
                  </td>
                </tr>
              ) : (
                docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`border-t border-monday-border/60 hover:bg-monday-hover transition-colors cursor-pointer ${selectedId === doc.id ? 'bg-monday-hover' : ''}`}
                    onClick={() => onSelectDoc(doc.id)}
                  >
                    <td className="px-3 py-2 border-r border-monday-border/60 align-middle" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                      <div className="flex items-center gap-2">
                        {doc.type === 'sheet' ? (
                          <Table2 size={16} className="text-monday-blue shrink-0" />
                        ) : isPdfDocType(doc.type as DocType) ? (
                          <FileCheck size={16} className="text-monday-blue shrink-0" />
                        ) : (
                          <FileText size={16} className="text-monday-blue shrink-0" />
                        )}
                        <span className="truncate text-[13px] text-monday-text">{doc.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[13px] text-monday-subtext border-r border-monday-border/60 align-middle">
                      {getDocTypeLabel(doc.type as DocType)}
                    </td>
                    {showSubgroups && docType && (
                      <td className="px-3 py-2 border-r border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={subgroupAssignments[doc.id] ?? ''}
                          onChange={(e) => onAssignSubgroup?.(doc.id, e.target.value || null)}
                          className="text-[12px] border border-monday-border rounded-monday px-2 py-1 bg-white text-monday-subtext w-full max-w-[120px]"
                        >
                          <option value="">—</option>
                          {subgroups.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-3 py-2 border-r border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={assignments[doc.id] ?? ''}
                        onChange={(e) => onAssign(doc.id, e.target.value || null)}
                        className="text-[12px] border border-monday-border rounded-monday px-2 py-1 bg-white text-monday-subtext w-full max-w-[120px]"
                      >
                        <option value="">—</option>
                        {customGroups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[13px] text-monday-subtext border-r border-monday-border/60 align-middle">
                      {new Date(doc.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 border-b border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onDeleteDoc(doc.id)}
                        className="p-1.5 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full text-left text-[12px] text-monday-subtext hover:text-monday-text flex items-center gap-1.5 px-3 py-2 hover:bg-monday-hover/50 transition-colors"
        >
          <ChevronDown size={14} className="-rotate-90" />
          {docs.length} elemento{docs.length !== 1 ? 's' : ''} ocultos
        </button>
      )}
    </section>
  );
}

// Vista general: panel de control con doc cards + panel de tareas personales (estado manejado por padre)
// Vista general simplificada: menús superiores + tabla de documentos
function DocsOverviewPanel({
  docs,
  workspaceId,
  onOpenDoc,
  onCreateDoc,
  onAddTaskList,
}: {
  docs: Doc[];
  workspaceId: string | null;
  onOpenDoc: (id: string) => void;
  onCreateDoc: (type: DocType) => void;
  onAddTaskList?: () => void;
}) {

  if (!workspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-monday-subtext text-[13px]">
        Selecciona un workspace en la barra lateral.
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-auto bg-[#f0f2f5] p-6">
      {/* Menús grandes para crear documentos */}
      <div className="flex flex-wrap gap-4 mb-6">
        {DOC_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.id}
            type="button"
            disabled={!workspaceId}
            onClick={() => onCreateDoc(opt.id)}
            className="flex flex-col items-start justify-between w-64 p-4 rounded-2xl bg-white border border-gray-200 shadow-md hover:shadow-lg hover:border-monday-blue/50 transition-all text-left disabled:opacity-60"
          >
            <div className="flex items-center gap-3 mb-2">
              {opt.id === 'sheet' ? (
                <Table2 size={26} className="text-monday-blue shrink-0" />
              ) : isPdfDocType(opt.id) ? (
                <FileCheck size={26} className="text-monday-blue shrink-0" />
              ) : (
                <FileText size={26} className="text-monday-blue shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-monday-text text-[14px] truncate">
                  {opt.title}
                </p>
                <p className="text-[11px] text-monday-subtext">{opt.label}</p>
              </div>
            </div>
            <span className="text-[11px] text-monday-blue font-medium">
              Crear {opt.label.toLowerCase()}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[12px] text-monday-subtext mb-3">Documentos del workspace (agrupados por tipo)</p>
      <div className="space-y-6">
        {DOC_TYPE_OPTIONS.map((opt) => {
          const groupDocs = docs.filter((d) => d.type === opt.id);
          const typeGroupTitle = opt.id === 'text' ? 'Documentos de texto' : opt.id === 'sheet' ? 'Hojas' : getDocTypeLabel(opt.id as DocType);
          return (
            <section
              key={opt.id}
              className="rounded-lg border border-monday-border bg-white shadow-[0_2px_6px_0_rgba(0,0,0,0.08)] overflow-hidden min-h-0"
            >
              <div className="h-[34px] px-3 flex items-center bg-monday-hover/60 border-b border-monday-border text-[12px] font-medium text-monday-subtext">
                {typeGroupTitle}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px] font-averta">
                  <thead>
                    <tr className="h-[34px] bg-monday-hover/60">
                      <th className="text-left px-3 py-2 font-normal text-monday-subtext border-b border-r border-monday-border last:border-r-0">
                        Nombre
                      </th>
                      <th className="text-left px-3 py-2 font-normal text-monday-subtext border-b border-r border-monday-border last:border-r-0">
                        Tipo
                      </th>
                      <th className="text-left px-3 py-2 font-normal text-monday-subtext border-b border-monday-border">
                        Última modificación
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupDocs.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-monday-subtext" colSpan={3}>
                          Ninguno
                        </td>
                      </tr>
                    ) : (
                      groupDocs.map((doc) => (
                        <tr
                          key={doc.id}
                          className="border-t border-monday-border/60 hover:bg-monday-hover cursor-pointer transition-colors"
                          onClick={() => onOpenDoc(doc.id)}
                        >
                          <td className="px-3 py-2 border-r border-monday-border/60">
                            <div className="flex items-center gap-2">
                            {doc.type === 'sheet' ? (
                              <Table2 size={16} className="text-monday-blue shrink-0" />
                            ) : isPdfDocType(doc.type as DocType) ? (
                              <FileCheck size={16} className="text-monday-blue shrink-0" />
                            ) : (
                              <FileText size={16} className="text-monday-blue shrink-0" />
                            )}
                            <span className="truncate text-monday-text">{doc.title}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-monday-subtext border-r border-monday-border/60">
                            {getDocTypeLabel(doc.type as DocType)}
                          </td>
                          <td className="px-3 py-2 text-monday-subtext">
                            {new Date(doc.updatedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      {docs.length === 0 && (
        <p className="text-[13px] text-monday-subtext mt-2">
          No hay documentos todavía. Crea uno con los botones de arriba.
        </p>
      )}
    </div>
  );
}

// --- Fórmulas tipo Excel para la hoja (suma, resta, multiplicación, división, SUM) ---
function parseCellRef(ref: string): { r: number; c: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const colStr = m[1];
  const row = parseInt(m[2], 10) - 1;
  if (row < 0) return null;
  let c = 0;
  for (let i = 0; i < colStr.length; i++) {
    c = c * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { r: row, c: c - 1 };
}

function getCellNum(table: string[][], r: number, c: number): number {
  const raw = table[r]?.[c] ?? '';
  if (raw === '') return 0;
  const n = parseFloat(raw.replace(/,/g, '.'));
  if (!Number.isNaN(n)) return n;
  if (raw.startsWith('=')) return 0;
  return 0;
}

function evaluateFormula(
  table: string[][],
  formula: string,
  currentR: number,
  currentC: number,
  visited?: Set<string>
): string | number {
  const vis = visited ?? new Set<string>();
  const expr = formula.replace(/^=/, '').trim();
  if (!expr) return '';

  const key = `${currentR},${currentC}`;
  if (vis.has(key)) return '#CIRCULAR';
  vis.add(key);

  try {
    // SUM(A1:A5) o SUM(A1,B2,C3)
    const sumMatch = expr.match(/^SUM\s*\((.*)\)$/i);
    if (sumMatch) {
      const arg = sumMatch[1].trim();
      let total = 0;
      if (arg.includes(':')) {
        const [start, end] = arg.split(':').map(s => parseCellRef(s.trim())).filter(Boolean) as { r: number; c: number }[];
        if (!start || !end) return '#ERROR';
        const minR = Math.min(start.r, end.r);
        const maxR = Math.max(start.r, end.r);
        const minC = Math.min(start.c, end.c);
        const maxC = Math.max(start.c, end.c);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const cell = table[r]?.[c] ?? '';
            if (cell.startsWith('=')) {
              const v = evaluateFormula(table, cell, r, c, new Set(vis));
              total += typeof v === 'number' ? v : 0;
            } else {
              const n = parseFloat(String(cell).replace(/,/g, '.'));
              total += Number.isNaN(n) ? 0 : n;
            }
          }
        }
      } else {
        arg.split(',').forEach(part => {
          const ref = parseCellRef(part.trim());
          if (ref) {
            const cell = table[ref.r]?.[ref.c] ?? '';
            if (cell.startsWith('=')) {
              const v = evaluateFormula(table, cell, ref.r, ref.c, new Set(vis));
              total += typeof v === 'number' ? v : 0;
            } else {
              const n = parseFloat(String(cell).replace(/,/g, '.'));
              total += Number.isNaN(n) ? 0 : n;
            }
          }
        });
      }
      return total;
    }

    // Expresión simple: A1+B1, A1-B1, A1*B1, A1/B1, (A1+B1)*C1, etc.
    const tokens: string[] = [];
    let rest = expr.replace(/\s/g, '');
    while (rest.length > 0) {
      const refMatch = rest.match(/^([A-Z]+\d+)/i);
      const numMatch = rest.match(/^\d+(?:[.,]\d+)?/);
      const opMatch = rest.match(/^([+\-*/()])/);
      if (refMatch) {
        const ref = parseCellRef(refMatch[1]);
        const val = ref ? getCellNum(table, ref.r, ref.c) : 0;
        const cellContent = ref ? (table[ref.r]?.[ref.c] ?? '') : '';
        if (cellContent.startsWith('=')) {
          const v = evaluateFormula(table, cellContent, ref!.r, ref!.c, new Set(vis));
          tokens.push(typeof v === 'number' ? String(v) : '0');
        } else {
          tokens.push(String(val));
        }
        rest = rest.slice(refMatch[1].length);
      } else if (numMatch) {
        tokens.push(numMatch[1].replace(/,/g, '.'));
        rest = rest.slice(numMatch[1].length);
      } else if (opMatch) {
        tokens.push(opMatch[1]);
        rest = rest.slice(1);
      } else {
        return '#ERROR';
      }
    }

    const rpn = toRPN(tokens);
    const result = evalRPN(rpn);
    return typeof result === 'number' && Number.isFinite(result) ? result : '#ERROR';
  } catch {
    return '#ERROR';
  }
}

function toRPN(tokens: string[]): string[] {
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  for (const t of tokens) {
    if (t === '(') ops.push(t);
    else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      ops.pop();
    } else if (prec[t] != null) {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()!);
      ops.push(t);
    } else {
      out.push(t);
    }
  }
  while (ops.length) out.push(ops.pop()!);
  return out;
}

function evalRPN(rpn: string[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t === '+') stack.push((stack.pop() ?? 0) + (stack.pop() ?? 0));
    else if (t === '-') { const b = stack.pop() ?? 0; const a = stack.pop() ?? 0; stack.push(a - b); }
    else if (t === '*') stack.push((stack.pop() ?? 0) * (stack.pop() ?? 0));
    else if (t === '/') { const b = stack.pop() ?? 0; const a = stack.pop() ?? 0; stack.push(b === 0 ? 0 : a / b); }
    else stack.push(parseFloat(t) || 0);
  }
  return stack[0] ?? 0;
}

function getCellDisplayValue(
  table: string[][],
  r: number,
  c: number,
  isFocused: boolean,
  focusedCell: { r: number; c: number } | null
): string {
  const raw = table[r]?.[c] ?? '';
  if (isFocused) return raw;
  if (!raw.startsWith('=')) return raw;
  const result = evaluateFormula(table, raw, r, c);
  if (typeof result === 'number') return Number.isInteger(result) ? String(result) : result.toFixed(2);
  return result;
}

// Editor de hoja tipo Excel: integrado a la interfaz, barra de fórmula y opciones
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
  const formulaBarValue = focusedCell != null ? (tableDraft[focusedCell.r]?.[focusedCell.c] ?? '') : '';

  const colLetters = (n: number) => {
    let s = '';
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s || 'A';
  };

  const setFocusedCellValue = (value: string) => {
    if (focusedCell == null) return;
    setTableDraft(prev => {
      const next = prev.map(row => [...row]);
      const row = next[focusedCell.r];
      if (row) row[focusedCell.c] = value;
      return next;
    });
  };

  const insertRowAbove = () => {
    if (focusedCell == null) {
      ensureTableSize(tableDraft.length + 1, tableDraft[0]?.length || 1);
      return;
    }
    setTableDraft(prev => {
      const newRow = new Array(prev[0]?.length || 1).fill('');
      const next = [...prev.slice(0, focusedCell.r), newRow, ...prev.slice(focusedCell.r)];
      return next;
    });
    setFocusedCell(prev => prev ? { r: prev.r + 1, c: prev.c } : null);
  };

  const insertColLeft = () => {
    if (focusedCell == null) {
      ensureTableSize(tableDraft.length, (tableDraft[0]?.length || 0) + 1);
      return;
    }
    setTableDraft(prev => prev.map(row => [...row.slice(0, focusedCell.c), '', ...row.slice(focusedCell.c)]));
    setFocusedCell(prev => prev ? { r: prev.r, c: prev.c + 1 } : null);
  };

  const sheetBtn = 'px-2.5 py-1.5 rounded-monday border border-monday-border bg-white text-[12px] text-monday-text hover:bg-monday-hover transition-colors';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-monday-bg/50">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
        <span className="text-[11px] text-monday-subtext font-mono w-8">fx</span>
        <input
          type="text"
          value={formulaBarValue}
          onChange={e => setFocusedCellValue(e.target.value)}
          readOnly={focusedCell == null}
          className="flex-1 max-w-md px-2.5 py-1.5 text-[12px] font-averta bg-monday-hover/50 border border-monday-border rounded-monday text-monday-text placeholder:text-monday-subtext"
          placeholder={focusedCell ? "Fórmula o valor (ej: =A1+B1, =SUM(A1:A5))" : "Selecciona una celda"}
        />
        {focusedCell != null && (
          <span className="text-[11px] text-monday-subtext font-mono shrink-0">
            {colLetters(focusedCell.c)}{focusedCell.r + 1}
          </span>
        )}
        <div className="w-px h-5 bg-monday-border" />
        <button type="button" onClick={() => ensureTableSize(tableDraft.length + 1, tableDraft[0]?.length || 1)} className={sheetBtn}>
          + Fila
        </button>
        <button type="button" onClick={() => ensureTableSize(tableDraft.length, (tableDraft[0]?.length || 0) + 1)} className={sheetBtn}>
          + Columna
        </button>
        {focusedCell != null && (
          <>
            <button type="button" onClick={insertRowAbove} className={sheetBtn} title="Insertar fila arriba">
              Fila ↑
            </button>
            <button type="button" onClick={insertColLeft} className={sheetBtn} title="Insertar columna a la izquierda">
              Col ←
            </button>
          </>
        )}
        <span className="text-[11px] text-monday-subtext px-2">Hoja</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="inline-block bg-white rounded-lg border border-monday-border shadow-monday-lg overflow-hidden">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-10 h-8 bg-monday-hover/60 border border-monday-border text-[11px] text-monday-subtext font-medium" />
                {Array.from({ length: cols }, (_, i) => (
                  <th key={i} className="min-w-[110px] h-8 px-1 bg-monday-hover/60 border border-monday-border text-[11px] text-monday-subtext font-medium">
                    {colLetters(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableDraft.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td className="w-10 h-8 px-0 bg-monday-hover/40 border border-monday-border text-[11px] text-monday-subtext text-center font-medium">
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => {
                    const isFocused = focusedCell?.r === rIdx && focusedCell?.c === cIdx;
                    return (
                      <td key={cIdx} className="border border-monday-border p-0">
                        <input
                          value={getCellDisplayValue(tableDraft, rIdx, cIdx, isFocused, focusedCell)}
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
                          readOnly={!isFocused}
                          className={`w-full min-w-[110px] h-8 px-2 text-[12px] font-averta text-monday-text outline-none focus:ring-1 focus:ring-inset focus:ring-monday-blue focus:border-monday-blue bg-white ${!isFocused ? 'cursor-cell' : ''}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-monday-subtext">Haz clic en una celda para editar. Fórmulas: =A1+B1, =A1*B2, =SUM(A1:A5). Usa + Fila / + Columna para ampliar.</p>
      </div>
    </div>
  );
}

export const DocsPage: React.FC<Props> = ({ workspaceId, boards, initialCreateFromBoard, onConsumeInitialCreateFromBoard, onAddTaskList, onAddCalculatorWidget }) => {
  const { currentUser } = useUser();
  const currentUserId = currentUser?.id ?? null;
  const isAdmin = !!(currentUser && String(currentUser.role || '').toUpperCase() === 'ADMIN');

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
  const [textDraft, setTextDraft] = useState(() => getInitialHtml(parsed.text ?? ''));
  const [tableDraft, setTableDraft] = useState<string[][]>(parsed.table ?? [['']]);
  const [headerImageUrlDraft, setHeaderImageUrlDraft] = useState<string | null>(
    (parsed.headerImageUrl as string | null) ?? null
  );
  const [pdfFormDraft, setPdfFormDraft] = useState<Record<string, unknown>>({});
  const [templateConfigByType, setTemplateConfigByType] = useState<Record<string, TemplateConfigState>>({});
  const [savingTemplateConfig, setSavingTemplateConfig] = useState(false);
  const [viewMode, setViewMode] = useState<'docs' | 'overview'>('overview');
  const [deleteConfirm, setDeleteConfirm] = useState<{ docId: string } | null>(null);

  // Grupos personalizados por usuario/workspace (API doc-groups, mismo patrón que panel-notes)
  const [customGroups, setCustomGroups] = useState<DocCustomGroup[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // docId -> customGroupId
  const [subgroupsByType, setSubgroupsByType] = useState<Record<string, DocCustomGroup[]>>({}); // type -> [{ id, name }]
  const [subgroupAssignments, setSubgroupAssignments] = useState<Record<string, string>>({}); // docId -> subgroupId
  const [docGroupsLoading, setDocGroupsLoading] = useState(false);
  const [collapsedDocGroups, setCollapsedDocGroups] = useState<Set<string>>(new Set());

  const toggleDocGroupCollapse = (key: string) => {
    setCollapsedDocGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!workspaceId || !currentUserId) {
      setCustomGroups([]);
      setAssignments({});
      setSubgroupsByType({});
      setSubgroupAssignments({});
      return;
    }
    let cancelled = false;
    setDocGroupsLoading(true);
    const url = `http://localhost:3001/api/workspaces/${workspaceId}/doc-groups?userId=${encodeURIComponent(currentUserId)}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : { groups: [], assignments: {}, subgroupsByType: {}, subgroupAssignments: {} }))
      .then((data: {
        groups?: DocCustomGroup[];
        assignments?: Record<string, string>;
        subgroupsByType?: Record<string, DocCustomGroup[]>;
        subgroupAssignments?: Record<string, string>;
      }) => {
        if (!cancelled) {
          setCustomGroups(Array.isArray(data.groups) ? data.groups : []);
          setAssignments(data.assignments && typeof data.assignments === 'object' ? data.assignments : {});
          setSubgroupsByType(data.subgroupsByType && typeof data.subgroupsByType === 'object' ? data.subgroupsByType : {});
          setSubgroupAssignments(data.subgroupAssignments && typeof data.subgroupAssignments === 'object' ? data.subgroupAssignments : {});
        }
      })
      .catch(() => { if (!cancelled) { setCustomGroups([]); setAssignments({}); setSubgroupsByType({}); setSubgroupAssignments({}); } })
      .finally(() => { if (!cancelled) setDocGroupsLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, currentUserId]);

  const saveDocGroupsToApi = useCallback(
    (
      groups: DocCustomGroup[],
      assign: Record<string, string>,
      subgroups?: Record<string, DocCustomGroup[]>,
      subgroupAssign?: Record<string, string>,
    ) => {
      if (!workspaceId || !currentUserId) return;
      const payload: Record<string, unknown> = {
        userId: currentUserId,
        groups,
        assignments: assign,
      };
      if (subgroups !== undefined) payload.subgroupsByType = subgroups;
      if (subgroupAssign !== undefined) payload.subgroupAssignments = subgroupAssign;
      fetch(`http://localhost:3001/api/workspaces/${workspaceId}/doc-groups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [workspaceId, currentUserId],
  );

  const addCustomGroup = () => {
    const name = window.prompt('Nombre del grupo');
    const trimmed = name?.trim();
    if (!trimmed) return;
    const next = [...customGroups, { id: crypto.randomUUID(), name: trimmed }];
    setCustomGroups(next);
    saveDocGroupsToApi(next, assignments, subgroupsByType, subgroupAssignments);
  };

  const renameCustomGroup = (groupId: string, newName: string) => {
    const next = customGroups.map((g) => (g.id === groupId ? { ...g, name: newName } : g));
    setCustomGroups(next);
    saveDocGroupsToApi(next, assignments, subgroupsByType, subgroupAssignments);
  };

  const removeCustomGroup = (groupId: string) => {
    const nextGroups = customGroups.filter((g) => g.id !== groupId);
    const nextAssign = { ...assignments };
    Object.keys(nextAssign).forEach((docId) => {
      if (nextAssign[docId] === groupId) delete nextAssign[docId];
    });
    setCustomGroups(nextGroups);
    setAssignments(nextAssign);
    saveDocGroupsToApi(nextGroups, nextAssign, subgroupsByType, subgroupAssignments);
  };

  const assignDocToCustomGroup = (docId: string, groupId: string | null) => {
    const next = groupId ? { ...assignments, [docId]: groupId } : { ...assignments };
    if (!groupId && next[docId]) delete next[docId];
    setAssignments(next);
    saveDocGroupsToApi(customGroups, next, subgroupsByType, subgroupAssignments);
  };

  const addSubgroup = (docType: string) => {
    const name = window.prompt('Nombre del subgrupo');
    const trimmed = name?.trim();
    if (!trimmed) return;
    const list = subgroupsByType[docType] ?? [];
    const nextList = [...list, { id: crypto.randomUUID(), name: trimmed }];
    const next = { ...subgroupsByType, [docType]: nextList };
    setSubgroupsByType(next);
    saveDocGroupsToApi(customGroups, assignments, next, subgroupAssignments);
  };

  const renameSubgroup = (docType: string, subgroupId: string, newName: string) => {
    const list = subgroupsByType[docType] ?? [];
    const nextList = list.map((s) => (s.id === subgroupId ? { ...s, name: newName } : s));
    const next = { ...subgroupsByType, [docType]: nextList };
    setSubgroupsByType(next);
    saveDocGroupsToApi(customGroups, assignments, next, subgroupAssignments);
  };

  const removeSubgroup = (docType: string, subgroupId: string) => {
    const list = (subgroupsByType[docType] ?? []).filter((s) => s.id !== subgroupId);
    const next = { ...subgroupsByType, [docType]: list.length ? list : undefined };
    if (!next[docType]) delete next[docType];
    setSubgroupsByType(next);
    const nextAssign = { ...subgroupAssignments };
    Object.keys(nextAssign).forEach((docId) => {
      if (nextAssign[docId] === subgroupId) delete nextAssign[docId];
    });
    setSubgroupAssignments(nextAssign);
    saveDocGroupsToApi(customGroups, assignments, next, nextAssign);
  };

  const assignDocToSubgroup = (docId: string, subgroupId: string | null) => {
    const next = subgroupId ? { ...subgroupAssignments, [docId]: subgroupId } : { ...subgroupAssignments };
    if (!subgroupId && next[docId]) delete next[docId];
    setSubgroupAssignments(next);
    saveDocGroupsToApi(customGroups, assignments, subgroupsByType, next);
  };

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
          setSelectedId(prev => (prev && data.some((d: Doc) => d.id === prev) ? prev : null));
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

  // Toda la lógica de tareas (panel-notes) se ha movido a App.tsx para mostrarlas en el sidebar global.

  useEffect(() => {
    setTextDraft(getInitialHtml(parsed.text ?? ''));
    setTableDraft(parsed.table ?? [['']]);
    setHeaderImageUrlDraft((parsed.headerImageUrl as string | null) ?? null);
    if (selectedDoc && isPdfDocType(selectedDoc.type as DocType)) {
      const initial = getInitialContentForType(selectedDoc.type as DocType);
      setPdfFormDraft({ ...initial, ...(parsed as Record<string, unknown>) });
    }
  }, [parsed, selectedId, selectedDoc?.type]);

  const pdfDocType = selectedDoc && isPdfDocType(selectedDoc.type as DocType) ? (selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo') : null;
  useEffect(() => {
    if (!pdfDocType) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/templates/${pdfDocType}/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { fieldPositions?: Record<string, { x: number; y: number }>; fontColor?: string; fontFamily?: string } | null) => {
        if (cancelled || !data) return;
        setTemplateConfigByType((prev) => ({
          ...prev,
          [pdfDocType]: {
            fieldPositions: data.fieldPositions ?? {},
            fontColor: data.fontColor ?? '#000000',
            fontFamily: data.fontFamily ?? 'Helvetica',
            fontSize: data.fontSize ?? 11,
            fontBold: data.fontBold ?? false,
            fontItalic: data.fontItalic ?? false,
            customBoxes: Array.isArray(data.customBoxes) ? data.customBoxes : [],
          },
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pdfDocType]);

  async function handleCreate(type: DocType) {
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
      const created = data as Doc;
      setDocs(prev => [created, ...prev]);
      setSelectedId(created.id);
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
  }

  // Si se dispara desde una columna de Docs/Facturación, crear y abrir el doc correspondiente
  useEffect(() => {
    if (!workspaceId || !initialCreateFromBoard) return;
    const { type } = initialCreateFromBoard;
    setViewMode('docs');
    handleCreate(type).finally(() => {
      onConsumeInitialCreateFromBoard?.();
    });
  }, [workspaceId, initialCreateFromBoard]);

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
          : { text: textDraft, headerImageUrl: headerImageUrlDraft };
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
      if (isAdmin && selectedDoc && isPdfDocType(selectedDoc.type as DocType)) {
        const docType = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
        const config = templateConfigByType[docType];
        const fieldPositions = config?.fieldPositions ?? {};
        const hasStoredPositions = config && Object.keys(fieldPositions).length > 0;
        const toSave = {
          userId: currentUser.id,
          username: currentUser.username,
          fieldPositions: hasStoredPositions ? fieldPositions : ((pdfFormDraft.fieldPositions as Record<string, { x: number; y: number }>) ?? {}),
          fontColor: config?.fontColor ?? '#000000',
          fontFamily: config?.fontFamily ?? 'Helvetica',
          fontSize: config?.fontSize ?? 11,
          fontBold: config?.fontBold ?? false,
          fontItalic: config?.fontItalic ?? false,
          customBoxes: config?.customBoxes ?? [],
        };
        await fetch(`${API_BASE}/api/templates/${docType}/config?userId=${encodeURIComponent(currentUser.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': currentUser.id,
            'X-User-Username': currentUser.username ?? '',
          },
          body: JSON.stringify(toSave),
        });
      }
    } catch (e) {
      console.error('Error saving doc', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el documento.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplateConfig = async () => {
    if (!currentUser || !isAdmin || !pdfDocType) return;
    const config = templateConfigByType[pdfDocType];
    if (!config) return;
    setSavingTemplateConfig(true);
    setError(null);
    try {
      const toSave = {
        userId: currentUser.id,
        username: currentUser.username,
        fieldPositions: config.fieldPositions ?? {},
        fontColor: config.fontColor ?? '#000000',
        fontFamily: config.fontFamily ?? 'Helvetica',
        fontSize: config.fontSize ?? 11,
        fontBold: config.fontBold ?? false,
        fontItalic: config.fontItalic ?? false,
        customBoxes: config.customBoxes ?? [],
      };
      const res = await fetch(`${API_BASE}/api/templates/${pdfDocType}/config?userId=${encodeURIComponent(currentUser.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
          'X-User-Username': currentUser.username ?? '',
        },
        body: JSON.stringify(toSave),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === 'string' ? data.error : 'Error al guardar configuración');
      }
    } catch (e) {
      console.error('Error saving template config', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar la configuración de la plantilla.');
    } finally {
      setSavingTemplateConfig(false);
    }
  };

  const canSaveTemplateConfig = isAdmin && !!pdfDocType && !!templateConfigByType[pdfDocType];

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const handleDownloadPdf = async () => {
    if (!selectedDoc || !isPdfDocType(selectedDoc.type as DocType)) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      const docType = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
      const config = templateConfigByType[docType];
      const contentToSend = config
        ? { ...pdfFormDraft, fieldPositions: config.fieldPositions }
        : pdfFormDraft;
      const res = await fetch(`${API_BASE}/api/templates/${docType}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentToSend }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al generar PDF');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${docType}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('PDF download error', e);
      setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF.');
    } finally {
      setDownloadingPdf(false);
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
              onClick={() => setViewMode('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors ${
                viewMode === 'overview' ? 'bg-monday-blue text-white' : 'text-monday-subtext hover:bg-monday-hover'
              }`}
            >
              <LayoutDashboard size={14} />
              Vista general
            </button>
            <button
              type="button"
              onClick={() => setViewMode('docs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors ${
                viewMode === 'docs' ? 'bg-monday-blue text-white' : 'text-monday-subtext hover:bg-monday-hover'
              }`}
            >
              <List size={14} />
              Documentos
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'overview' ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f2f5]">
          {/* Menús superiores */}
          <div className="p-6 pb-2">
            <div className="flex flex-wrap gap-4">
              {DOC_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!workspaceId}
                  onClick={() => handleCreate(opt.id)}
                  className="flex flex-col items-start justify-between w-64 p-4 rounded-2xl bg-white border border-gray-200 shadow-md hover:shadow-lg hover:border-monday-blue/50 transition-all text-left disabled:opacity-60"
                >
                  <div className="flex items-center gap-3 mb-2">
                    {opt.id === 'sheet' ? (
                      <Table2 size={26} className="text-monday-blue shrink-0" />
                    ) : isPdfDocType(opt.id) ? (
                      <FileCheck size={26} className="text-monday-blue shrink-0" />
                    ) : (
                      <FileText size={26} className="text-monday-blue shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-monday-text text-[14px] truncate">
                        {opt.title}
                      </p>
                      <p className="text-[11px] text-monday-subtext">{opt.label}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-monday-blue font-medium">
                    Crear {opt.label.toLowerCase()}
                  </span>
                </button>
              ))}
              {onAddTaskList && (
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      disabled={!workspaceId}
                      className="flex flex-col items-start justify-between w-64 p-4 rounded-2xl bg-[#5034ff] text-white border border-[#5034ff] shadow-md hover:shadow-lg hover:border-white/70 transition-all text-left disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                          <Calculator size={22} className="text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14px] truncate">
                            Añadir widget
                          </p>
                          <p className="text-[11px] text-white/90">
                            Crea elementos extra como tareas o utilidades.
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium flex items-center gap-1">
                        <Plus size={12} />
                        Nuevo widget
                      </span>
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-50 p-2 rounded-xl shadow-lg border border-monday-border bg-white w-56"
                      sideOffset={6}
                    >
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[13px] text-monday-text"
                          onClick={onAddTaskList}
                        >
                          <CheckSquare size={16} className="text-monday-blue" />
                          <span>Añadir tareas</span>
                        </button>
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[13px] text-monday-text"
                          onClick={onAddCalculatorWidget}
                          disabled={!onAddCalculatorWidget}
                        >
                          <span className="w-4 h-4 rounded bg-monday-blue text-white flex items-center justify-center text-[11px]">≡</span>
                          <span>Calculadora</span>
                        </button>
                      </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
            </div>
          </div>

          {/* Editor debajo de los menús */}
          <div className="flex-1 flex overflow-hidden px-6 pb-6">
            <section className="flex-1 flex flex-col bg-monday-bg/40 rounded-2xl border border-monday-border">
              {error && (
                <div className="px-4 py-2 bg-red-50 text-red-700 text-[13px] border-b border-red-200 rounded-t-2xl">
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
                    Usa los menús superiores para crear un documento o abre uno desde la pestaña Documentos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-5 py-3 border-b border-monday-border bg-monday-hover/30 rounded-t-2xl">
                    <div className="flex flex-col">
                      <h2 className="text-[16px] font-semibold text-monday-text truncate">
                        {selectedDoc.title}
                      </h2>
                    </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday border border-monday-border text-[12px] text-monday-subtext hover:bg-monday-hover"
                    >
                      <X size={12} />
                      <span>Cerrar</span>
                    </button>
                      {isPdfDocType(selectedDoc.type as DocType) && (
                        <button
                          type="button"
                          onClick={handleDownloadPdf}
                          disabled={downloadingPdf}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover disabled:opacity-60"
                        >
                          <Download size={14} />
                          {downloadingPdf ? 'Descargando…' : 'Descargar PDF'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
                      >
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  {isPdfDocType(selectedDoc.type as DocType) ? (
                    <div className="flex-1 overflow-auto custom-scrollbar p-2">
                      <PdfTemplateEditor
                        docType={selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'}
                        value={pdfFormDraft}
                        onChange={setPdfFormDraft}
                        docId={selectedDoc.id}
                        templateConfig={pdfDocType ? templateConfigByType[pdfDocType] : null}
                        isAdmin={isAdmin}
                        onTemplateConfigChange={
                          pdfDocType
                            ? (config) => setTemplateConfigByType((prev) => ({ ...prev, [pdfDocType]: { ...(prev[pdfDocType] || {}), ...config } }))
                            : undefined
                        }
                        onSaveTemplateConfig={canSaveTemplateConfig ? handleSaveTemplateConfig : undefined}
                        savingTemplateConfig={savingTemplateConfig}
                      />
                    </div>
                  ) : selectedDoc.type === 'sheet' ? (
                    <ExcelLikeSheet
                      tableDraft={tableDraft}
                      setTableDraft={setTableDraft}
                      ensureTableSize={ensureTableSize}
                    />
                  ) : (
                    <WordLikeEditor
                      key={selectedId ?? 'new'}
                      textDraft={textDraft}
                      setTextDraft={setTextDraft}
                      headerImageUrl={headerImageUrlDraft}
                      setHeaderImageUrl={setHeaderImageUrlDraft}
                    />
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      ) : (
      <div className="flex-1 flex overflow-hidden bg-[#f0f2f5]">
        {/* Tabla agrupada tipo ventana principal (grupos con color, cabeceras, tabla) */}
        <div className="flex-1 overflow-auto custom-scrollbar px-6 py-5 min-w-0">
          {!workspaceId && (
            <div className="p-4 text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg max-w-md">
              Selecciona un workspace en la barra lateral para ver y crear documentos.
            </div>
          )}
          {workspaceId && loading && (
            <div className="p-4 text-[13px] text-monday-subtext">Cargando documentos…</div>
          )}
          {workspaceId && !loading && (
            <>
              {DOC_TYPE_OPTIONS.map((opt) => {
                const groupDocs = docs.filter((d) => d.type === opt.id);
                const typeGroupTitle = opt.id === 'text' ? 'Documentos de texto' : opt.id === 'sheet' ? 'Hojas' : getDocTypeLabel(opt.id as DocType);
                const groupKey = `type:${opt.id}`;
                const typeSubgroups = subgroupsByType[opt.id] ?? [];
                return (
                  <DocGroupSection
                    key={groupKey}
                    id={groupKey}
                    title={typeGroupTitle}
                    color={DOC_TYPE_GROUP_COLORS[opt.id] ?? GROUP_PALETTE[0]}
                    collapsed={collapsedDocGroups.has(groupKey)}
                    onToggleCollapse={() => toggleDocGroupCollapse(groupKey)}
                    docs={groupDocs}
                    selectedId={selectedId}
                    onSelectDoc={setSelectedId}
                    onDeleteDoc={(id) => handleDeleteClick(id)}
                    customGroups={customGroups}
                    assignments={assignments}
                    onAssign={assignDocToCustomGroup}
                    getDocTypeLabel={getDocTypeLabel}
                    isPdfDocType={isPdfDocType}
                    docType={opt.id}
                    subgroups={typeSubgroups}
                    subgroupAssignments={subgroupAssignments}
                    onAddSubgroup={addSubgroup}
                    onRenameSubgroup={renameSubgroup}
                    onRemoveSubgroup={removeSubgroup}
                    onAssignSubgroup={assignDocToSubgroup}
                  />
                );
              })}
              {customGroups.map((grp) => {
                const groupDocs = docs.filter((d) => assignments[d.id] === grp.id);
                const groupKey = `custom:${grp.id}`;
                const color = GROUP_PALETTE[customGroups.indexOf(grp) % GROUP_PALETTE.length];
                return (
                  <DocGroupSection
                    key={groupKey}
                    id={groupKey}
                    title={grp.name}
                    color={color}
                    collapsed={collapsedDocGroups.has(groupKey)}
                    onToggleCollapse={() => toggleDocGroupCollapse(groupKey)}
                    onRemove={() => removeCustomGroup(grp.id)}
                    docs={groupDocs}
                    selectedId={selectedId}
                    onSelectDoc={setSelectedId}
                    onDeleteDoc={(id) => handleDeleteClick(id)}
                    customGroups={customGroups}
                    assignments={assignments}
                    onAssign={assignDocToCustomGroup}
                    getDocTypeLabel={getDocTypeLabel}
                    isPdfDocType={isPdfDocType}
                  />
                );
              })}
              <button
                type="button"
                onClick={addCustomGroup}
                className="flex items-center gap-2 px-4 py-2 rounded-monday border border-dashed border-monday-border hover:border-monday-blue text-[13px] text-monday-subtext hover:text-monday-blue mt-2 transition-colors"
              >
                <Plus size={16} className="text-monday-subtext" />
                Agregar grupo nuevo
              </button>
            </>
          )}
        </div>

        {/* Panel derecho: editor */}
        <section className="flex-1 flex flex-col min-w-0 max-w-[60%] border-l border-monday-border bg-white">
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
                Haz clic en una fila de la tabla para abrir el documento o crea uno desde la vista general.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-monday-border bg-monday-hover/30">
                <div className="flex flex-col">
                  <h2 className="text-[16px] font-semibold text-monday-text truncate">
                    {selectedDoc.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday border border-monday-border text-[12px] text-monday-subtext hover:bg-monday-hover"
                  >
                    <X size={12} />
                    <span>Cerrar</span>
                  </button>
                  {isPdfDocType(selectedDoc.type as DocType) && (
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover disabled:opacity-60"
                    >
                      <Download size={14} />
                      {downloadingPdf ? 'Descargando…' : 'Descargar PDF'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>

              {isPdfDocType(selectedDoc.type as DocType) ? (
                <div className="flex-1 overflow-auto custom-scrollbar p-2 bg-monday-bg/40">
                  <PdfTemplateEditor
                    docType={selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'}
                    value={pdfFormDraft}
                    onChange={setPdfFormDraft}
                    docId={selectedDoc.id}
                    templateConfig={pdfDocType ? templateConfigByType[pdfDocType] : null}
                    isAdmin={isAdmin}
                    onTemplateConfigChange={
                      pdfDocType
                        ? (config) => setTemplateConfigByType((prev) => ({ ...prev, [pdfDocType]: { ...(prev[pdfDocType] || {}), ...config } }))
                        : undefined
                    }
                    onSaveTemplateConfig={canSaveTemplateConfig ? handleSaveTemplateConfig : undefined}
                    savingTemplateConfig={savingTemplateConfig}
                  />
                </div>
              ) : selectedDoc.type === 'sheet' ? (
                <ExcelLikeSheet
                  tableDraft={tableDraft}
                  setTableDraft={setTableDraft}
                  ensureTableSize={ensureTableSize}
                />
              ) : (
                <WordLikeEditor
                  key={selectedId ?? 'new'}
                  textDraft={textDraft}
                  setTextDraft={setTextDraft}
                  headerImageUrl={headerImageUrlDraft}
                  setHeaderImageUrl={setHeaderImageUrlDraft}
                />
              )}
            </>
          )}
        </section>
      </div>
      )}
    </div>
  );
};
