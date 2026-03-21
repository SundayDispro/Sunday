import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  MessageCircle,
  Mail,
  MoreVertical,
  Filter,
  BellRing,
  AlarmClock,
  Clock3,
} from 'lucide-react';
import { GROUP_PALETTE } from '../Board/GroupColorPicker';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { Board, Doc, DocType } from '../../types';
import { MobileDocsShell, type WordShellTab } from '../mobile/docs/MobileDocsShell';
import { DocsHomeFeed } from '../mobile/docs/DocsHomeFeed';
import { DocsCreateGallery } from '../mobile/docs/DocsCreateGallery';
import {
  getInitialContentForType,
  mergeInitialPdfContentWithMasterDefaults,
  getDocTypeTitle,
  getDocTypeLabel,
  DOC_TYPE_OPTIONS,
  isPdfDocType,
} from './docs/docTypes';
import { ExcelLikeSheet } from './docs/ExcelLikeSheet';
import type { CellStyleDef, CellStylesMap } from './docs/sheetCellTypes';
export type { CellStyleDef, CellStylesMap } from './docs/sheetCellTypes';
import { FONT_OPTIONS, FONT_SIZES } from '../docs/TextFormatBar';
import type { TemplateConfigState, CustomBoxDef } from './docs/pdfTemplateConfig';
import { PdfTemplateEditor, PAGE_ASPECT, PAGE_WIDTH_PX_96DPI, PAGE_HEIGHT_PX_96DPI } from './docs/PdfTemplateEditor';
import { buildPdfContent } from './docs/buildPdfContent';
import { TextFormatBarForEditor, TextFormatBarForTemplate } from '../docs/TextFormatBar';
import { useUser } from '../../store/UserContext';
import { useToast } from '../Toast';
import { socket } from '../../store/socket';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../api';
import { useViewport } from '../../hooks/useViewport';
import {
  readEmergencyDraftFromStorage,
  writeEmergencyDraftToStorage,
  clearEmergencyDraftFromStorage,
  EMERGENCY_PDF_DRAFT_TTL_MS,
  deepCloneJson,
} from '../../utils/emergencyPdfTemplateDraft';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface Props {
  workspaceId: string | null;
  boards: Board[];
  initialCreateFromBoard?: {
    type: DocType;
    boardId: string;
    itemId: string;
    columnId: string;
  } | null;
  onConsumeInitialCreateFromBoard?: () => void;
  initialOpenDocId?: string | null;
  onConsumeInitialOpenDocId?: () => void;
  initialCreateDocType?: DocType | null;
  onConsumeInitialCreateDocType?: () => void;
  onAddTaskList?: () => void;
  onAddCalculatorWidget?: () => void;
  onAddReminderWidget?: () => void;
  mobileLayout?: boolean;
  /** En móvil hub: el scroll lo hace el contenedor padre; la lista no debe tener overflow propio (arregla iOS Safari). */
  scrollListInParent?: boolean;
  /** Shell tipo Word iOS: Inicio / Crear / Explorar + barra inferior flotante (solo con mobileLayout + isMobile). */
  mobileWordShell?: boolean;
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
  cellStyles?: CellStylesMap;
  headerImageUrl?: string | null;
  [key: string]: unknown;
};

type WorkflowStatus = 'por_hacer' | 'en_progreso' | 'listo_pdf';
type SavedDocsFilterId = 'all' | 'pending' | 'pdf' | 'updated_7d' | 'mine';
type ReminderRepeat = 'none' | 'daily' | 'weekly';
type ReminderSound = 'none' | 'beep' | 'chime';
type DocReminder = {
  id: string;
  title: string;
  dueAt: string;
  docId: string | null;
  repeat?: ReminderRepeat;
  sound?: ReminderSound;
  done?: boolean;
  notifiedAt?: string | null;
  snoozedUntil?: string | null;
};

