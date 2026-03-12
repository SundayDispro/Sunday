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
  CheckSquare,
  Circle,
  CheckCircle,
  Star,
  StarOff,
  ChevronDown,
} from 'lucide-react';
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

// Tableros personales de documentos (sólo para Docs, por usuario/workspace)
type DocBoard = { id: string; name: string };

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

// Editor WYSIWYG: contentEditable + barra de formato (negrita, cursiva, tamaño, etc.) con la fuente del proyecto
const FONT_SIZES = [
  { label: '10pt', value: '10pt' },
  { label: '11pt', value: '11pt' },
  { label: '12pt', value: '12pt' },
  { label: '14pt', value: '14pt' },
  { label: '18pt', value: '18pt' },
  { label: '24pt', value: '24pt' },
];

function WordLikeEditor({ textDraft, setTextDraft }: { textDraft: string; setTextDraft: (v: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSyncedRef = useRef<string>(textDraft);
  const savedRangeRef = useRef<Range | null>(null);

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

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const el = editorRef.current;
    if (!el || !el.contains(sel.anchorNode)) return;
    savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el || !savedRangeRef.current) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  }, []);

  const keepFocus = useCallback((fn: () => void) => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      fn();
      reportContent();
    };
  }, [reportContent]);

  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value ?? '');
  }, []);

  const applyFontSize = useCallback((size: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      document.execCommand('insertHTML', false, `<span style="font-size: ${size}">&#8203;</span>`);
      return;
    }
    const span = document.createElement('span');
    span.style.fontSize = size;
    try {
      range.surroundContents(span);
    } catch {
      document.execCommand('insertHTML', false, `<span style="font-size: ${size}">${range.toString()}</span>`);
    }
  }, [restoreSelection]);

  const insertList = useCallback((tag: 'ul' | 'ol') => () => {
    const cmd = tag === 'ul' ? 'insertUnorderedList' : 'insertOrderedList';
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      document.execCommand(cmd, false);
      return;
    }
    const range = sel.getRangeAt(0);
    const el = editorRef.current;
    if (!el) {
      document.execCommand(cmd, false);
      return;
    }
    let block: HTMLElement | null = range.startContainer.nodeType === Node.TEXT_NODE
      ? (range.startContainer.parentElement as HTMLElement)
      : (range.startContainer as HTMLElement);
    while (block && block !== el && !/^(P|DIV|LI|H[1-6])$/i.test(block.nodeName)) {
      block = block.parentElement;
    }
    const isEmpty = block && el.contains(block) && (!block.textContent || block.textContent.trim() === '');
    if (isEmpty && block) {
      const list = document.createElement(tag);
      list.className = tag === 'ul' ? 'list-disc ml-4 my-1' : 'list-decimal ml-4 my-1';
      const li = document.createElement('li');
      li.appendChild(document.createElement('br'));
      list.appendChild(li);
      block.parentNode?.replaceChild(list, block);
      const r = document.createRange();
      r.setStart(li, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    document.execCommand(cmd, false);
  }, []);

  const formatBarBtn = 'p-2 rounded-monday border-0 text-monday-text hover:bg-monday-hover active:bg-monday-border transition-colors min-w-[32px]';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-monday-bg/50">
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
        <button type="button" onMouseDown={keepFocus(() => exec('bold'))} className={formatBarBtn} title="Negrita">
          <span className="text-[13px] font-bold">B</span>
        </button>
        <button type="button" onMouseDown={keepFocus(() => exec('italic'))} className={formatBarBtn} title="Cursiva">
          <span className="text-[13px] italic font-serif">I</span>
        </button>
        <button type="button" onMouseDown={keepFocus(() => exec('strikeThrough'))} className={formatBarBtn} title="Tachado">
          <span className="text-[13px] line-through">S</span>
        </button>
        <button type="button" onMouseDown={keepFocus(() => exec('underline'))} className={formatBarBtn} title="Subrayado">
          <span className="text-[13px] underline">U</span>
        </button>
        <div className="w-px h-5 bg-monday-border mx-1" />
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              className="px-2 py-1.5 text-[11px] border border-monday-border rounded-monday bg-white text-monday-text hover:bg-monday-hover min-w-[4rem] text-left"
              title="Tamaño de texto"
            >
              Tamaño
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="z-50 p-1.5 rounded-lg shadow-lg border border-monday-border bg-white" sideOffset={4} onOpenAutoFocus={(e) => e.preventDefault()}>
              {FONT_SIZES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded"
                  onClick={() => { applyFontSize(value); reportContent(); }}
                >
                  {label}
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <div className="w-px h-5 bg-monday-border mx-1" />
        <button type="button" onMouseDown={keepFocus(insertList('ul'))} className={formatBarBtn} title="Lista con viñetas">
          <span className="text-[14px]">•</span>
        </button>
        <button type="button" onMouseDown={keepFocus(insertList('ol'))} className={formatBarBtn} title="Lista numerada">
          <span className="text-[13px] font-medium">1.</span>
        </button>
        <div className="w-px h-5 bg-monday-border mx-1" />
        <span className="text-[11px] text-monday-subtext px-2">Documento</span>
      </div>
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-[21cm] min-h-[29.7cm] bg-white rounded-lg border border-monday-border shadow-monday-lg px-12 py-14 font-averta">
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

      <p className="text-[12px] text-monday-subtext mb-3">Documentos del workspace</p>
      <div className="bg-white rounded-2xl border border-monday-border shadow-sm overflow-hidden">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-monday-hover/60">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-monday-subtext">Nombre</th>
              <th className="text-left px-3 py-2 font-semibold text-monday-subtext">Tipo</th>
              <th className="text-left px-3 py-2 font-semibold text-monday-subtext">Última modificación</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr
                key={doc.id}
                className="border-t border-monday-border/60 hover:bg-monday-hover cursor-pointer"
                onClick={() => onOpenDoc(doc.id)}
              >
                <td className="px-3 py-1.5 flex items-center gap-2">
                  {doc.type === 'sheet' ? (
                    <Table2 size={16} className="text-monday-blue shrink-0" />
                  ) : isPdfDocType(doc.type as DocType) ? (
                    <FileCheck size={16} className="text-monday-blue shrink-0" />
                  ) : (
                    <FileText size={16} className="text-monday-blue shrink-0" />
                  )}
                  <span className="truncate text-monday-text">{doc.title}</span>
                </td>
                <td className="px-3 py-1.5 text-monday-subtext">
                  {getDocTypeLabel(doc.type as DocType)}
                </td>
                <td className="px-3 py-1.5 text-monday-subtext">
                  {new Date(doc.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-[13px] text-monday-subtext" colSpan={3}>
                  No hay documentos todavía. Crea uno arriba para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

export const DocsPage: React.FC<Props> = ({ workspaceId, boards, initialCreateFromBoard, onConsumeInitialCreateFromBoard, onAddTaskList }) => {
  const { currentUser } = useUser();
  const currentUserId = currentUser?.id ?? null;

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
  const [pdfFormDraft, setPdfFormDraft] = useState<Record<string, unknown>>({});
  const [viewMode, setViewMode] = useState<'docs' | 'overview'>('overview');
  const [deleteConfirm, setDeleteConfirm] = useState<{ docId: string } | null>(null);

  // Tableros personales sólo para Docs (por usuario y workspace), almacenados en localStorage
  type DocBoard = { id: string; name: string };
  const [docBoards, setDocBoards] = useState<DocBoard[]>([]);
  const [docBoardByDocId, setDocBoardByDocId] = useState<Record<string, string | null>>({});
  const [activeDocBoardId, setActiveDocBoardId] = useState<string | 'sin-tablero'>('sin-tablero');

  useEffect(() => {
    if (!workspaceId || !currentUserId) {
      setDocBoards([]);
      setDocBoardByDocId({});
      return;
    }
    try {
      const key = `sunday-doc-boards-${workspaceId}-${currentUserId}`;
      const mapKey = `sunday-doc-board-map-${workspaceId}-${currentUserId}`;
      const storedBoards = localStorage.getItem(key);
      const storedMap = localStorage.getItem(mapKey);
      setDocBoards(storedBoards ? JSON.parse(storedBoards) as DocBoard[] : []);
      setDocBoardByDocId(storedMap ? JSON.parse(storedMap) as Record<string, string | null> : {});
      setActiveDocBoardId('sin-tablero');
    } catch {
      setDocBoards([]);
      setDocBoardByDocId({});
      setActiveDocBoardId('sin-tablero');
    }
  }, [workspaceId, currentUserId]);

  const persistDocBoards = (boardsToSave: DocBoard[], mapToSave: Record<string, string | null>) => {
    if (!workspaceId || !currentUserId) return;
    try {
      const key = `sunday-doc-boards-${workspaceId}-${currentUserId}`;
      const mapKey = `sunday-doc-board-map-${workspaceId}-${currentUserId}`;
      localStorage.setItem(key, JSON.stringify(boardsToSave));
      localStorage.setItem(mapKey, JSON.stringify(mapToSave));
    } catch {
      // ignorar errores de almacenamiento
    }
  };

  const handleCreateDocBoard = () => {
    const raw = window.prompt('Nombre del tablero de documentos');
    const name = raw?.trim();
    if (!name) return;
    setDocBoards(prev => {
      const next = [...prev, { id: crypto.randomUUID(), name }];
      persistDocBoards(next, docBoardByDocId);
      return next;
    });
  };

  const assignDocToBoard = (docId: string, boardId: string | null) => {
    setDocBoardByDocId(prev => {
      const next = { ...prev, [docId]: boardId };
      persistDocBoards(docBoards, next);
      return next;
    });
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
    if (selectedDoc && isPdfDocType(selectedDoc.type as DocType)) {
      const initial = getInitialContentForType(selectedDoc.type as DocType);
      setPdfFormDraft({ ...initial, ...(parsed as Record<string, unknown>) });
    }
  }, [parsed, selectedId, selectedDoc?.type]);

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
      // Asignar al tablero activo (o Sin tablero) para organización en ambas pestañas
      assignDocToBoard(created.id, activeDocBoardId === 'sin-tablero' ? null : activeDocBoardId);
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

  // Si se dispara desde una columna de Docs/Facturación, crear/abrir automáticamente el doc correspondiente
  useEffect(() => {
    if (!workspaceId || !initialCreateFromBoard) return;
    const { type, boardId } = initialCreateFromBoard;
    // Si ya hay un documento de ese tipo vinculado al mismo tablero, reusar
    const existing = docs.find(d => d.type === type && d.boardId === boardId);
    if (existing) {
      setViewMode('docs');
      setSelectedId(existing.id);
      onConsumeInitialCreateFromBoard?.();
      return;
    }
    setViewMode('docs');
    handleCreate(type).finally(() => {
      onConsumeInitialCreateFromBoard?.();
    });
  }, [workspaceId, initialCreateFromBoard, docs]);

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
                <button
                  type="button"
                  disabled={!workspaceId}
                  onClick={onAddTaskList}
                  className="flex flex-col items-start justify-between w-64 p-4 rounded-2xl bg-[#5034ff] text-white border border-[#5034ff] shadow-md hover:shadow-lg hover:border-white/70 transition-all text-left disabled:opacity-60"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                      <CheckSquare size={22} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14px] truncate">
                        Añadir tarea
                      </p>
                      <p className="text-[11px] text-white/90">
                        Crea una lista de tareas personales.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium flex items-center gap-1">
                    <Plus size={12} />
                    Nueva lista de tareas
                  </span>
                </button>
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
                    <div className="flex-1 overflow-auto custom-scrollbar p-4">
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
                    <WordLikeEditor key={selectedId ?? 'new'} textDraft={textDraft} setTextDraft={setTextDraft} />
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      ) : (
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r border-monday-border flex flex-col">
          <div className="px-3 py-2 border-b border-monday-border bg-monday-hover/40 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wide">
              Documentos
            </p>
            <button
              type="button"
              onClick={handleCreateDocBoard}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-monday-blue text-white text-[11px] hover:bg-monday-blue/90"
            >
              <Plus size={11} />
              <span>Añadir tablero</span>
            </button>
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
                No hay documentos aún.
              </div>
            )}
            {!loading &&
              (() => {
                // Agrupar documentos por tableros personales de docs
                const unassignedDocs = docs.filter(d => !docBoardByDocId[d.id]);
                const groups = docBoards.map(b => ({
                  key: b.id,
                  title: b.name,
                  docs: docs.filter(d => docBoardByDocId[d.id] === b.id),
                }));
                if (unassignedDocs.length > 0) {
                  groups.unshift({
                    key: 'sin-tablero',
                    title: 'Sin tablero',
                    docs: unassignedDocs,
                  });
                }
                if (groups.length === 0) {
                  return (
                    <div className="p-4 text-[13px] text-monday-subtext">
                      No hay documentos todavía.
                    </div>
                  );
                }
                return groups.map(group => (
                  <React.Fragment key={group.key}>
                    <div className="px-3 py-1 text-[11px] font-semibold text-monday-subtext uppercase tracking-wide bg-monday-hover/40 border-b border-monday-border/60">
                      {group.title}
                    </div>
                    {group.docs.map(doc => (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(doc.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(doc.id);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] border-b border-monday-border/60 hover:bg-monday-hover transition-colors cursor-pointer ${
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
                  <select
                    value={docBoardByDocId[doc.id] ?? ''}
                    onChange={e => assignDocToBoard(doc.id, e.target.value || null)}
                    className="ml-2 text-[11px] border border-monday-border rounded px-1 py-0.5 bg-white text-monday-subtext"
                    title="Mover a tablero de documentos"
                  >
                    <option value="">Sin tablero</option>
                    {docBoards.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                    ))}
                  </React.Fragment>
                ));
              })()}
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
                <WordLikeEditor key={selectedId ?? 'new'} textDraft={textDraft} setTextDraft={setTextDraft} />
              )}
            </>
          )}
        </section>
      </div>
      )}
    </div>
  );
};
