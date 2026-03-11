import React, { useState, useMemo } from 'react';
import { Search as SearchIcon, FileText, X } from 'lucide-react';
import { Item } from '../../types';

type SearchResult = {
  item: { id: string; name: string; groupId: string };
  boardId: string;
  boardName: string;
  groupId: string;
  groupName: string;
};

export const SearchPage: React.FC<{
  onItemClick?: (item: Item) => void;
  onResultClick?: (item: Item, boardId: string) => void;
}> = ({ onItemClick, onResultClick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then((data: SearchResult[]) => {
        setResults(Array.isArray(data) ? data : []);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch();
  };

  const handleClick = (r: SearchResult) => {
    const item: Item = {
      id: r.item.id,
      name: r.item.name,
      position: 0,
      groupId: r.item.groupId,
      columnValues: [],
    };
    if (onResultClick) {
      onResultClick(item, r.boardId);
    } else {
      onItemClick?.(item);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2 mb-4">
          <SearchIcon size={22} className="text-monday-blue" />
          Buscar
        </h1>
        <form onSubmit={handleSubmit} className="relative">
          <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-monday-subtext" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onBlur={() => query.trim() && doSearch()}
            placeholder="Buscar en tableros (nombre de tarea o tablero)..."
            className="w-full pl-10 pr-10 py-2.5 rounded-monday border border-monday-border bg-white text-monday-text text-[14px] placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-monday-subtext hover:text-monday-text"
            >
              <X size={16} />
            </button>
          )}
        </form>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !query.trim() ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <p className="text-[14px]">Escribe para buscar tareas o tableros por nombre.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <p className="text-[14px]">No se encontraron resultados para &quot;{query}&quot;.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {results.map((r, idx) => (
              <li key={`${r.boardId}-${r.item.id}-${idx}`}>
                <button
                  type="button"
                  onClick={() => handleClick(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-monday bg-white border border-monday-border hover:border-monday-blue/40 hover:bg-blue-50/50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-monday-hover flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-monday-subtext" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-monday-text truncate">{r.item.name}</p>
                    <p className="text-[12px] text-monday-subtext">{r.boardName} · {r.groupName}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
