import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Clock,
  FileText,
  LayoutGrid,
  Trash2,
  X,
  RotateCcw,
  Search,
  Plus,
  Sparkles,
  FolderOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Workspace as WorkspaceType, Board } from '../../types';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import { useUser } from '../../store/UserContext';
import { apiFetch } from '../../api';
import { can } from '../../authz/can';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

const RECENT_STORAGE_KEY = 'sunday-recent-visits';
const LAST_VISIT_KEY = 'sunday-last-board';
const RETOMA_DISMISSED_KEY = 'sunday-retoma-dismissed';
const MAX_RECENT = 12;

type TabId = 'recent' | 'content';

type BoardLite = { id: string; name: string; workspaceId: string };

interface WorkspaceOverviewPageProps {
  workspace: WorkspaceType | null;
  workspaces: WorkspaceType[];
  boards: Board[];
  onSelectBoard: (boardId: string) => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onWorkspaceUpdated: (w: WorkspaceType) => void;
  onWorkspaceDeleted: () => void;
  onBoardDeleted: () => void;
  showAsHome?: boolean;
  /** Abrir página Buscar (desde el campo «Ir a buscar») */
  onOpenSearch?: () => void;
  /** Solo para el CTA del estado vacío (sin tableros) */
  onRequestAddBoard?: () => void;
}

function loadRecent(): { boardIds: string[]; workspaceIds: string[] } {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return { boardIds: [], workspaceIds: [] };
    const p = JSON.parse(raw) as { boardIds?: string[]; workspaceIds?: string[] };
    return {
      boardIds: Array.isArray(p.boardIds) ? p.boardIds.slice(0, MAX_RECENT) : [],
      workspaceIds: Array.isArray(p.workspaceIds) ? p.workspaceIds.slice(0, MAX_RECENT) : [],
    };
  } catch {
    return { boardIds: [], workspaceIds: [] };
  }
}

