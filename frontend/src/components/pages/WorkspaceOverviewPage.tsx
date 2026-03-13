import React, { useState } from 'react';
import { Clock, FileText, LayoutGrid, Trash2 } from 'lucide-react';
import { Workspace as WorkspaceType, Board } from '../../types';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { useUser } from '../../store/UserContext';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

type TabId = 'recent' | 'content';

interface WorkspaceOverviewPageProps {
  workspace: WorkspaceType | null;
  workspaces: WorkspaceType[];
  boards: Board[];
  onSelectBoard: (boardId: string) => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onWorkspaceUpdated: (w: WorkspaceType) => void;
  onWorkspaceDeleted: () => void;
  onBoardDeleted: () => void;
}

export const WorkspaceOverviewPage: React.FC<WorkspaceOverviewPageProps> = ({
  workspace,
  workspaces,
  boards,
  onSelectBoard,
  onSelectWorkspace,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
  onBoardDeleted,
}) => {
  const [tab, setTab] = useState<TabId>('recent');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [editingDescription, setEditingDescription] = useState(false);

  React.useEffect(() => {
    setDescription(workspace?.description ?? '');
  }, [workspace?.id, workspace?.description]);
  const [savingDesc, setSavingDesc] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace?.name ?? '');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);
  const [boardDeleteOpen, setBoardDeleteOpen] = useState(false);
  const [boardDeleting, setBoardDeleting] = useState(false);
  const [boardDeleteError, setBoardDeleteError] = useState<string | null>(null);

  const { currentUser } = useUser();
  const canEditWorkspaceOrBoard = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';

  const saveDescription = async () => {
    if (!workspace?.id) return;
    setEditingDescription(false);
    setSavingDesc(true);
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        onWorkspaceUpdated(updated);
      }
    } finally {
      setSavingDesc(false);
    }
  };

  const saveRename = async () => {
    if (!workspace?.id || !renameValue.trim()) return;
    setSavingRename(true);
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        onWorkspaceUpdated(updated);
        setRenameOpen(false);
      }
    } finally {
      setSavingRename(false);
    }
  };

  const deleteWorkspace = async () => {
    if (!workspace?.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmOpen(false);
        setDeleteError(null);
        onWorkspaceDeleted();
      } else {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try {
          const json = text ? JSON.parse(text) : {};
          if (json?.error) msg = json.error;
        } catch {
          if (text) {
            if (text.trimStart().startsWith('<!') || text.includes('</html>')) {
              const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              const raw = preMatch ? preMatch[1].trim() : '';
              msg = raw.startsWith('Cannot DELETE')
                ? 'El backend no reconoce la eliminación de workspaces. Asegúrate de tener el backend de Sunday en ejecución (npm run dev en la carpeta backend, puerto 3001) y de haber guardado los cambios.'
                : raw || 'El servidor no pudo eliminar el espacio de trabajo. Comprueba que el backend esté en marcha.';
            } else {
              msg = text.length > 200 ? `${text.slice(0, 200)}…` : text;
            }
          }
        }
        setDeleteError(msg);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo conectar. Comprueba que el backend esté en marcha.');
    } finally {
      setDeleting(false);
    }
  };

  const deleteBoard = async () => {
    if (!boardToDelete) return;
    setBoardDeleting(true);
    setBoardDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/boards/${boardToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setBoardDeleteOpen(false);
        setBoardToDelete(null);
        onBoardDeleted();
      } else {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try {
          const json = text ? JSON.parse(text) : {};
          if (json?.error) msg = json.error;
        } catch {
          if (text) {
            if (text.trimStart().startsWith('<!') || text.includes('</html>')) {
              const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              const raw = preMatch ? preMatch[1].trim() : '';
              msg = raw.startsWith('Cannot DELETE')
                ? 'El backend no reconoce la eliminación de tableros. Asegúrate de tener el backend de Sunday en ejecución (npm run dev en la carpeta backend, puerto 3001) y de haber guardado los cambios.'
                : raw || 'El servidor no pudo eliminar el tablero. Comprueba que el backend esté en marcha.';
            } else {
              msg = text.length > 200 ? `${text.slice(0, 200)}…` : text;
            }
          }
        }
        setBoardDeleteError(msg);
      }
    } catch (err) {
      setBoardDeleteError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar. Comprueba que el backend esté en marcha.'
      );
    } finally {
      setBoardDeleting(false);
    }
  };

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-monday-subtext">
        <p>Selecciona un workspace.</p>
      </div>
    );
  }

  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-monday-bg">
      <div className="p-6 border-b border-monday-border bg-white">
        <div className="flex items-start gap-6">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-white text-4xl font-bold shrink-0"
            style={{ backgroundColor: '#00c875' }}
          >
            {initial}
          </div>
          <div>
            {canEditWorkspaceOrBoard ? (
              <Popover.Root open={renameOpen} onOpenChange={setRenameOpen}>
                <Popover.Trigger asChild>
                  <button className="flex items-center gap-1 text-3xl font-bold text-monday-text hover:bg-monday-hover rounded px-1 -ml-1">
                    {workspace.name}
                    <span className="text-monday-subtext text-2xl">▾</span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-72 rounded-xl shadow-monday-lg border border-monday-border bg-white p-4"
                    sideOffset={8}
                    align="start"
                  >
                    <p className="text-[12px] font-semibold text-monday-subtext mb-2">Renombrar espacio de trabajo</p>
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="w-full px-3 py-2 border border-monday-border rounded-monday text-[14px] mb-3"
                      placeholder="Nombre"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRenameOpen(false)}
                        className="px-3 py-1.5 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={saveRename}
                        disabled={!renameValue.trim() || savingRename}
                        className="px-4 py-1.5 text-[13px] font-medium bg-monday-blue text-white rounded-lg hover:bg-monday-blue/90 disabled:opacity-50"
                      >
                        {savingRename ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            ) : (
              <span className="text-3xl font-bold text-monday-text">{workspace.name}</span>
            )}
            {canEditWorkspaceOrBoard && (
              <>
                {editingDescription ? (
                  <div className="mt-2">
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      onBlur={saveDescription}
                      className="w-full max-w-md px-3 py-2 border border-monday-border rounded-monday text-[13px] resize-none"
                      placeholder="Agregar descripción del espacio de trabajo"
                      rows={2}
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDescription(true)}
                    className="mt-1 block text-[13px] text-monday-subtext hover:text-monday-text text-left"
                  >
                    {workspace.description?.trim()
                      ? workspace.description
                      : 'Agregar descripción del espacio de trabajo'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setDeleteError(null); setDeleteConfirmOpen(true); }}
                  className="mt-2 text-[12px] text-monday-subtext hover:text-red-600 hover:underline"
                >
                  Eliminar espacio de trabajo
                </button>
              </>
            )}
            {!canEditWorkspaceOrBoard && workspace.description?.trim() && (
              <p className="mt-1 text-[13px] text-monday-subtext">{workspace.description}</p>
            )}
            </div>
          </div>

        <div className="flex gap-1 mt-6 border-b border-monday-border">
          {[
            { id: 'recent' as TabId, label: 'Recientes', icon: Clock },
            { id: 'content' as TabId, label: 'Contenido', icon: FileText },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 min-h-0">
        {tab === 'recent' && (
          <div className="space-y-8">
            {workspaces.length > 0 && (
              <section>
                <h2 className="text-[15px] font-semibold text-monday-subtext mb-3 uppercase tracking-tight">Espacios de trabajo</h2>
                <ul className="space-y-2">
                  {workspaces.map(ws => {
                    const wsInitial = ws.name.charAt(0).toUpperCase();
                    const isActive = ws.id === workspace?.id;
                    return (
                      <li key={ws.id}>
                        <button
                          type="button"
                          onClick={() => onSelectWorkspace?.(ws.id)}
                          className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-colors ${
                            isActive ? 'bg-monday-blue/10 ring-1 ring-monday-blue/30' : 'hover:bg-monday-hover'
                          }`}
                        >
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0"
                            style={{ backgroundColor: isActive ? '#5034ff' : '#00c875' }}
                          >
                            {wsInitial}
                          </div>
                          <span className="text-[17px] font-semibold text-monday-text">{ws.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section>
              <h2 className="text-[15px] font-semibold text-monday-subtext mb-3 uppercase tracking-tight">Tableros</h2>
              {boards.length === 0 ? (
                <p className="text-[13px] text-monday-subtext">No hay tableros en este workspace.</p>
              ) : (
                <ul className="space-y-2">
                  {boards.map(b => (
                    <li key={b.id} className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectBoard(b.id)}
                        className="flex-1 flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-monday-hover text-left transition-colors"
                      >
                        <div className="w-14 h-14 rounded-xl bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
                          <LayoutGrid size={28} />
                        </div>
                        <span className="text-[17px] font-semibold text-monday-text">{b.name}</span>
                      </button>
                      {canEditWorkspaceOrBoard && (
                        <button
                          type="button"
                          onClick={() => {
                            setBoardToDelete(b);
                            setBoardDeleteError(null);
                            setBoardDeleteOpen(true);
                          }}
                          className="p-2.5 rounded-xl text-monday-subtext hover:text-red-600 hover:bg-red-50 shrink-0"
                          aria-label={`Eliminar tablero ${b.name}`}
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        {tab === 'content' && (
          <section className="max-w-2xl">
            <h2 className="text-[18px] font-semibold text-monday-text mb-4">Feed general</h2>
            <div className="space-y-4">
              <p className="text-[14px] text-monday-subtext">
                Actualización del feed: actividad reciente en tableros y documentos del workspace.
              </p>
              <div className="rounded-xl border border-monday-border bg-white p-4 text-[13px] text-monday-subtext">
                No hay actividad reciente para mostrar.
              </div>
            </div>
          </section>
        )}
      </div>

      <Dialog.Root
        open={boardDeleteOpen}
        onOpenChange={open => {
          setBoardDeleteOpen(open);
          if (!open) {
            setBoardDeleteError(null);
            setBoardToDelete(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <Dialog.Title className="text-[18px] font-semibold text-monday-text">
              Eliminar tablero
            </Dialog.Title>
            <Dialog.Description className="text-[14px] text-monday-subtext mt-2">
              ¿Estás seguro? Se eliminará el tablero &quot;{boardToDelete?.name}&quot; y todo su contenido.
              Esta acción no se puede deshacer.
            </Dialog.Description>
            {boardDeleteError && (
              <p className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[13px]" role="alert">
                {boardDeleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg">
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={deleteBoard}
                disabled={boardDeleting}
                className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {boardDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <Dialog.Title className="text-[18px] font-semibold text-monday-text">
              Eliminar espacio de trabajo
            </Dialog.Title>
            <Dialog.Description className="text-[14px] text-monday-subtext mt-2">
              ¿Estás seguro? Se eliminarán todos los tableros y su contenido de &quot;{workspace.name}&quot;. Esta acción no se puede deshacer.
            </Dialog.Description>
            {deleteError && (
              <p className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[13px]" role="alert">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg">
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={deleteWorkspace}
                disabled={deleting}
                className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
