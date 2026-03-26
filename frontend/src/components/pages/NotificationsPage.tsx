import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, AtSign, UserPlus } from 'lucide-react';
import { EmptyState } from '../EmptyState';
import { useUser } from '../../store/UserContext';
import { FeedPost, Notification as NotificationType, Item } from '../../types';
import { apiFetch } from '../../api';
import { parseNotificationsListPayload } from '../../utils/notificationsResponse';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

type TabId = 'all' | 'mentions' | 'assignments';

function daySectionLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === today.getTime()) return 'Hoy';
  if (d.getTime() === yesterday.getTime()) return 'Ayer';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

type FeedPostMention = {
  id: string;
  content: string;
  authorId: string;
  author?: { id: string; name: string; initials: string; color: string };
  createdAt: string;
};

interface NotificationsPageProps {
  onOpenItem?: (item: Item, boardId: string) => void;
  onOpenInbox?: (opts?: InboxOpenOpts) => void;
  onNotificationsChange?: () => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  onOpenItem,
  onOpenInbox,
  onNotificationsChange,
}) => {
  const { currentUser } = useUser();
  const [tab, setTab] = useState<TabId>('all');
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [notifSkip, setNotifSkip] = useState(0);
  const [notifHasMore, setNotifHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mentions, setMentions] = useState<FeedPostMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mentionsReadAt, setMentionsReadAt] = useState<number>(0);

  const getMentionsReadAtKey = (userId: string) => `sunday_mentions_read_at_${userId}`;

  const isMentionRead = (post: FeedPost) => {
    const ts = new Date(post.createdAt).getTime();
    if (!Number.isFinite(ts)) return true; // si no hay fecha válida, lo tratamos como "leído"
    return ts <= mentionsReadAt;
  };

  const markMentionAsRead = (post: FeedPost) => {
    if (!currentUser?.id) return;
    const ts = new Date(post.createdAt).getTime();
    if (!Number.isFinite(ts)) return;
    const next = Math.max(mentionsReadAt, ts);
    setMentionsReadAt(next);
    try {
      localStorage.setItem(getMentionsReadAtKey(currentUser.id), String(next));
    } catch {
      // ignore: localStorage puede fallar en algunos entornos
    }
  };

  const fetchNotificationsPage = async (reset: boolean) => {
    if (!currentUser?.id) return;
    const skip = reset ? 0 : notifSkip;
    const sp = new URLSearchParams();
    sp.set('limit', '20');
    sp.set('skip', String(skip));
    if (tab === 'assignments') sp.set('type', 'assigned');
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      const res = await apiFetch(`${API_BASE}/api/notifications?${sp.toString()}`, { silent: true });
      if (res.ok) {
        const data = await res.json();
        const parsed = parseNotificationsListPayload(data, skip);
        const items = parsed.items as NotificationType[];
        const { hasMore, nextSkip } = parsed;
        if (reset) {
          setNotifications(items);
        } else {
          setNotifications((prev) => {
            const seen = new Set(prev.map((n) => n.id));
            const merged = [...prev];
            for (const n of items) {
              if (!seen.has(n.id)) merged.push(n);
            }
            return merged;
          });
        }
        setNotifSkip(nextSkip);
        setNotifHasMore(hasMore);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreNotifications = () => {
    if (!notifHasMore || loadingMore) return;
    void fetchNotificationsPage(false);
  };

  const fetchMentions = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await apiFetch(
        `${API_BASE}/api/feed?filter=mentions&userId=${encodeURIComponent(currentUser.id)}`
      );
      if (res.ok) {
        const data = await res.json();
        setMentions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching mentions:', err);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    setNotifSkip(0);
    void fetchNotificationsPage(true);
    void fetchMentions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchNotificationsPage estable por cierre
  }, [currentUser?.id, tab]);

  // Cargar el "read cursor" local de menciones (bandeja móvil).
  useEffect(() => {
    if (!currentUser?.id) return;
    try {
      const raw = localStorage.getItem(getMentionsReadAtKey(currentUser.id));
      const parsed = raw == null ? 0 : Number(raw);
      setMentionsReadAt(Number.isFinite(parsed) ? parsed : 0);
    } catch {
      setMentionsReadAt(0);
    }
  }, [currentUser?.id]);

  const markAsRead = async (id: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
        onNotificationsChange?.();
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await apiFetch(`${API_BASE}/api/notifications/read-all`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        const next = Date.now();
        setMentionsReadAt(next);
        try {
          localStorage.setItem(getMentionsReadAtKey(currentUser.id), String(next));
        } catch {
          // ignore
        }
        onNotificationsChange?.();
        setNotifSkip(0);
        await fetchNotificationsPage(true);
      }
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleAssignmentClick = (n: NotificationType) => {
    if (!n.item) return;
    const boardId = n.item.group?.board?.id;
    if (boardId && onOpenItem) {
      markAsRead(n.id);
      onOpenItem(n.item as Item, boardId);
    }
  };

  const handleMentionClick = (post?: FeedPost) => {
    if (post) markMentionAsRead(post);
    onOpenInbox?.({ postId: post?.id, tab: 'mentions' });
  };

  const unreadAssignmentsCount = notifications.filter(n => !n.read && (n.type === 'assigned' || n.item)).length;
  const assignments = notifications.filter(n => n.type === 'assigned' || n.item);
  const q = searchQuery.trim().toLowerCase();

  const unreadAssignments = assignments.filter(n => !n.read);
  const readAssignments = assignments.filter(n => n.read);

  const filteredUnreadAssignments = (onlyUnread ? unreadAssignments : assignments).filter(
    n =>
      !q ||
      n.item?.name?.toLowerCase().includes(q) ||
      n.item?.group?.board?.name?.toLowerCase().includes(q)
  );

  const filteredReadAssignments = readAssignments.filter(
    n =>
      !q ||
      n.item?.name?.toLowerCase().includes(q) ||
      n.item?.group?.board?.name?.toLowerCase().includes(q)
  );

  const unreadAssignmentsByDay = useMemo(() => {
    const sorted = [...filteredUnreadAssignments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const order: string[] = [];
    const map = new Map<string, NotificationType[]>();
    for (const n of sorted) {
      const label = daySectionLabel(new Date(n.createdAt));
      if (!map.has(label)) {
        order.push(label);
        map.set(label, []);
      }
      map.get(label)!.push(n);
    }
    return { order, map };
  }, [filteredUnreadAssignments]);

  const mentionsByQuery = mentions.filter(
    m =>
      !q ||
      m.content?.toLowerCase().includes(q) ||
      m.author?.name?.toLowerCase().includes(q)
  );
  const mentionsUnread = mentionsByQuery.filter(m => !isMentionRead(m));
  const mentionsRead = mentionsByQuery.filter(m => isMentionRead(m));
  const unreadMentionsCount = mentionsUnread.length;
  const unreadCount = unreadAssignmentsCount + unreadMentionsCount;

  const showAssignments = tab === 'all' || tab === 'assignments';
  const showMentions = tab === 'all' || tab === 'mentions';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch">
      <div className="p-4 sm:p-6 border-b border-monday-border shrink-0">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h1 className="text-[18px] sm:text-[20px] font-semibold text-monday-text flex items-center gap-2">
            <Bell size={22} className="text-monday-blue shrink-0" />
            Notificaciones
          </h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-[13px] text-monday-blue hover:bg-monday-hover rounded-lg transition-colors touch-manipulation"
            >
              <CheckCheck size={16} />
              Marcar todas como leídas
            </button>
          )}
        </div>

        <div className="flex gap-1 border-b border-monday-border mb-4 overflow-x-auto scroll-touch -mx-1 px-1 flex-nowrap">
          {[
            { id: 'all' as TabId, label: 'Todas', labelShort: 'Todas' },
            { id: 'mentions' as TabId, label: 'Menciones', labelShort: 'Menc.', icon: AtSign },
            { id: 'assignments' as TabId, label: 'Asignaciones', labelShort: 'Asig.', icon: UserPlus },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 py-2.5 px-3 min-h-[44px] shrink-0 text-[13px] font-medium border-b-2 -mb-px transition-colors touch-manipulation ${
                tab === t.id ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text'
              }`}
            >
              {t.icon && <t.icon size={14} className="shrink-0" />}
              <span className="sm:hidden">{(t as { labelShort?: string }).labelShort ?? t.label}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Busca notificaciones..."
            className="flex-1 min-w-[140px] px-3 py-2 min-h-[44px] rounded-monday border border-monday-border bg-white text-monday-text text-[13px] placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
          />
          <label className="flex items-center gap-2 text-[13px] text-monday-subtext whitespace-nowrap min-h-[44px] py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={e => setOnlyUnread(e.target.checked)}
              className="rounded border-monday-border text-monday-blue focus:ring-monday-blue w-4 h-4"
            />
            Solo no leídas
          </label>
          <label className="flex items-center gap-2 text-[13px] text-monday-subtext whitespace-nowrap min-h-[44px] py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showRead}
              onChange={e => setShowRead(e.target.checked)}
              className="rounded border-monday-border text-monday-blue focus:ring-monday-blue w-4 h-4"
            />
            Mostrar leídas
          </label>
        </div>
      </div>

      <div className="p-4 sm:p-6 pb-32">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {showAssignments && (
              <section className="mb-6">
                <h2 className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
                  Asignaciones
                </h2>
                {filteredUnreadAssignments.length === 0 ? (
                  <p className="text-[13px] text-monday-subtext py-2">
                    No hay asignaciones para mostrar.
                  </p>
                ) : (
                  <>
                    {unreadAssignmentsByDay.order.map((dayLabel) => (
                      <div key={dayLabel} className="mb-4 last:mb-0">
                        <h3 className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
                          {dayLabel}
                        </h3>
                        <ul className="divide-y divide-monday-border rounded-lg border border-monday-border overflow-hidden">
                          {(unreadAssignmentsByDay.map.get(dayLabel) ?? []).map((n) => (
                            <li
                              key={n.id}
                              className={`py-3 px-2 flex items-start gap-3 hover:bg-monday-hover/50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                            >
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleAssignmentClick(n)}
                                  className="text-left w-full"
                                >
                                  <p className="text-[14px] text-monday-text font-medium">
                                    Te han asignado en un elemento
                                  </p>
                                  {n.item && (
                                    <p className="text-[13px] text-monday-subtext mt-0.5 truncate">
                                      {n.item.name}
                                      {n.item.group?.board?.name && (
                                        <span> · {n.item.group.board.name}</span>
                                      )}
                                    </p>
                                  )}
                                  <p className="text-[12px] text-monday-subtext mt-1">
                                    {new Date(n.createdAt).toLocaleDateString('es', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </button>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!n.read && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(n.id);
                                    }}
                                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors touch-manipulation"
                                    title="Marcar como leída"
                                  >
                                    <Check size={16} />
                                  </button>
                                )}
                                {n.item?.group?.board?.id && onOpenItem && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      n.item &&
                                      n.item.group?.board?.id &&
                                      onOpenItem(n.item as Item, n.item.group.board.id)
                                    }
                                    className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors"
                                    title="Ir al tablero"
                                  >
                                    <ExternalLink size={16} />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {notifHasMore && (
                      <button
                        type="button"
                        onClick={loadMoreNotifications}
                        disabled={loadingMore}
                        className="mt-3 w-full py-2.5 text-[13px] font-medium text-monday-blue border border-monday-border rounded-lg hover:bg-monday-hover disabled:opacity-50"
                      >
                        {loadingMore ? 'Cargando…' : 'Cargar más'}
                      </button>
                    )}
                  </>
                )}

                {showRead && filteredReadAssignments.length > 0 && (
                  <div className="mt-4 border-t border-monday-border pt-3">
                    <h3 className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
                      Leídas
                    </h3>
                    <ul className="divide-y divide-monday-border">
                      {filteredReadAssignments.map(n => (
                        <li
                          key={n.id}
                          className="py-3 flex items-start gap-3 bg-monday-hover/30"
                        >
                          <div className="flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleAssignmentClick(n)}
                              className="text-left w-full"
                            >
                              <p className="text-[14px] text-monday-text font-medium">
                                Te han asignado en un elemento
                              </p>
                              {n.item && (
                                <p className="text-[13px] text-monday-subtext mt-0.5 truncate">
                                  {n.item.name}
                                  {n.item.group?.board?.name && (
                                    <span> · {n.item.group.board.name}</span>
                                  )}
                                </p>
                              )}
                              <p className="text-[12px] text-monday-subtext mt-1">
                                {new Date(n.createdAt).toLocaleDateString('es', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </button>
                          </div>
                          {n.item?.group?.board?.id && onOpenItem && (
                            <button
                              type="button"
                              onClick={() =>
                                n.item &&
                                n.item.group?.board?.id &&
                                onOpenItem(n.item as Item, n.item.group.board.id)
                              }
                              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors touch-manipulation"
                              title="Ir al tablero"
                            >
                              <ExternalLink size={16} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {showMentions && (
              <section>
                <h2 className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
                  Menciones
                </h2>

                {(!onlyUnread && mentionsUnread.length === 0) || (onlyUnread && mentionsUnread.length === 0) ? (
                  <p className="text-[13px] text-monday-subtext py-2">
                    No hay menciones sin leer. Te avisaremos cuando alguien te @mencione.
                  </p>
                ) : (
                  <ul className="divide-y divide-monday-border">
                    {(onlyUnread ? mentionsUnread : mentionsUnread).map(post => (
                      <li
                        key={post.id}
                        className="py-3 flex items-start gap-3 bg-blue-50/50 hover:bg-blue-50/50 transition-colors"
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ backgroundColor: post.author?.color || '#555' }}
                        >
                          {post.author?.initials || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleMentionClick(post)}
                            className="text-left w-full"
                          >
                            <p className="text-[14px] text-monday-text font-medium">
                              {post.author?.name ?? 'Alguien'} te mencionó
                            </p>
                            <p className="text-[13px] text-monday-subtext mt-0.5 line-clamp-2">
                              {post.content}
                            </p>
                            <p className="text-[12px] text-monday-subtext mt-1">
                              {new Date(post.createdAt).toLocaleDateString('es', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </button>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              markMentionAsRead(post);
                              onNotificationsChange?.();
                            }}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors touch-manipulation"
                            title="Marcar como leída"
                          >
                            <Check size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMentionClick(post)}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors shrink-0 touch-manipulation"
                            title="Ir a la bandeja"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {showRead && mentionsRead.length > 0 && (
                  <div className="mt-4 border-t border-monday-border pt-3">
                    <h3 className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">
                      Leídas
                    </h3>
                    <ul className="divide-y divide-monday-border">
                      {mentionsRead.map(post => (
                        <li
                          key={post.id}
                          className="py-3 flex items-start gap-3 bg-monday-hover/30"
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: post.author?.color || '#555' }}
                          >
                            {post.author?.initials || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleMentionClick(post)}
                              className="text-left w-full"
                            >
                              <p className="text-[14px] text-monday-text font-medium">
                                {post.author?.name ?? 'Alguien'} te mencionó
                              </p>
                              <p className="text-[13px] text-monday-subtext mt-0.5 line-clamp-2">
                                {post.content}
                              </p>
                              <p className="text-[12px] text-monday-subtext mt-1">
                                {new Date(post.createdAt).toLocaleDateString('es', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMentionClick(post)}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors shrink-0 touch-manipulation"
                            title="Ir a la bandeja"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {!loading && tab === 'all' && assignments.length === 0 && mentionsByQuery.length === 0 && (
              <EmptyState
                icon={Bell}
                title="No hay notificaciones para mostrar"
                description="Te avisaremos aquí cuando alguien te @mencione o te asigne en un elemento."
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
