import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  LayoutGrid,
  Bell,
  Home,
  Inbox,
  Sun,
  Moon,
  Sparkles,
  ListTodo,
  LogOut,
  Shield,
} from 'lucide-react';
import {
  ALL_THEME_IDS,
  type AppTheme,
  SIDEBAR_THEME_IDS,
  THEME_LABELS,
  THEME_SWATCHES,
} from '../theme';

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
  /** Elementos cargados en los tableros del workspace (para búsqueda por nombre). */
  itemEntries: CommandPaletteItemEntry[];
  onSelectBoard: (boardId: string) => void;
  /** Abre el tablero y selecciona el elemento en el panel lateral. */
  onSelectItem: (itemId: string, boardId: string) => void;
  onNavigate: (page: 'home' | 'notifications' | 'inbox' | 'search') => void;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  onLogout: () => void;
  /** Solo ADMIN: muestra Administración en /acciones. */
  canOpenAdmin: boolean;
  onOpenAdmin: () => void;
};

function ThemeRowIcon({ id }: { id: AppTheme }) {
  if (id === 'light') return <Sun size={16} className="shrink-0" />;
  if (id === 'dark') return <Moon size={16} className="shrink-0" />;
  return <Sparkles size={16} className="shrink-0" />;
}

/**
 * Paleta Ctrl/Cmd+K: tableros, elementos, atajos, /temas y /acciones.
 */
