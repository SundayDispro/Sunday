import React, { useState } from 'react';
import { Clock, FileText, Lock, LayoutGrid, MoreHorizontal, Pencil, Trash2, LogOut } from 'lucide-react';
import { Workspace as WorkspaceType, Board } from '../../types';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

type TabId = 'recent' | 'content' | 'permissions';

interface WorkspaceOverviewPageProps {
  workspace: WorkspaceType | null;
  boards: Board[];
  onSelectBoard: (boardId: string) => void;
  onWorkspaceUpdated: (w: WorkspaceType) => void;
  onWorkspaceDeleted: () => void;
}

export const WorkspaceOverviewPage: React.FC<WorkspaceOverviewPageProps> = ({
  workspace,
  boards,
  onSelectBoard,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
}) => {
  const [tab, setTab] = useState<TabId>('recent');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [editingDescription, setEditingDescription] = useState(false);

  React.useEffect(() => {
    setDescription(workspace?.description ?? '');
  }, [workspace?.id, workspace?.description]);
  const [savingDesc, setSavingDesc] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace?.name ?? '');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        setMenuOpen(false);
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
              style={{ backgroundColor: '#00c875' }}
            >
              {initial}
            </div>
            <div>
              <Popover.Root open={renameOpen} onOpenChange={setRenameOpen}>
                <Popover.Trigger asChild>
                  <button className="flex items-center gap-1 text-[22px] font-bold text-monday-text hover:bg-monday-hover rounded px-1 -ml-1">
                    {workspace.name}
                    <span className="text-monday-subtext">▾</span>
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90"
            >
              Invitar / 1
            </button>
            <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="p-2 rounded-monday text-monday-subtext hover:bg-monday-hover hover:text-monday-text"
                >
                  <MoreHorizontal size={20} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 w-56 rounded-xl shadow-monday-lg border border-monday-border bg-white p-1"
                  sideOffset={8}
                  align="end"
                >
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setRenameOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-monday-text hover:bg-monday-hover rounded-lg text-left"
                  >
                    <Pencil size={14} />
                    Renombrar espacio de trabajo
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg text-left opacity-60 cursor-not-allowed"
                    disabled
                  >
                    <Lock size={14} />
                    Cambiar tipo
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-monday-text hover:bg-monday-hover rounded-lg text-left"
                  >
                    <LogOut size={14} />
                    Salir de espacio de trabajo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setDeleteError(null); setDeleteConfirmOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 rounded-lg text-left"
                  >
                    <Trash2 size={14} />
                    Eliminar espacio de trabajo
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>

        <div className="flex gap-1 mt-6 border-b border-monday-border">
          {[
            { id: 'recent' as TabId, label: 'Recientes', icon: Clock },
            { id: 'content' as TabId, label: 'Contenido', icon: FileText },
            { id: 'permissions' as TabId, label: 'Permisos', icon: Lock },
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

      <div className="flex-1 overflow-auto p-6">
        {tab === 'recent' && (
          <ul className="space-y-1">
            {boards.length === 0 ? (
              <p className="text-[13px] text-monday-subtext">No hay tableros en este workspace.</p>
            ) : (
              boards.map(b => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onSelectBoard(b.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-monday hover:bg-monday-hover text-left transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-monday-hover flex items-center justify-center text-monday-subtext">
                      <LayoutGrid size={16} />
                    </div>
                    <span className="text-[14px] font-medium text-monday-text">{b.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        {tab === 'content' && (
          <p className="text-[13px] text-monday-subtext">Contenido del workspace (tableros y elementos).</p>
        )}
        {tab === 'permissions' && (
          <p className="text-[13px] text-monday-subtext">Permisos del espacio de trabajo.</p>
        )}
      </div>

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
