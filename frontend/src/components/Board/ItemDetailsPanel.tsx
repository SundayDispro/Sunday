import React, { useState, useEffect, useRef } from 'react';
import { Item, Update } from '../../types';
import { X, Image, Smile, AtSign, Paperclip, Send, Clock, FileText, Activity, Info } from 'lucide-react';
import { socket } from '../../store/socket';
import { useUser } from '../../store/UserContext';

interface Props {
  item: Item;
  onClose: () => void;
}

const TABS = ['Actualizaciones', 'Archivos', 'Registro de act.', 'Info'] as const;
type Tab = typeof TABS[number];

// ── Utility: relative time ─────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} días`;
}

export const ItemDetailsPanel: React.FC<Props> = ({ item, onClose }) => {
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('Actualizaciones');
  const [updates, setUpdates] = useState<Update[]>([]);
  const [updateText, setUpdateText] = useState('');
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch existing updates for this item
  useEffect(() => {
    setLoading(true);
    setUpdates([]);
    fetch(`http://localhost:3001/api/items/${item.id}/updates`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setUpdates(data); setLoading(false); })
      .catch(() => setLoading(false));

    // Real-time: append new updates that belong to this item
    const onUpdateAdded = (u: Update) => {
      if (u.itemId === item.id) {
        setUpdates(prev => [u, ...prev]);
      }
    };
    socket.on('update_added', onUpdateAdded);
    return () => { socket.off('update_added', onUpdateAdded); };
  }, [item.id]);

  const submitUpdate = () => {
    const content = updateText.trim();
    if (!content || !currentUser) return;
    socket.emit('add_update', { itemId: item.id, content, authorId: currentUser.id });
    setUpdateText('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitUpdate();
  };

  const tabIcon = (tab: Tab) => {
    const cls = 'shrink-0';
    if (tab === 'Actualizaciones') return <Activity size={14} className={cls} />;
    if (tab === 'Archivos')        return <Paperclip size={14} className={cls} />;
    if (tab === 'Registro de act.') return <Clock size={14} className={cls} />;
    if (tab === 'Info')            return <Info size={14} className={cls} />;
    return null;
  };

  return (
    <div className="w-[520px] h-full bg-white border-l border-monday-border shadow-monday-panel flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-monday-border shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-[17px] font-semibold text-monday-text leading-tight truncate">{item.name}</h2>
          <p className="text-[12px] text-monday-subtext mt-0.5">Elemento · ID #{item.id.slice(0, 8)}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-monday-hover rounded-monday text-monday-subtext hover:text-monday-text transition-colors shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-5 border-b border-monday-border gap-1 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 py-2.5 px-2 text-[12px] font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-monday-blue text-monday-blue'
                : 'border-transparent text-monday-subtext hover:text-monday-text'
            }`}
          >
            {tabIcon(tab)}
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#f9fafb]" ref={feedRef}>
        {activeTab === 'Actualizaciones' && (
          <div className="p-4 flex flex-col gap-4">
            {/* Write update box */}
            <div className="bg-white rounded-xl border border-monday-border shadow-monday-sm overflow-hidden">
              <textarea
                ref={textareaRef}
                placeholder="Escribe una actualización..."
                className="w-full resize-none outline-none text-[13px] text-monday-text px-4 pt-3 pb-2 min-h-[72px] placeholder:text-monday-border"
                value={updateText}
                onChange={e => setUpdateText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-monday-border bg-monday-hover/30">
                <div className="flex gap-2 text-monday-subtext">
                  <button className="hover:text-monday-text transition-colors" title="Emoji"><Smile size={16} /></button>
                  <button className="hover:text-monday-text transition-colors" title="Mencionar"><AtSign size={16} /></button>
                  <button className="hover:text-monday-text transition-colors" title="Archivo"><Image size={16} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-monday-subtext">Ctrl+Enter para enviar</span>
                  <button
                    onClick={submitUpdate}
                    disabled={!updateText.trim()}
                    className="flex items-center gap-1.5 bg-monday-blue disabled:bg-monday-border text-white text-[12px] font-semibold px-3 py-1.5 rounded-monday hover:bg-blue-600 transition-colors disabled:cursor-not-allowed"
                  >
                    <Send size={13} />
                    Actualizar
                  </button>
                </div>
              </div>
            </div>

            {/* Updates feed */}
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
              </div>
            ) : updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 text-monday-subtext">
                <div className="w-16 h-16 bg-monday-hover rounded-full flex items-center justify-center mb-4">
                  <Activity size={24} className="text-monday-border" />
                </div>
                <p className="text-[14px] font-medium text-monday-text mb-1">Sin actualizaciones aún</p>
                <p className="text-[12px] max-w-[220px]">
                  Comunícate con tu equipo dejando notas y comentarios aquí.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {updates.map(u => (
                  <div key={u.id} className="flex gap-3 fade-in">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0 mt-0.5 shadow-monday-sm"
                      style={{ backgroundColor: u.authorUser?.color || '#ccc' }}
                    >
                      {u.authorUser?.initials || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-white rounded-xl border border-monday-border p-3 shadow-monday-sm">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-[13px] font-semibold text-monday-text">{u.authorUser?.name || 'Desconocido'}</span>
                          <span className="text-[11px] text-monday-subtext">{relativeTime(u.createdAt)}</span>
                        </div>
                        <p className="text-[13px] text-monday-text whitespace-pre-wrap">{u.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Archivos' && (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <FileText size={32} className="text-monday-border mb-3" />
            <p className="text-[13px] font-medium text-monday-text">No hay archivos</p>
            <p className="text-[12px] mt-1">Sube archivos desde el área de actualizaciones</p>
          </div>
        )}

        {(activeTab === 'Registro de act.' || activeTab === 'Info') && (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <Clock size={32} className="text-monday-border mb-3" />
            <p className="text-[13px] font-medium text-monday-text">Próximamente</p>
            <p className="text-[12px] mt-1">Esta funcionalidad estará disponible pronto</p>
          </div>
        )}
      </div>
    </div>
  );
};
