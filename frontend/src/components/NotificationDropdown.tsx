import React, { useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Bell, CheckCheck, ChevronRight, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE, apiFetch } from '../api';
import { useUser } from '../store/UserContext';
import { socket } from '../store/socket';
import type { Notification, Item } from '../types';
import { parseNotificationsListPayload } from '../utils/notificationsResponse';

type TabId = 'all' | 'unread' | 'mentions' | 'assignments';

type Props = {
  onOpenItem?: (item: Item, boardId: string) => void;
  /** Abre la vista completa de notificaciones (p. ej. página dedicada). */
  onOpenFullPage?: () => void;
  onNotificationsChange?: () => void;
  unreadCount: number;
  recentPulse?: boolean;
  isActive?: boolean;
  compact?: boolean;
  /** 'sidebar' = rail negro; 'header' = barra superior clara */
  variant?: 'sidebar' | 'header';
};

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'Hoy';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (day.getTime() === y.getTime()) return 'Ayer';
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function NotificationDropdown({
  onOpenItem,
  onOpenFullPage,
  onNotificationsChange,
  unreadCount,
  recentPulse,
  isActive,
  compact = false,
  variant = 'sidebar',
}: Props) {
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('all');
  const [raw, setRaw] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/notifications?limit=40&skip=0`, { silent: true });
      if (res.ok) {
        const data = await res.json();
        const parsed = parseNotificationsListPayload(data, 0);
        setRaw(parsed.items as Notification[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, currentUser?.id]);

  useEffect(() => {
    const onCreated = () => {
      if (open) void load();
      onNotificationsChange?.();
    };
    socket.on('notification_created', onCreated);
    return () => {
      socket.off('notification_created', onCreated);
    };
  }, [open, onNotificationsChange]);

  const items = useMemo(() => {
    let list = raw;
    if (tab === 'unread') list = list.filter((n) => !n.read);
    if (tab === 'assignments') list = list.filter((n) => n.type === 'assigned');
    if (tab === 'mentions') list = list.filter((n) => n.type === 'mention' || n.type === 'comment');
    return list;
  }, [raw, tab]);

  const markRead = async (id: string) => {
    await apiFetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
    setRaw((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    onNotificationsChange?.();
  };

  const markAllRead = async () => {
    await apiFetch(`${API_BASE}/api/notifications/read-all`, { method: 'PATCH' });
    setRaw((prev) => prev.map((n) => ({ ...n, read: true })));
    onNotificationsChange?.();
  };

  const grouped = useMemo(() => {
    const m = new Map<string, Notification[]>();
    for (const n of items) {
      const key = dayLabel(new Date(n.createdAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(n);
    }
    return m;
  }, [items]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Notificaciones"
          className={`relative flex items-center justify-center rounded-lg transition-all duration-150 ${
            compact ? 'min-h-[36px] min-w-[36px] w-[36px] h-[36px]' : 'min-h-[44px] min-w-[44px] w-11 h-11'
          } ${
            variant === 'header'
              ? isActive
                ? 'bg-monday-pill text-monday-text shadow-sm'
                : 'text-monday-subtext hover:text-monday-text hover:bg-monday-hover'
              : isActive
                ? 'bg-monday-sidebarHover text-white shadow-sm'
                : 'text-white/70 hover:text-white hover:bg-monday-sidebarHover'
          }`}
          aria-label="Notificaciones"
        >
          <Bell size={compact ? 18 : 22} strokeWidth={2.25} />
          {recentPulse && (
            <span
              className={`absolute -top-1 -left-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ${
                variant === 'header' ? 'ring-white' : 'ring-black'
              }`}
              aria-hidden
            />
          )}
          {unreadCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 px-1 flex items-center justify-center bg-red-500 text-white font-bold rounded-full ${
                compact
                  ? 'min-w-[14px] h-[3px] text-[9px]'
                  : 'min-w-[16px] h-4 text-[10px]'
              }`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-[400] w-[380px] max-h-[min(500px,70vh)] flex flex-col rounded-xl border border-monday-border bg-[var(--monday-surface)] shadow-monday-xl outline-none overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 border-b border-monday-border px-3 py-2 shrink-0">
            <div className="flex gap-1 flex-wrap text-[11px]">
              {(['all', 'unread', 'mentions', 'assignments'] as TabId[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2 py-1 capitalize ${
                    tab === t ? 'bg-monday-pill text-monday-text font-medium' : 'text-monday-subtext hover:bg-monday-hover'
                  }`}
                >
                  {t === 'all' ? 'Todas' : t === 'unread' ? 'Sin leer' : t === 'mentions' ? 'Menciones' : 'Asignaciones'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-[11px] text-monday-blue hover:underline shrink-0 flex items-center gap-1"
            >
              <CheckCheck size={14} />
              Marcar todo
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
            {loading && <p className="text-center text-[12px] text-monday-subtext py-6">Cargando…</p>}
            {!loading && items.length === 0 && (
              <p className="text-center text-[12px] text-monday-subtext py-8">Sin notificaciones</p>
            )}
            <AnimatePresence initial={false}>
              {Array.from(grouped.entries()).map(([label, group]) => (
                <div key={label} className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-monday-subtext px-1 mb-1">{label}</p>
                  <ul className="space-y-1">
                    {group.map((n, i) => (
                      <motion.li
                        key={n.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void markRead(n.id);
                            if (n.item && n.item.group?.board?.id) {
                              onOpenItem?.(n.item as Item, n.item.group.board.id);
                            }
                            setOpen(false);
                          }}
                          className={`w-full text-left rounded-lg px-2 py-2 text-[12px] hover:bg-monday-hover ${
                            !n.read ? 'bg-monday-pill/50' : ''
                          }`}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="text-monday-text line-clamp-2">
                              {n.type === 'assigned' ? 'Te asignaron un elemento' : 'Notificación'}
                            </span>
                            <ExternalLink size={12} className="shrink-0 text-monday-subtext mt-0.5" />
                          </div>
                          <span className="text-[10px] text-monday-subtext">
                            {new Date(n.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ))}
            </AnimatePresence>
          </div>
          {onOpenFullPage && (
            <div className="shrink-0 border-t border-monday-border px-2 py-1.5 bg-[var(--monday-bg)]/40">
              <button
                type="button"
                onClick={() => {
                  onOpenFullPage();
                  setOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-medium text-monday-blue hover:bg-monday-hover transition-colors"
              >
                Ver todas las notificaciones
                <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
