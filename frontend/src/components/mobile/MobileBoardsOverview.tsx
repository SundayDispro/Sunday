import React, { useMemo, useState } from 'react';
import { Board, Workspace } from '../../types';
import { LayoutGrid, Search, ChevronDown, Clock } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useViewport } from '../../hooks/useViewport';

const RECENT_STORAGE_KEY = 'sunday-recent-visits';
const LAST_VISIT_KEY = 'sunday-last-board';

function loadRecentBoardIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { boardIds?: string[] };
    return Array.isArray(parsed.boardIds) ? parsed.boardIds : [];
  } catch {
    return [];
  }
}

function loadLastBoardId(): string | null {
  try {
    return localStorage.getItem(LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

export function MobileBoardsOverview({
  workspaces,
  activeWorkspaceId,
  boards,
  onSelectWorkspace,
  onSelectBoard,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  boards: Board[];
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectBoard: (boardId: string) => void;
}) {
  const { isLandscape } = useViewport();
  const [query, setQuery] = useState('');
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);

  const activeWorkspace = useMemo(() => {
    if (!workspaces.length) return null;
    const byId = activeWorkspaceId ? workspaces.find(w => w.id === activeWorkspaceId) : null;
    return byId ?? workspaces[0];
  }, [workspaces, activeWorkspaceId]);

  const workspaceBoards = useMemo(() => {
    const wsId = activeWorkspace?.id ?? null;
    const q = query.trim().toLowerCase();
    return boards
      .filter(b => b && (!wsId || b.workspaceId === wsId))
      .filter(b => !q || b.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [boards, activeWorkspace?.id, query]);

  const recentBoards = useMemo(() => {
    const ids = loadRecentBoardIds();
    const wsId = activeWorkspace?.id ?? null;
    const map = new Map(boards.map(b => [b.id, b]));
    return ids
      .map(id => map.get(id))
      .filter((b): b is Board => !!b)
      .filter(b => !wsId || b.workspaceId === wsId)
      .slice(0, 10);
  }, [boards, activeWorkspace?.id]);

  const lastBoard = useMemo(() => {
    const id = loadLastBoardId();
    if (!id) return null;
    const b = boards.find(x => x.id === id) ?? null;
    if (!b) return null;
    const wsId = activeWorkspace?.id ?? null;
    if (wsId && b.workspaceId !== wsId) return null;
    return b;
  }, [boards, activeWorkspace?.id]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-monday-bg">
      <div
        className={`shrink-0 px-4 bg-monday-bg border-b border-monday-border/60 space-y-3 ${
          isLandscape ? 'pt-2 pb-2' : 'pt-4 pb-3'
        }`}
      >
      <div className="flex items-center gap-2">
        <Popover.Root open={workspacePickerOpen} onOpenChange={setWorkspacePickerOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2.5 min-h-[44px] rounded-2xl border border-monday-border bg-[var(--monday-surface)] text-[13px] text-monday-text"
              aria-label="Seleccionar workspace"
            >
              <span className="truncate font-semibold">{activeWorkspace?.name ?? 'Workspace'}</span>
              <ChevronDown size={18} className="text-monday-subtext shrink-0" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-[min(320px,90vw)] rounded-2xl shadow-monday-lg border border-monday-border bg-[var(--monday-surface)] p-2"
              sideOffset={8}
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[11px] font-semibold text-monday-subtext px-2 py-1.5 uppercase tracking-wider">
                Workspaces
              </div>
              <div className="max-h-72 overflow-y-auto custom-scrollbar">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(15);
                      onSelectWorkspace(ws.id);
                      setWorkspacePickerOpen(false);
                    }}
                    className={[
                      'w-full flex items-center gap-2 px-2.5 py-2.5 rounded-xl text-left text-[13px] min-h-[44px] transition-colors',
                      ws.id === activeWorkspace?.id
                        ? 'bg-monday-blue/15 text-monday-blue font-semibold'
                        : 'text-monday-text hover:bg-monday-hover',
                    ].join(' ')}
                  >
                    <span className="w-2 h-2 rounded-full bg-current opacity-60 shrink-0" />
                    <span className="truncate">{ws.name}</span>
                  </button>
                ))}
              </div>
              <Popover.Arrow className="fill-[var(--monday-surface)]" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="mt-3 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-monday-subtext" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tableros..."
          className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-2xl border border-monday-border bg-[var(--monday-surface)] text-[16px] sm:text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
        />
      </div>
      </div>

      <div
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch ${
          isLandscape
            ? 'pb-4 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))]'
            : 'px-4 pb-32'
        }`}
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
      {lastBoard && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider px-1 mb-2">
            Retomar
          </div>
          <button
            type="button"
            onClick={() => {
              if (navigator.vibrate) navigator.vibrate(20);
              onSelectBoard(lastBoard.id);
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-3xl bg-[var(--monday-surface)] border border-monday-border shadow-monday-sm text-left min-h-[56px] hover:bg-monday-hover/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-2xl bg-monday-blue/15 text-monday-blue flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-monday-text truncate">{lastBoard.name}</div>
              <div className="text-[11px] text-monday-subtext mt-0.5">
                {lastBoard.groups?.length ?? 0} grupos · {(lastBoard.groups ?? []).reduce((acc, g) => acc + (g.items?.length ?? 0), 0)} elementos
              </div>
            </div>
          </button>
        </div>
      )}

      {recentBoards.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider px-1 mb-2">
              Recientes
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto scroll-touch pb-1">
            {recentBoards.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(15);
                  onSelectBoard(b.id);
                }}
                className="shrink-0 px-3 py-2 rounded-full border border-monday-border bg-[var(--monday-surface)] text-[12px] text-monday-text hover:bg-monday-hover transition-colors"
              >
                <span className="truncate max-w-[220px] inline-block align-middle">{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider px-1 mb-2">
          Tableros
        </div>

        {workspaceBoards.length === 0 ? (
          <div className="rounded-3xl border border-monday-border bg-[var(--monday-surface)] p-4 text-[13px] text-monday-subtext">
            No hay tableros que coincidan con tu búsqueda.
          </div>
        ) : (
          <div className={`grid gap-2 ${isLandscape ? 'grid-cols-2' : ''}`}>
            {workspaceBoards.map((b) => {
              const groupsCount = b.groups?.length ?? 0;
              const itemsCount = (b.groups ?? []).reduce((acc, g) => acc + (g.items?.length ?? 0), 0);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(15);
                    onSelectBoard(b.id);
                  }}
                  className={`w-full flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2.5 sm:py-3 rounded-2xl sm:rounded-3xl bg-[var(--monday-surface)] border border-monday-border shadow-monday-sm text-left min-h-[52px] sm:min-h-[56px] hover:bg-monday-hover/40 transition-colors ${
                    isLandscape ? 'flex-col items-stretch text-center' : ''
                  }`}
                >
                  <div
                    className={`rounded-2xl bg-monday-pill border border-monday-border flex items-center justify-center text-monday-text shrink-0 ${
                      isLandscape ? 'w-9 h-9 mx-auto' : 'w-10 h-10'
                    }`}
                  >
                    <LayoutGrid size={isLandscape ? 16 : 18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] sm:text-[13px] font-semibold text-monday-text line-clamp-2 sm:truncate">
                      {b.name}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-monday-subtext mt-0.5">
                      {groupsCount} grupos · {itemsCount} elem.
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

