import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Plus,
  Calendar,
  ChevronDown,
  ChevronRight,
  Check,
  MoreVertical,
  ListPlus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { apiFetch, apiUrl } from '../../api';
import { useUser } from '../../store/UserContext';

export type UserTaskListRow = {
  id: string;
  userId: string;
  name: string;
  position: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: { tasks: number };
};

export type UserTaskRow = {
  id: string;
  userId: string;
  listId: string;
  parentId: string | null;
  title: string;
  notes: string;
  completed: boolean;
  position: number;
  dueDate: string | null;
  assigneeUserId?: string | null;
  assignee?: { id: string; name: string; initials: string; color: string } | null;
  assigneeUserIds?: string[];
  assignees?: Array<{ id: string; name: string; initials: string; color: string }>;
  createdAt: string;
  updatedAt: string;
};

export type AssignedTaskRow = UserTaskRow & {
  user: { id: string; name: string; initials: string; color: string };
  list: { id: string; name: string };
};

function formatDue(d: string | null): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Etiqueta de vencimiento: Hoy / Mañana o fecha corta */
function formatDueBadge(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d0 = new Date(date);
  d0.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d0.getTime() === today.getTime()) return 'Hoy';
  if (d0.getTime() === tomorrow.getTime()) return 'Mañana';
  return formatDue(d);
}

function sortByPosition(a: UserTaskRow, b: UserTaskRow) {
  return a.position - b.position;
}