function workspaceColor(seed: string): string {
  const colors = ['#00c875', '#5034ff', '#fdab3d', '#e2445c', '#0073ea', '#6e3cbb'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
  return colors[h % colors.length];
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
  showAsHome = false,
  onOpenSearch,
  onRequestAddBoard,
}) => {
  const [tab, setTab] = useState<TabId>('recent');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [editingDescription, setEditingDescription] = useState(false);

  React.useEffect(() => {
    setDescription(workspace?.description ?? '');
  }, [workspace?.id, workspace?.description]);
  React.useEffect(() => {
    setRenameValue(workspace?.name ?? '');
  }, [workspace?.id, workspace?.name]);
  const [savingDesc, setSavingDesc] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace?.name ?? '');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | BoardLite | null>(null);
  const [boardDeleteOpen, setBoardDeleteOpen] = useState(false);
  const [boardDeleting, setBoardDeleting] = useState(false);
  const [boardDeleteError, setBoardDeleteError] = useState<string | null>(null);

  const [retomaDismissed, setRetomaDismissed] = useState(() => {
    try {
      return localStorage.getItem(RETOMA_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [recentVisits, setRecentVisits] = useState(loadRecent);

  const [allBoardsLite, setAllBoardsLite] = useState<BoardLite[]>([]);
  const [allBoardsLoading, setAllBoardsLoading] = useState(true);
  const [overviewSearch, setOverviewSearch] = useState('');
  const [feedPosts, setFeedPosts] = useState<
    { id: string; content: string; createdAt: string; author?: { name?: string; initials?: string } | null }[]
  >([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const refetchAllBoards = useCallback(() => {
    setAllBoardsLoading(true);
    apiFetch(`${API_BASE}/api/boards`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        setAllBoardsLite(
          arr
            .filter((b): b is BoardLite => typeof b === 'object' && b !== null && 'id' in b && 'workspaceId' in b)
            .map((b) => ({
              id: String((b as BoardLite).id),
              name: String((b as BoardLite).name),
              workspaceId: String((b as BoardLite).workspaceId),
            }))
        );
      })
      .catch(() => setAllBoardsLite([]))
      .finally(() => setAllBoardsLoading(false));
  }, []);

  useEffect(() => {
    refetchAllBoards();
  }, [refetchAllBoards, boards.length, workspace?.id]);

  useEffect(() => {
    if (showAsHome) setRecentVisits(loadRecent());
  }, [showAsHome]);

  useEffect(() => {
    if (tab !== 'content') return;
    setFeedLoading(true);
    apiFetch(`${API_BASE}/api/feed`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data : [];
        setFeedPosts(
          list.slice(0, 20).map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ''),
            content: String(p.content ?? ''),
            createdAt: String(p.createdAt ?? ''),
            author: p.author as { name?: string; initials?: string } | null | undefined,
          }))
        );
      })
      .catch(() => setFeedPosts([]))
      .finally(() => setFeedLoading(false));
  }, [tab]);

  const getWorkspaceName = useCallback(
    (workspaceId: string) => workspaces.find((w) => w.id === workspaceId)?.name ?? 'Espacio de trabajo',
    [workspaces]
  );

  const boardsIndex: BoardLite[] = allBoardsLite.length > 0 ? allBoardsLite : boards.map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId }));

  const retomaBoardId = useMemo(() => {
    if (retomaDismissed) return null;
    try {
      return localStorage.getItem(LAST_VISIT_KEY);
    } catch {
      return null;
    }
  }, [retomaDismissed]);

  const retomaBoard = useMemo(() => {
    if (!retomaBoardId) return null;
    return boardsIndex.find((b) => b.id === retomaBoardId) ?? null;
  }, [retomaBoardId, boardsIndex]);

  const recentBoardsResolved = useMemo(() => {
    return recentVisits.boardIds
      .map((id) => boardsIndex.find((b) => b.id === id))
      .filter((b): b is BoardLite => !!b);
  }, [recentVisits.boardIds, boardsIndex]);

  const recentWorkspaces = useMemo(() => {
    return recentVisits.workspaceIds
      .map((id) => workspaces.find((w) => w.id === id))
      .filter((w): w is WorkspaceType => !!w);
  }, [recentVisits.workspaceIds, workspaces]);

  const { currentUser } = useUser();
  const canEditWorkspaceOrBoard = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';
  const canDeleteBoard = can(currentUser, 'board.delete');
  const canCreateBoard = can(currentUser, 'board.create');

  const q = overviewSearch.trim().toLowerCase();
  const matchesQuery = useCallback(
    (b: BoardLite) => {
      if (!q) return true;
      const wsName = getWorkspaceName(b.workspaceId).toLowerCase();
      return b.name.toLowerCase().includes(q) || wsName.includes(q);
    },
    [q, getWorkspaceName]
  );

  const groupedBoards = useMemo(() => {
    const byWs = new Map<string, BoardLite[]>();
    for (const b of boardsIndex) {
      if (!matchesQuery(b)) continue;
      const list = byWs.get(b.workspaceId) ?? [];
      list.push(b);
      byWs.set(b.workspaceId, list);
    }
    return workspaces
      .map((ws) => ({
        workspace: ws,
        boards: (byWs.get(ws.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es')),
      }))
      .filter((g) => g.boards.length > 0);
  }, [boardsIndex, workspaces, matchesQuery]);

  const saveDescription = async () => {
    if (!workspace?.id) return;
    setEditingDescription(false);
    setSavingDesc(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/workspaces/${workspace.id}`, {
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
      const res = await apiFetch(`${API_BASE}/api/workspaces/${workspace.id}`, {
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
      const res = await apiFetch(`${API_BASE}/api/workspaces/${workspace.id}`, { method: 'DELETE' });
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
      const res = await apiFetch(`${API_BASE}/api/boards/${boardToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setBoardDeleteOpen(false);
        setBoardToDelete(null);
        refetchAllBoards();
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
        err instanceof Error ? err.message : 'No se pudo conectar. Comprueba que el backend esté en marcha.'
      );
    } finally {
      setBoardDeleting(false);
    }
  };

  const handleJumpToSearch = () => {
    try {
      if (overviewSearch.trim()) sessionStorage.setItem('sunday-search-prefill', overviewSearch.trim());
    } catch {
      /* ignore */
    }
    onOpenSearch?.();
  };

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-monday-subtext">
        <p>Selecciona un workspace.</p>
      </div>
    );
  }

  const initial = workspace.name.charAt(0).toUpperCase();
  const totalBoardsCount = boardsIndex.length;
  const hasNoBoardsAnywhere = !allBoardsLoading && totalBoardsCount === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg">
      <div className="p-4 sm:p-5 border-b border-monday-border bg-white">
        <div className="flex items-start gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
            style={{ backgroundColor: '#00c875' }}
          >
            {initial}
          </motion.div>
          <div className="min-w-0 flex-1">
            {canEditWorkspaceOrBoard ? (
              <Popover.Root open={renameOpen} onOpenChange={setRenameOpen}>
                <Popover.Trigger asChild>
                  <button className="flex items-center gap-1 text-2xl font-bold text-monday-text hover:bg-monday-hover rounded px-1 -ml-1 min-w-0">
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
                      onChange={(e) => setRenameValue(e.target.value)}
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
              <span className="text-2xl font-bold text-monday-text">{workspace.name}</span>
            )}
            {canEditWorkspaceOrBoard && (
              <>
                {editingDescription ? (
                  <div className="mt-2">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
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
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteConfirmOpen(true);
                  }}
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

        {/* Resumen rápido (compacto) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4"
        >
          {[
            { label: 'Tableros en total', value: totalBoardsCount, icon: LayoutGrid, color: 'text-blue-600' },
            { label: 'Visitados recientes', value: recentVisits.boardIds.length, icon: Clock, color: 'text-violet-600' },
          ].map((card) => (
            <div
              key={card.label}
              className="flex items-center gap-3 rounded-xl border border-monday-border bg-monday-bg/80 px-4 py-3"
            >
              <card.icon size={22} className={`shrink-0 ${card.color}`} />
              <div>
                <p className="text-[20px] font-bold text-monday-text leading-tight">{card.value}</p>
                <p className="text-[11px] font-medium text-monday-subtext uppercase tracking-wide">{card.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="flex gap-1 mt-4 border-b border-monday-border">
          {[
            { id: 'recent' as TabId, label: 'Recientes', icon: Clock },
            { id: 'content' as TabId, label: 'Contenido', icon: FileText },
          ].map((t) => (
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

      <div className="flex-1 overflow-auto custom-scrollbar scroll-touch p-4 sm:p-5 min-h-0">
        {/* Búsqueda global de tableros (nombre o espacio) */}
        <div className="relative mb-5 group/search max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-monday-subtext" />
          <input
            type="search"
            value={overviewSearch}
            onChange={(e) => setOverviewSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJumpToSearch();
            }}
            placeholder="Buscar tablero o espacio de trabajo..."
            className="w-full pl-9 pr-24 py-2.5 rounded-xl bg-white border border-monday-border text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
          />
          {onOpenSearch && (
            <button
              type="button"
              onClick={handleJumpToSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-medium text-monday-blue hover:underline px-2"
            >
              Ir a buscar
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {hasNoBoardsAnywhere && canCreateBoard && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-2xl border border-dashed border-monday-border bg-white p-8 text-center"
            >
              <Sparkles className="mx-auto text-monday-blue mb-3" size={36} />
              <p className="text-[16px] font-semibold text-monday-text mb-1">Crea tu primer tablero</p>
              <p className="text-[13px] text-monday-subtext mb-4 max-w-md mx-auto">
                Los tableros viven dentro de cada espacio de trabajo. Así evitas confusiones cuando varios proyectos
                comparten nombres parecidos.
              </p>
              <button
                type="button"
                onClick={() => onRequestAddBoard?.()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90"
              >
                <Plus size={18} />
                Agregar tablero
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {showAsHome && retomaBoardId && !retomaDismissed && retomaBoard && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 rounded-xl border border-monday-border bg-monday-blue/10 flex items-center gap-3 px-4 py-3"
          >
            <RotateCcw size={20} className="text-monday-blue shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-monday-text">Retoma desde donde estabas</p>
              <p className="text-[12px] text-monday-subtext truncate" title={`${getWorkspaceName(retomaBoard.workspaceId)} › ${retomaBoard.name}`}>
                <span className="font-medium text-monday-text/90">{getWorkspaceName(retomaBoard.workspaceId)}</span>
                <span className="mx-1">›</span>
                {retomaBoard.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectBoard(retomaBoardId!);
                setRetomaDismissed(true);
                try {
                  localStorage.setItem(RETOMA_DISMISSED_KEY, '1');
                } catch {
                  /* ignore */
                }
              }}
              className="shrink-0 px-3 py-1.5 text-[12px] font-medium bg-monday-blue text-white rounded-lg hover:bg-monday-blue/90"
            >
              Ir
            </button>
            <button
              type="button"
              onClick={() => {
                setRetomaDismissed(true);
                try {
                  localStorage.setItem(RETOMA_DISMISSED_KEY, '1');
                } catch {
                  /* ignore */
                }
              }}
              className="shrink-0 p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-text"
              aria-label="No volver a mostrar"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}

        {showAsHome && (recentBoardsResolved.length > 0 || recentWorkspaces.length > 0) && (
          <section className="mb-6">
            <h2 className="text-[15px] font-semibold text-monday-subtext mb-3 uppercase tracking-tight">Visitado recientemente</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scroll-touch custom-scrollbar -mx-1">
              {recentWorkspaces.slice(0, 4).map((ws) => {
                const isActive = ws.id === workspace?.id;
                const wsInitial = ws.name.charAt(0).toUpperCase();
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => onSelectWorkspace?.(ws.id)}
                    className={`shrink-0 flex flex-col items-center gap-1.5 w-[88px] p-3 rounded-xl transition-colors ${
                      isActive ? 'bg-monday-blue/15 ring-1 ring-monday-blue/30' : 'bg-white border border-monday-border hover:bg-monday-hover'
                    }`}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                      style={{ backgroundColor: workspaceColor(ws.id) }}
                    >
                      {wsInitial}
                    </div>
                    <span className="text-[11px] font-medium text-monday-text truncate w-full text-center">{ws.name}</span>
                  </button>
                );
              })}
              {recentBoardsResolved.slice(0, 6).map((b) => {
                const wsName = getWorkspaceName(b.workspaceId);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBoard(b.id)}
                    title={`${wsName} › ${b.name}`}
                    className="shrink-0 flex flex-col items-center gap-1.5 w-[100px] p-3 rounded-xl bg-white border border-monday-border hover:bg-monday-hover transition-colors text-left"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: workspaceColor(b.workspaceId) }}
                    >
                      <LayoutGrid size={22} className="text-white/95" />
                    </div>
                    <span className="text-[11px] font-semibold text-monday-text truncate w-full text-center leading-tight">{b.name}</span>
                    <span className="text-[10px] text-monday-subtext truncate w-full text-center leading-tight">{wsName}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'recent' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {allBoardsLoading && (
              <p className="text-[13px] text-monday-subtext">Cargando tableros…</p>
            )}
            <section>
              <h2 className="text-[15px] font-semibold text-monday-subtext mb-3 uppercase tracking-tight">Tableros por espacio</h2>
              {groupedBoards.length === 0 && !allBoardsLoading ? (
                <p className="text-[13px] text-monday-subtext">
                  {q ? 'Ningún tablero coincide con la búsqueda.' : 'No hay tableros todavía.'}
                </p>
              ) : (
                <div className="space-y-6">
                  {groupedBoards.map(({ workspace: ws, boards: wsBoards }) => (
                    <motion.div
                      key={ws.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-2xl border border-monday-border bg-white overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-4 py-3 bg-monday-bg/90 border-b border-monday-border">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ backgroundColor: workspaceColor(ws.id) }}
                        >
                          {ws.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-monday-text truncate">{ws.name}</p>
                          <p className="text-[11px] text-monday-subtext">
                            {wsBoards.length} tablero{wsBoards.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <ul className="divide-y divide-monday-border/80">
                        {wsBoards.map((b) => (
                          <li key={b.id} className="flex items-center justify-between gap-3 hover:bg-monday-hover/40 transition-colors">
                            <button
                              type="button"
                              title={`${ws.name} › ${b.name}`}
                              onClick={() => onSelectBoard(b.id)}
                              className="flex-1 flex items-center gap-4 px-4 py-3 text-left min-w-0"
                            >
                              <div className="w-12 h-12 rounded-xl bg-monday-blue/15 flex items-center justify-center text-monday-blue shrink-0">
                                <LayoutGrid size={24} />
                              </div>
                              <span className="text-[16px] font-semibold text-monday-text truncate">{b.name}</span>
                            </button>
                            {canDeleteBoard && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBoardToDelete(b);
                                  setBoardDeleteError(null);
                                  setBoardDeleteOpen(true);
                                }}
                                className="p-2.5 mr-2 rounded-xl text-monday-subtext hover:text-red-600 hover:bg-red-50 shrink-0"
                                aria-label={`Eliminar tablero ${b.name}`}
                              >
                                <Trash2 size={20} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}

        {tab === 'content' && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-3xl"
          >
            <h2 className="text-[18px] font-semibold text-monday-text mb-2">Bandeja y actividad</h2>
            <p className="text-[13px] text-monday-subtext mb-4">
              Publicaciones recientes del equipo (menciones y avisos). El detalle por tablero sigue en cada vista Kanban.
            </p>
            {feedLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
              </div>
            ) : feedPosts.length === 0 ? (
              <div className="rounded-xl border border-monday-border bg-white p-6 text-[13px] text-monday-subtext">
                No hay publicaciones recientes en la bandeja.
              </div>
            ) : (
              <ul className="space-y-3">
                {feedPosts.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-monday-border bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] font-semibold text-monday-text">
                        {p.author?.name ?? p.author?.initials ?? 'Usuario'}
                      </span>
                      <span className="text-[11px] text-monday-subtext">
                        {p.createdAt ? new Date(p.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                      </span>
                    </div>
                    <p className="text-[13px] text-monday-text whitespace-pre-wrap line-clamp-6">{p.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        )}
      </div>

      <Dialog.Root
        open={boardDeleteOpen}
        onOpenChange={(open) => {
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
            <Dialog.Title className="text-[18px] font-semibold text-monday-text">Eliminar tablero</Dialog.Title>
            <Dialog.Description className="text-[14px] text-monday-subtext mt-2">
              ¿Estás seguro? Se eliminará el tablero &quot;{boardToDelete?.name}&quot;
              {boardToDelete && 'workspaceId' in boardToDelete ? (
                <>
                  {' '}
                  del espacio <span className="font-medium text-monday-text">{getWorkspaceName(boardToDelete.workspaceId)}</span>
                </>
              ) : null}{' '}
              y todo su contenido. Esta acción no se puede deshacer.
            </Dialog.Description>
            {boardDeleteError && (
              <p className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[13px]" role="alert">
                {boardDeleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg">Cancelar</button>
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
            <Dialog.Title className="text-[18px] font-semibold text-monday-text">Eliminar espacio de trabajo</Dialog.Title>
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
                <button className="px-4 py-2 text-[13px] text-monday-subtext hover:bg-monday-hover rounded-lg">Cancelar</button>
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
