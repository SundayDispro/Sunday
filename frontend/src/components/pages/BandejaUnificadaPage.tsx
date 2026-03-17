import React, { useState, useEffect } from 'react';
import { Inbox, Bell } from 'lucide-react';
import { Item } from '../../types';
import { InboxPage } from './InboxPage';
import { NotificationsPage } from './NotificationsPage';

export type BandejaTab = 'actividad' | 'notificaciones';

interface BandejaUnificadaPageProps {
  onItemClick?: (item: Item) => void;
  initialTab?: BandejaTab;
  onTabChange?: (tab: BandejaTab) => void;
  /** Llamado al abrir un item (p. ej. ir a tablero) */
  onOpenItem?: (item: Item, boardId: string) => void;
  onNotificationsChange?: () => void;
}

/**
 * Vista unificada Bandeja en móvil: pestañas Actividad (feed/inbox) y Notificaciones.
 */
export const BandejaUnificadaPage: React.FC<BandejaUnificadaPageProps> = ({
  onItemClick,
  initialTab = 'actividad',
  onTabChange,
  onOpenItem,
  onNotificationsChange,
}) => {
  const [tab, setTab] = useState<BandejaTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const handleTab = (t: BandejaTab) => {
    setTab(t);
    onTabChange?.(t);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex border-b border-monday-border bg-white">
        <button
          type="button"
          onClick={() => handleTab('actividad')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium transition-colors border-b-2 ${
            tab === 'actividad'
              ? 'border-monday-blue text-monday-blue'
              : 'border-transparent text-monday-subtext hover:text-monday-text'
          }`}
        >
          <Inbox size={18} />
          Actividad
        </button>
        <button
          type="button"
          onClick={() => handleTab('notificaciones')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium transition-colors border-b-2 ${
            tab === 'notificaciones'
              ? 'border-monday-blue text-monday-blue'
              : 'border-transparent text-monday-subtext hover:text-monday-text'
          }`}
        >
          <Bell size={18} />
          Notificaciones
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'actividad' ? (
          <InboxPage onItemClick={onItemClick} />
        ) : (
          <NotificationsPage
            onOpenItem={onOpenItem}
            onOpenInbox={() => handleTab('actividad')}
            onNotificationsChange={onNotificationsChange}
          />
        )}
      </div>
    </div>
  );
};
