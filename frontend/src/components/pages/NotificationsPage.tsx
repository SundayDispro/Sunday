import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { useUser } from '../../store/UserContext';
import { Notification as NotificationType, Item } from '../../types';

const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:3001';

interface NotificationsPageProps {
  onOpenItem?: (item: Item, boardId: string) => void;
  onNotificationsChange?: () => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onOpenItem, onNotificationsChange }) => {
  const { currentUser } = useUser();
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [currentUser?.id]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      onNotificationsChange?.();
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser?.id) return;
    try {
      await fetch(`${API_BASE}/api/notifications/read-all?userId=${currentUser.id}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      onNotificationsChange?.();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleClick = (n: NotificationType) => {
    if (!n.item) return;
    const boardId = n.item.group?.board?.id;
    if (boardId && onOpenItem) {
      markAsRead(n.id);
      onOpenItem(n.item as Item, boardId);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
              <Bell size={22} className="text-monday-blue" />
              Notificaciones
            </h1>
            <p className="text-[13px] text-monday-subtext mt-1">
              Actualizaciones y asignaciones
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-monday-blue hover:bg-monday-hover rounded-lg transition-colors"
            >
              <CheckCheck size={16} />
              Marcar todas como leídas
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4">
              <Bell size={28} className="opacity-60" />
            </div>
            <p className="text-[15px] font-medium text-monday-text">Sin notificaciones</p>
            <p className="text-[13px] mt-1">Aquí aparecerán las notificaciones de asignación y tableros.</p>
          </div>
        ) : (
          <ul className="divide-y divide-monday-border">
            {notifications.map(n => (
              <li
                key={n.id}
                className={`px-6 py-3 flex items-start gap-3 hover:bg-monday-hover/50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className="text-left w-full"
                  >
                    <p className="text-[14px] text-monday-text font-medium">
                      {n.type === 'assigned' && 'Te han asignado en un elemento'}
                    </p>
                    {n.item && (
                      <p className="text-[13px] text-monday-subtext mt-0.5 truncate">
                        {n.item.name}
                        {n.item.group?.board?.name && (
                          <span className="text-monday-subtext"> · {n.item.group.board.name}</span>
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
                      onClick={e => { e.stopPropagation(); markAsRead(n.id); }}
                      className="p-1.5 rounded-lg text-monday-subtext hover:bg-monday-hover hover:text-monday-blue transition-colors"
                      title="Marcar como leída"
                    >
                      <Check size={16} />
                    </button>
                  )}
                  {n.item?.group?.board?.id && (
                    <button
                      type="button"
                      onClick={() => n.item && n.item.group?.board?.id && onOpenItem?.(n.item as Item, n.item.group.board.id)}
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
        )}
      </div>
    </div>
  );
};
