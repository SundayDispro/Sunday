import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Star, ExternalLink } from 'lucide-react';
import { apiFetch, API_BASE } from '../../api';

interface BrowserHistoryEntry {
  id: string;
  url: string;
  title?: string | null;
  workspaceId?: string | null;
  createdAt: string;
}

interface BrowserFavorite {
  id: string;
  url: string;
  title: string;
  workspaceId?: string | null;
  createdAt: string;
}

interface BrowserPageProps {
  workspaceId: string | null;
}

// Muchas webs grandes (incluida Google) bloquean iframes con X-Frame-Options / CSP.
// Usamos una página neutra como Wikipedia que suele permitir incrustación.
const DEFAULT_START_URL = 'https://es.wikipedia.org';

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const QUICK_LINKS = [
  { label: 'Google', url: 'https://www.google.com' },
  { label: 'Figma', url: 'https://www.figma.com' },
  { label: 'YouTube', url: 'https://www.youtube.com' },
  { label: 'Wikipedia', url: 'https://es.wikipedia.org' },
];

export const BrowserPage: React.FC<BrowserPageProps> = ({ workspaceId }) => {
  const [addressBar, setAddressBar] = useState<string>(DEFAULT_START_URL);
  const [currentUrl, setCurrentUrl] = useState<string>(DEFAULT_START_URL);
  const [backStack, setBackStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const [history, setHistory] = useState<BrowserHistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<BrowserFavorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const canGoBack = backStack.length > 0;
  const canGoForward = forwardStack.length > 0;

  const sortedFavorites = useMemo(
    () =>
      [...favorites].sort((a, b) => {
        return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      }),
    [favorites],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const qp = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
        const [histRes, favRes] = await Promise.all([
          apiFetch(`${API_BASE}/api/browser/history${qp}`),
          apiFetch(`${API_BASE}/api/browser/favorites${qp}`),
        ]);

        const histRaw = (await histRes.json().catch(() => [])) ?? [];
        const favRaw = (await favRes.json().catch(() => [])) ?? [];

        const histData = Array.isArray(histRaw) ? (histRaw as BrowserHistoryEntry[]) : [];
        const favData = Array.isArray(favRaw) ? (favRaw as BrowserFavorite[]) : [];
        if (cancelled) return;
        setHistory(histData);
        setFavorites(favData);
        if (histData.length > 0) {
          const last = histData[0];
          setCurrentUrl(last.url);
          setAddressBar(last.url);
        }
      } catch {
        if (!cancelled) setError(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const pushHistory = async (url: string, title?: string | null) => {
    try {
      const res = await apiFetch(`${API_BASE}/api/browser/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          title: title ?? null,
          workspaceId,
        }),
      });
      const data = (await res.json().catch(() => null)) as BrowserHistoryEntry | null;
      if (data?.id) setHistory(prev => [data, ...prev]);
    } catch {
      // ignorar
    }
  };

  const navigateTo = (rawUrl: string) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    setError(null);
    setAddressBar(url);
    setBackStack(prev => (currentUrl ? [...prev, currentUrl] : prev));
    setForwardStack([]);
    setCurrentUrl(url);
    setIframeKey(k => k + 1);
    void pushHistory(url);
  };

  const handleSubmitAddress = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(addressBar);
  };

  const handleGoBack = () => {
    if (!canGoBack) return;
    setError(null);
    const previousUrl = backStack[backStack.length - 1];
    setBackStack(prev => prev.slice(0, -1));
    setForwardStack(prev => (currentUrl ? [currentUrl, ...prev] : prev));
    setCurrentUrl(previousUrl);
    setAddressBar(previousUrl);
    setIframeKey(k => k + 1);
  };

  const handleGoForward = () => {
    if (!canGoForward) return;
    setError(null);
    const [nextUrl, ...rest] = forwardStack;
    setForwardStack(rest);
    setBackStack(prev => (currentUrl ? [...prev, currentUrl] : prev));
    setCurrentUrl(nextUrl);
    setAddressBar(nextUrl);
    setIframeKey(k => k + 1);
  };

  const handleReload = () => {
    setError(null);
    setIframeKey(k => k + 1);
  };

  const handleAddFavorite = async () => {
    const url = normalizeUrl(addressBar || currentUrl);
    if (!url) return;
    const title = addressBar.trim() || new URL(url).hostname || url;
    try {
      const res = await apiFetch(`${API_BASE}/api/browser/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, workspaceId }),
      });
      const data = (await res.json().catch(() => null)) as BrowserFavorite | null;
      if (data?.id) setFavorites(prev => [...prev, data]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar favorito.');
    }
  };

  const handleOpenFavorite = (fav: BrowserFavorite) => {
    setError(null);
    setAddressBar(fav.url);
    navigateTo(fav.url);
  };

  const handleDeleteFavorite = async (fav: BrowserFavorite) => {
    try {
      await apiFetch(`${API_BASE}/api/browser/favorites/${encodeURIComponent(fav.id)}`, {
        method: 'DELETE',
      });
      setFavorites(prev => prev.filter(f => f.id !== fav.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.');
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 w-full bg-monday-bg overflow-hidden">
      {/* Barra de navegación */}
      <div className="shrink-0 border-b border-monday-border bg-monday-bg/95 backdrop-blur-md px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={!canGoBack}
            className="p-2 rounded-lg border border-monday-border bg-white text-monday-text disabled:opacity-40 hover:bg-monday-hover transition-colors"
            title="Atrás"
          >
            ←
          </button>
          <button
            type="button"
            onClick={handleGoForward}
            disabled={!canGoForward}
            className="p-2 rounded-lg border border-monday-border bg-white text-monday-text disabled:opacity-40 hover:bg-monday-hover transition-colors"
            title="Adelante"
          >
            →
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="p-2 rounded-lg border border-monday-border bg-white text-monday-text hover:bg-monday-hover transition-colors"
            title="Recargar"
          >
            ↻
          </button>
        </div>
        <form onSubmit={handleSubmitAddress} className="flex-1 flex items-center gap-2 min-w-[200px]">
          <input
            type="text"
            value={addressBar}
            placeholder="URL (ej. google.com, figma.com)"
            onChange={(e) => setAddressBar(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-monday-border bg-white text-[13px] text-monday-text placeholder:text-monday-subtext focus:outline-none focus:ring-2 focus:ring-monday-blue"
          />
          <button
            type="submit"
            className="shrink-0 px-4 py-2 rounded-lg text-[12px] font-medium bg-monday-blue text-white hover:opacity-90"
          >
            Ir
          </button>
          <button
            type="button"
            onClick={handleAddFavorite}
            className="shrink-0 p-2 rounded-lg border border-monday-border bg-white text-monday-text hover:bg-monday-hover transition-colors"
            title="Guardar en favoritos"
          >
            <Star size={18} />
          </button>
        </form>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2 text-[12px] text-red-600 bg-red-50 border-b border-red-200">
          {error}
        </div>
      )}

      {/* Contenido principal: iframe + sidebar */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Contenedor del iframe: posición relativa para que el iframe absoluto tenga altura definida (evita pantalla vacía en flex) */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white rounded-lg overflow-hidden border border-monday-border m-2 relative" style={{ minHeight: '400px' }}>
          <div className="absolute inset-0 m-0 rounded-lg overflow-hidden" style={{ margin: 0 }}>
            <iframe
              key={iframeKey}
              src={currentUrl}
              title="Navegador integrado"
              className="w-full h-full border-0 bg-white block"
              style={{ minHeight: '100%' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            />
          </div>
        </div>

        <aside className="w-64 shrink-0 border-l border-monday-border bg-monday-sidebarPanel/95 flex flex-col overflow-hidden">
          <div className="shrink-0 px-3 py-2 border-b border-monday-border flex items-center gap-2">
            <Globe size={14} className="text-monday-subtext" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-monday-subtext">
              Favoritos
            </span>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-1">
            {sortedFavorites.length === 0 ? (
              <p className="text-[11px] text-monday-subtext px-1 py-2">
                Guarda páginas con la estrella para verlas aquí.
              </p>
            ) : (
              sortedFavorites.map((fav) => (
                <div
                  key={fav.id}
                  className="group flex items-center gap-2 rounded-lg hover:bg-monday-hover"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenFavorite(fav)}
                    className="flex-1 min-w-0 text-left px-2 py-2 rounded-lg"
                  >
                    <div className="truncate text-[12px] font-medium text-monday-text">{fav.title}</div>
                    <div className="truncate text-[10px] text-monday-subtext">{fav.url}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFavorite(fav)}
                    className="shrink-0 p-1.5 rounded text-monday-subtext hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar favorito"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 p-2 border-t border-monday-border">
            <p className="text-[10px] text-monday-subtext">
              Accesos rápidos
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {QUICK_LINKS.map(({ label, url }) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => navigateTo(url)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-monday-hover text-[11px] text-monday-text hover:bg-monday-blue hover:text-white transition-colors"
                >
                  <ExternalLink size={10} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="shrink-0 px-2 py-1.5 text-[9px] text-monday-subtext border-t border-monday-border">
            Algunas webs bloquean verse dentro del marco (X-Frame-Options).
          </p>
        </aside>
      </div>

      {loading && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 text-[11px] text-white shadow-lg pointer-events-none">
          Cargando…
        </div>
      )}
    </div>
  );
};

export default BrowserPage;
