import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ALL_THEME_IDS,
  type AppTheme,
  THEME_LABELS,
  THEME_SWATCHES,
} from '../theme';

const HISTORY_KEY = 'sunday-terminal-history';
const MAX_HISTORY = 5;

export type CommandPaletteItemEntry = {
  itemId: string;
  name: string;
  boardId: string;
  boardName: string;
};

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardNames: { id: string; name: string }[];
  workspaces: { id: string; name: string }[];
  docs: { id: string; title: string }[];
  itemEntries: CommandPaletteItemEntry[];
  activeBoardId: string | null;
  currentUser: { name: string; username: string; role: string } | null;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  onToggleLightDark: () => void;
  onSelectBoard: (boardId: string) => void;
  onSelectItem: (itemId: string, boardId: string) => void;
  onSelectDoc: (docId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onNavigate: (
    page: 'home' | 'notifications' | 'inbox' | 'search' | 'docs' | 'calendar' | 'miTrabajo' | 'team',
  ) => void;
  onQuickNav: (dest: 'inicio' | 'calendario' | 'mi-trabajo' | 'docs') => void;
  onNewItem: () => void;
  onOpenAccount: () => void;
  onExportBoard: () => void;
  onGlobalSearch: (q: string) => void;
  onLogout: () => void;
  canOpenAdmin: boolean;
  onOpenAdmin: () => void;
};

const CMD_SPECS: { cmd: string; desc: string }[] = [
  { cmd: '/help', desc: 'Lista todos los comandos' },
  { cmd: '/temas', desc: 'Selector de tema en esta ventana' },
  { cmd: '/cuenta', desc: 'Resumen de cuenta y enlace al panel' },
  { cmd: '/nuevo', desc: 'Crea ítem en el tablero activo' },
  { cmd: '/tablero', desc: 'Ir a tablero (usa /tablero <nombre>)' },
  { cmd: '/doc', desc: 'Abrir documento (/doc <nombre>)' },
  { cmd: '/workspace', desc: 'Cambiar workspace (/workspace <nombre>)' },
  { cmd: '/shortcuts', desc: 'Atajos de teclado' },
  { cmd: '/cerrar', desc: 'Cerrar sesión (confirmación)' },
  { cmd: '/modo', desc: 'Alternar claro / oscuro' },
  { cmd: '/exportar', desc: 'Exportar tablero activo a Excel' },
  { cmd: '/buscar', desc: 'Búsqueda global (/buscar <texto>)' },
  { cmd: '/ir', desc: 'Navegación rápida (/ir inicio|calendario|mi-trabajo|docs)' },
];