const WORKFLOW_STATUS_META: Record<WorkflowStatus, { label: string; badgeClass: string }> = {
  por_hacer: { label: 'Por hacer', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  en_progreso: { label: 'En progreso', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  listo_pdf: { label: 'Listo para PDF', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

const DOCS_FILTER_OPTIONS: Array<{ id: SavedDocsFilterId; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'pdf', label: 'Solo PDF' },
  { id: 'updated_7d', label: 'Actualizados 7d' },
  { id: 'mine', label: 'Creados por mí' },
];

const REMINDER_REPEAT_OPTIONS: Array<{ id: ReminderRepeat; label: string }> = [
  { id: 'none', label: 'Sin repetir' },
  { id: 'daily', label: 'Diario' },
  { id: 'weekly', label: 'Semanal' },
];

const REMINDER_SOUND_OPTIONS: Array<{ id: ReminderSound; label: string }> = [
  { id: 'none', label: 'Sin sonido' },
  { id: 'beep', label: 'Beep corto' },
  { id: 'chime', label: 'Chime suave' },
];

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
  documentTitle = 'Documento',
  enableMobileViewEditMode = false,
}: {
  textDraft: string;
  setTextDraft: (v: string) => void;
  headerImageUrl: string | null;
  setHeaderImageUrl: (v: string | null) => void;
  documentTitle?: string;
  /** Modo Word iOS: visor (solo lectura) / edición con Listo y doble toque. */
  enableMobileViewEditMode?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSyncedRef = useRef<string>(textDraft);
  const headerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<'view' | 'edit'>(() => (enableMobileViewEditMode ? 'view' : 'edit'));
  const lastTouchEndRef = useRef(0);

  useEffect(() => {
    if (!enableMobileViewEditMode) {
      setMobileMode('edit');
      return;
    }
    setMobileMode('view');
  }, [enableMobileViewEditMode]);

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
        const res = await apiFetch(`${API_BASE}/api/upload`, {
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

  const headerPopover = (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-monday border border-monday-border text-[11px] text-monday-subtext hover:bg-monday-hover sm:text-[11px]"
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
  );

  const finishMobileEdit = useCallback(() => {
    reportContent();
    setMobileMode('view');
    editorRef.current?.blur();
  }, [reportContent]);

  const onEditorTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enableMobileViewEditMode || mobileMode === 'edit') return;
      const now = Date.now();
      if (now - lastTouchEndRef.current < 300) {
        e.preventDefault();
        lastTouchEndRef.current = 0;
        setMobileMode('edit');
        requestAnimationFrame(() => {
          editorRef.current?.focus();
        });
      } else {
        lastTouchEndRef.current = now;
      }
    },
    [enableMobileViewEditMode, mobileMode],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg/50">
      {enableMobileViewEditMode ? (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-zinc-900 border-b border-zinc-800 pt-[env(safe-area-inset-top)]">
            {mobileMode === 'edit' ? (
              <button
                type="button"
                className="text-[17px] text-sky-400 font-normal min-w-[52px] text-left touch-manipulation py-1"
                onClick={finishMobileEdit}
              >
                Listo
              </button>
            ) : (
              <span className="w-[52px]" aria-hidden />
            )}
            <span className="flex-1 text-center text-[15px] font-semibold text-white truncate px-1">
              {documentTitle}
            </span>
            {mobileMode === 'view' ? (
              <button
                type="button"
                className="text-[17px] text-sky-400 font-normal min-w-[52px] text-right touch-manipulation py-1"
                onClick={() => {
                  setMobileMode('edit');
                  requestAnimationFrame(() => editorRef.current?.focus());
                }}
              >
                Editar
              </button>
            ) : (
              <div className="shrink-0 min-w-[52px] flex justify-end [&_button]:border-zinc-600 [&_button]:text-zinc-200 [&_span]:text-zinc-200">
                {headerPopover}
              </div>
            )}
          </div>
          {mobileMode === 'edit' && (
            <div className="border-b border-monday-border bg-[var(--monday-surface)] shrink-0 overflow-x-auto">
              <div className="flex items-center gap-2 px-1 py-1.5 min-w-min">
                <TextFormatBarForEditor editorRef={editorRef} reportContent={reportContent} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="border-b border-monday-border bg-[var(--monday-surface)]">
          <div className="flex items-stretch sm:items-center justify-between gap-2 px-1 sm:px-3 py-2 min-h-0">
            <div className="min-w-0 flex-1 overflow-hidden">
              <TextFormatBarForEditor editorRef={editorRef} reportContent={reportContent} />
            </div>
            <div className="shrink-0 flex items-center gap-2 pr-1 sm:pr-2 self-center">{headerPopover}</div>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto scroll-touch custom-scrollbar p-3 sm:p-6 flex justify-center">
        {/* Carta US 8.5×11 in; en móvil altura mínima acotada para no forzar scroll excesivo */}
        <div className="w-full max-w-[8.5in] min-h-[min(11in,82dvh)] sm:min-h-[11in] bg-white rounded-lg border border-monday-border shadow-monday-lg px-6 py-8 sm:px-12 sm:py-10 font-averta box-border">
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
            contentEditable={!enableMobileViewEditMode || mobileMode === 'edit'}
            suppressContentEditableWarning
            data-placeholder="Empieza a escribir..."
            onInput={reportContent}
            onBlur={reportContent}
            onDoubleClick={() => {
              if (enableMobileViewEditMode && mobileMode === 'view') {
                setMobileMode('edit');
                requestAnimationFrame(() => editorRef.current?.focus());
              }
            }}
            onTouchEnd={onEditorTouchEnd}
            className={[
              'w-full min-h-[180px] sm:min-h-[calc(11in-5.5rem)] outline-none text-[11pt] text-monday-text leading-relaxed font-averta [&:empty::before]:content-[attr(data-placeholder)] [&:empty::before]:text-monday-subtext [&_span]:font-averta [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1 [&_li]:pl-0.5 [&_img]:max-w-full [&_img]:h-auto',
              enableMobileViewEditMode && mobileMode === 'view' ? 'select-text cursor-default' : '',
            ].join(' ')}
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
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start gap-2 py-1 group overflow-hidden"
      >
        <motion.button
          type="button"
          onClick={() => toggleDone(task.id)}
          whileTap={{ scale: 0.9 }}
          className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-monday-blue bg-transparent hover:bg-monday-hover/60 border border-monday-border"
        >
          {isDone ? <CheckCircle size={14} /> : <Circle size={14} className="text-monday-subtext" />}
        </motion.button>
        <textarea
          value={task.text}
          onChange={handleTextChange(task.id)}
          rows={1}
          style={{ minHeight: '24px', overflow: 'hidden' }}
          className={`flex-1 resize-none border-0 bg-transparent text-[12px] outline-none px-1 py-0.5 rounded hover:bg-monday-hover/40 transition-opacity duration-200 ${
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
      </motion.div>
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
                className="z-[200] bg-white rounded-lg border border-monday-border shadow-lg p-2"
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
        <AnimatePresence initial={false}>
          {activeTasks.map((task) => renderTaskRow(task, false))}
        </AnimatePresence>
        {completedTasks.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowCompleted((s) => !s)}
              className="flex items-center gap-1 text-[11px] text-monday-subtext hover:text-monday-text"
            >
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${
                  showCompleted ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <span>
                Completadas ({completedTasks.length})
              </span>
            </button>
            {showCompleted && (
              <div className="mt-1 space-y-1">
                <AnimatePresence initial={false}>
                  {completedTasks.map((task) => renderTaskRow(task, true))}
                </AnimatePresence>
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
  onRequestRenameSubgroup,
  onRemoveSubgroup,
  onAssignSubgroup,
  showSubgroupUI = true,
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
  onRequestRenameSubgroup?: (docType: string, subgroupId: string, currentName: string) => void;
  onRemoveSubgroup?: (docType: string, subgroupId: string) => void;
  onAssignSubgroup?: (docId: string, subgroupId: string | null) => void;
  showSubgroupUI?: boolean;
}) {
  const showSubgroups = showSubgroupUI && !!docType && !!onAddSubgroup;
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Set<string>>(new Set());
  const toggleSubgroupCollapse = (subgroupId: string) => {
    setCollapsedSubgroups((prev) => {
      const next = new Set(prev);
      if (next.has(subgroupId)) next.delete(subgroupId);
      else next.add(subgroupId);
      return next;
    });
  };
  const hasSubgroupBlocks = showSubgroups && subgroups.length > 0;
  const docsWithSubgroup = (subgroupId: string | null) =>
    subgroupId === null
      ? docs.filter((d) => !subgroupAssignments[d.id] || !subgroups.some((s) => s.id === subgroupAssignments[d.id]))
      : docs.filter((d) => subgroupAssignments[d.id] === subgroupId);
  return (
    <section className="mb-6 rounded-lg border border-monday-border bg-white shadow-[0_2px_6px_0_rgba(0,0,0,0.08)] overflow-hidden min-h-0">
      {/* Cabecera tipo BoardGroup: chevron, color, nombre, contador y acciones */}
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
        <div className="min-w-0 flex-1 flex flex-col">
          <h3 className="text-[18px] sm:text-[26px] font-normal leading-tight font-averta truncate min-w-0" style={{ color }}>
            {title}
          </h3>
          <span className="text-[10px] sm:text-[14px] leading-none text-monday-subtext font-normal whitespace-nowrap mt-0.5">
            {docs.length} {docs.length === 1 ? 'elemento' : 'elementos'}
          </span>
        </div>
        {showSubgroups && docType && (
          <div className="flex items-center gap-1">
            {subgroups.length > 0 && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-monday border border-monday-border text-[11px] sm:text-[12px] text-monday-subtext hover:bg-monday-hover"
                  >
                    <span className="hidden sm:inline">Subgrupos ({subgroups.length})</span>
                    <span className="sm:hidden">Sub ({subgroups.length})</span>
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
                            onClick={() => onRequestRenameSubgroup?.(docType, s.id, s.name)}
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
        <>
          {hasSubgroupBlocks ? (
            /* Bloques por subgrupo (igual que tabla principal: cada subgrupo es una sección con su tabla) */
            <div className="relative z-0 w-full">
              {subgroups!.map((sub) => {
                const subDocs = docsWithSubgroup(sub.id);
                const isSubCollapsed = collapsedSubgroups.has(sub.id);
                return (
                  <div
                    key={sub.id}
                    className="ml-6 mt-2 pl-4 border-l-2 border-monday-border/60 bg-monday-hover/20 rounded-r-md py-1"
                    style={{ borderLeftColor: color }}
                  >
                    <div className="flex items-center gap-1.5 py-1.5 px-2 mb-1 rounded-md">
                      <button
                        type="button"
                        onClick={() => toggleSubgroupCollapse(sub.id)}
                        className="text-monday-subtext hover:text-monday-text transition-colors flex-shrink-0"
                        title={isSubCollapsed ? 'Expandir' : 'Colapsar'}
                      >
                        <ChevronDown
                          size={20}
                          style={{ color }}
                          className={`transition-transform duration-200 ${isSubCollapsed ? '-rotate-90' : 'rotate-0'}`}
                        />
                      </button>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
                      <span className="text-[15px] font-normal text-monday-text truncate">{sub.name}</span>
                      <span className="text-[12px] text-monday-subtext whitespace-nowrap">
                        {subDocs.length} {subDocs.length === 1 ? 'elemento' : 'elementos'}
                      </span>
                      <span className="text-[11px] text-monday-subtext">· subgrupo</span>
                      <button
                        type="button"
                        onClick={() => onRemoveSubgroup?.(docType!, sub.id)}
                        className="ml-auto p-1 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50"
                        title="Eliminar subgrupo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {!isSubCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse font-averta text-[13px]">
                          <thead>
                            <tr className="h-[32px] bg-monday-hover/40">
                              <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[1%]" style={{ borderLeftColor: color, borderLeftWidth: 2 }}>Nombre</th>
                              <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[100px]">Tipo</th>
                              <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[120px]">Última modificación</th>
                              <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[100px]">Mover a</th>
                              <th className="font-normal text-[12px] text-monday-subtext border-b border-monday-border px-1.5 py-1.5 w-[36px]">{' '}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subDocs.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-2 py-2 text-[12px] text-monday-subtext border-b border-monday-border">Ningún documento</td>
                              </tr>
                            ) : (
                              subDocs.map((doc) => (
                                <tr
                                  key={doc.id}
                                  className={`border-t border-monday-border/60 hover:bg-monday-hover/50 cursor-pointer ${selectedId === doc.id ? 'bg-monday-hover' : ''}`}
                                  onClick={() => onSelectDoc(doc.id)}
                                >
                                  <td className="px-2 py-1.5 border-r border-monday-border/60 align-middle" style={{ borderLeftColor: color, borderLeftWidth: 2 }}>
                                    <div className="flex items-center gap-1.5">
                                      {doc.type === 'sheet' ? <Table2 size={14} className="text-monday-blue shrink-0" /> : isPdfDocType(doc.type as DocType) ? <FileCheck size={14} className="text-monday-blue shrink-0" /> : <FileText size={14} className="text-monday-blue shrink-0" />}
                                      <span className="truncate text-monday-text">{doc.title}</span>
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-monday-subtext border-r border-monday-border/60 align-middle">{getDocTypeLabel(doc.type as DocType)}</td>
                                  <td className="px-2 py-1.5 text-monday-subtext border-r border-monday-border/60 align-middle">{new Date(doc.updatedAt).toLocaleString()}</td>
                                  <td className="px-2 py-1.5 border-r border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                                    <select value={subgroupAssignments[doc.id] ?? ''} onChange={(e) => onAssignSubgroup?.(doc.id, e.target.value || null)} className="text-[11px] border border-monday-border rounded px-1.5 py-0.5 bg-white text-monday-subtext w-full max-w-[90px]">
                                      <option value="">—</option>
                                      {subgroups!.filter((s) => s.id !== sub.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-1.5 py-1.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => onDeleteDoc(doc.id)} className="p-1 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50" title="Eliminar"><Trash2 size={12} /></button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Bloque "Sin subgrupo" */}
              <div className="ml-6 mt-2 pl-4 border-l-2 border-monday-border/60 bg-monday-hover/20 rounded-r-md py-1" style={{ borderLeftColor: color }}>
                <div className="flex items-center gap-1.5 py-1.5 px-2 mb-1 rounded-md">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-monday-subtext/50" aria-hidden />
                  <span className="text-[15px] font-normal text-monday-text">Sin subgrupo</span>
                  <span className="text-[12px] text-monday-subtext">
                    {docsWithSubgroup(null).length} {docsWithSubgroup(null).length === 1 ? 'elemento' : 'elementos'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-averta text-[13px]">
                    <thead>
                      <tr className="h-[32px] bg-monday-hover/40">
                        <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[1%]" style={{ borderLeftColor: color, borderLeftWidth: 2 }}>Nombre</th>
                        <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[100px]">Tipo</th>
                        <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[120px]">Última modificación</th>
                        <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-2 py-1.5 w-[100px]">Mover a</th>
                        <th className="font-normal text-[12px] text-monday-subtext border-b border-monday-border px-1.5 py-1.5 w-[36px]">{' '}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docsWithSubgroup(null).length === 0 ? (
                        <tr><td colSpan={5} className="px-2 py-2 text-[12px] text-monday-subtext border-b border-monday-border">Ningún documento</td></tr>
                      ) : (
                        docsWithSubgroup(null).map((doc) => (
                          <tr key={doc.id} className={`border-t border-monday-border/60 hover:bg-monday-hover/50 cursor-pointer ${selectedId === doc.id ? 'bg-monday-hover' : ''}`} onClick={() => onSelectDoc(doc.id)}>
                            <td className="px-2 py-1.5 border-r border-monday-border/60 align-middle" style={{ borderLeftColor: color, borderLeftWidth: 2 }}>
                              <div className="flex items-center gap-1.5">
                                {doc.type === 'sheet' ? <Table2 size={14} className="text-monday-blue shrink-0" /> : isPdfDocType(doc.type as DocType) ? <FileCheck size={14} className="text-monday-blue shrink-0" /> : <FileText size={14} className="text-monday-blue shrink-0" />}
                                <span className="truncate text-monday-text">{doc.title}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-monday-subtext border-r border-monday-border/60 align-middle">{getDocTypeLabel(doc.type as DocType)}</td>
                            <td className="px-2 py-1.5 text-monday-subtext border-r border-monday-border/60 align-middle">{new Date(doc.updatedAt).toLocaleString()}</td>
                            <td className="px-2 py-1.5 border-r border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                              <select value={subgroupAssignments[doc.id] ?? ''} onChange={(e) => onAssignSubgroup?.(doc.id, e.target.value || null)} className="text-[11px] border border-monday-border rounded px-1.5 py-0.5 bg-white text-monday-subtext w-full max-w-[90px]">
                                <option value="">—</option>
                                {subgroups!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1.5 align-middle" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => onDeleteDoc(doc.id)} className="p-1 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50" title="Eliminar"><Trash2 size={12} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Una sola tabla (sin subgrupos o sin UI de subgrupos) */
            <div className="relative z-0 w-full overflow-x-auto">
              <table className="w-full text-left border-collapse font-averta">
                <thead>
                  <tr className="h-[34px] bg-monday-hover/60">
                    <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[1%]" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>Nombre</th>
                    <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[120px]">Tipo</th>
                    {showSubgroups && (
                      <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[130px]">Subgrupo</th>
                    )}
                    <th className="font-normal text-[12px] text-monday-subtext border-b border-r border-monday-border px-3 py-2 w-[140px]">Última modificación</th>
                    <th className="font-normal text-[12px] text-monday-subtext border-b border-monday-border px-2 py-2 w-[44px]">{' '}</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 ? (
                    <tr>
                      <td colSpan={showSubgroups ? 5 : 4} className="px-3 py-3 text-[13px] text-monday-subtext border-b border-monday-border">Ningún documento</td>
                    </tr>
                  ) : (
                    docs.map((doc) => (
                      <tr key={doc.id} className={`border-t border-monday-border/60 hover:bg-monday-hover transition-colors cursor-pointer ${selectedId === doc.id ? 'bg-monday-hover' : ''}`} onClick={() => onSelectDoc(doc.id)}>
                        <td className="px-3 py-2 border-r border-monday-border/60 align-middle" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                      <div className="flex items-center gap-2">
                            {doc.type === 'sheet' ? <Table2 size={16} className="text-monday-blue shrink-0" /> : isPdfDocType(doc.type as DocType) ? <FileCheck size={16} className="text-monday-blue shrink-0" /> : <FileText size={16} className="text-monday-blue shrink-0" />}
                            <span className="truncate text-[13px] text-monday-text">{doc.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[13px] text-monday-subtext border-r border-monday-border/60 align-middle">{getDocTypeLabel(doc.type as DocType)}</td>
                        {showSubgroups && docType && (
                          <td className="px-3 py-2 border-r border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                            <select value={subgroupAssignments[doc.id] ?? ''} onChange={(e) => onAssignSubgroup?.(doc.id, e.target.value || null)} className="text-[12px] border border-monday-border rounded-monday px-2 py-1 bg-white text-monday-subtext w-full max-w-[120px]">
                              <option value="">—</option>
                              {subgroups!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                        )}
                        <td className="px-3 py-2 text-[13px] text-monday-subtext border-r border-monday-border/60 align-middle">{new Date(doc.updatedAt).toLocaleString()}</td>
                        <td className="px-2 py-2 border-b border-monday-border/60 align-middle" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => onDeleteDoc(doc.id)} className="p-1.5 rounded text-monday-subtext hover:text-monday-red hover:bg-red-50" title="Eliminar"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
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
  mobileLayout = false,
}: {
  docs: Doc[];
  workspaceId: string | null;
  onOpenDoc: (id: string) => void;
  onCreateDoc: (type: DocType) => void;
  onAddTaskList?: () => void;
  /** En móvil: lista de cards por tipo en lugar de tabla */
  mobileLayout?: boolean;
}) {

  if (!workspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-monday-subtext text-[13px]">
        Selecciona un workspace en la barra lateral.
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-auto scroll-touch custom-scrollbar bg-monday-bg p-4 sm:p-6 min-h-0">
      {/* Menús grandes para crear documentos */}
      <div className="flex flex-wrap gap-4 mb-6">
        {DOC_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.id}
            type="button"
            disabled={!workspaceId}
            onClick={() => onCreateDoc(opt.id)}
            className="flex flex-col items-start justify-between w-64 p-4 rounded-2xl bg-white border border-monday-border shadow-md hover:shadow-lg hover:border-monday-blue/50 transition-all text-left disabled:opacity-60"
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
          if (mobileLayout) {
            return (
              <section key={opt.id} className="rounded-lg border border-monday-border bg-white shadow-[0_2px_6px_0_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="h-[40px] px-3 flex items-center bg-monday-hover/60 border-b border-monday-border text-[12px] font-medium text-monday-subtext">
                  {typeGroupTitle}
                </div>
                {groupDocs.length === 0 ? (
                  <p className="px-3 py-3 text-monday-subtext text-[13px]">Ninguno</p>
                ) : (
                  <div className="divide-y divide-monday-border/60">
                    {groupDocs.map((doc) => (
                      <div
                        key={doc.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenDoc(doc.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDoc(doc.id); } }}
                        className="flex items-center gap-3 px-3 py-3 min-h-[48px] touch-manipulation active:bg-monday-hover/50"
                      >
                        {doc.type === 'sheet' ? (
                          <Table2 size={18} className="text-monday-blue shrink-0" />
                        ) : isPdfDocType(doc.type as DocType) ? (
                          <FileCheck size={18} className="text-monday-blue shrink-0" />
                        ) : (
                          <FileText size={18} className="text-monday-blue shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-monday-text text-[14px] truncate">{doc.title}</div>
                          <div className="text-[11px] text-monday-subtext">{getDocTypeLabel(doc.type as DocType)} · {new Date(doc.updatedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          }
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

export const DocsPage: React.FC<Props> = ({ workspaceId, boards, initialCreateFromBoard, onConsumeInitialCreateFromBoard, initialOpenDocId, onConsumeInitialOpenDocId, initialCreateDocType, onConsumeInitialCreateDocType, onAddTaskList, onAddCalculatorWidget, onAddReminderWidget, mobileLayout = false, scrollListInParent = false, mobileWordShell = false }) => {
  const { currentUser } = useUser();
  const currentUserId = currentUser?.id ?? null;
  const isAdmin = !!(currentUser && String(currentUser.role || '').toUpperCase() === 'ADMIN');
  const { toast } = useToast();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerActionsOpen, setViewerActionsOpen] = useState(false);
  const [workflowStatusByDocId, setWorkflowStatusByDocId] = useState<Record<string, WorkflowStatus>>({});
  const [activeSavedFilter, setActiveSavedFilter] = useState<SavedDocsFilterId>('all');
  const [reminders, setReminders] = useState<DocReminder[]>([]);
  const [reminderDraftTitle, setReminderDraftTitle] = useState('');
  const [reminderDraftDueAt, setReminderDraftDueAt] = useState('');
  const [reminderDraftDocId, setReminderDraftDocId] = useState<string>('none');
  const [reminderDraftRepeat, setReminderDraftRepeat] = useState<ReminderRepeat>('none');
  const [reminderDraftSound, setReminderDraftSound] = useState<ReminderSound>('beep');

  const { isMobile } = useViewport();
  const [wordShellTab, setWordShellTab] = useState<WordShellTab>('inicio');
  const useWordMobileShell = Boolean(mobileLayout && mobileWordShell && isMobile);

  const selectedDoc = useMemo(
    () => docs.find(d => d.id === selectedId) ?? null,
    [docs, selectedId]
  );
  const docsWorkflowStorageKey = useMemo(
    () => (workspaceId && currentUserId ? `sunday_docs_workflow_status_${workspaceId}_${currentUserId}` : null),
    [workspaceId, currentUserId]
  );
  const docsFilterStorageKey = useMemo(
    () => (workspaceId && currentUserId ? `sunday_docs_saved_filter_${workspaceId}_${currentUserId}` : null),
    [workspaceId, currentUserId]
  );
  const docsReminderStorageKey = useMemo(
    () => (workspaceId && currentUserId ? `sunday_docs_reminders_${workspaceId}_${currentUserId}` : null),
    [workspaceId, currentUserId]
  );
  const getDocWorkflowStatus = useCallback(
    (doc: Doc): WorkflowStatus => workflowStatusByDocId[doc.id] ?? 'por_hacer',
    [workflowStatusByDocId]
  );
  const docsForDisplay = useMemo(() => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return docs.filter((doc) => {
      if (activeSavedFilter === 'all') return true;
      if (activeSavedFilter === 'pending') return getDocWorkflowStatus(doc) !== 'listo_pdf';
      if (activeSavedFilter === 'pdf') return isPdfDocType(doc.type as DocType);
      if (activeSavedFilter === 'updated_7d') {
        const updatedTs = new Date(doc.updatedAt).getTime();
        return Number.isFinite(updatedTs) && now - updatedTs <= sevenDaysMs;
      }
      if (activeSavedFilter === 'mine') return !!currentUserId && doc.createdBy === currentUserId;
      return true;
    });
  }, [docs, activeSavedFilter, getDocWorkflowStatus, currentUserId]);
  const workflowCounts = useMemo(() => {
    const base = { por_hacer: 0, en_progreso: 0, listo_pdf: 0 };
    for (const doc of docsForDisplay) {
      const st = getDocWorkflowStatus(doc);
      base[st] += 1;
    }
    return base;
  }, [docsForDisplay, getDocWorkflowStatus]);
  const pendingTotal = workflowCounts.por_hacer + workflowCounts.en_progreso;
  const upcomingReminderCount = useMemo(() => {
    const now = Date.now();
    return reminders.filter((r) => !r.done && new Date(r.snoozedUntil || r.dueAt).getTime() >= now).length;
  }, [reminders]);
  const overdueReminderCount = useMemo(() => {
    const now = Date.now();
    return reminders.filter((r) => !r.done && new Date(r.snoozedUntil || r.dueAt).getTime() < now).length;
  }, [reminders]);
  const parsed = useMemo(() => parseContent(selectedDoc), [selectedDoc]);
  const [textDraft, setTextDraft] = useState(() => getInitialHtml(parsed.text ?? ''));
  const [tableDraft, setTableDraft] = useState<string[][]>(parsed.table ?? [['']]);
  const [cellStylesDraft, setCellStylesDraft] = useState<CellStylesMap>(() => {
    const cs = parsed.cellStyles;
    return cs && typeof cs === 'object' && !Array.isArray(cs) ? { ...cs } : {};
  });
  const [sheetHistory, setSheetHistory] = useState<{
    past: Array<{ table: string[][]; cellStyles: CellStylesMap }>;
    future: Array<{ table: string[][]; cellStyles: CellStylesMap }>;
  }>({ past: [], future: [] });
  const [headerImageUrlDraft, setHeaderImageUrlDraft] = useState<string | null>(
    (parsed.headerImageUrl as string | null) ?? null
  );
  const [pdfFormDraft, setPdfFormDraft] = useState<Record<string, unknown>>({});
  const pdfFormDraftRef = useRef(pdfFormDraft);
  pdfFormDraftRef.current = pdfFormDraft;
  const skipNextPdfDraftSyncFromParsed = useRef(false);
  const [templateConfigByType, setTemplateConfigByType] = useState<Record<string, TemplateConfigState>>({});
  const templateConfigByTypeRef = useRef(templateConfigByType);
  templateConfigByTypeRef.current = templateConfigByType;
  const [templateConfigLoading, setTemplateConfigLoading] = useState<boolean>(false);
  const [savingTemplateConfig, setSavingTemplateConfig] = useState(false);
  /** Evita auto-guardar justo después de cargar la config desde la API. */
  const templateConfigJustLoadedRef = useRef(false);
  const [viewMode, setViewMode] = useState<'docs' | 'overview'>('overview');
  /** En móvil vista Lista: true = se muestra el viewer (solo panel derecho); false = se muestra la lista (solo panel izquierdo). */
  const [mobileDocOpen, setMobileDocOpen] = useState(false);
  useEffect(() => {
    if (isMobile && selectedId === null) setMobileDocOpen(false);
  }, [isMobile, selectedId]);
  const beginNewDocDraft = useCallback((type: DocType) => {
    setViewMode('overview');
    setSelectedId(null);
    if (isMobile) setMobileDocOpen(true);
    setNewDocDraft({
      type,
      title: type === 'sheet' ? 'Nueva hoja' : getDocTypeTitle(type),
    });
  }, [isMobile]);

  const openTemplateInNewTab = useCallback((type: DocType) => {
    const url = new URL(window.location.href);
    url.searchParams.set('docsCreate', type);
    const opened = window.open(url.toString(), '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Fallback cuando el navegador bloquea popups.
      beginNewDocDraft(type);
    }
  }, [beginNewDocDraft]);
  const createFromExploreFlow = useCallback((type: DocType) => {
    setViewMode('docs');
    setSelectedId(null);
    setNewDocDraft(null);
    if (isMobile) setMobileDocOpen(false);
    void handleCreate(type);
  }, [isMobile]);
  // Drawer móvil para editar plantillas (evita “scroll dentro de scroll”).
  const [templateEditorMobileOpen, setTemplateEditorMobileOpen] = useState(false);
  // Focus Mode (Micro-Editor) para edición contextual en móvil.
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [activeBoxGeom, setActiveBoxGeom] = useState<{
    xPct: number;
    yPct: number;
    wPct: number;
    hPct: number;
  } | null>(null);
  // PR2: auto-zoom/auto-scroll (override scale del editor y desplazamiento del contenedor).
  const [focusZoomScale, setFocusZoomScale] = useState<number | null>(null);
  const pdfScrollContainerElRef = useRef<HTMLDivElement | null>(null);
  const pendingAutoScrollTimeoutRef = useRef<number | null>(null);
  // PR2: panel contextual sobre el teclado (visualViewport).
  const [focusPanelKeyboardGapPx, setFocusPanelKeyboardGapPx] = useState(0);
  const [focusPanelTranslateYPx, setFocusPanelTranslateYPx] = useState(0);
  const [focusPanelMeasuredHeightPx, setFocusPanelMeasuredHeightPx] = useState(0);
  const [focusSpotlightRect, setFocusSpotlightRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [focusVisualAid, setFocusVisualAid] = useState<'soft' | 'clear'>('soft');
  const focusPanelRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusClearTimeoutRef = useRef<number | null>(null);
  const templateEditorDraftSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const templateEditorTemplateConfigSnapshotRef = useRef<TemplateConfigState | null>(null);
  const templateEditorCloseAfterSaveRef = useRef(false);
  const templateEditorDialogRef = useRef<HTMLDivElement | null>(null);
  const templateEditorReturnToDocOpenRef = useRef<boolean>(true);
  const adminMasterSyncAppliedForDocIdRef = useRef<string | null>(null);
  /** Si el master se abrió desde el drawer normal, al cerrar/guardar volver a abrirlo. */
  const reopenNormalAfterMasterRef = useRef(false);
  /** Doc cuyo borrador de emergencia debe limpiarse al cerrar el drawer (no al pasar por Master). */
  const templateDrawerDocIdRef = useRef<string | null>(null);

  // Drawer de ADMIN para editar el master global (3 tipos).
  const [templateMasterEditorOpen, setTemplateMasterEditorOpen] = useState(false);
  const [templateMasterDocType, setTemplateMasterDocType] = useState<'cotizacion' | 'levantamiento' | 'hoja_trabajo'>('cotizacion');
  const [templateMasterDraft, setTemplateMasterDraft] = useState<TemplateConfigState | null>(null);
  const [templateMasterValue, setTemplateMasterValue] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!docsWorkflowStorageKey) {
      setWorkflowStatusByDocId({});
      return;
    }
    try {
      const raw = localStorage.getItem(docsWorkflowStorageKey);
      if (!raw) {
        setWorkflowStatusByDocId({});
        return;
      }
      const parsedRaw = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, WorkflowStatus> = {};
      for (const [docId, status] of Object.entries(parsedRaw)) {
        if (status === 'por_hacer' || status === 'en_progreso' || status === 'listo_pdf') {
          next[docId] = status;
        }
      }
      setWorkflowStatusByDocId(next);
    } catch {
      setWorkflowStatusByDocId({});
    }
  }, [docsWorkflowStorageKey]);

  useEffect(() => {
    if (!docsFilterStorageKey) {
      setActiveSavedFilter('all');
      return;
    }
    const raw = localStorage.getItem(docsFilterStorageKey);
    if (raw === 'all' || raw === 'pending' || raw === 'pdf' || raw === 'updated_7d' || raw === 'mine') {
      setActiveSavedFilter(raw);
    } else {
      setActiveSavedFilter('all');
    }
  }, [docsFilterStorageKey]);

  useEffect(() => {
    if (!docsReminderStorageKey) {
      setReminders([]);
      return;
    }
    try {
      const raw = localStorage.getItem(docsReminderStorageKey);
      if (!raw) {
        setReminders([]);
        return;
      }
      const parsedRaw = JSON.parse(raw);
      if (!Array.isArray(parsedRaw)) {
        setReminders([]);
        return;
      }
      const next: DocReminder[] = parsedRaw
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({
          id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
          title: typeof r.title === 'string' ? r.title : 'Recordatorio',
          dueAt: typeof r.dueAt === 'string' ? r.dueAt : '',
          docId: typeof r.docId === 'string' ? r.docId : null,
          repeat: r.repeat === 'daily' || r.repeat === 'weekly' ? r.repeat : 'none',
          sound: r.sound === 'none' || r.sound === 'chime' ? r.sound : 'beep',
          done: r.done === true,
          notifiedAt: typeof r.notifiedAt === 'string' ? r.notifiedAt : null,
          snoozedUntil: typeof r.snoozedUntil === 'string' ? r.snoozedUntil : null,
        }))
        .filter((r) => !!r.dueAt);
      setReminders(next);
    } catch {
      setReminders([]);
    }
  }, [docsReminderStorageKey]);

  useEffect(() => {
    if (!docsWorkflowStorageKey) return;
    localStorage.setItem(docsWorkflowStorageKey, JSON.stringify(workflowStatusByDocId));
  }, [docsWorkflowStorageKey, workflowStatusByDocId]);

  useEffect(() => {
    if (!docsFilterStorageKey) return;
    localStorage.setItem(docsFilterStorageKey, activeSavedFilter);
  }, [docsFilterStorageKey, activeSavedFilter]);

  useEffect(() => {
    if (!docsReminderStorageKey) return;
    localStorage.setItem(docsReminderStorageKey, JSON.stringify(reminders));
  }, [docsReminderStorageKey, reminders]);

  const playReminderSound = useCallback((sound: ReminderSound | undefined) => {
    if (!sound || sound === 'none') return;
    try {
      const AudioCtx =
        (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = sound === 'chime' ? 880 : 660;
      gain.gain.value = sound === 'chime' ? 0.05 : 0.035;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      if (sound === 'chime') {
        osc.frequency.setValueAtTime(660, now + 0.18);
        osc.frequency.setValueAtTime(990, now + 0.36);
        osc.stop(now + 0.5);
      } else {
        osc.stop(now + 0.22);
      }
      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, 700);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      setReminders((prev) => {
        let changed = false;
        const next = prev.map((reminder) => {
          if (reminder.done) return reminder;
          const dueSource = reminder.snoozedUntil || reminder.dueAt;
          const dueTs = new Date(dueSource).getTime();
          if (!Number.isFinite(dueTs) || dueTs > now || reminder.notifiedAt) return reminder;
          changed = true;
          const linkedDoc = reminder.docId ? docs.find((d) => d.id === reminder.docId) : null;
          const msg = linkedDoc
            ? `Recordatorio: ${reminder.title} (${linkedDoc.title})`
            : `Recordatorio: ${reminder.title}`;
          playReminderSound(reminder.sound);
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (window.Notification.permission === 'granted') {
              new window.Notification('Sunday Docs', { body: msg });
            } else if (window.Notification.permission === 'default') {
              window.Notification.requestPermission().catch(() => {});
              toast(msg, 'info');
            } else {
              toast(msg, 'info');
            }
          } else {
            toast(msg, 'info');
          }
          if (reminder.repeat === 'daily' || reminder.repeat === 'weekly') {
            const base = new Date(reminder.dueAt).getTime();
            const stepMs = reminder.repeat === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
            const safeBase = Number.isFinite(base) ? base : now;
            let nextDue = safeBase + stepMs;
            while (nextDue <= now) nextDue += stepMs;
            return {
              ...reminder,
              dueAt: new Date(nextDue).toISOString(),
              notifiedAt: null,
              snoozedUntil: null,
            };
          }
          return { ...reminder, notifiedAt: new Date().toISOString(), snoozedUntil: null };
        });
        return changed ? next : prev;
      });
    }, 30000);
    return () => window.clearInterval(tick);
  }, [docs, toast, playReminderSound]);

  useEffect(() => {
    if (!templateEditorMobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Evita que el fondo “salte” cuando el drawer bloquea scroll.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [templateEditorMobileOpen]);

  // Evita que la bottom nav global tape la edición en el drawer de plantilla.
  useEffect(() => {
    const mobileNav = document.querySelector('nav[aria-label="Navegación principal"]') as HTMLElement | null;
    if (!mobileNav) return;
    if (!templateEditorMobileOpen) {
      mobileNav.style.visibility = '';
      mobileNav.style.pointerEvents = '';
      return;
    }
    const prevVisibility = mobileNav.style.visibility;
    const prevPointerEvents = mobileNav.style.pointerEvents;
    mobileNav.style.visibility = 'hidden';
    mobileNav.style.pointerEvents = 'none';
    return () => {
      mobileNav.style.visibility = prevVisibility;
      mobileNav.style.pointerEvents = prevPointerEvents;
    };
  }, [templateEditorMobileOpen]);

  // m6: limpiar borrador de emergencia al cerrar el drawer (no si solo se oculta para el overlay Master).
  useEffect(() => {
    if (templateEditorMobileOpen) return;
    if (reopenNormalAfterMasterRef.current) return;
    const docId = templateDrawerDocIdRef.current;
    if (docId) {
      clearEmergencyDraftFromStorage(docId);
      templateDrawerDocIdRef.current = null;
    }
  }, [templateEditorMobileOpen]);

  useEffect(() => {
    // Cerrar Focus Mode al salir del drawer de edición para evitar paneles “fantasma”.
    if (!templateEditorMobileOpen) {
      setFocusModeOpen(false);
      setActiveBoxId(null);
      setActiveBoxGeom(null);
      setFocusZoomScale(null);
      setFocusPanelKeyboardGapPx(0);
      setFocusPanelTranslateYPx(0);
    }
  }, [templateEditorMobileOpen]);

  useEffect(() => {
    if (!templateMasterEditorOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [templateMasterEditorOpen]);

  useEffect(() => {
    if (templateMasterEditorOpen) {
      setFocusModeOpen(false);
      setActiveBoxId(null);
      setActiveBoxGeom(null);
      setFocusZoomScale(null);
      setFocusPanelKeyboardGapPx(0);
      setFocusPanelTranslateYPx(0);
    }
  }, [templateMasterEditorOpen]);

  const handleActiveBoxChange = useCallback(
    (payload: {
      boxId: string | null;
      boxKind?: 'text' | 'image';
      xPct?: number;
      yPct?: number;
      wPct?: number;
      hPct?: number;
    }) => {
      if (!templateEditorMobileOpen) return;

      if (pendingFocusClearTimeoutRef.current != null) {
        window.clearTimeout(pendingFocusClearTimeoutRef.current);
        pendingFocusClearTimeoutRef.current = null;
      }

      if (!payload || payload.boxId === null) {
        pendingFocusClearTimeoutRef.current = window.setTimeout(() => {
          setFocusModeOpen(false);
          setActiveBoxId(null);
          setActiveBoxGeom(null);
          pendingFocusClearTimeoutRef.current = null;
        }, 150);
        return;
      }

      const boxKind = payload.boxKind ?? 'text';
      setActiveBoxId(payload.boxId);
      if (
        typeof payload.xPct === 'number' &&
        typeof payload.yPct === 'number' &&
        typeof payload.wPct === 'number' &&
        typeof payload.hPct === 'number'
      ) {
        setActiveBoxGeom({
          xPct: payload.xPct,
          yPct: payload.yPct,
          wPct: payload.wPct,
          hPct: payload.hPct,
        });
      } else {
        setActiveBoxGeom(null);
      }

      // En PR1 abrimos Focus Mode solo para texto (contentEditable).
      setFocusModeOpen(boxKind === 'text');
    },
    [templateEditorMobileOpen]
  );

  // PR2: Panel contextual "keyboard-aware" (visualViewport) en móvil.
  useEffect(() => {
    if (!templateEditorMobileOpen) return;
    if (!focusModeOpen) return;

    const vv = window.visualViewport;

    const update = () => {
      const v = window.visualViewport;
      if (!v) return;
      const kbGap = Math.max(0, window.innerHeight - (v.height ?? window.innerHeight));
      setFocusPanelKeyboardGapPx(kbGap);
      setFocusPanelTranslateYPx(v.offsetTop ?? 0);
    };

    update();

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update as any);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update as any);
    };
  }, [focusModeOpen, templateEditorMobileOpen]);

  // PR2: reset de zoom/panel cuando cerramos Focus Mode.
  useEffect(() => {
    if (!focusModeOpen) {
      setFocusZoomScale(null);
      setFocusPanelKeyboardGapPx(0);
      setFocusPanelTranslateYPx(0);
      setFocusPanelMeasuredHeightPx(0);
      setFocusSpotlightRect(null);
      setFocusVisualAid('soft');
    }
  }, [focusModeOpen]);

  // Mide la altura real de la barra de foco para reservar espacio al auto-scroll.
  useEffect(() => {
    if (!focusModeOpen) return;
    const el = focusPanelRef.current;
    if (!el) return;
    const update = () => setFocusPanelMeasuredHeightPx(el.getBoundingClientRect().height || 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [focusModeOpen, activeBoxId, focusPanelKeyboardGapPx]);

  // PR8 backlog: mitigar pinch-zoom en focus mode sin romper scroll vertical del drawer.
  useEffect(() => {
    if (!templateEditorMobileOpen || !focusModeOpen) return;
    const root = templateEditorDialogRef.current;
    if (!root) return;

    const preventPinch = (e: TouchEvent) => {
      if (!root.contains(e.target as Node)) return;
      if (e.touches.length > 1) e.preventDefault();
    };
    const preventGesture = (e: Event) => {
      if (!root.contains(e.target as Node)) return;
      e.preventDefault();
    };

    root.addEventListener('touchstart', preventPinch, { passive: false });
    root.addEventListener('touchmove', preventPinch, { passive: false });

    // iOS Safari expone gesture* para pinch/zoom en algunas versiones.
    const docWithGesture = document as Document & {
      addEventListener: (
        type: 'gesturestart' | 'gesturechange' | 'gestureend',
        listener: (ev: Event) => void,
        options?: boolean | AddEventListenerOptions
      ) => void;
      removeEventListener: (
        type: 'gesturestart' | 'gesturechange' | 'gestureend',
        listener: (ev: Event) => void
      ) => void;
    };
    docWithGesture.addEventListener('gesturestart', preventGesture, { passive: false });
    docWithGesture.addEventListener('gesturechange', preventGesture, { passive: false });
    docWithGesture.addEventListener('gestureend', preventGesture, { passive: false });

    return () => {
      root.removeEventListener('touchstart', preventPinch);
      root.removeEventListener('touchmove', preventPinch);
      docWithGesture.removeEventListener('gesturestart', preventGesture);
      docWithGesture.removeEventListener('gesturechange', preventGesture);
      docWithGesture.removeEventListener('gestureend', preventGesture);
    };
  }, [templateEditorMobileOpen, focusModeOpen]);

  // PR2: Auto-zoom/auto-scroll hacia el cuadro enfocado (usa coords en porcentajes).
  useEffect(() => {
    if (!templateEditorMobileOpen) return;
    if (!focusModeOpen) return;
    if (!activeBoxGeom) return;

    const el = pdfScrollContainerElRef.current;
    if (!el) return;

    const baseScale = Math.max(0.25, Math.min(1, (el.clientWidth ?? 0) / PAGE_WIDTH_PX_96DPI));
    const nextScale = Math.max(0.25, Math.min(1, baseScale * 1.6));
    setFocusZoomScale(nextScale);

    if (pendingAutoScrollTimeoutRef.current != null) {
      window.clearTimeout(pendingAutoScrollTimeoutRef.current);
      pendingAutoScrollTimeoutRef.current = null;
    }

    const yPx = activeBoxGeom.yPct * PAGE_HEIGHT_PX_96DPI * nextScale;
    const boxBottomPx = (activeBoxGeom.yPct + activeBoxGeom.hPct) * PAGE_HEIGHT_PX_96DPI * nextScale;
    const xPx = activeBoxGeom.xPct * PAGE_WIDTH_PX_96DPI * nextScale;
    // Reserva inferior: barra de foco + navegación inferior + pequeño margen de aire.
    const bottomNavReservePx = 96;
    const focusPanelReservePx = Math.max(132, focusPanelMeasuredHeightPx + 24);
    const keyboardReservePx =
      focusPanelKeyboardGapPx > 0 ? Math.min(focusPanelKeyboardGapPx, el.clientHeight * 0.4) : 0;
    const blockedBottomPx = Math.min(
      el.clientHeight * 0.75,
      focusPanelReservePx + bottomNavReservePx + keyboardReservePx
    );
    const visibleHeightPx = Math.max(120, el.clientHeight - blockedBottomPx);
    const idealTopFromTop = yPx - el.clientHeight * 0.22;
    const idealTopFromBottom = boxBottomPx - visibleHeightPx;
    const idealTop = Math.max(idealTopFromTop, idealTopFromBottom);
    const idealLeft = xPx - el.clientWidth * 0.1;

    pendingAutoScrollTimeoutRef.current = window.setTimeout(() => {
      // Casi obligatorio en móviles: evita que el "scroll into view" del browser sobreescriba.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
          const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
          const nextTop = Math.max(0, Math.min(maxTop, idealTop));
          const nextLeft = Math.max(0, Math.min(maxLeft, idealLeft));
          el.scrollTo({ top: nextTop, left: nextLeft, behavior: 'auto' });
          pendingAutoScrollTimeoutRef.current = null;
        });
      });
    }, 0);
  }, [
    focusModeOpen,
    activeBoxGeom,
    templateEditorMobileOpen,
    focusPanelMeasuredHeightPx,
    focusPanelKeyboardGapPx,
  ]);

  // Reserva "runway" de scroll al fondo para que cajas bajas (ej. total) no queden ocultas.
  useEffect(() => {
    const el = pdfScrollContainerElRef.current;
    if (!el) return;
    if (!templateEditorMobileOpen || !focusModeOpen) {
      el.style.paddingBottom = '';
      return;
    }
    const bottomNavReservePx = 96;
    const focusPanelReservePx = Math.max(132, focusPanelMeasuredHeightPx + 24);
    const keyboardReservePx = focusPanelKeyboardGapPx > 0 ? Math.min(focusPanelKeyboardGapPx, 260) : 0;
    const totalReservePx = focusPanelReservePx + bottomNavReservePx + keyboardReservePx;
    el.style.paddingBottom = `${totalReservePx}px`;
    return () => {
      el.style.paddingBottom = '';
    };
  }, [templateEditorMobileOpen, focusModeOpen, focusPanelMeasuredHeightPx, focusPanelKeyboardGapPx]);

  // PR8: Spotlight en focus mode: blur/overlay solo fuera del cuadro activo.
  useEffect(() => {
    if (!templateEditorMobileOpen || !focusModeOpen || !activeBoxGeom) {
      setFocusSpotlightRect(null);
      return;
    }
    const el = pdfScrollContainerElRef.current;
    if (!el) {
      setFocusSpotlightRect(null);
      return;
    }

    const updateSpotlight = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) {
        setFocusSpotlightRect(null);
        return;
      }

      const autoFitScale = Math.max(0.25, Math.min(1, width / PAGE_WIDTH_PX_96DPI));
      const scale = focusZoomScale ?? autoFitScale;
      const pad = 10;
      const leftRaw = activeBoxGeom.xPct * PAGE_WIDTH_PX_96DPI * scale - el.scrollLeft - pad;
      const topRaw = activeBoxGeom.yPct * PAGE_HEIGHT_PX_96DPI * scale - el.scrollTop - pad;
      const boxWidthRaw = activeBoxGeom.wPct * PAGE_WIDTH_PX_96DPI * scale + pad * 2;
      const boxHeightRaw = activeBoxGeom.hPct * PAGE_HEIGHT_PX_96DPI * scale + pad * 2;

      const minWidth = Math.max(56, Math.min(boxWidthRaw, width));
      const minHeight = Math.max(40, Math.min(boxHeightRaw, height));
      const left = Math.max(0, Math.min(width - minWidth, leftRaw));
      const top = Math.max(0, Math.min(height - minHeight, topRaw));

      setFocusSpotlightRect({
        left,
        top,
        width: minWidth,
        height: minHeight,
      });
    };

    updateSpotlight();
    const onScroll = () => updateSpotlight();
    const onResize = () => updateSpotlight();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(updateSpotlight);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [templateEditorMobileOpen, focusModeOpen, activeBoxGeom, focusZoomScale]);

  const [deleteConfirm, setDeleteConfirm] = useState<{ docId: string } | null>(null);
  type PromptDialog =
    | { type: 'renameSubgroup'; docType: string; subgroupId: string; initialValue: string }
    | { type: 'addGroup' }
    | { type: 'addSubgroup'; docType: string };
  const [promptDialog, setPromptDialog] = useState<PromptDialog | null>(null);
  const [promptInputValue, setPromptInputValue] = useState('');

  // Documento nuevo sin id (solo al hacer clic en Guardar se crea en el servidor)
  type NewDocDraft = { type: DocType; title: string };
  const [newDocDraft, setNewDocDraft] = useState<NewDocDraft | null>(null);

  // Al crear doc/sheet desde el tablero: guardar datos para ligar al guardar
  const [linkToBoardItem, setLinkToBoardItem] = useState<{
    boardId: string;
    itemId: string;
    columnId: string;
    type: 'cotizacion' | 'levantamiento' | 'hoja_trabajo' | 'sheet';
  } | null>(null);

  // Evitar que React StrictMode dispare dos veces la creación desde tablero
  const lastCreateFromBoardKeyRef = useRef<string | null>(null);
  // Ref para que performSaveNew vea el link actual al guardar (el doc se crea solo al hacer clic en Guardar)
  const linkToBoardItemRef = useRef<typeof linkToBoardItem>(null);
  useEffect(() => {
    linkToBoardItemRef.current = linkToBoardItem;
  }, [linkToBoardItem]);

  const linkDocToBoardItem = useCallback(
    async (opts: {
      boardId: string;
      itemId: string;
      columnId: string;
      type: 'cotizacion' | 'levantamiento' | 'hoja_trabajo' | 'sheet';
      docId: string;
    }) => {
      try {
        const boardRes = await apiFetch(`${API_BASE}/api/boards/${opts.boardId}`);
        if (!boardRes.ok) {
          console.error('No se pudo cargar el tablero para ligar el documento.');
          return;
        }
        const board = await boardRes.json();
        const allItems =
          board?.groups?.flatMap((g: { items?: any[] }) => g.items ?? []) ?? [];
        const item = allItems.find((it: { id: string }) => it.id === opts.itemId);
        const columnValues = item?.columnValues ?? [];
        const existingCv =
          columnValues.find(
            (cv: { columnId: string }) => cv.columnId === opts.columnId
          ) ?? null;
        const columns = board?.columns ?? [];
        const column = columns.find((c: { id: string }) => c.id === opts.columnId);

        let nextValue: string;
        if (column?.type === 'excel') {
          // Para columnas excel: { docId, url? }
          let parsed: { docId?: string; url?: string } = {};
          const raw = typeof existingCv?.value === 'string' ? existingCv.value.trim() : '';
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = { url: raw };
            }
          }
          parsed.docId = opts.docId;
          nextValue = JSON.stringify(parsed);
        } else {
          // Columnas docs: JSON con cotizacionDocId / levantamientoDocId / hojaTrabajoDocId
          let parsed: Record<string, unknown> = {};
          const raw = typeof existingCv?.value === 'string' ? existingCv.value.trim() : '';
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = {};
            }
          }
          const key =
            opts.type === 'cotizacion'
              ? 'cotizacionDocId'
              : opts.type === 'levantamiento'
              ? 'levantamientoDocId'
              : opts.type === 'hoja_trabajo'
              ? 'hojaTrabajoDocId'
              : 'docId';
          parsed[key] = opts.docId;
          nextValue = JSON.stringify(parsed);
        }

        socket.emit('update_column_value', {
          itemId: opts.itemId,
          columnId: opts.columnId,
          value: nextValue,
        });
      } catch (e) {
        console.error('Error ligando documento al elemento (fallback):', e);
      }
    },
    []
  );

  // Modal para Guardar (nuevo) y Guardar como: elegir grupo/subgrupo (y nombre en save as)
  type SaveModal = { mode: 'new' } | { mode: 'saveAs'; doc: Doc };
  const [saveModal, setSaveModal] = useState<SaveModal | null>(null);
  const [saveModalGroupId, setSaveModalGroupId] = useState<string>('');
  const [saveModalSubgroupId, setSaveModalSubgroupId] = useState<string>('');
  const [saveModalTitle, setSaveModalTitle] = useState<string>('');

  // Grupos personalizados por usuario/workspace (API doc-groups, mismo patrón que panel-notes)
  const [customGroups, setCustomGroups] = useState<DocCustomGroup[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // docId -> customGroupId
  const [subgroupsByType, setSubgroupsByType] = useState<Record<string, DocCustomGroup[]>>({}); // type -> [{ id, name }]
  const [subgroupAssignments, setSubgroupAssignments] = useState<Record<string, string>>({}); // docId -> subgroupId
  const [docGroupsLoading, setDocGroupsLoading] = useState(false);
  const [collapsedDocGroups, setCollapsedDocGroups] = useState<Set<string>>(new Set());
  const hasInitializedMobileCollapseRef = useRef(false);

  useEffect(() => {
    if (!isMobile || hasInitializedMobileCollapseRef.current) return;
    const typeKeys = DOC_TYPE_OPTIONS.map((opt) => `type:${opt.id}`);
    const customKeys = customGroups.map((grp) => `custom:${grp.id}`);
    const allKeys = [...typeKeys, ...customKeys];
    if (allKeys.length === 0) return;
    hasInitializedMobileCollapseRef.current = true;
    setCollapsedDocGroups(new Set(allKeys));
  }, [isMobile, customGroups]);

  const toggleDocGroupCollapse = (key: string) => {
    setCollapsedDocGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // En móvil preferimos la vista "docs" (lista + visor), pero permitimos "overview"
  // cuando el usuario lo solicita (ej. "Editar plantilla" para PDFs).
  // Si hay borrador nuevo activo, forzamos la vista de edición para evitar volver a "Explorar" por cambios de estado laterales.
  const effectiveViewMode: 'docs' | 'overview' = newDocDraft ? 'overview' : viewMode;
  const useEmbeddedTemplateEditor =
    isMobile &&
    templateEditorMobileOpen &&
    !!selectedDoc &&
    isPdfDocType(selectedDoc.type as DocType);

  // Solo una vez al montar en móvil: arrancar en lista. No volver a forzar 'docs'
  // o al tocar "Editar plantilla" el efecto nos devolvería a lista.
  const hasSetInitialMobileViewRef = useRef(false);
  useEffect(() => {
    if (!isMobile || hasSetInitialMobileViewRef.current) return;
    hasSetInitialMobileViewRef.current = true;
    setViewMode('docs');
  }, [isMobile]);

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
    const url = `${API_BASE}/api/workspaces/${workspaceId}/doc-groups?userId=${encodeURIComponent(currentUserId)}`;
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
      apiFetch(`${API_BASE}/api/workspaces/${workspaceId}/doc-groups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [workspaceId, currentUserId],
  );

  const addCustomGroup = () => {
    setPromptDialog({ type: 'addGroup' });
    setPromptInputValue('');
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
    setPromptDialog({ type: 'addSubgroup', docType });
    setPromptInputValue('');
  };

  const openRenameSubgroupPrompt = (docType: string, subgroupId: string, currentName: string) => {
    setPromptDialog({ type: 'renameSubgroup', docType, subgroupId, initialValue: currentName });
    setPromptInputValue(currentName);
  };

  const handlePromptConfirm = () => {
    const trimmed = promptInputValue.trim();
    if (!trimmed) return;
    if (!promptDialog) return;
    if (promptDialog.type === 'addGroup') {
      const next = [...customGroups, { id: crypto.randomUUID(), name: trimmed }];
      setCustomGroups(next);
      saveDocGroupsToApi(next, assignments, subgroupsByType, subgroupAssignments);
    } else if (promptDialog.type === 'addSubgroup') {
      const list = subgroupsByType[promptDialog.docType] ?? [];
      const nextList = [...list, { id: crypto.randomUUID(), name: trimmed }];
      const next = { ...subgroupsByType, [promptDialog.docType]: nextList };
      setSubgroupsByType(next);
      saveDocGroupsToApi(customGroups, assignments, next, subgroupAssignments);
    } else if (promptDialog.type === 'renameSubgroup') {
      renameSubgroup(promptDialog.docType, promptDialog.subgroupId, trimmed);
    }
    setPromptDialog(null);
    setPromptInputValue('');
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
    const next: Record<string, DocCustomGroup[]> = { ...subgroupsByType };
    if (list.length > 0) next[docType] = list;
    else delete next[docType];
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
        const res = await apiFetch(`${API_BASE}/api/docs?workspaceId=${encodeURIComponent(workspaceId)}`);
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
    const cs = parsed.cellStyles;
    setCellStylesDraft(cs && typeof cs === 'object' && !Array.isArray(cs) ? { ...cs } : {});
    setSheetHistory({ past: [], future: [] });
    setHeaderImageUrlDraft((parsed.headerImageUrl as string | null) ?? null);
    if (selectedDoc && isPdfDocType(selectedDoc.type as DocType)) {
      if (skipNextPdfDraftSyncFromParsed.current) {
        skipNextPdfDraftSyncFromParsed.current = false;
      } else {
        const initial = getInitialContentForType(selectedDoc.type as DocType);
        const merged = { ...initial, ...(parsed as Record<string, unknown>) };
        // Fecha: nunca rellenar desde el documento guardado; solo lo que el usuario escribe (evitar 15/03/2026 automático)
        (merged as Record<string, unknown>).fecha = (initial as Record<string, unknown>).fecha ?? '';
        setPdfFormDraft(merged);
        // Fallback para no-admin: si el documento tiene customBoxes guardados y aún no tenemos config de la API, usar la del doc
        const docType = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
        const rawCustom = (parsed as Record<string, unknown>).customBoxes as unknown;
        const rawDocBoxes: unknown[] = Array.isArray(rawCustom) ? rawCustom : [];
        if (rawDocBoxes.length > 0) {
          const docBoxes = rawDocBoxes.map((bUnknown) => {
            const box = bUnknown as {
              id?: string;
              x?: number;
              y?: number;
              width?: number;
              height?: number;
              kind?: string;
              fieldKey?: string;
              semantic?: string;
              backgroundColor?: string;
              singleLine?: boolean;
              fontSize?: number;
              fontColor?: string;
              fontFamily?: string;
              fontBold?: boolean;
              fontItalic?: boolean;
            };
            const mapped: CustomBoxDef = {
              id: String(box.id ?? crypto.randomUUID()),
              x: typeof box.x === 'number' ? box.x : 0,
              y: typeof box.y === 'number' ? box.y : 0,
              width: typeof box.width === 'number' ? box.width : 0.3,
              height: typeof box.height === 'number' ? box.height : 0.05,
              kind: box.kind === 'image' ? 'image' : 'text',
              fieldKey: typeof box.fieldKey === 'string' ? box.fieldKey : undefined,
              semantic: box.semantic === 'folio' || box.semantic === 'element' ? box.semantic : undefined,
              backgroundColor: typeof box.backgroundColor === 'string' ? box.backgroundColor : undefined,
              singleLine: box.singleLine === true,
              fontSize: typeof box.fontSize === 'number' ? box.fontSize : undefined,
              fontColor: typeof box.fontColor === 'string' ? box.fontColor : undefined,
              fontFamily: typeof box.fontFamily === 'string' ? box.fontFamily : undefined,
              fontBold: box.fontBold === true,
              fontItalic: box.fontItalic === true,
            };
          return mapped;
          });
          setTemplateConfigByType((prev) => {
            const current = prev[docType];
            if (current?.customBoxes?.length) return prev; // ya hay config (API); no sobrescribir
            return {
              ...prev,
              [docType]: {
                fieldPositions: (typeof (parsed as Record<string, unknown>).fieldPositions === 'object' && (parsed as Record<string, unknown>).fieldPositions != null)
                  ? (parsed as Record<string, unknown>).fieldPositions as Record<string, { x: number; y: number }>
                  : {},
                fontColor: typeof (parsed as Record<string, unknown>).globalFontColor === 'string' ? (parsed as Record<string, unknown>).globalFontColor as string : '#000000',
                fontFamily: typeof (parsed as Record<string, unknown>).globalFontFamily === 'string' ? (parsed as Record<string, unknown>).globalFontFamily as string : 'Helvetica',
                fontSize: typeof (parsed as Record<string, unknown>).globalFontSize === 'number' ? (parsed as Record<string, unknown>).globalFontSize as number : 11,
                fontBold: (parsed as Record<string, unknown>).globalFontBold === true || (parsed as Record<string, unknown>).globalFontBold === 'true',
                fontItalic: (parsed as Record<string, unknown>).globalFontItalic === true || (parsed as Record<string, unknown>).globalFontItalic === 'true',
                customBoxes: docBoxes,
              },
            };
          });
        }
      }
    }
  }, [parsed, selectedId, selectedDoc?.type]);

  // Inicializar drafts cuando se abre un documento nuevo (sin id)
  // Si viene del tablero (linkToBoardItem), no sobrescribir pdfFormDraft: el efecto de creación desde tablero ya lo rellenó con elemento/folio
  useEffect(() => {
    if (!newDocDraft) return;
    const initial = getInitialContentForType(newDocDraft.type);
    setTextDraft(getInitialHtml((initial.text as string) ?? ''));
    setTableDraft(Array.isArray(initial.table) ? (initial.table as string[][]) : [['']]);
    const cs = initial.cellStyles;
    setCellStylesDraft(cs && typeof cs === 'object' && !Array.isArray(cs) ? { ...cs } : {});
    setSheetHistory({ past: [], future: [] });
    setHeaderImageUrlDraft((initial.headerImageUrl as string | null) ?? null);
    if (!(isPdfDocType(newDocDraft.type) && linkToBoardItem)) {
      if (isPdfDocType(newDocDraft.type)) {
        const masterDef = templateConfigByType[newDocDraft.type]?.defaultContent;
        setPdfFormDraft(mergeInitialPdfContentWithMasterDefaults(newDocDraft.type, masterDef) as Record<string, unknown>);
      } else {
        setPdfFormDraft(initial as Record<string, unknown>);
      }
    }
  }, [
    newDocDraft?.type,
    linkToBoardItem,
    newDocDraft && isPdfDocType(newDocDraft.type) ? templateConfigByType[newDocDraft.type]?.defaultContent : undefined,
  ]);

  const pdfDocType = (selectedDoc && isPdfDocType(selectedDoc.type as DocType) ? selectedDoc.type : newDocDraft && isPdfDocType(newDocDraft.type) ? newDocDraft.type : null) as 'cotizacion' | 'levantamiento' | 'hoja_trabajo' | null;

  // Config efectiva para el viewer: priorizar el documento; si el doc no tiene cajas, usar la plantilla global.
  const effectiveTemplateConfigForPdf = useMemo((): TemplateConfigState | null => {
    if (!pdfDocType) return null;
    const fromApi = templateConfigByType[pdfDocType];
    // ADMIN usa siempre el master global para layout/estilos de cajas.
    if (isAdmin) return fromApi ?? null;
    const fromDoc = Array.isArray(pdfFormDraft.customBoxes) ? pdfFormDraft.customBoxes : [];
    if (fromDoc.length > 0) {
      return {
        fieldPositions: (typeof pdfFormDraft.fieldPositions === 'object' && pdfFormDraft.fieldPositions != null)
          ? (pdfFormDraft.fieldPositions as Record<string, { x: number; y: number }>)
          : {},
        fontColor: typeof pdfFormDraft.globalFontColor === 'string' ? (pdfFormDraft.globalFontColor as string) : '#000000',
        fontFamily: typeof pdfFormDraft.globalFontFamily === 'string' ? (pdfFormDraft.globalFontFamily as string) : 'Helvetica',
        fontSize: typeof pdfFormDraft.globalFontSize === 'number' ? (pdfFormDraft.globalFontSize as number) : 11,
        fontBold: pdfFormDraft.globalFontBold === true || pdfFormDraft.globalFontBold === 'true',
        fontItalic: pdfFormDraft.globalFontItalic === true || pdfFormDraft.globalFontItalic === 'true',
        customBoxes: fromDoc as TemplateConfigState['customBoxes'],
      };
    }
    return fromApi ?? null;
  }, [pdfDocType, templateConfigByType, pdfFormDraft]);

  // ADMIN: normaliza el draft contra el master para que layout + IDs + valores queden coherentes.
  const syncAdminDraftWithMaster = (
    draft: Record<string, unknown>,
    master: TemplateConfigState
  ): { nextDraft: Record<string, unknown>; orphanCount: number } => {
    const docBoxes: CustomBoxDef[] = Array.isArray(draft.customBoxes) ? (draft.customBoxes as CustomBoxDef[]) : [];
    const docCustomFieldValuesRaw = (draft.customFieldValues ?? {}) as unknown;
    const docCustomFieldValues =
      docCustomFieldValuesRaw && typeof docCustomFieldValuesRaw === 'object' && !Array.isArray(docCustomFieldValuesRaw)
        ? (docCustomFieldValuesRaw as Record<string, string>)
        : {};

    const masterBoxes: CustomBoxDef[] = Array.isArray(master.customBoxes) ? (master.customBoxes as CustomBoxDef[]) : [];

    const nextCustomFieldValues: Record<string, string> = {};
    const mappedDocIds = new Set<string>();

    // Mantener valores de campos con fieldKey: el editor los lee desde draft[fieldKey].
    const nextDraft: Record<string, unknown> = {
      ...draft,
      customBoxes: masterBoxes,
      fieldPositions: master.fieldPositions ?? {},
      globalFontColor: master.fontColor ?? '#000000',
      globalFontFamily: master.fontFamily ?? 'Helvetica',
      globalFontSize: master.fontSize ?? 11,
      globalFontBold: master.fontBold ?? false,
      globalFontItalic: master.fontItalic ?? false,
      customFieldValues: nextCustomFieldValues,
    };

    for (let i = 0; i < masterBoxes.length; i += 1) {
      const masterBox = masterBoxes[i] as CustomBoxDef;
      let candidateDocBox: CustomBoxDef | undefined;

      if (masterBox.semantic) {
        candidateDocBox = docBoxes.find((b) => b.semantic === masterBox.semantic);
      }
      if (!candidateDocBox && masterBox.fieldKey) {
        candidateDocBox = docBoxes.find((b) => b.fieldKey === masterBox.fieldKey);
      }
      if (!candidateDocBox && docBoxes.length > 0) {
        candidateDocBox = docBoxes[Math.min(i, docBoxes.length - 1)];
      }

      const candidateId = candidateDocBox?.id;
      const candidateValueFromCustom =
        candidateId && typeof docCustomFieldValues[candidateId] === 'string' ? docCustomFieldValues[candidateId] : undefined;
      const candidateValueFromFieldKey =
        masterBox.fieldKey && typeof (draft as Record<string, unknown>)[masterBox.fieldKey] === 'string'
          ? String((draft as Record<string, unknown>)[masterBox.fieldKey] as string)
          : undefined;
      const candidateValueFromDocFieldKey =
        candidateDocBox?.fieldKey && typeof (draft as Record<string, unknown>)[candidateDocBox.fieldKey] === 'string'
          ? String((draft as Record<string, unknown>)[candidateDocBox.fieldKey] as string)
          : undefined;

      const rawVal =
        candidateValueFromCustom ?? candidateValueFromFieldKey ?? candidateValueFromDocFieldKey ?? '';
      const val = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal).trim();

      nextCustomFieldValues[masterBox.id] = val;
      mappedDocIds.add(candidateId ?? '');

      if (masterBox.fieldKey) {
        nextDraft[masterBox.fieldKey] = val;
      }
    }

    const orphanCount = docBoxes.filter((b) => b.id && !mappedDocIds.has(b.id)).length;
    return { nextDraft, orphanCount };
  };

  /** Abre el drawer móvil de plantilla: ofrece recuperar borrador de emergencia (m6) y aplica sync ADMIN. */
  const openMobilePdfTemplateDrawer = () => {
    if (!selectedDoc || !isPdfDocType(selectedDoc.type as DocType)) return;
    if (templateConfigLoading) {
      toast('Cargando plantilla…', 'info');
      return;
    }
    const docPdfType = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
    const docId = selectedDoc.id;
    templateDrawerDocIdRef.current = docId;
    templateEditorReturnToDocOpenRef.current = mobileDocOpen;

    let draft: Record<string, unknown> = pdfFormDraft;
    let master: TemplateConfigState | null = templateConfigByType[docPdfType] ?? null;

    const emergency = readEmergencyDraftFromStorage(docId);
    if (
      emergency &&
      emergency.pdfDocType === docPdfType &&
      (emergency.userId == null || emergency.userId === currentUserId) &&
      Date.now() - emergency.timestamp < EMERGENCY_PDF_DRAFT_TTL_MS
    ) {
      const mins = Math.max(1, Math.round((Date.now() - emergency.timestamp) / 60000));
      if (
        window.confirm(
          `Hay un borrador de emergencia de esta plantilla (~${mins} min). ¿Recuperarlo?`
        )
      ) {
        draft = deepCloneJson(emergency.content);
        setPdfFormDraft(draft);
        if (isAdmin && emergency.templateConfigSnapshot) {
          master = emergency.templateConfigSnapshot;
          setTemplateConfigByType((prev) => ({
            ...prev,
            [docPdfType]: emergency.templateConfigSnapshot as TemplateConfigState,
          }));
        }
      }
    }

    if (isAdmin && master) {
      const { nextDraft, orphanCount } = syncAdminDraftWithMaster(draft, master);
      adminMasterSyncAppliedForDocIdRef.current = docId;
      if (orphanCount > 0) {
        toast('Algunas cajas del diseño anterior no existen en el master y fueron ignoradas.', 'info');
      }
      setPdfFormDraft(nextDraft);
      templateEditorDraftSnapshotRef.current = deepCloneJson(nextDraft);
      templateEditorTemplateConfigSnapshotRef.current = deepCloneJson(master);
    } else {
      templateEditorDraftSnapshotRef.current = deepCloneJson(draft);
    }

    setTemplateEditorMobileOpen(true);
  };

  const closeEmbeddedTemplateEditor = useCallback(() => {
    templateEditorCloseAfterSaveRef.current = false;
    setTemplateEditorMobileOpen(false);
    if (isMobile) setMobileDocOpen(templateEditorReturnToDocOpenRef.current);
  }, [isMobile]);

  const setDocWorkflowStatus = useCallback((docId: string, status: WorkflowStatus) => {
    setWorkflowStatusByDocId((prev) => ({ ...prev, [docId]: status }));
  }, []);

  const handleAddReminder = useCallback(() => {
    const title = reminderDraftTitle.trim();
    const dueAt = reminderDraftDueAt.trim();
    if (!title) {
      toast('Escribe un título para el recordatorio.', 'error');
      return;
    }
    if (!dueAt) {
      toast('Selecciona fecha y hora para la alarma.', 'error');
      return;
    }
    const dueTs = new Date(dueAt).getTime();
    if (!Number.isFinite(dueTs)) {
      toast('Fecha/hora inválida para el recordatorio.', 'error');
      return;
    }
    setReminders((prev) => [
      {
        id: crypto.randomUUID(),
        title,
        dueAt: new Date(dueTs).toISOString(),
        docId: reminderDraftDocId === 'none' ? null : reminderDraftDocId,
        repeat: reminderDraftRepeat,
        sound: reminderDraftSound,
        done: false,
        notifiedAt: null,
        snoozedUntil: null,
      },
      ...prev,
    ]);
    setReminderDraftTitle('');
    setReminderDraftDueAt('');
    setReminderDraftDocId('none');
    setReminderDraftRepeat('none');
    setReminderDraftSound('beep');
    toast('Recordatorio programado.', 'success');
  }, [reminderDraftTitle, reminderDraftDueAt, reminderDraftDocId, reminderDraftRepeat, reminderDraftSound, toast]);

  // m6: autosave de emergencia mientras el drawer móvil está abierto.
  useEffect(() => {
    if (!templateEditorMobileOpen || !selectedDoc?.id) return;
    if (!isPdfDocType(selectedDoc.type as DocType)) return;
    const docId = selectedDoc.id;
    const pdfKind = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
    const persist = () => {
      writeEmergencyDraftToStorage({
        documentId: docId,
        userId: currentUserId,
        timestamp: Date.now(),
        content: deepCloneJson(pdfFormDraftRef.current),
        pdfDocType: pdfKind,
        ...(isAdmin ? { templateConfigSnapshot: templateConfigByTypeRef.current[pdfKind] ?? null } : {}),
      });
    };
    persist();
    const tick = window.setInterval(persist, 5000);
    return () => window.clearInterval(tick);
  }, [templateEditorMobileOpen, selectedDoc?.id, selectedDoc?.type, currentUserId, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedDoc) return;
    if (!pdfDocType) return;
    if (!effectiveTemplateConfigForPdf) return;

    const docId = selectedDoc.id;
    if (adminMasterSyncAppliedForDocIdRef.current === docId) return;

    // Importante: usamos updater funcional para que tome el draft “actual” (el que ya haya sido
    // inicializado por el efecto que mezcla `selectedDoc.content`). Esto evita que un doc nuevo
    // herede valores del doc anterior.
    setPdfFormDraft((prev) => {
      const { nextDraft, orphanCount } = syncAdminDraftWithMaster(prev, effectiveTemplateConfigForPdf);
      adminMasterSyncAppliedForDocIdRef.current = docId;
      if (orphanCount > 0) {
        toast('Algunas cajas del diseño anterior no existen en el master y fueron ignoradas.', 'info');
      }
      return nextDraft;
    });
  }, [isAdmin, selectedDoc?.id, pdfDocType, effectiveTemplateConfigForPdf, toast]);

  useEffect(() => {
    if (!pdfDocType) {
      setTemplateConfigLoading(false);
      return;
    }
    let cancelled = false;
    setTemplateConfigLoading(true);
    apiFetch(`${API_BASE}/api/templates/${pdfDocType}/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { fieldPositions?: Record<string, { x: number; y: number }>; fontColor?: string; fontFamily?: string; fontSize?: number; fontBold?: boolean; fontItalic?: boolean; customBoxes?: unknown[]; defaultContent?: Record<string, unknown> } | null) => {
        if (cancelled || !data) return;
        templateConfigJustLoadedRef.current = true;
        setTemplateConfigByType((prev) => {
          const current = prev[pdfDocType];
          const currentBoxes = current?.customBoxes ?? [];
          const currentImageCount = currentBoxes.filter((b) => b.kind === 'image').length;
          const rawApi = data.customBoxes as unknown;
          const apiBoxes: CustomBoxDef[] = Array.isArray(rawApi)
            ? (rawApi as unknown[]).map((b) => {
                const box = b as Partial<CustomBoxDef>;
                return {
                  id: box.id ?? crypto.randomUUID(),
                  x: typeof box.x === 'number' ? box.x : 0,
                  y: typeof box.y === 'number' ? box.y : 0,
                  width: typeof box.width === 'number' ? box.width : 0.3,
                  height: typeof box.height === 'number' ? box.height : 0.05,
                  kind: box.kind,
                  fieldKey: box.fieldKey,
                  semantic: box.semantic,
                  backgroundColor: box.backgroundColor,
                  singleLine: box.singleLine,
                  fontSize: box.fontSize,
                  fontColor: box.fontColor,
                  fontFamily: box.fontFamily,
                  fontBold: box.fontBold,
                  fontItalic: box.fontItalic,
                };
              })
            : [];
          const apiImageCount = apiBoxes.filter((b) => b.kind === 'image').length;
          if (currentImageCount > apiImageCount && currentImageCount > 0) {
            return prev;
          }
          const prevEntry = prev[pdfDocType];
          const fromApi =
            data.defaultContent != null && typeof data.defaultContent === 'object' && !Array.isArray(data.defaultContent)
              ? data.defaultContent
              : undefined;
          const defaultContent = fromApi ?? prevEntry?.defaultContent;
          return {
            ...prev,
            [pdfDocType]: {
              fieldPositions: data.fieldPositions ?? {},
              fontColor: data.fontColor ?? '#000000',
              fontFamily: data.fontFamily ?? 'Helvetica',
              fontSize: data.fontSize ?? 11,
              fontBold: data.fontBold ?? false,
              fontItalic: data.fontItalic ?? false,
              customBoxes: apiBoxes,
              ...(defaultContent ? { defaultContent } : {}),
            },
          };
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTemplateConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, [pdfDocType]);

  async function handleCreate(
    type: DocType,
    subgroupId?: string,
    initialContentOverride?: Record<string, unknown>
  ) {
    if (!workspaceId) {
      setError('Selecciona un workspace en la barra lateral para poder crear documentos.');
      return;
    }
    const initialContent = initialContentOverride ?? getInitialContentForType(type);
    const title = type === 'text' ? 'Nuevo doc' : type === 'sheet' ? 'Nueva hoja' : getDocTypeTitle(type);

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/docs`, {
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
      if (isMobile) setMobileDocOpen(true);
      setNewDocDraft(null);
      if (subgroupId) {
        setSubgroupAssignments((prev) => ({ ...prev, [created.id]: subgroupId }));
        saveDocGroupsToApi(customGroups, assignments, subgroupsByType, { ...subgroupAssignments, [created.id]: subgroupId });
      }
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

  // Si se dispara desde una columna de Docs/Excel, crear y abrir el doc en Vista general y recordar enlace para al guardar.
  // Además, si la plantilla PDF tiene cuadros marcados como Elemento/Folio, auto-rellenarlos con los datos del tablero.
  useEffect(() => {
    if (!workspaceId || !initialCreateFromBoard) return;
    const { type, boardId, itemId, columnId } = initialCreateFromBoard;
    const key = `${type}|${boardId}|${itemId}|${columnId}`;
    if (lastCreateFromBoardKeyRef.current === key) {
      return;
    }
    lastCreateFromBoardKeyRef.current = key;
    const linkType =
      type === 'sheet'
        ? 'sheet'
        : type === 'cotizacion'
        ? 'cotizacion'
        : type === 'levantamiento'
        ? 'levantamiento'
        : 'hoja_trabajo';
    setLinkToBoardItem({ boardId, itemId, columnId, type: linkType });
    setViewMode('overview');

    const run = async () => {
      let initialContentOverride: Record<string, unknown> | undefined;

      try {
        // Solo aplica auto-relleno cuando es un doc PDF basado en plantilla
        if (isPdfDocType(type)) {
          // 1) Obtener datos del elemento (nombre y folio) desde el tablero
          const boardRes = await apiFetch(`${API_BASE}/api/boards/${boardId}`);
          if (!boardRes.ok) throw new Error('No se pudo cargar el tablero');
          const board = (await boardRes.json()) as {
            groups: Array<{
              id: string;
              items: Array<{ id: string; name: string; columnValues: Array<{ columnId: string; value: string }> }>;
            }>;
            columns: Array<{ id: string; title: string }>;
          };

          const allItems =
            board.groups?.flatMap((g) => g.items ?? []) ?? [];
          const item = allItems.find((it) => it.id === itemId);

          const elemento = item?.name ?? '';
          let folio = '';

          if (item) {
            const folioCol = board.columns?.find((c) => String(c.title).trim().toLowerCase() === 'folio');
            if (folioCol) {
              const cv = item.columnValues?.find((v) => v.columnId === folioCol.id);
              if (cv?.value) folio = String(cv.value).trim();
            }
          }

          // 2) Obtener la plantilla para saber qué cuadros son Elemento/Folio
          const pdfType = type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
          let tmpl = templateConfigByType[pdfType];
          if (!tmpl) {
            const res = await apiFetch(`${API_BASE}/api/templates/${pdfType}/config`);
            if (res.ok) {
              const data = await res.json();
              const dc =
                data.defaultContent != null && typeof data.defaultContent === 'object' && !Array.isArray(data.defaultContent)
                  ? (data.defaultContent as Record<string, unknown>)
                  : undefined;
              tmpl = {
                fieldPositions: data.fieldPositions ?? {},
                fontColor: data.fontColor ?? '#000000',
                fontFamily: data.fontFamily ?? 'Helvetica',
                fontSize: data.fontSize ?? 11,
                fontBold: data.fontBold ?? false,
                fontItalic: data.fontItalic ?? false,
                customBoxes: Array.isArray(data.customBoxes) ? data.customBoxes : [],
                ...(dc ? { defaultContent: dc } : {}),
              };
              setTemplateConfigByType((prev) => ({ ...prev, [pdfType]: tmpl! }));
            }
          }

          const base = mergeInitialPdfContentWithMasterDefaults(type, tmpl?.defaultContent);
          const customValues: Record<string, string> = {
            ...(((base as { customFieldValues?: Record<string, string> }).customFieldValues as Record<string, string>) ?? {}),
          };

          if (tmpl?.customBoxes && (elemento || folio)) {
            const elementBox = tmpl.customBoxes.find((b) => b.semantic === 'element');
            const folioBox = tmpl.customBoxes.find((b) => b.semantic === 'folio');
            if (elementBox && elemento) {
              customValues[elementBox.id] = elemento;
            }
            if (folioBox && folio) {
              customValues[folioBox.id] = folio;
            }
          }

          initialContentOverride = {
            ...base,
            ...(Object.keys(customValues).length > 0 ? { customFieldValues: customValues } : {}),
          };
        }
      } catch (e) {
        console.error('Error preparando contenido inicial desde tablero', e);
      }
      // No crear documento en el servidor: solo abrir borrador. El doc se crea al hacer clic en Guardar
      const initialContent = initialContentOverride ?? getInitialContentForType(type);
      beginNewDocDraft(type);
      setPdfFormDraft(initialContent as Record<string, unknown>);
      if (type === 'sheet') {
        const table = (initialContent as { table?: string[][] }).table;
        setTableDraft(Array.isArray(table) ? table : [['']]);
      } else if (type === 'text') {
        setTextDraft((initialContent as { text?: string })?.text ?? '');
        setHeaderImageUrlDraft((initialContent as { headerImageUrl?: string })?.headerImageUrl ?? '');
      }
      onConsumeInitialCreateFromBoard?.();
      lastCreateFromBoardKeyRef.current = null;
    };

    run();
  }, [workspaceId, initialCreateFromBoard]);

  // Abrir un doc por id (desde clic en celda del tablero con doc vinculado)
  useEffect(() => {
    if (!initialOpenDocId) return;
    setSelectedId(initialOpenDocId);
    setViewMode('overview');
    onConsumeInitialOpenDocId?.();
  }, [initialOpenDocId, onConsumeInitialOpenDocId]);

  useEffect(() => {
    if (!initialCreateDocType) return;
    createFromExploreFlow(initialCreateDocType);
    onConsumeInitialCreateDocType?.();
  }, [initialCreateDocType, onConsumeInitialCreateDocType, createFromExploreFlow]);

  const [overwriteDialog, setOverwriteDialog] = useState<{
    mode: 'update' | 'create';
    title: string;
    message: string;
    action: 'saveExisting' | 'saveNew';
  } | null>(null);
  const overwriteActionRef = useRef<(() => Promise<void> | void) | null>(null);

  const runOverwriteAction = async () => {
    const fn = overwriteActionRef.current;
    overwriteActionRef.current = null;
    setOverwriteDialog(null);
    if (fn) {
      await fn();
    }
    if (templateEditorCloseAfterSaveRef.current) {
      templateEditorCloseAfterSaveRef.current = false;
      closeEmbeddedTemplateEditor();
    }
  };

  const performSaveExisting = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    setError(null);
    try {
      let content: DocContent;
      if (selectedDoc.type === 'sheet') {
        content = { table: tableDraft, cellStyles: cellStylesDraft };
      } else if (isPdfDocType(selectedDoc.type as DocType)) {
        // Incluir customBoxes y fuentes en el contenido del doc para que cualquier usuario vea la misma plantilla al abrirlo
        const docType = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
        const config = templateConfigByType[docType];
        const draftCustomBoxes = Array.isArray(pdfFormDraft.customBoxes) ? pdfFormDraft.customBoxes : [];
        const shouldFillTemplateDefaults = draftCustomBoxes.length === 0;
        content = {
          ...pdfFormDraft,
          ...(config && shouldFillTemplateDefaults && Array.isArray(config.customBoxes)
            ? {
                customBoxes: config.customBoxes,
                globalFontColor: config.fontColor,
                globalFontFamily: config.fontFamily,
                globalFontSize: config.fontSize,
                globalFontBold: config.fontBold,
                globalFontItalic: config.fontItalic,
                fieldPositions: config.fieldPositions,
              }
            : {}),
        } as DocContent;
      } else {
        content = { text: textDraft, headerImageUrl: headerImageUrlDraft };
      }
      const res = await apiFetch(`${API_BASE}/api/docs/${selectedDoc.id}`, {
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
      if (isPdfDocType(selectedDoc.type as DocType) && data.content != null) {
        try {
          const savedContent = typeof data.content === 'string' ? JSON.parse(data.content as string) : (data.content as Record<string, unknown>);
          if (savedContent && typeof savedContent === 'object') {
            skipNextPdfDraftSyncFromParsed.current = true;
            setPdfFormDraft((prev) => ({ ...prev, ...savedContent }));
          }
        } catch (_) {}
      }
      if (linkToBoardItem) {
        await linkDocToBoardItem({
          boardId: linkToBoardItem.boardId,
          itemId: linkToBoardItem.itemId,
          columnId: linkToBoardItem.columnId,
          type: linkToBoardItem.type,
          docId: selectedDoc.id,
        });
        setLinkToBoardItem(null);
      }
      toast('Documento guardado', 'success');
      if (isPdfDocType(selectedDoc.type as DocType)) {
        clearEmergencyDraftFromStorage(selectedDoc.id);
      }
    } catch (e) {
      console.error('Error saving doc', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el documento.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    // 1) Documento existente -> flujo de sobrescritura
    if (selectedDoc) {
      overwriteActionRef.current = performSaveExisting;
      setOverwriteDialog({
        mode: 'update',
        title: selectedDoc.title || 'Sin título',
        message: '¿Deseas sobreescribir este documento con los cambios actuales?',
        action: 'saveExisting',
      });
      return;
    }

    // 2) Documento nuevo (newDocDraft) -> reutilizar popup de "Guardar como"
    if (newDocDraft) {
      // Nombre base: título del draft
      let baseTitle = newDocDraft.title || 'Nuevo doc';
      // Si es una plantilla PDF creada desde tablero y hay folio, añadirlo al nombre
      const docType = newDocDraft.type;
      if (isPdfDocType(docType as DocType)) {
        const cfg = templateConfigByType[docType as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'];
        const folioBox = cfg?.customBoxes?.find((b) => b.semantic === 'folio');
        const customValues =
          ((pdfFormDraft as { customFieldValues?: Record<string, string> }).customFieldValues as
            | Record<string, string>
            | undefined) ?? {};
        const folioVal = folioBox ? (customValues[folioBox.id] || '').trim() : '';
        if (folioVal) {
          baseTitle = folioVal;
        }
      }
      setSaveModal({ mode: 'new' });
      setSaveModalTitle(baseTitle);
      setSaveModalGroupId('');
      setSaveModalSubgroupId('');
    }
  };

  const handleSaveTemplateConfig = async (configOverride?: TemplateConfigState) => {
    if (!currentUser || !isAdmin || !pdfDocType) return;
    const config = configOverride ?? templateConfigByType[pdfDocType];
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
      const res = await apiFetch(`${API_BASE}/api/templates/${pdfDocType}/config?userId=${encodeURIComponent(currentUser.id)}`, {
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

  const handleSaveTemplateConfigForKind = async (
    kind: 'cotizacion' | 'levantamiento' | 'hoja_trabajo',
    configOverride?: TemplateConfigState,
    /** Texto/contenido por defecto para docs nuevos (lo editado en el master). */
    defaultContentSnapshot?: Record<string, unknown> | null
  ) => {
    if (!currentUser || !isAdmin) return;
    const config = configOverride ?? templateConfigByType[kind];
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
        ...(defaultContentSnapshot != null && typeof defaultContentSnapshot === 'object' && !Array.isArray(defaultContentSnapshot)
          ? { defaultContent: defaultContentSnapshot }
          : {}),
      };
      const res = await apiFetch(
        `${API_BASE}/api/templates/${kind}/config?userId=${encodeURIComponent(currentUser.id)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': currentUser.id,
            'X-User-Username': currentUser.username ?? '',
          },
          body: JSON.stringify(toSave),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === 'string' ? data.error : 'Error al guardar configuración de la plantilla');
      }

      // Asegurar que el master en memoria quede sincronizado (incl. textos por defecto).
      setTemplateConfigByType((prev) => ({
        ...prev,
        [kind]: {
          ...config,
          ...(defaultContentSnapshot != null && typeof defaultContentSnapshot === 'object' && !Array.isArray(defaultContentSnapshot)
            ? { defaultContent: defaultContentSnapshot }
            : {}),
        },
      }));
    } catch (e) {
      console.error('Error saving template config', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar la configuración de la plantilla.');
    } finally {
      setSavingTemplateConfig(false);
    }
  };

  const loadTemplateMasterDraftForKind = useCallback(
    async (kind: 'cotizacion' | 'levantamiento' | 'hoja_trabajo') => {
      const cfgFromState = templateConfigByType[kind];
      try {
        let config: TemplateConfigState | null = cfgFromState ?? null;
        if (!config) {
          const res = await apiFetch(`${API_BASE}/api/templates/${kind}/config`);
          if (!res.ok) throw new Error('No se pudo cargar la configuración del master');
          const data: {
            fieldPositions?: Record<string, { x: number; y: number }>;
            fontColor?: string;
            fontFamily?: string;
            fontSize?: number;
            fontBold?: boolean;
            fontItalic?: boolean;
            customBoxes?: unknown[];
            defaultContent?: Record<string, unknown>;
          } = await res.json();

          const rawApi = data.customBoxes as unknown;
          const apiBoxes: CustomBoxDef[] = Array.isArray(rawApi)
            ? (rawApi as unknown[]).map((b) => {
                const box = b as Partial<CustomBoxDef>;
                return {
                  id: box.id ?? crypto.randomUUID(),
                  x: typeof box.x === 'number' ? box.x : 0,
                  y: typeof box.y === 'number' ? box.y : 0,
                  width: typeof box.width === 'number' ? box.width : 0.3,
                  height: typeof box.height === 'number' ? box.height : 0.05,
                  kind: box.kind,
                  fieldKey: box.fieldKey,
                  semantic: box.semantic,
                  backgroundColor: box.backgroundColor,
                  singleLine: box.singleLine,
                  fontSize: box.fontSize,
                  fontColor: box.fontColor,
                  fontFamily: box.fontFamily,
                  fontBold: box.fontBold,
                  fontItalic: box.fontItalic,
                };
              })
            : [];

          const dcMaster =
            data.defaultContent != null && typeof data.defaultContent === 'object' && !Array.isArray(data.defaultContent)
              ? data.defaultContent
              : undefined;
          config = {
            fieldPositions: data.fieldPositions ?? {},
            fontColor: data.fontColor ?? '#000000',
            fontFamily: data.fontFamily ?? 'Helvetica',
            fontSize: data.fontSize ?? 11,
            fontBold: data.fontBold ?? false,
            fontItalic: data.fontItalic ?? false,
            customBoxes: apiBoxes,
            ...(dcMaster ? { defaultContent: dcMaster } : {}),
          };

          // Mantener también el cache en el estado principal.
          setTemplateConfigByType((prev) => ({
            ...prev,
            [kind]: config!,
          }));
        }

        setTemplateMasterDocType(kind);
        setTemplateMasterDraft(
          typeof structuredClone === 'function'
            ? structuredClone(config!)
            : (JSON.parse(JSON.stringify(config)) as TemplateConfigState)
        );
        setTemplateMasterValue(
          mergeInitialPdfContentWithMasterDefaults(kind as DocType, config!.defaultContent) as Record<string, unknown>
        );
      } catch (e) {
        console.error('Error al cargar master', e);
        toast('Error al cargar el master de plantilla.', 'error');
      }
    },
    [templateConfigByType, toast]
  );

  /** Abre una ventana con la vista 1:1 del documento para que el usuario guarde como PDF (captura como imagen). */
  const handleGeneratePdf = () => {
    if (!selectedDoc || !isPdfDocType(selectedDoc.type as DocType)) return;
    const docType = selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
    const config = templateConfigByType[docType];
    const { contentToSend } = buildPdfContent({
      docType,
      parsedContent: parsed as Record<string, unknown>,
      pdfFormDraft,
      templateConfig: config,
      selectedDocId: selectedDoc.id,
    });
    const payload = {
      docType,
      content: contentToSend,
      templateConfig: effectiveTemplateConfigForPdf ?? config ?? null,
      documentTitle: selectedDoc?.title ?? docType,
    };
    try {
      localStorage.setItem('sunday_pdf_preview', JSON.stringify(payload));
      const url = `${window.location.origin}/docs/pdf-preview?t=${Date.now()}`;
      requestAnimationFrame(() => {
        window.open(url, '_blank', 'noopener,noreferrer,width=920,height=960,scrollbars=yes');
      });
    } catch (e) {
      console.error('PDF preview open error', e);
      setError(e instanceof Error ? e.message : 'No se pudo abrir la vista para PDF.');
    }
  };

  const handleDeleteClick = (id: string) => setDeleteConfirm({ docId: id });

  /** Seleccionar documento existente desde lista siempre limpia borrador nuevo. */
  const handleOpenExistingDoc = useCallback((id: string) => {
    setNewDocDraft(null);
    setSelectedId(id);
    if (isMobile) setMobileDocOpen(true);
  }, [isMobile]);

  /** En vista Lista: alias semántico para selección desde la tabla/listado. */
  const handleSelectDocInList = useCallback((id: string) => {
    handleOpenExistingDoc(id);
  }, [handleOpenExistingDoc]);

  const handleDeleteConfirm = async () => {
    const id = deleteConfirm?.docId;
    if (!id) return;
    setDeleteConfirm(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/docs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      setDocs(prev => prev.filter(d => d.id !== id));
      setSelectedId(prev => (prev === id ? null : prev));
    } catch (e) {
      console.error('Error deleting doc', e);
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el documento.');
    }
  };

  const ensureTableSize = useCallback((rows: number, cols: number) => {
    setTableDraft(prev => {
      const next = [...prev];
      while (next.length < rows) next.push(new Array(cols).fill(''));
      return next.map(r => {
        const row = [...r];
        while (row.length < cols) row.push('');
        return row;
      });
    });
  }, []);

  const pushSheetHistory = useCallback(() => {
    setSheetHistory(prev => ({
      past: [...prev.past.slice(-49), { table: tableDraft, cellStyles: cellStylesDraft }],
      future: [],
    }));
  }, [tableDraft, cellStylesDraft]);

  const undoSheet = useCallback(() => {
    setSheetHistory(prev => {
      if (prev.past.length === 0) return prev;
      const toRestore = prev.past[prev.past.length - 1];
      setTableDraft(toRestore.table);
      setCellStylesDraft(toRestore.cellStyles);
      return {
        past: prev.past.slice(0, -1),
        future: [{ table: tableDraft, cellStyles: cellStylesDraft }, ...prev.future],
      };
    });
  }, [tableDraft, cellStylesDraft]);

  const redoSheet = useCallback(() => {
    setSheetHistory(prev => {
      if (prev.future.length === 0) return prev;
      const toRestore = prev.future[0];
      setTableDraft(toRestore.table);
      setCellStylesDraft(toRestore.cellStyles);
      return {
        past: [...prev.past, { table: tableDraft, cellStyles: cellStylesDraft }],
        future: prev.future.slice(1),
      };
    });
  }, [tableDraft, cellStylesDraft]);

  const ensureTableSizeWithHistory = useCallback((rows: number, cols: number) => {
    pushSheetHistory();
    ensureTableSize(rows, cols);
  }, [pushSheetHistory, ensureTableSize]);

  const saveModalDocType = saveModal?.mode === 'new' ? newDocDraft?.type : saveModal?.mode === 'saveAs' ? saveModal.doc.type : null;

  const performSaveNew = async () => {
    if (!workspaceId || !saveModal) return;
    const docType = saveModalDocType;
    if (!docType) return;
    setSaving(true);
    setError(null);
    try {
      let content: DocContent;
      if (docType === 'sheet') {
        content = { table: tableDraft, cellStyles: cellStylesDraft };
      } else if (isPdfDocType(docType as DocType)) {
        const pdfType = docType as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
        const config = templateConfigByType[pdfType];
        const draftCustomBoxes = Array.isArray(pdfFormDraft.customBoxes) ? pdfFormDraft.customBoxes : [];
        const shouldFillTemplateDefaults = draftCustomBoxes.length === 0;
        content = {
          ...pdfFormDraft,
          ...(config && shouldFillTemplateDefaults && Array.isArray(config.customBoxes)
            ? {
                customBoxes: config.customBoxes,
                globalFontColor: config.fontColor,
                globalFontFamily: config.fontFamily,
                globalFontSize: config.fontSize,
                globalFontBold: config.fontBold,
                globalFontItalic: config.fontItalic,
                fieldPositions: config.fieldPositions,
              }
            : {}),
        } as DocContent;
      } else {
        content = { text: textDraft, headerImageUrl: headerImageUrlDraft };
      }
      const titleBase = saveModal.mode === 'saveAs'
        ? saveModal.doc.title
        : newDocDraft?.title ?? 'Nuevo doc';
      const title = saveModalTitle.trim() || titleBase;

      const res = await apiFetch(`${API_BASE}/api/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          title,
          type: docType,
          content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Error al guardar';
        throw new Error(msg);
      }
      const created = data as Doc;
      setDocs(prev => [created, ...prev]);
      setSelectedId(created.id);
      if (isMobile) setMobileDocOpen(true);
      setNewDocDraft(null);
      setSaveModal(null);
      const link = linkToBoardItemRef.current;
      if (link) {
        await linkDocToBoardItem({
          boardId: link.boardId,
          itemId: link.itemId,
          columnId: link.columnId,
          type: link.type,
          docId: created.id,
        });
        setLinkToBoardItem(null);
        linkToBoardItemRef.current = null;
      }
      if (saveModalGroupId) {
        setAssignments(prev => ({ ...prev, [created.id]: saveModalGroupId }));
        setSubgroupAssignments(prev =>
          saveModalSubgroupId ? { ...prev, [created.id]: saveModalSubgroupId } : prev
        );
        saveDocGroupsToApi(
          customGroups,
          { ...assignments, [created.id]: saveModalGroupId },
          subgroupsByType,
          saveModalSubgroupId ? { ...subgroupAssignments, [created.id]: saveModalSubgroupId } : subgroupAssignments
        );
      } else if (saveModalSubgroupId) {
        setSubgroupAssignments(prev => ({ ...prev, [created.id]: saveModalSubgroupId }));
        saveDocGroupsToApi(customGroups, assignments, subgroupsByType, { ...subgroupAssignments, [created.id]: saveModalSubgroupId });
      }
      toast(saveModal.mode === 'saveAs' ? `Guardado como "${title}"` : 'Documento guardado', 'success');
    } catch (e) {
      console.error('Error saving doc', e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el documento.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveModalConfirm = async () => {
    if (!workspaceId || !saveModal) return;
    const docType = saveModalDocType;
    if (!docType) return;

    let content: DocContent;
    if (docType === 'sheet') {
      content = { table: tableDraft, cellStyles: cellStylesDraft };
    } else if (isPdfDocType(docType as DocType)) {
      const pdfType = docType as 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
      const config = templateConfigByType[pdfType];
      const draftCustomBoxes = Array.isArray(pdfFormDraft.customBoxes) ? pdfFormDraft.customBoxes : [];
      const shouldFillTemplateDefaults = draftCustomBoxes.length === 0;
      content = {
        ...pdfFormDraft,
        ...(config && shouldFillTemplateDefaults && Array.isArray(config.customBoxes)
          ? {
              customBoxes: config.customBoxes,
              globalFontColor: config.fontColor,
              globalFontFamily: config.fontFamily,
              globalFontSize: config.fontSize,
              globalFontBold: config.fontBold,
              globalFontItalic: config.fontItalic,
              fieldPositions: config.fieldPositions,
            }
          : {}),
      } as DocContent;
    } else {
      content = { text: textDraft, headerImageUrl: headerImageUrlDraft };
    }
    const titleBase = saveModal.mode === 'saveAs'
      ? saveModal.doc.title
      : newDocDraft?.title ?? 'Nuevo doc';
    const title = saveModalTitle.trim() || titleBase;

    // Antes de guardar: si ya existe un documento con mismo título y tipo, abrir diálogo de sobrescritura.
    const normalizedTitle = title.trim().toLowerCase();
    const existsWithSameNameAndType = docs.some(
      (d) =>
        d.type === docType &&
        d.title.trim().toLowerCase() === normalizedTitle &&
        (saveModal.mode !== 'saveAs' || d.id !== saveModal.doc.id)
    );

    if (existsWithSameNameAndType) {
      overwriteActionRef.current = performSaveNew;
      setOverwriteDialog({
        mode: 'create',
        title: title || 'Sin título',
        message:
          'Ya existe un documento con este nombre y tipo. ¿Deseas crear otro documento igualmente?',
        action: 'saveNew',
      });
      return;
    }

    await performSaveNew();
  };

  return (
    <>
      <div className={`flex-1 flex flex-col min-h-0 ${scrollListInParent ? 'overflow-visible min-h-min' : 'overflow-hidden'}`}>
      <Dialog.Root open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[151] bg-white rounded-xl shadow-xl border border-monday-border p-5 w-[320px]">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text">Eliminar documento</Dialog.Title>
            <p className="text-[13px] text-monday-subtext mt-1">¿Eliminar este documento? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 mt-6">
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

      {/* Diálogo de confirmación de sobrescritura (integrado en la UI) */}
      <Dialog.Root
        open={!!overwriteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setOverwriteDialog(null);
            overwriteActionRef.current = null;
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[151] bg-white rounded-xl shadow-xl border border-monday-border p-5 w-[340px]">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text">
              Confirmar sobrescritura
            </Dialog.Title>
            <p className="text-[13px] text-monday-subtext mt-2">
              {overwriteDialog?.message}
            </p>
            <p className="text-[13px] font-medium text-monday-text mt-1 break-words">
              {overwriteDialog?.title}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setOverwriteDialog(null);
                  overwriteActionRef.current = null;
                }}
                className="px-3 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={runOverwriteAction}
                className="px-3 py-1.5 rounded-lg bg-monday-blue text-white text-[13px] hover:bg-monday-blue/90"
              >
                Sobrescribir
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Diálogo integrado para nombre (grupo, subgrupo, renombrar) */}
      <Dialog.Root open={!!promptDialog} onOpenChange={open => { if (!open) { setPromptDialog(null); setPromptInputValue(''); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[151] bg-white rounded-xl shadow-xl border border-monday-border p-5 w-[320px]">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text">
              {promptDialog?.type === 'renameSubgroup' && 'Nuevo nombre'}
              {promptDialog?.type === 'addGroup' && 'Nombre del grupo'}
              {promptDialog?.type === 'addSubgroup' && 'Nombre del subgrupo'}
            </Dialog.Title>
            <input
              type="text"
              value={promptInputValue}
              onChange={e => setPromptInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePromptConfirm(); if (e.key === 'Escape') { setPromptDialog(null); setPromptInputValue(''); } }}
              className="mt-3 w-full px-3 py-2 rounded-lg border border-monday-border text-[13px] text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue"
              placeholder={promptDialog?.type === 'addGroup' ? 'Ej. Mi grupo' : promptDialog?.type === 'addSubgroup' ? 'Ej. Subgrupo A' : ''}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setPromptDialog(null); setPromptInputValue(''); }}
                className="px-3 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePromptConfirm}
                disabled={!promptInputValue.trim()}
                className="px-3 py-1.5 rounded-lg bg-monday-blue text-white text-[13px] hover:bg-monday-blue/90 disabled:opacity-50 disabled:pointer-events-none"
              >
                Aceptar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Guardar (nuevo) / Guardar como: grupo, subgrupo y opcionalmente nombre */}
      <Dialog.Root
        open={!!saveModal}
        onOpenChange={(open) => {
          if (!open) {
            setSaveModal(null);
            setSaveModalTitle('');
            setSaveModalGroupId('');
            setSaveModalSubgroupId('');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[150]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[151] bg-white rounded-xl shadow-xl border border-monday-border p-5 w-[360px]">
            <Dialog.Title className="text-[15px] font-semibold text-monday-text">
              {saveModal?.mode === 'saveAs' ? 'Guardar como' : 'Guardar documento'}
            </Dialog.Title>
            <label className="mt-3 block text-[13px] text-monday-subtext">
              Nombre del documento
              <input
                type="text"
                value={saveModalTitle}
                onChange={(e) => setSaveModalTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-monday-border text-[13px] text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue"
                placeholder="Título"
              />
            </label>
            {saveModalDocType && (
              <label className="mt-3 block text-[13px] text-monday-subtext">
                Subgrupo
                <select
                  value={saveModalSubgroupId}
                  onChange={(e) => setSaveModalSubgroupId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-monday-border text-[13px] text-monday-text bg-white focus:outline-none focus:ring-2 focus:ring-monday-blue"
                >
                  <option value="">— Sin subgrupo —</option>
                  {(subgroupsByType[saveModalDocType] ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => { setSaveModal(null); setSaveModalTitle(''); setSaveModalGroupId(''); setSaveModalSubgroupId(''); }}
                className="px-3 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveModalConfirm}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-monday-blue text-white text-[13px] hover:bg-monday-blue/90 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {!(useWordMobileShell && isMobile) && (
      <div className="p-3 sm:p-4 border-b border-monday-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-[18px] sm:text-[20px] font-semibold text-monday-text flex items-center gap-2 shrink-0">
          <BookOpen size={20} className="text-monday-blue sm:w-[22px] sm:h-[22px]" />
          Documentos
        </h1>
        {!isMobile && (
          <div className="flex rounded-lg border border-monday-border overflow-x-auto scroll-touch overflow-y-hidden bg-white shrink-0 flex-nowrap">
            <button
              type="button"
              onClick={() => setViewMode('overview')}
              className={`flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-0 shrink-0 text-[13px] transition-colors touch-manipulation ${
                effectiveViewMode === 'overview' ? 'bg-monday-blue text-white' : 'text-monday-subtext hover:bg-monday-hover'
              }`}
            >
              <LayoutDashboard size={14} />
              <span className="sm:hidden">General</span>
              <span className="hidden sm:inline">Vista general</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('docs')}
              className={`flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-0 shrink-0 text-[13px] transition-colors touch-manipulation ${
                effectiveViewMode === 'docs' ? 'bg-monday-blue text-white' : 'text-monday-subtext hover:bg-monday-hover'
              }`}
            >
              <List size={14} />
              <span className="sm:hidden">Lista</span>
              <span className="hidden sm:inline">Documentos</span>
            </button>
          </div>
        )}
      </div>
      )}

      {effectiveViewMode === 'overview' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg">
          {/* Menús superiores: ocultos cuando ya hay doc/borrador abierto para evitar solaparse con el editor */}
          {!selectedDoc && !newDocDraft && (
            <div className="p-4 sm:p-6 pb-2 shrink-0">
              <div className="flex flex-wrap gap-3 sm:gap-4 justify-center sm:justify-start">
                {DOC_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!workspaceId}
                    onClick={() => {
                      createFromExploreFlow(opt.id);
                    }}
                    className="flex flex-col items-start justify-between w-full min-[400px]:w-64 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-monday-border shadow-md hover:shadow-lg hover:border-monday-blue/50 transition-all text-left disabled:opacity-60"
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
                {!isMobile && onAddTaskList && (
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
                              Se añade al panel lateral de Docs.
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
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-monday-hover text-[13px] text-monday-text"
                            onClick={onAddReminderWidget}
                            disabled={!onAddReminderWidget}
                          >
                            <BellRing size={16} className="text-monday-blue" />
                            <span>Recordatorios</span>
                          </button>
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                )}
              </div>
            </div>
          )}

          {/* Editor debajo de los menús */}
          <div className="flex-1 flex min-h-0 overflow-hidden px-4 sm:px-6 pb-4 sm:pb-6">
            <section className="flex-1 flex flex-col min-h-0 bg-monday-bg/40 rounded-xl sm:rounded-2xl border border-monday-border overflow-hidden">
              {error && (
                <div className="px-4 py-2 bg-red-50 text-red-700 text-[13px] border-b border-red-200 rounded-t-2xl">
                  {error}
                </div>
              )}

              {!selectedDoc && !newDocDraft ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="flex items-center gap-4 text-monday-subtext text-[13px] max-w-md text-left">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-monday-blue/10 text-monday-blue shrink-0">
                      <BookOpen size={28} />
                    </div>
                    <div>
                      <p className="mb-1">
                        Elige un tipo de documento arriba (texto, hoja, cotización, etc.) para comenzar.
                      </p>
                      {!isMobile && (
                        <p>
                          También puedes añadir un widget desde el bloque <span className="font-semibold">“Añadir widget”</span>.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-monday-border bg-monday-hover/30 rounded-t-2xl">
                    <div className="flex flex-col">
                      <h2 className="text-[16px] font-semibold text-monday-text truncate">
                        {selectedDoc?.title ?? newDocDraft?.title ?? 'Sin título'}
                      </h2>
                    </div>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 justify-end mt-2 sm:mt-0">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || (!selectedDoc && !newDocDraft)}
                      className="px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
                    >
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={handleGeneratePdf}
                      disabled={!selectedDoc || !isPdfDocType((selectedDoc?.type ?? '') as DocType)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover disabled:opacity-50"
                      title="Generar PDF"
                    >
                      <Download size={14} />
                      Generar PDF
                    </button>
                    {isAdmin && pdfDocType && (
                      <button
                        type="button"
                        onClick={async () => {
                          await loadTemplateMasterDraftForKind(pdfDocType);
                          setTemplateEditorMobileOpen(false);
                          setTemplateMasterEditorOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover disabled:opacity-50"
                        title="Editar el master global de plantillas (3 tipos)"
                      >
                        Master de plantillas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleGeneratePdf}
                      disabled={!selectedDoc || !isPdfDocType((selectedDoc?.type ?? '') as DocType)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover disabled:opacity-50"
                      title="Enviar"
                    >
                      <MessageCircle size={14} />
                      Enviar
                    </button>
                  </div>
                  </div>

                  {(selectedDoc && isPdfDocType(selectedDoc.type as DocType)) || (newDocDraft && isPdfDocType(newDocDraft.type)) ? (
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar scroll-touch p-2">
                      {templateConfigLoading && !(effectiveTemplateConfigForPdf?.customBoxes?.length) ? (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-sm text-gray-400">
                            Cargando plantilla...
                          </span>
                        </div>
                      ) : (
                        <PdfTemplateEditor
                          docType={(selectedDoc?.type ?? newDocDraft?.type) as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'}
                          value={pdfFormDraft}
                          onChange={setPdfFormDraft}
                          docId={selectedDoc?.id ?? ''}
                          templateConfig={effectiveTemplateConfigForPdf}
                          isAdmin={isAdmin}
                          allowBoxEditing={!isAdmin}
                          lockedOutline={isAdmin}
                          onTemplateConfigChange={
                            !isAdmin && pdfDocType
                              ? (config) =>
                                  setPdfFormDraft((prev) => {
                                    const prevFieldPositions =
                                      typeof prev.fieldPositions === 'object' && prev.fieldPositions != null && !Array.isArray(prev.fieldPositions)
                                        ? (prev.fieldPositions as Record<string, { x: number; y: number }>)
                                        : {};
                                    const prevBold = prev.globalFontBold === true || prev.globalFontBold === 'true';
                                    const prevItalic = prev.globalFontItalic === true || prev.globalFontItalic === 'true';
                                    return {
                                      ...prev,
                                      fieldPositions: config.fieldPositions ?? prevFieldPositions,
                                      globalFontColor:
                                        typeof config.fontColor === 'string'
                                          ? config.fontColor
                                          : typeof prev.globalFontColor === 'string'
                                            ? prev.globalFontColor
                                            : '#000000',
                                      globalFontFamily:
                                        typeof config.fontFamily === 'string'
                                          ? config.fontFamily
                                          : typeof prev.globalFontFamily === 'string'
                                            ? prev.globalFontFamily
                                            : 'Helvetica',
                                      globalFontSize:
                                        typeof config.fontSize === 'number'
                                          ? config.fontSize
                                          : typeof prev.globalFontSize === 'number'
                                            ? prev.globalFontSize
                                            : 11,
                                      globalFontBold: config.fontBold ?? prevBold,
                                      globalFontItalic: config.fontItalic ?? prevItalic,
                                      customBoxes: config.customBoxes ?? (Array.isArray(prev.customBoxes) ? prev.customBoxes : []),
                                    } as Record<string, unknown>;
                                  })
                              : undefined
                          }
                          onSaveTemplateConfig={undefined}
                          savingTemplateConfig={savingTemplateConfig}
                        />
                      )}
                    </div>
                  ) : (selectedDoc?.type ?? newDocDraft?.type) === 'sheet' ? (
                    <ExcelLikeSheet
                      tableDraft={tableDraft}
                      setTableDraft={setTableDraft}
                      ensureTableSize={ensureTableSizeWithHistory}
                      cellStyles={cellStylesDraft}
                      setCellStyles={setCellStylesDraft}
                      documentTitle={selectedDoc?.title ?? newDocDraft?.title ?? 'Nueva hoja'}
                      pushSheetHistory={pushSheetHistory}
                      undoSheet={undoSheet}
                      redoSheet={redoSheet}
                    />
                  ) : (
                    <WordLikeEditor
                      key={selectedId ?? 'new-draft'}
                      textDraft={textDraft}
                      setTextDraft={setTextDraft}
                      headerImageUrl={headerImageUrlDraft}
                      setHeaderImageUrl={setHeaderImageUrlDraft}
                      documentTitle={selectedDoc?.title ?? newDocDraft?.title ?? 'Documento'}
                      enableMobileViewEditMode={useWordMobileShell && isMobile}
                    />
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      ) : useEmbeddedTemplateEditor && selectedDoc ? (
        <div ref={templateEditorDialogRef} className="flex-1 flex flex-col min-h-0 bg-monday-bg overflow-hidden">
          <div className="shrink-0 flex flex-col gap-2 px-4 py-2 border-b border-monday-border bg-white">
            <div className="min-w-0 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[11px] leading-4 text-monday-subtext truncate">Documentos / Editar plantilla</div>
                <div className="text-[15px] font-semibold text-monday-text truncate">Editar plantilla</div>
              </div>
            </div>
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (templateEditorDraftSnapshotRef.current) {
                    setPdfFormDraft(templateEditorDraftSnapshotRef.current);
                  }
                  if (templateEditorTemplateConfigSnapshotRef.current && isAdmin && pdfDocType) {
                    setTemplateConfigByType((prev) => ({
                      ...prev,
                      [pdfDocType]: templateEditorTemplateConfigSnapshotRef.current as TemplateConfigState,
                    }));
                  }
                }}
                className="min-h-[44px] px-2.5 rounded-lg border border-monday-border bg-white text-[12px] sm:text-[13px] text-monday-text hover:bg-monday-hover touch-manipulation w-full"
              >
                Deshacer
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateEditorDraftSnapshotRef.current) {
                    setPdfFormDraft(templateEditorDraftSnapshotRef.current);
                  }
                  if (templateEditorTemplateConfigSnapshotRef.current && isAdmin && pdfDocType) {
                    setTemplateConfigByType((prev) => ({
                      ...prev,
                      [pdfDocType]: templateEditorTemplateConfigSnapshotRef.current as TemplateConfigState,
                    }));
                  }
                  closeEmbeddedTemplateEditor();
                }}
                className="min-h-[44px] px-2.5 rounded-lg border border-monday-border bg-white text-[12px] sm:text-[13px] text-monday-text hover:bg-monday-hover touch-manipulation w-full"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => handleGeneratePdf()}
                disabled={!selectedDoc || !isPdfDocType(selectedDoc.type as DocType)}
                className="min-h-[44px] px-2.5 rounded-lg border border-monday-border bg-white text-[12px] sm:text-[13px] text-monday-text hover:bg-monday-hover disabled:opacity-60 touch-manipulation w-full"
              >
                Generar PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  templateEditorCloseAfterSaveRef.current = true;
                  handleSave();
                }}
                className="min-h-[44px] px-2.5 rounded-lg bg-monday-blue text-white text-[12px] sm:text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60 touch-manipulation w-full"
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden relative pb-3">
            <div className="p-0 relative h-full">
              <PdfTemplateEditor
                key={selectedDoc.id}
                docType={selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'}
                value={pdfFormDraft}
                onChange={setPdfFormDraft}
                docId={selectedDoc.id}
                templateConfig={effectiveTemplateConfigForPdf}
                isAdmin={isAdmin}
                allowBoxEditing={!isAdmin}
                lockedOutline={isAdmin}
                compactPadding
                renderFormatBarExternally={false}
                blueprintMode={false}
                onTemplateConfigChange={
                  !isAdmin && pdfDocType
                    ? (config) => {
                        setPdfFormDraft((prev) => {
                          const prevFieldPositions =
                            typeof prev.fieldPositions === 'object' && prev.fieldPositions != null && !Array.isArray(prev.fieldPositions)
                              ? (prev.fieldPositions as Record<string, { x: number; y: number }>)
                              : {};
                          const prevBold = prev.globalFontBold === true || prev.globalFontBold === 'true';
                          const prevItalic = prev.globalFontItalic === true || prev.globalFontItalic === 'true';
                          return {
                            ...prev,
                            fieldPositions: config.fieldPositions ?? prevFieldPositions,
                            globalFontColor:
                              typeof config.fontColor === 'string'
                                ? config.fontColor
                                : typeof prev.globalFontColor === 'string'
                                  ? prev.globalFontColor
                                  : '#000000',
                            globalFontFamily:
                              typeof config.fontFamily === 'string'
                                ? config.fontFamily
                                : typeof prev.globalFontFamily === 'string'
                                  ? prev.globalFontFamily
                                  : 'Helvetica',
                            globalFontSize:
                              typeof config.fontSize === 'number'
                                ? config.fontSize
                                : typeof prev.globalFontSize === 'number'
                                  ? prev.globalFontSize
                                  : 11,
                            globalFontBold: config.fontBold ?? prevBold,
                            globalFontItalic: config.fontItalic ?? prevItalic,
                            customBoxes: config.customBoxes ?? (Array.isArray(prev.customBoxes) ? prev.customBoxes : []),
                          } as Record<string, unknown>;
                        });
                      }
                    : undefined
                }
                onSaveTemplateConfig={undefined}
                savingTemplateConfig={savingTemplateConfig}
              />
            </div>
          </div>
        </div>
      ) : (
      <div className={`flex-1 flex flex-col md:flex-row bg-monday-bg min-h-0 ${scrollListInParent ? 'overflow-visible min-h-min' : 'overflow-hidden'}`}>
        {/* Panel izquierdo: lista de docs. En móvil solo visible cuando mobileDocOpen === false. */}
        {(!isMobile || !mobileDocOpen) && (
        <div
          className={`flex-1 min-h-0 px-4 sm:px-6 py-4 sm:py-5 min-w-0 overscroll-contain ${useWordMobileShell ? 'pb-44' : 'pb-28'} ${scrollListInParent ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch'}`}
          style={scrollListInParent ? undefined : { WebkitOverflowScrolling: 'touch' }}
        >
          {!workspaceId && (
            <div className="p-4 text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg max-w-md">
              Selecciona un workspace en la barra lateral para ver y crear documentos.
            </div>
          )}
          {useWordMobileShell ? (
            <>
              {wordShellTab === 'inicio' && (
                <DocsHomeFeed
                  docs={workspaceId ? docsForDisplay : []}
                  selectedId={selectedId}
                  onOpenDoc={handleOpenExistingDoc}
                  onDeleteDoc={handleDeleteClick}
                  loading={!!workspaceId && loading}
                />
              )}
              {wordShellTab === 'crear' && (
                <DocsCreateGallery
                  workspaceId={workspaceId}
                  saving={saving}
                  error={error}
                  onCreate={async (type) => {
                    await handleCreate(type);
                    setWordShellTab('inicio');
                  }}
                />
              )}
              {wordShellTab === 'explorar' && (
                <>
                  {workspaceId && loading && (
                    <div className="p-4 text-[13px] text-monday-subtext">Cargando documentos…</div>
                  )}
                  {workspaceId && !loading && (
                    <>
                      {DOC_TYPE_OPTIONS.map((opt) => {
                        const groupDocs = docsForDisplay.filter((d) => d.type === opt.id);
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
                            onSelectDoc={handleOpenExistingDoc}
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
                            onRequestRenameSubgroup={openRenameSubgroupPrompt}
                            onRemoveSubgroup={removeSubgroup}
                            onAssignSubgroup={assignDocToSubgroup}
                          />
                        );
                      })}
                      {customGroups.map((grp) => {
                        const groupDocs = docsForDisplay.filter((d) => assignments[d.id] === grp.id);
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
                            onSelectDoc={handleOpenExistingDoc}
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
                  {!workspaceId && (
                    <p className="text-center text-[13px] text-zinc-500 py-8 px-2">
                      Selecciona un workspace para explorar documentos por grupos.
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
          {workspaceId && loading && (
            <div className="p-4 text-[13px] text-monday-subtext">Cargando documentos…</div>
          )}
          {workspaceId && !loading && (
            <>
              {/* Widgets visibles solo en panel lateral de Docs (no en contenido principal). */}

              {DOC_TYPE_OPTIONS.map((opt) => {
                const groupDocs = docsForDisplay.filter((d) => d.type === opt.id);
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
                    onSelectDoc={handleOpenExistingDoc}
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
                    onRequestRenameSubgroup={openRenameSubgroupPrompt}
                    onRemoveSubgroup={removeSubgroup}
                    onAssignSubgroup={assignDocToSubgroup}
                  />
                );
              })}
              {customGroups.map((grp) => {
                const groupDocs = docsForDisplay.filter((d) => assignments[d.id] === grp.id);
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
                    onSelectDoc={handleOpenExistingDoc}
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
            </>
          )}
        </div>
        )}

        {/* Panel derecho: visualizador (solo lectura). En móvil solo visible cuando mobileDocOpen === true. */}
        {(!isMobile || mobileDocOpen) && (
        <section className="flex-1 flex flex-col min-w-0 min-h-0 w-full md:max-w-[60%] border-t md:border-t-0 md:border-l border-monday-border overflow-hidden bg-white">
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
              <p className="text-[15px] font-medium text-monday-text">Selecciona un documento</p>
              <p className="text-[13px] mt-1 max-w-sm text-center">
                Haz clic en una fila de la tabla para ver el documento. Para editarlo, usa el botón «Editar en Docs» o «Editar en Sheets» o cambia a Vista general.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-monday-border bg-monday-hover/30 flex-wrap gap-2 min-h-0 shrink-0">
                <h2 className="text-[14px] sm:text-[16px] font-semibold text-monday-text truncate min-w-0 flex-1 sm:flex-none">
                  {selectedDoc.title || 'Sin título'}
                </h2>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  {!isMobile && (
                  <select
                    value={getDocWorkflowStatus(selectedDoc)}
                    onChange={(e) => setDocWorkflowStatus(selectedDoc.id, e.target.value as WorkflowStatus)}
                    className="px-2 py-1.5 min-h-[44px] sm:min-h-0 rounded-monday border border-monday-border text-[12px] text-monday-subtext bg-white touch-manipulation"
                    title="Estado de flujo del documento"
                  >
                    <option value="por_hacer">Por hacer</option>
                    <option value="en_progreso">En progreso</option>
                    <option value="listo_pdf">Listo para PDF</option>
                  </select>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectedId(null); if (isMobile) setMobileDocOpen(false); }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-monday border border-monday-border text-[12px] text-monday-subtext hover:bg-monday-hover touch-manipulation"
                  >
                    <X size={14} className="sm:w-3 sm:h-3" />
                    <span>Cerrar</span>
                  </button>
                  {isPdfDocType(selectedDoc.type as DocType) ? (
                    <>
                      <button
                        type="button"
                        onClick={handleGeneratePdf}
                        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover"
                      >
                        <Download size={14} />
                        Generar PDF
                      </button>
                      <button
                        type="button"
                        onClick={handleGeneratePdf}
                        title="Generar PDF"
                        className="sm:hidden inline-flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-monday border border-monday-border text-monday-text hover:bg-monday-hover touch-manipulation"
                      >
                        <Download size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isMobile) {
                            openMobilePdfTemplateDrawer();
                          } else {
                            setViewMode('overview');
                          }
                        }}
                        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90"
                      >
                        <Pencil size={14} />
                        <span>Editar plantilla</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isMobile) {
                            openMobilePdfTemplateDrawer();
                          } else {
                            setViewMode('overview');
                          }
                        }}
                        title="Editar plantilla"
                        className="sm:hidden inline-flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-monday bg-monday-blue text-white hover:bg-monday-blue/90 touch-manipulation"
                      >
                        <Pencil size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="hidden sm:flex items-center gap-2">
                        {selectedDoc && (
                          <button
                            type="button"
                            onClick={() => {
                              setSaveModal({ mode: 'saveAs', doc: selectedDoc });
                              setSaveModalTitle(selectedDoc.title);
                              setSaveModalGroupId(assignments[selectedDoc.id] ?? '');
                              setSaveModalSubgroupId(subgroupAssignments[selectedDoc.id] ?? '');
                            }}
                            className="px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-monday-text hover:bg-monday-hover"
                          >
                            Guardar como
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving || (!selectedDoc && !newDocDraft)}
                          className="px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
                        >
                          {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                      <Popover.Root open={viewerActionsOpen} onOpenChange={setViewerActionsOpen}>
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            className="sm:hidden inline-flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-monday border border-monday-border text-monday-text hover:bg-monday-hover touch-manipulation"
                            title="Más acciones"
                          >
                            <MoreVertical size={18} />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            className="z-50 p-2 rounded-xl shadow-lg border border-monday-border bg-white w-56"
                            sideOffset={6}
                            align="end"
                            onOpenAutoFocus={e => e.preventDefault()}
                          >
                            {selectedDoc && (
                              <button
                                type="button"
                                onClick={() => {
                                  setViewerActionsOpen(false);
                                  setSaveModal({ mode: 'saveAs', doc: selectedDoc });
                                  setSaveModalTitle(selectedDoc.title);
                                  setSaveModalGroupId(assignments[selectedDoc.id] ?? '');
                                  setSaveModalSubgroupId(subgroupAssignments[selectedDoc.id] ?? '');
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:bg-monday-hover text-[13px] text-monday-text text-left"
                              >
                                Guardar como
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setViewerActionsOpen(false); handleSave(); }}
                              disabled={saving || (!selectedDoc && !newDocDraft)}
                              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:bg-monday-hover text-[13px] text-monday-text text-left disabled:opacity-60"
                            >
                              {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </>
                  )}
                </div>
              </div>

              {selectedDoc && isPdfDocType(selectedDoc.type as DocType) ? (
                <div className="flex-1 min-h-0 min-w-0 overflow-auto scroll-touch custom-scrollbar bg-white p-2 sm:p-0">
                  {templateConfigLoading && !(effectiveTemplateConfigForPdf?.customBoxes?.length) ? (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-sm text-gray-400">
                        Cargando plantilla...
                      </span>
                    </div>
                  ) : (
                    <PdfTemplateEditor
                      key={selectedDoc.id}
                      docType={selectedDoc.type as 'cotizacion' | 'levantamiento' | 'hoja_trabajo'}
                      value={pdfFormDraft}
                      onChange={setPdfFormDraft}
                      docId={selectedDoc.id}
                      templateConfig={effectiveTemplateConfigForPdf}
                      isAdmin={isAdmin}
                      viewerOnly
                      compactPadding
                    />
                  )}
                </div>
              ) : selectedDoc?.type === 'sheet' ? (
                <div className="flex-1 min-h-0 overflow-auto scroll-touch custom-scrollbar">
                  <ExcelLikeSheet
                    tableDraft={tableDraft}
                    setTableDraft={setTableDraft}
                    ensureTableSize={ensureTableSize}
                    cellStyles={cellStylesDraft}
                    documentTitle={selectedDoc.title}
                    readOnly
                  />
                </div>
              ) : selectedDoc?.type === 'text' ? (
                <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
                  {/* Lista+visor: editor siempre editable (el modo Listo/Editar solo en «Vista general»). */}
                  <WordLikeEditor
                    key={selectedDoc.id}
                    textDraft={textDraft}
                    setTextDraft={setTextDraft}
                    headerImageUrl={headerImageUrlDraft}
                    setHeaderImageUrl={setHeaderImageUrlDraft}
                    documentTitle={selectedDoc.title || 'Documento'}
                    enableMobileViewEditMode={false}
                  />
                </div>
              ) : (
                <div
                  className="flex-1 min-h-0 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 bg-monday-bg/50 prose prose-sm max-w-none font-averta [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
                  dangerouslySetInnerHTML={{ __html: getInitialHtml(parseContent(selectedDoc).text ?? '') }}
                />
              )}
            </>
          )}
        </section>
        )}
      </div>
      )}
    </div>
    <AnimatePresence>
      {templateMasterEditorOpen && isAdmin && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[250] bg-black/30"
            aria-hidden
            onClick={() => {
              setTemplateMasterEditorOpen(false);
              if (reopenNormalAfterMasterRef.current) {
                reopenNormalAfterMasterRef.current = false;
                setTemplateEditorMobileOpen(true);
              }
            }}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-0 right-0 bottom-0 z-[251] bg-white rounded-t-2xl shadow-monday-xl border-t border-monday-border flex flex-col max-h-[95dvh]"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            role="dialog"
            aria-label="Editor master de plantillas"
          >
            <div className="shrink-0 flex flex-col">
              <div className="flex items-center justify-between min-h-[52px] px-4 border-b border-monday-border">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-monday-text truncate">Master de plantillas</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateMasterEditorOpen(false);
                      if (reopenNormalAfterMasterRef.current) {
                        reopenNormalAfterMasterRef.current = false;
                        setTemplateEditorMobileOpen(true);
                      }
                    }}
                    className="min-h-[44px] px-3 rounded-lg border border-monday-border bg-white text-[13px] text-monday-text hover:bg-monday-hover touch-manipulation"
                    title="Cerrar sin guardar"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!templateMasterDraft) return;
                      await handleSaveTemplateConfigForKind(templateMasterDocType, templateMasterDraft, templateMasterValue);
                      setTemplateMasterEditorOpen(false);
                      if (reopenNormalAfterMasterRef.current) {
                        reopenNormalAfterMasterRef.current = false;
                        setTemplateEditorMobileOpen(true);
                      }
                    }}
                    disabled={!templateMasterDraft || savingTemplateConfig}
                    className="min-h-[44px] px-3 rounded-lg bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60 touch-manipulation"
                    title="Guardar master global"
                  >
                    {savingTemplateConfig ? 'Guardando…' : 'Guardar master'}
                  </button>
                </div>
              </div>

              <div className="p-3 border-b border-monday-border">
                <div className="flex gap-2">
                  {(
                    [
                      { id: 'cotizacion', label: 'Cotización' },
                      { id: 'levantamiento', label: 'Levantamiento' },
                      { id: 'hoja_trabajo', label: 'Hoja de trabajo' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={async () => {
                        if (t.id === templateMasterDocType) return;
                        await loadTemplateMasterDraftForKind(t.id);
                      }}
                      className={`flex-1 min-h-[44px] px-3 rounded-xl border touch-manipulation text-[13px] ${
                        t.id === templateMasterDocType
                          ? 'bg-monday-blue border-monday-blue text-white'
                          : 'bg-white border-monday-border text-monday-text hover:bg-monday-hover'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {!templateMasterDraft ? (
                  <div className="flex items-center justify-center py-10 text-monday-subtext text-[13px]">
                    Cargando master…
                  </div>
                ) : (
                  <div className="p-0">
                    <PdfTemplateEditor
                      docType={templateMasterDocType}
                      value={templateMasterValue}
                      onChange={setTemplateMasterValue}
                      docId=""
                      templateConfig={templateMasterDraft}
                      isAdmin
                      allowBoxEditing
                      lockedOutline={false}
                      compactPadding
                      onTemplateConfigChange={(cfg) => setTemplateMasterDraft(cfg)}
                      onSaveTemplateConfig={undefined}
                      savingTemplateConfig={savingTemplateConfig}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    {useWordMobileShell && !mobileDocOpen && (
      <MobileDocsShell active={wordShellTab} onChange={setWordShellTab} />
    )}
    </>
  );
};
export default DocsPage;