export const TasksPage: React.FC = () => {
  const { users } = useUser();
  const [lists, setLists] = useState<UserTaskListRow[]>([]);
  const [tasksByList, setTasksByList] = useState<Record<string, UserTaskRow[]>>({});
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftByList, setDraftByList] = useState<Record<string, string>>({});
  /** Guardando PATCH/DELETE de una tarea concreta */
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  /** Creando t nueva en esa lista (evita bloquear el botón en el resto de columnas) */
  const [savingNewListId, setSavingNewListId] = useState<string | null>(null);
  /** Creando subtarea en esa lista */
  const [savingSubListId, setSavingSubListId] = useState<string | null>(null);
  const [completedOpenByList, setCompletedOpenByList] = useState<Record<string, boolean>>({});
  const [menuListId, setMenuListId] = useState<string | null>(null);
  /** Diálogo crear / renombrar lista */
  const [listModal, setListModal] = useState<
    null | { mode: 'create' } | { mode: 'rename'; listId: string; previousName: string }
  >(null);
  const [listModalName, setListModalName] = useState('');
  const [deleteListConfirmId, setDeleteListConfirmId] = useState<string | null>(null);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ taskId: string; listId: string } | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const lr = await apiFetch(apiUrl('/api/user-task-lists'));
      if (!lr.ok) {
        if (lr.status === 404) {
          throw new Error(
            'La API de tareas no está disponible en el servidor (404). En el servidor ejecuta deploy o reinicia el backend (puerto 3001) con el código actual; en desarrollo, arranca el backend y usa el proxy de Vite para /api.'
          );
        }
        const j = await lr.json().catch(() => ({}));
        throw new Error(typeof j?.error === 'string' ? j.error : `Error ${lr.status}`);
      }
      const listData = (await lr.json()) as UserTaskListRow[];
      setLists(Array.isArray(listData) ? listData : []);

      const entries = await Promise.all(
        (Array.isArray(listData) ? listData : []).map(async (l) => {
          const tr = await apiFetch(`${apiUrl('/api/user-tasks')}?listId=${encodeURIComponent(l.id)}`);
          if (!tr.ok) return [l.id, []] as const;
          const tasks = (await tr.json()) as UserTaskRow[];
          return [l.id, Array.isArray(tasks) ? tasks : []] as const;
        })
      );
      setTasksByList(Object.fromEntries(entries));
      // Compatibilidad: si el backend aún no tiene este endpoint, no mostramos error global.
      const assignedRes = await apiFetch(apiUrl('/api/user-tasks-assigned'), { silent: true });
      if (assignedRes.ok) {
        const assigned = (await assignedRes.json()) as AssignedTaskRow[];
        setAssignedTasks(Array.isArray(assigned) ? assigned : []);
      } else {
        setAssignedTasks([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setLists([]);
      setTasksByList({});
      setAssignedTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const patchTask = async (
    id: string,
    patch: Partial<Pick<UserTaskRow, 'title' | 'notes' | 'completed' | 'dueDate' | 'listId' | 'parentId' | 'assigneeUserIds'>> & {
      dueDate?: string | null;
      assigneeUserIds?: string[];
    }
  ) => {
    setSavingTaskId(id);
    try {
      const res = await apiFetch(apiUrl(`/api/user-tasks/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j?.error === 'string' ? j.error : `Error ${res.status}`);
      }
      const updated = (await res.json()) as UserTaskRow;
      const patchedAssigneeUserIds =
        patch.assigneeUserIds !== undefined
          ? patch.assigneeUserIds
          : updated.assigneeUserIds ??
            (updated.assigneeUserId ? [updated.assigneeUserId] : []);
      const assigneesFromUsers =
        patchedAssigneeUserIds
          .map((id) => users.find((u) => u.id === id))
          .filter((u): u is NonNullable<typeof u> => Boolean(u))
          .map((u) => ({
            id: u.id,
            name: u.name,
            initials: u.initials ?? u.name.slice(0, 2).toUpperCase(),
            color: u.color ?? '#6b7280',
          }));
      const normalizedUpdated: UserTaskRow = {
        ...updated,
        assigneeUserIds: patchedAssigneeUserIds,
        assignees: updated.assignees ?? assigneesFromUsers,
        assigneeUserId: patchedAssigneeUserIds[0] ?? null,
        assignee: (updated.assignees ?? assigneesFromUsers)[0] ?? null,
      };
      setTasksByList((prev) => ({
        ...prev,
        [normalizedUpdated.listId]: (prev[normalizedUpdated.listId] ?? []).map((t) => (t.id === id ? normalizedUpdated : t)),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSavingTaskId(null);
    }
  };

  const deleteTask = async (id: string, listId: string) => {
    setSavingTaskId(id);
    try {
      const res = await apiFetch(apiUrl(`/api/user-tasks/${id}`), { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j?.error === 'string' ? j.error : `Error ${res.status}`);
      }
      setTasksByList((prev) => ({
        ...prev,
        [listId]: (prev[listId] ?? []).filter((t) => t.id !== id),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setSavingTaskId(null);
    }
  };

  /** El título debe venir del input de la columna (texto actual), no solo de draftByList en el padre, para evitar estado desfasado. */
  const addTask = async (listId: string, titleFromInput: string) => {
    const title = titleFromInput.trim();
    if (!title) return;
    setDraftByList((d) => ({ ...d, [listId]: '' }));
    setSavingNewListId(listId);
    try {
      const res = await apiFetch(apiUrl('/api/user-tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, listId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j?.error === 'string' ? j.error : `Error ${res.status}`);
      }
      const created = (await res.json()) as UserTaskRow;
      setTasksByList((prev) => ({
        ...prev,
        [listId]: [...(prev[listId] ?? []), created],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear');
    } finally {
      setSavingNewListId(null);
    }
  };

  const addSubtask = async (listId: string, parentId: string) => {
    setSavingSubListId(listId);
    try {
      const res = await apiFetch(apiUrl('/api/user-tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Subtarea', listId, parentId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j?.error === 'string' ? j.error : `Error ${res.status}`);
      }
      const created = (await res.json()) as UserTaskRow;
      setTasksByList((prev) => ({
        ...prev,
        [listId]: [...(prev[listId] ?? []), created],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear subtarea');
    } finally {
      setSavingSubListId(null);
    }
  };

  const openCreateListModal = () => {
    setListModalName('Lista nueva');
    setListModal({ mode: 'create' });
  };

  const openRenameListModal = (listId: string, current: string) => {
    setMenuListId(null);
    setListModalName(current);
    setListModal({ mode: 'rename', listId, previousName: current });
  };

  const submitListModal = async () => {
    const n = listModalName.trim() || 'Lista nueva';
    if (!listModal) return;
    if (listModal.mode === 'create') {
      try {
        const res = await apiFetch(apiUrl('/api/user-task-lists'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: n }),
        });
        if (!res.ok) throw new Error('No se pudo crear la lista');
        const list = (await res.json()) as UserTaskListRow;
        setLists((prev) => [...prev, list].sort((a, b) => a.position - b.position));
        setTasksByList((prev) => ({ ...prev, [list.id]: [] }));
        setListModal(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      }
      return;
    }
    const { listId, previousName } = listModal;
    if (n === previousName) {
      setListModal(null);
      return;
    }
    try {
      const res = await apiFetch(apiUrl(`/api/user-task-lists/${listId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) throw new Error('No se pudo renombrar');
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name: n } : l)));
      setListModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const runDeleteList = async (listId: string) => {
    try {
      const res = await apiFetch(apiUrl(`/api/user-task-lists/${listId}`), { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j?.error === 'string' ? j.error : 'No se pudo eliminar');
      }
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setTasksByList((prev) => {
        const next = { ...prev };
        delete next[listId];
        return next;
      });
      setDeleteListConfirmId(null);
      setMenuListId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-monday-subtext bg-monday-bg">
        <Loader2 size={20} className="animate-spin text-monday-blue" />
        <span className="text-[14px]">Cargando…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg">
      <header className="shrink-0 px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-medium text-monday-text tracking-tight">Tareas</h1>
          <p className="text-[12px] text-monday-subtext mt-0.5">Listas y subtareas</p>
        </div>
        <button
          type="button"
          onClick={openCreateListModal}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-monday-border bg-monday-surface text-[13px] font-medium text-monday-text hover:bg-monday-hover"
        >
          <ListPlus size={18} className="text-monday-blue" />
          Nueva lista
        </button>
      </header>

      {error && (
        <div className="mx-4 sm:mx-6 mb-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-[13px] px-3 py-2" role="alert">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => { setError(null); loadAll(); }}>
            Reintentar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0 px-4 sm:px-6 pb-4">
        <div className="flex gap-4 h-full min-h-[min(100%,480px)] items-stretch">
          {lists.map((list) => (
            <TaskListColumn
              key={list.id}
              list={list}
              tasks={tasksByList[list.id] ?? []}
              draft={draftByList[list.id] ?? ''}
              onDraftChange={(v) => setDraftByList((d) => ({ ...d, [list.id]: v }))}
              onAddTask={(title) => addTask(list.id, title)}
              onAddSubtask={(parentId) => addSubtask(list.id, parentId)}
              onToggleDone={(id) => {
                const t = (tasksByList[list.id] ?? []).find((x) => x.id === id);
                if (t) patchTask(id, { completed: !t.completed });
              }}
              onPatchTask={patchTask}
              onRequestDeleteTask={(taskId) => setDeleteTaskConfirm({ taskId, listId: list.id })}
              users={users}
              savingTaskId={savingTaskId}
              savingNewListId={savingNewListId}
              savingSubListId={savingSubListId}
              completedOpen={completedOpenByList[list.id] !== false}
              onToggleCompletedOpen={() =>
                setCompletedOpenByList((o) => {
                  const isOpen = o[list.id] !== false;
                  return { ...o, [list.id]: !isOpen };
                })
              }
              listMenuOpen={menuListId === list.id}
              onListMenuOpenChange={(open) => {
                if (open) setMenuListId(list.id);
                else setMenuListId((m) => (m === list.id ? null : m));
              }}
              onRename={() => openRenameListModal(list.id, list.name)}
              onDeleteList={() => {
                setMenuListId(null);
                setDeleteListConfirmId(list.id);
              }}
            />
          ))}
          {assignedTasks.length > 0 && (
            <section className="w-[min(100%,380px)] shrink-0 flex flex-col h-full max-h-full bg-monday-surface rounded-xl border border-monday-border shadow-monday-sm overflow-hidden">
              <div className="px-3 pt-3 pb-2 border-b border-monday-border">
                <h2 className="text-[15px] font-medium text-monday-text truncate pl-1">Asignadas a mí</h2>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar divide-y divide-monday-border/70">
                {assignedTasks.map((task) => (
                  <article key={task.id} className="px-3 py-2">
                    <p className="text-[13px] font-medium text-monday-text">{task.title || 'Sin título'}</p>
                    {task.notes?.trim() ? (
                      <p className="mt-1 text-[12px] text-monday-subtext line-clamp-3 whitespace-pre-wrap">{task.notes}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-monday-subtext">
                      {task.user.name} · {task.list.name}
                      {task.dueDate ? ` · ${formatDueBadge(task.dueDate)}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <Dialog.Root open={listModal !== null} onOpenChange={(open) => !open && setListModal(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-[min(100vw-2rem,400px)] bg-monday-surface rounded-xl shadow-xl border border-monday-border p-5 outline-none">
            <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-3">
              {listModal?.mode === 'rename' ? 'Renombrar lista' : 'Nueva lista'}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {listModal?.mode === 'rename' ? 'Escribe el nuevo nombre de la lista' : 'Escribe el nombre de la nueva lista'}
            </Dialog.Description>
            <input
              type="text"
              value={listModalName}
              onChange={(e) => setListModalName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitListModal();
              }}
              className="w-full text-[14px] text-monday-text bg-monday-bg border border-monday-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-monday-blue/25"
              placeholder="Nombre de la lista"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setListModal(null)}
                className="px-3 py-2 rounded-lg text-[13px] text-monday-subtext hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitListModal()}
                className="px-3 py-2 rounded-lg text-[13px] font-medium bg-monday-blue text-white hover:opacity-90"
              >
                Guardar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteListConfirmId !== null} onOpenChange={(open) => !open && setDeleteListConfirmId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-[min(100vw-2rem,400px)] bg-monday-surface rounded-xl shadow-xl border border-monday-border p-5 outline-none">
            <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-2">Eliminar lista</Dialog.Title>
            <Dialog.Description className="text-[14px] text-monday-subtext mb-5">
              ¿Eliminar esta lista y todas sus tareas? Esta acción no se puede deshacer.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteListConfirmId(null)}
                className="px-3 py-2 rounded-lg text-[13px] text-monday-subtext hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteListConfirmId && void runDeleteList(deleteListConfirmId)}
                className="px-3 py-2 rounded-lg text-[13px] font-medium bg-monday-red text-white hover:opacity-90"
              >
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteTaskConfirm !== null} onOpenChange={(open) => !open && setDeleteTaskConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] w-[min(100vw-2rem,400px)] bg-monday-surface rounded-xl shadow-xl border border-monday-border p-5 outline-none">
            <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-2">Eliminar tarea</Dialog.Title>
            <Dialog.Description className="text-[14px] text-monday-subtext mb-5">
              ¿Eliminar esta tarea? Si tiene subtareas, también se eliminarán.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTaskConfirm(null)}
                className="px-3 py-2 rounded-lg text-[13px] text-monday-subtext hover:bg-monday-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!deleteTaskConfirm) return;
                  void deleteTask(deleteTaskConfirm.taskId, deleteTaskConfirm.listId);
                  setDeleteTaskConfirm(null);
                }}
                className="px-3 py-2 rounded-lg text-[13px] font-medium bg-monday-red text-white hover:opacity-90"
              >
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

function TaskListColumn({
  list,
  tasks,
  draft,
  onDraftChange,
  onAddTask,
  onAddSubtask,
  onToggleDone,
  onPatchTask,
  onRequestDeleteTask,
  users,
  savingTaskId,
  savingNewListId,
  savingSubListId,
  completedOpen,
  onToggleCompletedOpen,
  listMenuOpen,
  onListMenuOpenChange,
  onRename,
  onDeleteList,
}: {
  list: UserTaskListRow;
  tasks: UserTaskRow[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAddTask: (title: string) => void;
  onAddSubtask: (parentId: string) => void;
  onToggleDone: (id: string) => void;
  onPatchTask: (
    id: string,
    patch: Partial<Pick<UserTaskRow, 'title' | 'notes' | 'completed' | 'dueDate' | 'listId' | 'parentId' | 'assigneeUserIds'>> & {
      dueDate?: string | null;
      assigneeUserIds?: string[];
    }
  ) => Promise<void>;
  onRequestDeleteTask: (taskId: string) => void;
  users: Array<{ id: string; name: string; initials?: string; color?: string }>;
  savingTaskId: string | null;
  savingNewListId: string | null;
  savingSubListId: string | null;
  completedOpen: boolean;
  onToggleCompletedOpen: () => void;
  listMenuOpen: boolean;
  onListMenuOpenChange: (open: boolean) => void;
  onRename: () => void;
  onDeleteList: () => void;
}) {
  const draftInputRef = useRef<HTMLInputElement>(null);
  const pending = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.completed), [tasks]);

  const handleAddClick = () => {
    const t = draft.trim();
    if (!t) {
      draftInputRef.current?.focus();
      return;
    }
    onAddTask(t);
  };

  const renderTree = (pool: UserTaskRow[], completed: boolean) => {
    const ids = new Set(pool.map((t) => t.id));
    const roots = pool
      .filter((t) => !t.parentId || !ids.has(t.parentId))
      .sort(sortByPosition);
    const byParent = new Map<string | null, UserTaskRow[]>();
    for (const t of pool) {
      const k = t.parentId;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(t);
    }
    for (const arr of byParent.values()) arr.sort(sortByPosition);

    const renderNode = (task: UserTaskRow, depth: number): React.ReactNode => {
      const children = byParent.get(task.id) ?? [];
      return (
        <div key={task.id}>
          <div style={{ paddingLeft: depth * 20 }} className="border-b border-monday-border/80">
            <TaskListRow
              task={task}
              completed={completed}
              onToggleDone={() => onToggleDone(task.id)}
              busy={savingTaskId === task.id}
              onPatch={(patch) => onPatchTask(task.id, patch)}
              onRequestDelete={() => onRequestDeleteTask(task.id)}
              users={users}
            />
            {!completed && (
              <div style={{ paddingLeft: depth * 20 + 48 }} className="pb-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingSubListId === list.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSubtask(task.id);
                  }}
                  className="text-[12px] text-monday-blue hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {savingSubListId === list.id ? (
                    <Loader2 size={12} className="animate-spin shrink-0" />
                  ) : null}
                  Añadir subtarea
                </button>
              </div>
            )}
          </div>
          {children.map((ch) => renderNode(ch, depth + 1))}
        </div>
      );
    };

    return <>{roots.map((r) => renderNode(r, 0))}</>;
  };

  return (
    <div className="w-[min(100%,380px)] shrink-0 flex flex-col h-full max-h-full bg-monday-surface rounded-xl border border-monday-border shadow-monday-sm overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-monday-border">
        <h2 className="text-[15px] font-medium text-monday-text truncate flex-1 pl-1">{list.name}</h2>
        <DropdownMenu.Root open={listMenuOpen} onOpenChange={onListMenuOpenChange}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-full hover:bg-monday-hover text-monday-subtext shrink-0 outline-none focus:ring-2 focus:ring-monday-blue/30"
              aria-label="Opciones de lista"
            >
              <MoreVertical size={18} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="end"
              className="z-[200] min-w-[180px] rounded-lg border border-monday-border bg-monday-surface py-1 shadow-monday-lg text-[13px] text-monday-text outline-none"
            >
              <DropdownMenu.Item
                className="cursor-pointer px-3 py-2 outline-none hover:bg-monday-hover focus:bg-monday-hover"
                onSelect={() => onRename()}
              >
                Renombrar lista
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer px-3 py-2 text-monday-red outline-none hover:bg-red-50 focus:bg-red-50"
                onSelect={() => onDeleteList()}
              >
                Eliminar lista
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {pending.length === 0 && done.length === 0 && (
          <p className="text-[13px] text-monday-subtext px-4 py-6 text-center">Sin tareas</p>
        )}
        {pending.length > 0 && renderTree(pending, false)}

        {done.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={onToggleCompletedOpen}
              className="flex items-center gap-1 w-full px-3 py-2 text-[12px] font-medium text-monday-subtext hover:bg-monday-hover/50"
            >
              {completedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Completadas ({done.length})
            </button>
            {completedOpen && <div className="opacity-90">{renderTree(done, true)}</div>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-monday-border bg-monday-bg/30">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-monday-border text-monday-subtext">
          <Check size={14} className="opacity-40" />
        </div>
        <input
          ref={draftInputRef}
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddClick();
          }}
          placeholder="Añadir una tarea"
          className="flex-1 min-w-0 bg-transparent text-[14px] text-monday-text placeholder:text-monday-subtext outline-none border-0"
        />
        <button
          type="button"
          onClick={handleAddClick}
          disabled={savingNewListId === list.id}
          className="shrink-0 p-1.5 rounded-full text-monday-blue hover:bg-monday-hover disabled:opacity-40"
          title={draft.trim() ? 'Añadir' : 'Escribe un título o pulsa para enfocar el campo'}
        >
          {savingNewListId === list.id ? <Loader2 size={18} className="animate-spin" /> : <Plus size={20} />}
        </button>
      </div>
    </div>
  );
}

type TaskPatch = Partial<Pick<UserTaskRow, 'title' | 'notes' | 'completed' | 'dueDate' | 'assigneeUserIds'>> & {
  dueDate?: string | null;
  assigneeUserIds?: string[];
};

const TaskListRow: React.FC<{
  task: UserTaskRow;
  completed: boolean;
  onToggleDone: () => void;
  busy: boolean;
  onPatch: (patch: TaskPatch) => Promise<void>;
  onRequestDelete: () => void;
  users: Array<{ id: string; name: string; initials?: string; color?: string }>;
}> = ({ task, completed, onToggleDone, busy, onPatch, onRequestDelete, users }) => {
  const locked = task.completed || completed;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(task.notes);
  const [dueEditing, setDueEditing] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  useEffect(() => {
    setTitleDraft(task.title);
  }, [task.id, task.title]);

  useEffect(() => {
    setNotesDraft(task.notes);
  }, [task.id, task.notes]);

  const dueBadge = formatDueBadge(task.dueDate);
  const dueInputValue = task.dueDate ? task.dueDate.slice(0, 10) : '';

  const commitTitle = async () => {
    setEditingTitle(false);
    const t = titleDraft.trim() || 'Sin título';
    if (t !== task.title) await onPatch({ title: t });
  };

  const commitNotes = async () => {
    setEditingNotes(false);
    if (notesDraft !== task.notes) await onPatch({ notes: notesDraft });
  };

  const fallbackAssigneeIds = task.assigneeUserIds ?? (task.assigneeUserId ? [task.assigneeUserId] : []);
  const fallbackAssignees = fallbackAssigneeIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({
      id: u.id,
      name: u.name,
      initials: u.initials ?? u.name.slice(0, 2).toUpperCase(),
      color: u.color ?? '#6b7280',
    }));
  const displayAssignees = (task.assignees && task.assignees.length > 0)
    ? task.assignees
    : fallbackAssignees;
  const displayAssigneeIds = displayAssignees.map((a) => a.id);
  const toggleAssignee = (userId: string) => {
    const next = displayAssigneeIds.includes(userId)
      ? displayAssigneeIds.filter((id) => id !== userId)
      : [...displayAssigneeIds, userId];
    void onPatch({ assigneeUserIds: next });
  };

  return (
    <div className="group flex items-start gap-2 px-2 py-2 hover:bg-monday-hover/40">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        disabled={busy}
        className="mt-0.5 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-monday-blue/40"
        aria-label={task.completed ? 'Marcar pendiente' : 'Completar'}
      >
        {task.completed || completed ? (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-monday-blue">
            <Check size={14} className="text-white" strokeWidth={3} />
          </span>
        ) : (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-monday-subtext/60 hover:border-monday-blue" />
        )}
      </button>
      <div className="min-w-0 flex-1 pt-0.5">
        {editingTitle && !locked ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitTitle();
              }
              if (e.key === 'Escape') {
                setTitleDraft(task.title);
                setEditingTitle(false);
              }
            }}
            className="w-full text-[14px] leading-snug text-monday-text bg-monday-bg border border-monday-border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-monday-blue/25"
          />
        ) : (
          <p
            role={locked ? undefined : 'button'}
            tabIndex={locked ? undefined : 0}
            onClick={() => {
              if (!locked) setEditingTitle(true);
            }}
            onKeyDown={(e) => {
              if (!locked && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setEditingTitle(true);
              }
            }}
            className={`text-[14px] leading-snug rounded px-0.5 -mx-0.5 ${
              locked ? 'line-through text-monday-subtext' : 'text-monday-text cursor-text hover:bg-monday-hover/60'
            }`}
          >
            {task.title || 'Sin título'}
          </p>
        )}

        {locked ? (
          task.notes?.trim() ? (
            <p className="mt-1 text-[12px] text-monday-subtext line-clamp-4 whitespace-pre-wrap">{task.notes}</p>
          ) : null
        ) : editingNotes ? (
          <textarea
            autoFocus
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => void commitNotes()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNotesDraft(task.notes);
                setEditingNotes(false);
              }
            }}
            placeholder="Descripción"
            rows={3}
            className="mt-1 w-full text-[12px] text-monday-text bg-monday-bg border border-monday-border rounded px-2 py-1.5 resize-y min-h-[60px] outline-none focus:ring-2 focus:ring-monday-blue/25 placeholder:text-monday-subtext"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingNotes(true)}
            className={`mt-1 w-full text-left text-[12px] rounded px-0.5 -mx-0.5 py-0.5 ${
              task.notes?.trim()
                ? 'text-monday-subtext line-clamp-3 hover:bg-monday-hover/60'
                : 'text-monday-subtext/70 italic hover:bg-monday-hover/60'
            }`}
          >
            {task.notes?.trim() ? task.notes : 'Añadir descripción'}
          </button>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {locked ? (
            displayAssignees.length > 0 ? (
              <div className="inline-flex flex-wrap items-center gap-1">
                {displayAssignees.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-monday-border bg-monday-hover/50 text-monday-text">
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                      style={{ backgroundColor: a.color ?? '#6b7280' }}
                    >
                      {String(a.initials ?? a.name.slice(0, 2)).toUpperCase().slice(0, 2)}
                    </span>
                    {a.name}
                  </span>
                ))}
              </div>
            ) : null
          ) : (
            <DropdownMenu.Root open={assigneeOpen} onOpenChange={setAssigneeOpen}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                    displayAssignees.length > 0
                      ? 'border border-monday-border bg-monday-hover/50 text-monday-text'
                      : 'border border-dashed border-monday-border text-monday-subtext hover:bg-monday-hover/60'
                  }`}
                >
                  {displayAssignees.length > 0 ? (
                    <>
                      <UserRound size={11} className="text-monday-subtext" />
                      {displayAssignees.length === 1 ? displayAssignees[0].name : `${displayAssignees.length} personas`}
                    </>
                  ) : (
                    'Personas'
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={6}
                  align="start"
                  className="z-[220] min-w-[220px] rounded-lg border border-monday-border bg-monday-surface py-1 shadow-monday-lg text-[12px] text-monday-text outline-none max-h-64 overflow-auto custom-scrollbar"
                >
                  <DropdownMenu.Item
                    className="cursor-pointer px-3 py-2 outline-none hover:bg-monday-hover focus:bg-monday-hover text-monday-subtext"
                    onSelect={() => {
                      void onPatch({ assigneeUserIds: [] });
                    }}
                  >
                    Sin asignar
                  </DropdownMenu.Item>
                  {users.map((u) => (
                    <DropdownMenu.Item
                      key={u.id}
                      className="cursor-pointer px-3 py-2 outline-none hover:bg-monday-hover focus:bg-monday-hover"
                      onSelect={() => {
                        toggleAssignee(u.id);
                      }}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: u.color ?? '#6b7280' }}
                        >
                          {String(u.initials ?? u.name.slice(0, 2)).toUpperCase().slice(0, 2)}
                        </span>
                        {u.name}
                        {displayAssigneeIds.includes(u.id) ? (
                          <Check size={12} className="text-monday-blue ml-auto" />
                        ) : null}
                      </span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          {!locked && displayAssignees.length > 0 && (
            <div className="inline-flex flex-wrap items-center gap-1">
              {displayAssignees.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    void onPatch({ assigneeUserIds: displayAssigneeIds.filter((id) => id !== a.id) });
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-monday-border bg-monday-hover/50 text-monday-text hover:bg-monday-hover"
                  title={`Quitar a ${a.name}`}
                >
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                    style={{ backgroundColor: a.color ?? '#6b7280' }}
                  >
                    {String(a.initials ?? a.name.slice(0, 2)).toUpperCase().slice(0, 2)}
                  </span>
                  {a.name}
                  <X size={11} className="opacity-70" />
                </button>
              ))}
            </div>
          )}
          {dueEditing && !locked ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                autoFocus
                value={dueInputValue}
                onChange={(e) => {
                  const v = e.target.value;
                  void onPatch({ dueDate: v ? `${v}T12:00:00.000Z` : null });
                }}
                onBlur={() => setDueEditing(false)}
                className="text-[12px] text-monday-text bg-monday-bg border border-monday-border rounded px-2 py-1"
              />
              <button
                type="button"
                className="text-[11px] text-monday-subtext hover:text-monday-text underline"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  void onPatch({ dueDate: null });
                  setDueEditing(false);
                }}
              >
                Quitar fecha
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={locked}
              onClick={() => !locked && setDueEditing(true)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                dueBadge
                  ? 'bg-monday-hover text-monday-subtext hover:bg-monday-border/80'
                  : 'border border-dashed border-monday-border text-monday-subtext hover:bg-monday-hover/60'
              } ${locked ? 'opacity-60 cursor-default' : ''}`}
            >
              <Calendar size={11} />
              {dueBadge || 'Fecha'}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRequestDelete()}
        className="mt-0.5 shrink-0 p-1 rounded-md text-monday-subtext hover:text-monday-red hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-30"
        title="Eliminar tarea"
        aria-label="Eliminar tarea"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};