const APP_SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: 'Ctrl/Cmd + K', desc: 'Abrir terminal de comandos' },
  { keys: 'Ctrl + \\', desc: 'Colapsar / expandir barra lateral' },
  { keys: 'Ctrl + Shift + F', desc: 'Modo enfoque (ocultar chrome)' },
  { keys: 'Escape', desc: 'Cerrar paleta / dropdowns' },
];

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? p.filter((x) => typeof x === 'string').slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function pushHistory(line: string) {
  const t = line.trim();
  if (!t) return;
  const prev = readHistory().filter((x) => x !== t);
  const next = [t, ...prev].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function fuzzy<T extends { name?: string; title?: string }>(items: T[], q: string): T[] {
  const n = q.trim().toLowerCase();
  if (!n) return items.slice(0, 12);
  return items
    .filter((it) => {
      const label = ('name' in it && it.name ? it.name : 'title' in it && it.title ? it.title : '') || '';
      return label.toLowerCase().includes(n);
    })
    .slice(0, 12);
}

/**
 * Paleta modo terminal: Ctrl/Cmd+K. Comandos con "/", historial al abrir, resultados inline.
 */
export function CommandPalette({
  open,
  onOpenChange,
  boardNames,
  workspaces,
  docs,
  itemEntries,
  activeBoardId,
  currentUser,
  currentTheme,
  onSelectTheme,
  onToggleLightDark,
  onSelectBoard,
  onSelectItem,
  onSelectDoc,
  onSelectWorkspace,
  onNavigate,
  onQuickNav,
  onNewItem,
  onOpenAccount,
  onExportBoard,
  onGlobalSearch,
  onLogout,
  canOpenAdmin,
  onOpenAdmin,
}: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<string[]>([]);

  /** Contenido inline bajo el input (temas, help, etc.) */
  const [inline, setInline] = useState<
    | { type: 'none' }
    | { type: 'help' }
    | { type: 'themes' }
    | { type: 'shortcuts' }
    | { type: 'account' }
    | { type: 'confirm-logout' }
  >({ type: 'none' });

  const trimmed = q.trim();
  const isCommandMode = trimmed.startsWith('/');
  const slashRest = trimmed.slice(1).trim();
  const firstToken = slashRest.split(/\s+/)[0]?.toLowerCase() ?? '';

  const matchingCommands = useMemo(() => {
    if (!isCommandMode) return [];
    const rest = slashRest;
    const token = rest.split(/\s+/)[0] ?? '';
    if (!token) return CMD_SPECS;
    return CMD_SPECS.filter((c) => c.cmd.slice(1).startsWith(token) || c.cmd.includes(token));
  }, [isCommandMode, slashRest]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setInline({ type: 'none' });
      setHistory(readHistory());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSel(0);
  }, [q, matchingCommands.length, inline.type]);

  const recordAndClose = useCallback(
    (line: string) => {
      pushHistory(line);
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const runLine = useCallback(() => {
    const line = trimmed;
    if (!line) return;

    if (inline.type === 'confirm-logout') {
      if (line.toLowerCase() === 'si' || line.toLowerCase() === 'sí' || line.toLowerCase() === 'y') {
        pushHistory('/cerrar');
        onLogout();
        onOpenChange(false);
      } else {
        setInline({ type: 'none' });
        setQ('');
      }
      return;
    }

    if (line.startsWith('/')) {
      const [cmd0, ...restParts] = line.split(/\s+/);
      const cmd = cmd0.toLowerCase();
      const rest = restParts.join(' ').trim();

      if (cmd === '/help' || cmd === '/?') {
        pushHistory(line);
        setInline({ type: 'help' });
        setQ('');
        return;
      }
      if (cmd === '/temas') {
        pushHistory(line);
        setInline({ type: 'themes' });
        setQ('');
        return;
      }
      if (cmd === '/shortcuts') {
        pushHistory(line);
        setInline({ type: 'shortcuts' });
        setQ('');
        return;
      }
      if (cmd === '/cuenta') {
        pushHistory(line);
        setInline({ type: 'account' });
        onOpenAccount();
        setQ('');
        return;
      }
      if (cmd === '/nuevo') {
        recordAndClose(line);
        onNewItem();
        return;
      }
      if (cmd === '/modo') {
        recordAndClose(line);
        onToggleLightDark();
        return;
      }
      if (cmd === '/exportar') {
        recordAndClose(line);
        onExportBoard();
        return;
      }
      if (cmd === '/cerrar') {
        setInline({ type: 'confirm-logout' });
        setQ('');
        return;
      }
      if (cmd === '/tablero') {
        const boards = fuzzy(boardNames.map((b) => ({ id: b.id, name: b.name })), rest);
        const pick = boards[0];
        if (pick) {
          recordAndClose(line);
          onSelectBoard(pick.id);
        }
        return;
      }
      if (cmd === '/doc') {
        const ds = fuzzy(docs.map((d) => ({ id: d.id, title: d.title })), rest);
        const pick = ds[0];
        if (pick && 'id' in pick) {
          recordAndClose(line);
          onSelectDoc(pick.id);
        }
        return;
      }
      if (cmd === '/workspace') {
        const ws = fuzzy(workspaces.map((w) => ({ id: w.id, name: w.name })), rest);
        const pick = ws[0];
        if (pick) {
          recordAndClose(line);
          onSelectWorkspace(pick.id);
        }
        return;
      }
      if (cmd === '/buscar') {
        if (rest) {
          recordAndClose(line);
          onGlobalSearch(rest);
        }
        return;
      }
      if (cmd === '/ir') {
        const d = rest.toLowerCase().replace(/_/g, '-');
        recordAndClose(line);
        if (d === 'inicio' || d === 'home') onQuickNav('inicio');
        else if (d === 'calendario' || d === 'calendar') onQuickNav('calendario');
        else if (d === 'mi-trabajo' || d === 'mitrabajo') onQuickNav('mi-trabajo');
        else if (d === 'docs' || d === 'documentos') onQuickNav('docs');
        return;
      }
      if (cmd === '/admin' && canOpenAdmin) {
        recordAndClose(line);
        onOpenAdmin();
        return;
      }
    } else {
      const q = line.toLowerCase();
      const itemHit = itemEntries.find((e) => e.name.toLowerCase().includes(q));
      if (itemHit) {
        recordAndClose(line);
        onSelectItem(itemHit.itemId, itemHit.boardId);
        return;
      }
      const boardHit = boardNames.find((b) => b.name.toLowerCase().includes(q));
      if (boardHit) {
        recordAndClose(line);
        onSelectBoard(boardHit.id);
        return;
      }
    }
  }, [
    trimmed,
    inline.type,
    boardNames,
    docs,
    workspaces,
    itemEntries,
    recordAndClose,
    onNewItem,
    onToggleLightDark,
    onExportBoard,
    onLogout,
    onOpenChange,
    onSelectBoard,
    onSelectDoc,
    onSelectWorkspace,
    onGlobalSearch,
    onQuickNav,
    onOpenAdmin,
    canOpenAdmin,
    onSelectItem,
    onOpenAccount,
  ]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inline.type !== 'none') {
        setInline({ type: 'none' });
        return;
      }
      onOpenChange(false);
      return;
    }
    if (e.key === 'Tab' && isCommandMode) {
      e.preventDefault();
      const partial = slashRest.split(/\s+/)[0] ?? '';
      if (!partial || partial.includes('/')) return;
      const match = CMD_SPECS.find((c) => c.cmd.startsWith('/' + partial));
      if (match) {
        setQ(match.cmd + ' ');
      }
      return;
    }
    if (e.key === 'ArrowDown' && isCommandMode && matchingCommands.length > 0) {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, matchingCommands.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' && isCommandMode && matchingCommands.length > 0) {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isCommandMode && matchingCommands.length > 0 && !slashRest.includes(' ') && firstToken) {
        const pick = matchingCommands[sel];
        if (pick) {
          const typedToken = firstToken.toLowerCase();
          const fullToken = pick.cmd.slice(1).toLowerCase(); // 'help' from '/help'
          // Si el usuario todavía está escribiendo algo parcial, Tab lo completa.
          // Si el token ya está completo, Enter debe ejecutar el comando.
          if (typedToken !== fullToken) {
            setQ(pick.cmd + ' ');
            return;
          }
        }
      }
      runLine();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-[14%] z-[501] w-[min(100vw-1.5rem,560px)] -translate-x-1/2 rounded-xl border border-monday-border/80 bg-[var(--monday-surface)]/95 shadow-monday-xl outline-none overflow-hidden"
          onCloseAutoFocus={(ev) => ev.preventDefault()}
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className="sr-only">Terminal de comandos</Dialog.Title>
          <Dialog.Description className="sr-only">
            Escribe comandos con barra o busca tableros e ítems.
          </Dialog.Description>

          <div className="flex items-stretch gap-0 border-b border-monday-border/60 px-3 py-2 font-mono text-[13px] bg-black/20">
            <span className="text-monday-subtext select-none mr-1.5 pt-0.5" aria-hidden>
              &gt;
            </span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Comando o búsqueda…"
              className="flex-1 min-w-0 bg-transparent text-monday-text placeholder:text-monday-subtext/70 outline-none caret-monday-blue"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Entrada de terminal"
            />
            <kbd className="hidden sm:inline text-[10px] text-monday-subtext border border-monday-border/50 rounded px-1 self-center">
              Esc
            </kbd>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto custom-scrollbar px-3 py-2 text-[13px]">
            {inline.type === 'help' && (
              <table className="w-full text-left border-collapse font-mono text-[12px]">
                <thead>
                  <tr className="text-monday-subtext border-b border-monday-border/50">
                    <th className="py-1 pr-2 font-medium">comando</th>
                    <th className="py-1 font-medium">descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {CMD_SPECS.map((r) => (
                    <tr key={r.cmd} className="border-b border-monday-border/30 text-monday-text">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-monday-blue">{r.cmd}</td>
                      <td className="py-1.5 text-monday-subtext">{r.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {inline.type === 'themes' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_THEME_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSelectTheme(id);
                      pushHistory('/temas');
                    }}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                      currentTheme === id
                        ? 'border-monday-blue bg-monday-hover ring-1 ring-monday-blue/40'
                        : 'border-monday-border hover:bg-monday-hover'
                    }`}
                  >
                    <span className="flex gap-1">
                      <span
                        className="h-6 w-6 rounded-full border border-monday-border"
                        style={{ backgroundColor: THEME_SWATCHES[id][0] }}
                      />
                      <span
                        className="h-6 w-6 rounded-full border border-monday-border"
                        style={{ backgroundColor: THEME_SWATCHES[id][1] }}
                      />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-monday-text">{THEME_LABELS[id]}</span>
                    {currentTheme === id && (
                      <span className="text-monday-blue text-xs shrink-0" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {inline.type === 'shortcuts' && (
              <ul className="space-y-1.5 font-mono text-[12px]">
                {APP_SHORTCUTS.map((s) => (
                  <li key={s.keys} className="flex gap-2">
                    <span className="text-monday-blue shrink-0">{s.keys}</span>
                    <span className="text-monday-subtext">{s.desc}</span>
                  </li>
                ))}
              </ul>
            )}

            {inline.type === 'account' && currentUser && (
              <div className="rounded-lg border border-monday-border/60 bg-monday-bg/50 p-3 text-[13px]">
                <p className="font-medium text-monday-text">{currentUser.name}</p>
                <p className="text-monday-subtext text-[12px]">@{currentUser.username}</p>
                <p className="text-[11px] text-monday-subtext mt-1">Rol: {currentUser.role}</p>
                <p className="text-[11px] text-monday-subtext mt-2">
                  El panel de cuenta completo está en el menú del avatar.
                </p>
              </div>
            )}

            {inline.type === 'confirm-logout' && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-[13px] text-monday-text">
                <p className="font-medium">¿Cerrar sesión?</p>
                <p className="text-[12px] text-monday-subtext mt-1">Escribe sí o no, o Esc para cancelar.</p>
              </div>
            )}

            {inline.type === 'none' && !isCommandMode && q.trim() === '' && history.length > 0 && (
              <div className="font-mono text-[11px] text-monday-subtext">
                <p className="uppercase tracking-wider mb-2 text-[10px]">Historial</p>
                <ul className="space-y-1">
                  {history.map((h) => (
                    <li key={h}>
                      <button
                        type="button"
                        className="text-left w-full truncate text-monday-text hover:text-monday-blue"
                        onClick={() => {
                          setQ(h);
                        }}
                      >
                        {h}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {inline.type === 'none' && isCommandMode && q.trim() !== '' && (
              <ul className="font-mono text-[12px] space-y-0.5">
                {matchingCommands.map((c, idx) => (
                  <li key={c.cmd}>
                    <button
                      type="button"
                      className={`w-full text-left px-2 py-1 rounded ${
                        idx === sel ? 'bg-monday-pill text-monday-text' : 'text-monday-subtext hover:bg-monday-hover'
                      }`}
                      onClick={() => {
                        setQ(c.cmd + ' ');
                        inputRef.current?.focus();
                      }}
                    >
                      <span className="text-monday-blue">{c.cmd}</span>{' '}
                      <span className="text-monday-subtext">{c.desc}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {inline.type === 'none' && !isCommandMode && q.trim() !== '' && (
              <p className="text-[12px] text-monday-subtext font-mono">
                Enter para buscar tablero o ítem por nombre.
              </p>
            )}
          </div>

          <div className="border-t border-monday-border/50 px-3 py-1.5 text-[10px] text-monday-subtext font-mono">
            {activeBoardId ? 'Tablero activo' : 'Sin tablero'} · /help
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