export function CommandPalette({
  open,
  onOpenChange,
  boardNames,
  itemEntries,
  onSelectBoard,
  onSelectItem,
  onNavigate,
  currentTheme,
  onSelectTheme,
  onLogout,
  canOpenAdmin,
  onOpenAdmin,
}: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = q.trim();
  const lower = trimmed.toLowerCase();
  const themeMode = lower.startsWith('/temas');
  // Si el usuario escribe '/', mostramos las acciones disponibles.
  // Excepción: '/temas...' ya es modo tema.
  const accionesMode = lower.startsWith('/') && !themeMode;

  const themeFilter = useMemo(() => {
    if (!themeMode) return '';
    return trimmed.slice('/temas'.length).trim().toLowerCase();
  }, [trimmed, themeMode]);

  const accionesFilter = useMemo(() => {
    if (!accionesMode) return '';
    return trimmed.slice(1).trim().toLowerCase();
  }, [trimmed, accionesMode]);

  const normalized = lower;

  const boardMatches = useMemo(() => {
    if (themeMode || accionesMode) return [];
    if (!normalized) return boardNames.slice(0, 12);
    return boardNames.filter((b) => b.name.toLowerCase().includes(normalized)).slice(0, 20);
  }, [boardNames, normalized, themeMode, accionesMode]);

  const itemMatches = useMemo(() => {
    if (themeMode || accionesMode) return [];
    if (!normalized) return [];
    return itemEntries
      .filter((it) => it.name.toLowerCase().includes(normalized))
      .slice(0, 22);
  }, [itemEntries, normalized, themeMode, accionesMode]);

  const staticCommands = useMemo(() => {
    if (themeMode || accionesMode) return [];
    const cmds: { id: string; label: string; icon: React.ReactNode; run: () => void }[] = [
      { id: 'home', label: 'Ir a inicio', icon: <Home size={16} />, run: () => onNavigate('home') },
      { id: 'notif', label: 'Notificaciones', icon: <Bell size={16} />, run: () => onNavigate('notifications') },
      { id: 'inbox', label: 'Bandeja / actividad', icon: <Inbox size={16} />, run: () => onNavigate('inbox') },
      { id: 'search', label: 'Búsqueda', icon: <Search size={16} />, run: () => onNavigate('search') },
    ];
    if (!normalized) return cmds;
    if (normalized.startsWith('/')) return [];
    return cmds.filter((c) => c.label.toLowerCase().includes(normalized));
  }, [normalized, onNavigate, themeMode, accionesMode]);

  const accionesDefinitions = useMemo(() => {
    const rows: { key: string; label: string; icon: React.ReactNode; run: () => void }[] = [
      { key: 'a-home', label: 'Ir a inicio', icon: <Home size={16} />, run: () => onNavigate('home') },
      { key: 'a-notif', label: 'Notificaciones', icon: <Bell size={16} />, run: () => onNavigate('notifications') },
      { key: 'a-inbox', label: 'Bandeja / actividad', icon: <Inbox size={16} />, run: () => onNavigate('inbox') },
      { key: 'a-search', label: 'Búsqueda global', icon: <Search size={16} />, run: () => onNavigate('search') },
    ];
    if (canOpenAdmin) {
      rows.push({
        key: 'a-admin',
        label: 'Administración de usuarios',
        icon: <Shield size={16} />,
        run: () => {
          onOpenAdmin();
        },
      });
    }
    rows.push({
      key: 'a-logout',
      label: 'Cerrar sesión',
      icon: <LogOut size={16} />,
      run: () => {
        onLogout();
      },
    });
    return rows;
  }, [onNavigate, onOpenAdmin, onLogout, canOpenAdmin]);

  const accionesRows = useMemo(() => {
    if (!accionesMode) return [];
    return accionesDefinitions
      .filter((r) => {
        if (!accionesFilter) return true;
        return r.label.toLowerCase().includes(accionesFilter);
      })
      .map((r) => ({
        key: r.key,
        label: r.label,
        icon: r.icon,
        onSelect: r.run,
      }));
  }, [accionesMode, accionesDefinitions, accionesFilter]);

  const themeRows = useMemo(() => {
    if (!themeMode) return [];
    return ALL_THEME_IDS.filter((id) => {
      const label = THEME_LABELS[id].toLowerCase();
      const idMatch = id.toLowerCase().includes(themeFilter);
      return !themeFilter || label.includes(themeFilter) || idMatch;
    }).map((id) => ({
      key: `theme-${id}`,
      themeId: id,
      label: THEME_LABELS[id],
      icon: <ThemeRowIcon id={id} />,
      onSelect: () => onSelectTheme(id),
      isCurrent: currentTheme === id,
    }));
  }, [themeMode, themeFilter, onSelectTheme, currentTheme]);

  const flatRows = useMemo(() => {
    if (themeMode) {
      return themeRows.map((r) => ({
        key: r.key,
        themeId: r.themeId,
        label: r.label,
        icon: r.icon,
        onSelect: r.onSelect,
        isCurrent: r.isCurrent,
      }));
    }
    if (accionesMode) {
      return accionesRows;
    }
    const rows: Array<{
      key: string;
      themeId?: AppTheme;
      label: string;
      icon?: React.ReactNode;
      onSelect: () => void;
      isCurrent?: boolean;
      subtitle?: string;
    }> = [];
    staticCommands.forEach((c) =>
      rows.push({ key: `s-${c.id}`, label: c.label, icon: c.icon, onSelect: c.run })
    );
    itemMatches.forEach((it) =>
      rows.push({
        key: `i-${it.itemId}`,
        label: it.name,
        subtitle: it.boardName,
        icon: <ListTodo size={16} />,
        onSelect: () => onSelectItem(it.itemId, it.boardId),
      })
    );
    boardMatches.forEach((b) =>
      rows.push({
        key: `b-${b.id}`,
        label: b.name,
        icon: <LayoutGrid size={16} />,
        onSelect: () => onSelectBoard(b.id),
      })
    );
    return rows;
  }, [
    themeMode,
    accionesMode,
    themeRows,
    accionesRows,
    staticCommands,
    itemMatches,
    boardMatches,
    onSelectBoard,
    onSelectItem,
  ]);

  useEffect(() => {
    setSel(0);
  }, [q, open, themeMode, accionesMode]);

  useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const runSelected = () => {
    const row = flatRows[sel];
    if (row) {
      row.onSelect();
      onOpenChange(false);
    }
  };

  const placeholder = themeMode
    ? 'Filtrar temas…'
    : accionesMode
      ? 'Filtrar acciones…'
      : 'Buscar elementos, tableros, /temas, /acciones…';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[500]" />
        <Dialog.Content
          className="fixed left-1/2 top-[18%] z-[501] w-[min(100vw-2rem,420px)] -translate-x-1/2 rounded-xl border border-monday-border bg-[var(--monday-surface)] shadow-monday-xl p-2 outline-none"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((i) => Math.min(i + 1, Math.max(0, flatRows.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              runSelected();
            }
          }}
        >
          <Dialog.Title className="sr-only">Paleta de comandos</Dialog.Title>
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-monday-border mb-1">
            <Search size={18} className="text-monday-subtext shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="flex-1 min-w-0 bg-transparent text-[15px] text-monday-text outline-none placeholder:text-monday-border"
            />
            <kbd className="hidden sm:inline text-[10px] text-monday-subtext border border-monday-border rounded px-1">Esc</kbd>
          </div>
          {themeMode && (
            <p className="px-2 pb-1 text-[11px] text-monday-subtext">
              {ALL_THEME_IDS.length} temas (rápido en la barra: {SIDEBAR_THEME_IDS.map((id) => THEME_LABELS[id]).join(', ')}).
            </p>
          )}
          {accionesMode && (
            <p className="px-2 pb-1 text-[11px] text-monday-subtext">
              Acciones de cuenta y navegación. <span className="font-mono text-monday-text">/temas</span> para apariencia.
            </p>
          )}
          <div className="max-h-[min(50vh,360px)] overflow-y-auto custom-scrollbar">
            {flatRows.length === 0 ? (
              <p className="px-3 py-6 text-[13px] text-monday-subtext text-center">Sin resultados</p>
            ) : (
              flatRows.map((row, idx) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => {
                    row.onSelect();
                    onOpenChange(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] ${
                    idx === sel ? 'bg-monday-pill text-monday-text' : 'text-monday-text hover:bg-monday-hover'
                  }`}
                >
                  <span className="text-monday-subtext shrink-0">{row.icon}</span>
                  <span className="min-w-0 flex-1 flex flex-col">
                    <span className="truncate">{row.label}</span>
                    {'subtitle' in row && (row as { subtitle?: string }).subtitle && (
                      <span className="text-[11px] text-monday-subtext truncate">
                        {(row as { subtitle?: string }).subtitle}
                      </span>
                    )}
                  </span>
                  {themeMode && 'themeId' in row && row.isCurrent && (
                    <span className="text-[11px] text-monday-subtext shrink-0">Actual</span>
                  )}
                  {themeMode && 'themeId' in row && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-monday-border"
                        style={{ backgroundColor: THEME_SWATCHES[row.themeId as AppTheme][0] }}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-monday-border"
                        style={{ backgroundColor: THEME_SWATCHES[row.themeId as AppTheme][1] }}
                      />
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
