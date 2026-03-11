import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Inbox, Send, AtSign, CheckSquare } from 'lucide-react';
import { Item, User } from '../../types';
import { useUser } from '../../store/UserContext';

type FeedPost = {
  id: string;
  content: string;
  authorId: string;
  author: User;
  mentionedUserIds: string[];
  createdAt: string;
};

type TabId = 'all' | 'mentions';

export const InboxPage: React.FC<{ onItemClick?: (item: Item) => void }> = ({ onItemClick }) => {
  const { currentUser } = useUser();
  const [tab, setTab] = useState<TabId>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [users, setUsers] = useState<User[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [readPostIds, setReadPostIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchFeed = () => {
    setLoading(true);
    const url = tab === 'mentions' && currentUser?.id
      ? `http://localhost:3001/api/feed?filter=mentions&userId=${encodeURIComponent(currentUser.id)}`
      : 'http://localhost:3001/api/feed';
    fetch(url)
      .then(r => r.json())
      .then((data: FeedPost[]) => {
        setPosts(Array.isArray(data) ? data : []);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFeed();
  }, [tab, currentUser?.id]);

  useEffect(() => {
    fetch('http://localhost:3001/api/users')
      .then(r => r.json())
      .then((data: User[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));
  }, []);

  const filteredUsers = useMemo(() => {
    if (!mentionSearch.trim()) return users.filter(u => u.id !== currentUser?.id);
    const q = mentionSearch.toLowerCase();
    return users.filter(u => u.id !== currentUser?.id && (
      u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
    )).slice(0, 8);
  }, [users, currentUser?.id, mentionSearch]);

  const insertMention = (user: User) => {
    if (!textareaRef.current || mentionStartIndex < 0) return;
    const before = newContent.slice(0, mentionStartIndex);
    const after = newContent.slice(textareaRef.current.selectionStart || newContent.length);
    const mention = `@${user.name} `;
    setNewContent(before + mention + after);
    setShowUserList(false);
    setMentionSearch('');
    setMentionStartIndex(-1);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setNewContent(v);
    const cursor = e.target.selectionStart ?? v.length;
    const beforeCursor = v.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt !== -1) {
      const between = beforeCursor.slice(lastAt + 1);
      if (!/\s/.test(between)) {
        setMentionStartIndex(lastAt);
        setMentionSearch(between);
        setShowUserList(true);
        return;
      }
    }
    setShowUserList(false);
    setMentionStartIndex(-1);
  };

  const extractMentionedIds = (content: string): string[] => {
    const ids: string[] = [];
    const re = /@([^@\s]+)(?=\s|$)/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const namePart = m[1];
      const user = users.find(u =>
        u.name.toLowerCase().startsWith(namePart.toLowerCase()) ||
        u.username.toLowerCase().startsWith(namePart.toLowerCase())
      );
      if (user && !ids.includes(user.id)) ids.push(user.id);
    }
    return ids;
  };

  const handlePost = () => {
    const content = newContent.trim();
    if (!content || !currentUser?.id || posting) return;
    setPostError(null);
    setPosting(true);
    const mentionedUserIds = extractMentionedIds(content);
    fetch('http://localhost:3001/api/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, authorId: currentUser.id, mentionedUserIds }),
    })
      .then(r => {
        if (!r.ok) return r.json().then((err: { error?: string }) => { throw new Error(err?.error || 'Error al publicar'); });
        return r.json();
      })
      .then(() => {
        setNewContent('');
        fetchFeed();
      })
      .catch(err => setPostError(err?.message || 'No se pudo publicar. ¿Está el servidor en marcha?'))
      .finally(() => setPosting(false));
  };

  const renderContent = (content: string) => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const re = /@([^@\s]+)(?=\s|$)/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) parts.push(content.slice(last, m.index));
      const namePart = m[1];
      const user = users.find(u =>
        u.name.toLowerCase().startsWith(namePart.toLowerCase()) ||
        u.username.toLowerCase().startsWith(namePart.toLowerCase())
      );
      parts.push(
        <span key={m.index} className="font-medium text-monday-blue">@{user ? user.name : namePart}</span>
      );
      last = re.lastIndex;
    }
    if (last < content.length) parts.push(content.slice(last));
    return parts;
  };

  const handleMarkPostAsRead = (id: string) => {
    setReadPostIds(prev => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleMarkAllAsRead = () => {
    setReadPostIds(posts.map(p => p.id));
  };

  const visiblePosts = (onlyUnread ? posts.filter(p => !readPostIds.includes(p.id)) : posts);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <Inbox size={22} className="text-monday-blue" />
          Bandeja de entrada
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1">
          Actualizaciones del equipo y menciones con @
        </p>

        <div className="flex gap-1 mt-4 border-b border-monday-border">
          {[
            { id: 'all' as TabId, label: 'Todas las actualizaciones' },
            { id: 'mentions' as TabId, label: 'Me mencionaron', icon: AtSign },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-monday-blue text-monday-blue' : 'border-transparent text-monday-subtext hover:text-monday-text'
              }`}
            >
              {t.icon && <t.icon size={14} />}
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={newContent}
              onChange={handleContentChange}
              onKeyDown={e => {
                if (showUserList && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
                  e.preventDefault();
                  // simple: Enter selects first filtered user
                  if (e.key === 'Enter' && filteredUsers.length > 0) insertMention(filteredUsers[0]);
                }
              }}
              placeholder="Escribe una actualización... Usa @ para mencionar a alguien"
              className="w-full min-h-[80px] px-3 py-2.5 rounded-monday border border-monday-border bg-white text-monday-text text-[14px] placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue resize-none"
              rows={3}
            />
            {showUserList && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-monday-border rounded-monday shadow-monday-lg overflow-hidden z-10 max-h-48 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-2 text-[13px] text-monday-subtext">Sin coincidencias</div>
                ) : (
                  filteredUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-monday-hover transition-colors"
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.initials}
                      </div>
                      <span className="text-[13px] text-monday-text">{u.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePost}
            disabled={!newContent.trim() || posting}
            className="self-end flex items-center gap-2 px-4 py-2.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
            Publicar
          </button>
        </div>
        {postError && <p className="mt-2 text-red-600 text-[13px]" role="alert">{postError}</p>}

        <div className="flex items-center justify-between mt-3 text-[12px] text-monday-subtext">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={e => setOnlyUnread(e.target.checked)}
              className="rounded border-monday-border text-monday-blue focus:ring-monday-blue"
            />
            Mostrar solo no leídas
          </label>
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            className="hover:text-monday-text transition-colors"
          >
            Marcar todas como leídas
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4">
              <Inbox size={28} className="opacity-60" />
            </div>
            <p className="text-[15px] font-medium text-monday-text">
              {tab === 'mentions' ? 'Nadie te ha mencionado aún' : 'Sin actualizaciones'}
            </p>
            <p className="text-[13px] mt-1">
              {tab === 'mentions' ? 'Cuando alguien use @ con tu nombre aparecerá aquí.' : 'Publica algo o pide a tu equipo que use @ para mencionar.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {visiblePosts.map(post => {
              const isRead = readPostIds.includes(post.id);
              return (
              <li
                key={post.id}
                className={`bg-white border border-monday-border rounded-monday p-4 shadow-monday-sm hover:border-monday-border/80 transition-colors ${
                  isRead ? 'opacity-70' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style={{ backgroundColor: post.author?.color || '#555' }}
                  >
                    {post.author?.initials || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-monday-text">
                      {post.author?.name ?? 'Usuario'}
                    </p>
                    <p className="text-[12px] text-monday-subtext mt-0.5">
                      {new Date(post.createdAt).toLocaleString('es')}
                    </p>
                    <div className="mt-2 text-[14px] text-monday-text whitespace-pre-wrap break-words">
                      {renderContent(post.content)}
                    </div>
                  </div>
                  {!isRead && (
                    <button
                      type="button"
                      title="Marcar como leída"
                      onClick={() => handleMarkPostAsRead(post.id)}
                      className="p-1.5 rounded-monday text-monday-subtext hover:text-monday-blue hover:bg-monday-hover transition-colors"
                    >
                      <CheckSquare size={18} />
                    </button>
                  )}
                </div>
              </li>
            );})}
          </ul>
        )}
      </div>
    </div>
  );
};
