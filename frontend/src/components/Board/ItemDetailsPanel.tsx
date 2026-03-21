import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimation, PanInfo, useDragControls } from 'framer-motion';
import { Board, BoardColumn, ColumnValue, Item, Update } from '../../types';
import { X, Image, Smile, AtSign, Paperclip, Send, Clock, FileText, ExternalLink, Activity, Info } from 'lucide-react';
import { socket } from '../../store/socket';
import { useUser } from '../../store/UserContext';
import { API_BASE, apiFetch } from '../../api';

interface Props {
  item: Item;
  onClose: () => void;
  /** Proporciona metadatos del tablero para poder renderizar Info/Archivos con títulos y tipos de columnas. */
  board?: Board | null;
  /** En móvil: 'sheet' = overlay pantalla completa/sheet desde abajo con barra de cierre; 'panel' = lateral como en desktop */
  variant?: 'panel' | 'sheet';
}

const TABS = ['Info', 'Archivos', 'Registro de act.', 'Actualizaciones'] as const;
type Tab = typeof TABS[number];

const AUDIT_PREFIX = '__audit__:'; // creado en backend para distinguir logs vs comentarios manuales

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

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function tryParseJson<T>(raw: string): T | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function tryParseJsonPossiblyDoubleEncoded<T>(raw: string): T | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const first = JSON.parse(s) as unknown;
    if (typeof first === 'string') {
      try {
        return JSON.parse(first) as T;
      } catch {
        return null;
      }
    }
    return first as T;
  } catch {
    return null;
  }
}

function driveFileIdFromHref(href: string): string | null {
  const s = href.trim();
  if (!s.toLowerCase().includes('drive.google.com')) return null;
  try {
    const url = new URL(s.startsWith('http') ? s : 'https://' + s);
    const matchD = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD?.[1]) return matchD[1];
    const matchFile = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchFile?.[1]) return matchFile[1];
    const id = url.searchParams.get('id') || url.searchParams.get('docid');
    return id;
  } catch {
    // ignore
  }
  const m = s.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{10,})/);
  return m?.[1] ?? null;
}

function canonicalLinkKey(href: string): string {
  const h = href.trim();
  if (!h) return '';

  const lower = h.toLowerCase();
  const uploadsIdx = lower.indexOf('/uploads/');
  if (uploadsIdx >= 0) {
    const suffixRaw = h.slice(uploadsIdx + '/uploads/'.length);
    const suffix = suffixRaw.split('?')[0].split('#')[0];
    return `uploads:${suffix.replace(/\/+$/, '')}`;
  }

  const driveId = driveFileIdFromHref(h);
  if (driveId) return `drive:${driveId}`;

  // Normalización genérica: quitar protocolo, queries y dobles /
  try {
    const url = new URL(h.startsWith('http') ? h : 'https://' + h);
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return h.toLowerCase().replace(/\/+$/, '');
  }
}

function normalizeExternalHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return v;
  // En DEV, el proxy de Vite entrega /uploads desde el backend; por eso basta con dejar la ruta.
  if (v.startsWith('/uploads/')) return API_BASE ? `${API_BASE}${v}` : v;
  // Si viene como ruta interna, igual resolvemos con API_BASE si aplica.
  if (v.startsWith('/')) return API_BASE ? `${API_BASE}${v}` : v;
  // Drive/URLs sin protocolo.
  return 'https://' + v;
}

const DOC_KEY_LABELS: Record<string, string> = {
  cotizacionDocId: 'Cotización',
  levantamientoDocId: 'Levantamiento',
  hojaTrabajoDocId: 'Hoja de trabajo',
};

type DocsValue = {
  cotizacion?: string;
  hojaTrabajo?: string;
  levantamiento?: string;
  cotizacionDocId?: string;
  hojaTrabajoDocId?: string;
  levantamientoDocId?: string;
};

function parseDocsValue(raw: string): DocsValue {
  if (!raw.trim()) return {};
  try {
    let parsed: unknown = JSON.parse(raw);
    // Soporta doble-encoding: "\"{...}\""
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // deja parsed como string
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, unknown>;
    return {
      cotizacion: typeof obj.cotizacion === 'string' ? obj.cotizacion : '',
      hojaTrabajo: typeof obj.hojaTrabajo === 'string' ? obj.hojaTrabajo : '',
      levantamiento: typeof obj.levantamiento === 'string' ? obj.levantamiento : '',
      cotizacionDocId: typeof obj.cotizacionDocId === 'string' ? obj.cotizacionDocId : '',
      hojaTrabajoDocId: typeof obj.hojaTrabajoDocId === 'string' ? obj.hojaTrabajoDocId : '',
      levantamientoDocId: typeof obj.levantamientoDocId === 'string' ? obj.levantamientoDocId : '',
    };
  } catch {
    return {};
  }
}

function extractDocsColumnDocIds(raw: string): Array<{ docId: string; label: string }> {
  const parsed = tryParseJson<Record<string, unknown>>(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const out: Array<{ docId: string; label: string }> = [];
  for (const [key, label] of Object.entries(DOC_KEY_LABELS)) {
    const maybeId = (parsed as any)[key];
    if (typeof maybeId === 'string' && maybeId.trim()) {
      out.push({ docId: maybeId.trim(), label });
    }
  }
  return out;
}

function extractExcelDocId(raw: string): string | null {
  const parsed = tryParseJson<{ docId?: string }>(raw);
  const id = parsed?.docId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function parseExcelValue(raw: string): { url?: string; docId?: string } {
  const s = raw.trim();
  if (!s) return {};
  if (s.startsWith('{')) {
    try {
      let parsed: unknown = JSON.parse(s);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // ignore
        }
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as any;
        const docId = typeof obj.docId === 'string' ? obj.docId : undefined;
        const url = typeof obj.url === 'string' ? obj.url : undefined;
        return { docId, url };
      }
    } catch {
      // ignore
    }
  }
  // Valor plano tipo URL o ruta interna
  return { url: s };
}

function looksLikeUuid(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 32) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}

function containsUuid(raw: string): boolean {
  const s = raw.trim();
  return /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.test(s);
}

function looksLikeMachineValue(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (looksLikeUuid(s) || containsUuid(s)) return true;
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) return true;
  return false;
}

function extractBillingDocsUrl(raw: string): { url: string; name?: string } | null {
  const s = raw.trim();
  if (!s) return null;

  const parsed = tryParseJson<unknown>(s);
  if (typeof parsed === 'string') {
    const url = parsed.trim();
    return url ? { url } : null;
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const url = typeof obj.url === 'string' ? obj.url.trim() : '';
    const name = typeof obj.name === 'string' ? obj.name.trim() : undefined;
    return url ? { url, name } : null;
  }

  // Fallback: valor directo tipo URL.
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return { url: s };
  return { url: s };
}

export const ItemDetailsPanel: React.FC<Props> = ({ item, onClose, variant = 'panel', board = null }) => {
  const { currentUser, users } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('Info');
  const [updates, setUpdates] = useState<Update[]>([]);
  const [updateText, setUpdateText] = useState('');
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch existing updates for this item
  useEffect(() => {
    setLoading(true);
    setUpdates([]);
    apiFetch(`${API_BASE}/api/items/${item.id}/updates`)
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

  const isSheet = variant === 'sheet';
  const panelClassName = isSheet
    ? 'w-full max-h-[90dvh] min-h-0 bg-white rounded-t-2xl shadow-monday-panel flex flex-col safe-area-padding border-t border-l border-r border-monday-border'
    : 'w-full max-w-full md:w-[520px] h-full min-h-0 bg-white border-l border-monday-border shadow-monday-panel flex flex-col safe-area-padding';

  const columnById = useMemo(() => {
    if (!board) return new Map<string, BoardColumn>();
    const cols = Array.isArray(board.columns) ? board.columns : [];
    return new Map(cols.map((c) => [c.id, c]));
  }, [board]);

  const group = useMemo(() => {
    if (!board) return null;
    const groups = Array.isArray(board.groups) ? board.groups : [];
    return groups.find((g) => g.id === item.groupId) ?? null;
  }, [board, item.groupId]);

  const infoRows = useMemo(() => {
    const cvs = Array.isArray(item.columnValues) ? item.columnValues : [];

    const formatValue = (col: BoardColumn, cv: ColumnValue): string => {
      const raw = cv.value ?? '';
      if (!raw.trim()) return '—';

      if (col.type === 'person') {
        const uid = raw.trim();
        const u = users.find((x) => x.id === uid);
        return u ? u.name : 'Usuario asignado';
      }

      if (col.type === 'contact') {
        const parsed =
          tryParseJsonPossiblyDoubleEncoded<{ text?: string; link?: string }>(raw) ??
          tryParseJson<{ text?: string; link?: string }>(raw);
        const text = parsed?.text?.trim() ?? '';
        const link = parsed?.link?.trim() ?? '';
        return text || link || raw;
      }

      if (col.type === 'file') {
        // No mostrar URL/paths completos en crudo.
        const href = normalizeExternalHref(raw);
        return href ? 'Enlace Drive' : raw;
      }

      if (col.type === 'docs') {
        const parsed = parseDocsValue(raw);
        const labels: string[] = [];

        if (parsed.levantamientoDocId?.trim() || parsed.levantamiento?.trim()) labels.push('Levantamiento');
        if (parsed.cotizacionDocId?.trim() || parsed.cotizacion?.trim()) labels.push('Cotización');
        if (parsed.hojaTrabajoDocId?.trim() || parsed.hojaTrabajo?.trim()) labels.push('Hoja de trabajo');

        if (labels.length) return labels.join(', ');
        // Si no pudimos inferir por JSON, al menos ocultar ids tipo UUID.
        if (containsUuid(raw)) return 'Documento enlazado';
        if (raw.startsWith('http') || raw.startsWith('/') || raw.includes('drive.google')) return 'Archivo enlazado';
        return 'Documento enlazado';
      }

      if (col.type === 'excel') {
        const parsed = parseExcelValue(raw);
        if (parsed.docId?.trim()) return 'Documento enlazado';
        if (parsed.url?.trim()) return 'Archivo enlazado';
        if (containsUuid(raw) || looksLikeUuid(raw)) return 'Documento enlazado';
        return raw;
      }

      if (col.type === 'folio') {
        return raw.trim() || '—';
      }

      if (col.type === 'billing_docs') {
        const parsed = extractBillingDocsUrl(raw);
        return parsed?.name?.trim() || 'Documento enlazado';
      }

      if (col.type === 'status' || col.type === 'priority') {
        const parsedValue =
          tryParseJsonPossiblyDoubleEncoded<{ optionId?: string }>(raw) ??
          tryParseJson<{ optionId?: string }>(raw);
        const optionId = parsedValue?.optionId?.trim() ? parsedValue.optionId.trim() : raw.trim();
        const settings = col.settings ? tryParseJson<{ options?: Array<{ id: string; label: string }> }>(col.settings) : null;
        const opt = settings?.options?.find((o) => o.id === optionId);
        return (opt?.label && opt.label.trim()) ? opt.label : optionId;
      }

      if (containsUuid(raw) || looksLikeUuid(raw)) return '—';
      const parsedScalar = tryParseJsonPossiblyDoubleEncoded<any>(raw);
      if (typeof parsedScalar === 'string') {
        const t = parsedScalar.trim();
        return t ? t : '—';
      }
      return raw;
    };

    return cvs
      .map((cv) => {
        const col = columnById.get(cv.columnId);
        const raw = cv.value ?? '';
        if (!raw.trim()) return null;
        if (!col) {
          // Fallback: si el board no trae columnas o no coinciden los ids, intentamos
          // mostrar una representación amigable (evita imprimir JSON crudo).
          const deepTry = (s: string): any | null => {
            const t = s.trim();
            if (!t) return null;
            const p1 = tryParseJson<any>(t);
            if (typeof p1 === 'string') return tryParseJson<any>(p1) ?? p1;
            return p1;
          };

          const parsed = deepTry(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const optionId = typeof (parsed as any).optionId === 'string' ? (parsed as any).optionId : null;
            if (optionId && optionId.trim()) return { id: cv.id, label: 'Estado', value: optionId.trim() };

            const text = typeof (parsed as any).text === 'string' ? (parsed as any).text.trim() : '';
            const link = typeof (parsed as any).link === 'string' ? (parsed as any).link.trim() : '';
            if (text || link) return { id: cv.id, label: 'Contacto', value: text || link };

            const docKeys: Array<{ k: string; label: string }> = [
              { k: 'levantamientoDocId', label: 'Levantamiento' },
              { k: 'cotizacionDocId', label: 'Cotización' },
              { k: 'hojaTrabajoDocId', label: 'Hoja de trabajo' },
              { k: 'levantamiento', label: 'Levantamiento' },
              { k: 'cotizacion', label: 'Cotización' },
              { k: 'hojaTrabajo', label: 'Hoja de trabajo' },
            ];
            const docsAfter = docKeys
              .map((d) => {
                const v = (parsed as any)[d.k];
                return typeof v === 'string' && v.trim() ? d.label : null;
              })
              .filter(Boolean) as string[];
            if (docsAfter.length) return { id: cv.id, label: 'Documentos', value: [...new Set(docsAfter)].join(', ') };

            const url = typeof (parsed as any).url === 'string' ? (parsed as any).url.trim() : '';
            const label = typeof (parsed as any).label === 'string' ? (parsed as any).label.trim() : '';
            if (url) return { id: cv.id, label: label || 'Archivo', value: normalizeExternalHref(url) ?? url };
          }

          const cleaned = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
          if (looksLikeMachineValue(cleaned)) return null;
          // Inferir etiqueta semántica desde el valor
          const inferredLabel = (() => {
            if (/^\d{1,6}$/.test(cleaned.trim())) return 'Folio';
            if (cleaned.startsWith('http') || cleaned.includes('drive.google')) return 'Archivo';
            return 'Campo';
          })();
          return { id: cv.id, label: inferredLabel, value: cleaned };
        }
        return {
          id: cv.id,
          label: col.title,
          value: formatValue(col, cv),
        };
      })
      .filter((x): x is { id: string; label: string; value: string } => !!x);
  }, [board, item.columnValues, columnById, users]);

  const archiveEntries = useMemo(() => {
    const fileLikeTypes = new Set(['docs', 'excel', 'file', 'billing_docs']);
    const cols = board?.columns && Array.isArray(board.columns) ? board.columns : [];
    const cvs = Array.isArray(item.columnValues) ? item.columnValues : [];

    type Entry = {
      id: string;
      columnTitle: string;
      kind: 'drive' | 'doc' | 'external';
      primaryLabel: string;
      docId?: string;
      href?: string;
    };

    const entries: Entry[] = [];
    for (const col of cols) {
      if (!fileLikeTypes.has(col.type)) continue;

      const cv = cvs.find((v) => v.columnId === col.id);
      const rawValue = cv?.value?.trim() ?? '';
      if (!rawValue) continue;

      if (col.type === 'file') {
        const href = normalizeExternalHref(rawValue);
        if (href) {
          entries.push({
            id: `${col.id}-file`,
            columnTitle: col.title,
            kind: 'drive',
            primaryLabel: 'Enlace Drive',
            href,
          });
        }
        continue;
      }

      if (col.type === 'docs') {
        const parsed = parseDocsValue(rawValue);

        const docIds: Array<{ key: keyof DocsValue; label: string }> = [
          { key: 'levantamientoDocId', label: 'Levantamiento' },
          { key: 'cotizacionDocId', label: 'Cotización' },
          { key: 'hojaTrabajoDocId', label: 'Hoja de trabajo' },
        ];

        let pushedAny = false;
        docIds.forEach((d) => {
          const docId = (parsed[d.key] as string | undefined)?.trim();
          if (!docId) return;
          pushedAny = true;
          entries.push({
            id: `${col.id}-${docId}`,
            columnTitle: col.title,
            kind: 'doc',
            primaryLabel: d.label,
            docId,
          });
        });

        // Si no hay docId, soporta valores legacy tipo URL (cotizacion/levantamiento/hojaTrabajo)
        if (!pushedAny) {
          const urls: Array<{ key: keyof DocsValue; label: string }> = [
            { key: 'levantamiento', label: 'Levantamiento' },
            { key: 'cotizacion', label: 'Cotización' },
            { key: 'hojaTrabajo', label: 'Hoja de trabajo' },
          ];

          urls.forEach((d) => {
            const urlRaw = (parsed[d.key] as string | undefined)?.trim();
            if (!urlRaw) return;
            const href = normalizeExternalHref(urlRaw);
            if (!href) return;
            entries.push({
              id: `${col.id}-${d.label}-url`,
              columnTitle: col.title,
              kind: 'external',
              primaryLabel: d.label,
              href,
            });
          });
        }
        continue;
      }

      if (col.type === 'excel') {
        const parsed = parseExcelValue(rawValue);
        const docId = parsed.docId?.trim() || null;
        const url = parsed.url?.trim() || null;

        if (docId) {
          entries.push({
            id: `${col.id}-${docId}`,
            columnTitle: col.title,
            kind: 'doc',
            primaryLabel: 'Documento',
            docId,
          });
        } else if (url) {
          const href = normalizeExternalHref(url);
          if (href) {
            entries.push({
              id: `${col.id}-excel-url`,
              columnTitle: col.title,
              kind: 'external',
              primaryLabel: col.title,
              href,
            });
          }
        }
        continue;
      }

      if (col.type === 'billing_docs') {
        const parsed = extractBillingDocsUrl(rawValue);
        const href = parsed ? normalizeExternalHref(parsed.url) : null;
        if (href) {
          entries.push({
            id: `${col.id}-billing`,
            columnTitle: col.title,
            kind: 'external',
            primaryLabel: parsed?.name?.trim() || 'Enlace',
            href,
          });
        }
        continue;
      }
    }

    // Fallback: si el panel no tiene suficiente metadata del board (columns/type),
    // intenta inferir documentos/enlaces únicamente desde el value del item.
    if (entries.length === 0) {
      const deepParsed = (raw: string): any | null => {
        const p1 = tryParseJson<any>(raw);
        if (typeof p1 === 'string') return tryParseJson<any>(p1) ?? p1;
        return p1;
      };

      for (const cv of cvs) {
        const rawValue = cv.value?.trim() ?? '';
        if (!rawValue) continue;

        const parsed = deepParsed(rawValue);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // docs
          const docsKeys: Array<{ key: keyof DocsValue; label: string }> = [
            { key: 'levantamientoDocId', label: 'Levantamiento' },
            { key: 'cotizacionDocId', label: 'Cotización' },
            { key: 'hojaTrabajoDocId', label: 'Hoja de trabajo' },
          ];
          let pushed = false;
          for (const k of docsKeys) {
            const docId = (parsed as any)[k.key];
            if (typeof docId === 'string' && docId.trim()) {
              pushed = true;
              entries.push({
                id: `${cv.columnId}-${String(k.key)}-${docId}`,
                columnTitle: 'Documentos',
                kind: 'doc',
                primaryLabel: k.label,
                docId: docId.trim(),
              });
            }
          }

          if (!pushed) {
            const urlKeys: Array<{ key: keyof DocsValue; label: string }> = [
              { key: 'levantamiento', label: 'Levantamiento' },
              { key: 'cotizacion', label: 'Cotización' },
              { key: 'hojaTrabajo', label: 'Hoja de trabajo' },
            ];
            for (const k of urlKeys) {
              const urlRaw = (parsed as any)[k.key];
              if (typeof urlRaw === 'string' && urlRaw.trim()) {
                const href = normalizeExternalHref(urlRaw);
                if (!href) continue;
                entries.push({
                  id: `${cv.columnId}-${String(k.key)}-url`,
                  columnTitle: 'Documentos',
                  kind: 'external',
                  primaryLabel: k.label,
                  href,
                });
              }
            }
          }

          // excel
          {
            const excel = parseExcelValue(rawValue);
            if (excel.docId?.trim()) {
              entries.push({
                id: `${cv.columnId}-excel-${excel.docId}`,
                columnTitle: 'Excel',
                kind: 'doc',
                primaryLabel: 'Documento',
                docId: excel.docId.trim(),
              });
            } else if (excel.url?.trim()) {
              const href = normalizeExternalHref(excel.url.trim());
              if (href) {
                entries.push({
                  id: `${cv.columnId}-excel-url`,
                  columnTitle: 'Excel',
                  kind: 'external',
                  primaryLabel: 'Archivo',
                  href,
                });
              }
            }
          }

          // billing docs
          const billing = extractBillingDocsUrl(rawValue);
          if (billing?.url) {
            const href = normalizeExternalHref(billing.url);
            if (href) {
              entries.push({
                id: `${cv.columnId}-billing-${billing.url}`,
                columnTitle: 'Facturación',
                kind: 'external',
                primaryLabel: billing.name?.trim() || 'Documento',
                href,
              });
            }
          }

          continue;
        }

        // file (drive) como string URL
        const href = normalizeExternalHref(rawValue);
        if (href) {
          entries.push({
            id: `${cv.columnId}-file-${href}`,
            columnTitle: 'Archivos',
            kind: 'external',
            primaryLabel: 'Enlace Drive',
            href,
          });
        }
      }
    }

    // Dedupe: evitar repetir el mismo link (p. ej. Drive) si hay múltiples columnas con el mismo valor.
    const uniq = new Map<string, Entry>();
    for (const e of entries) {
      if (e.kind === 'doc') {
        const key = `doc:${e.docId ?? e.primaryLabel}`;
        if (!uniq.has(key)) uniq.set(key, e);
        continue;
      }

      if (e.href) {
        const href = e.href.trim();
        const key = `href:${canonicalLinkKey(href)}`;
        if (!uniq.has(key)) uniq.set(key, e);
        continue;
      }

      const key = `ext:${e.primaryLabel}:${e.columnTitle}`;
      if (!uniq.has(key)) uniq.set(key, e);
    }

    return Array.from(uniq.values());
  }, [board, item.columnValues]);

  const activitySummary = useMemo(() => {
    if (!board) return { statusEntries: [] as Array<{ id: string; title: string; value: string }>, docEntries: [] as Array<{ id: string; title: string; value: string }> };

    const cols = Array.isArray(board.columns) ? board.columns : [];
    const cvs = Array.isArray(item.columnValues) ? item.columnValues : [];
    const statusCols = cols.filter((c) => c.type === 'status' || c.type === 'priority');
    const docCols = cols.filter((c) => ['docs', 'excel', 'file', 'billing_docs'].includes(c.type));

    const parseStatusLabel = (col: BoardColumn, rawValue: string): string => {
      const parsedValue = tryParseJson<{ optionId?: string }>(rawValue.trim());
      const optionId = parsedValue?.optionId?.trim() ? parsedValue.optionId.trim() : rawValue.trim();
      const settings = col.settings ? tryParseJson<{ options?: Array<{ id: string; label: string }> }>(col.settings) : null;
      const opt = settings?.options?.find((o) => o.id === optionId);
      return (opt?.label && opt.label.trim()) ? opt.label : optionId;
    };

    const statusEntries = statusCols
      .map((col) => {
        const cv = cvs.find((v) => v.columnId === col.id);
        const raw = cv?.value?.trim() ?? '';
        if (!raw) return null;
        return { id: col.id, title: col.title, value: parseStatusLabel(col, raw) };
      })
      .filter((x): x is { id: string; title: string; value: string } => !!x);

    const docEntries: Array<{ id: string; title: string; value: string }> = [];
    for (const col of docCols) {
      const cv = cvs.find((v) => v.columnId === col.id);
      const raw = cv?.value?.trim() ?? '';
      if (!raw) continue;

      if (col.type === 'file') {
        docEntries.push({ id: col.id, title: col.title, value: 'Enlace Drive' });
        continue;
      }

      if (col.type === 'docs') {
        const docs = extractDocsColumnDocIds(raw);
        docEntries.push({
          id: col.id,
          title: col.title,
          value: docs.length ? docs.map((d) => d.label).join(', ') : 'Documento enlazado',
        });
        continue;
      }

      if (col.type === 'excel') {
        const docId = extractExcelDocId(raw);
        docEntries.push({ id: col.id, title: col.title, value: docId ? 'Documento enlazado' : 'Enlace externo' });
        continue;
      }

      if (col.type === 'billing_docs') {
        const parsed = extractBillingDocsUrl(raw);
        docEntries.push({ id: col.id, title: col.title, value: parsed?.name?.trim() || 'Enlace' });
      }
    }

    return { statusEntries, docEntries };
  }, [board, item.columnValues]);

  const openDocById = (docId: string) => {
    if (!docId) return;
    window.dispatchEvent(new CustomEvent('sunday:open-doc', { detail: { docId } }));
    onClose();
  };

  const dragControls = useDragControls();
  const animationControls = useAnimation();

  const handleDragEnd = async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      await animationControls.start({ y: '100%', transition: { duration: 0.2 } });
      onClose();
    } else {
      animationControls.start({ y: 0, transition: { type: 'spring', bounce: 0.5 } });
    }
  };

  const Wrapper = isSheet ? motion.div : 'div';
  const wrapperProps = isSheet ? {
    drag: 'y' as const,
    dragControls,
    dragListener: false,
    dragConstraints: { top: 0, bottom: 0 },
    dragElastic: 0.2,
    onDragEnd: handleDragEnd as any,
    animate: animationControls,
    className: panelClassName,
  } : { className: panelClassName };

  return (
    <Wrapper {...wrapperProps}>
      {/* Barra de agarre (solo sheet) para indicar que se puede cerrar */}
      {isSheet && (
        <div 
          className="shrink-0 flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <div className="w-10 h-1 rounded-full bg-monday-border/60" aria-hidden />
        </div>
      )}
      {/* Header: título + Cerrar siempre visible, altura táctil */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-monday-border shrink-0 gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] sm:text-[17px] font-semibold text-monday-text leading-tight truncate">{item.name}</h2>
          <p className="text-[12px] text-monday-subtext mt-0.5">Elemento · ID #{item.id.slice(0, 8)}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 hover:bg-monday-hover rounded-monday text-monday-subtext hover:text-monday-text transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tabs: scroll horizontal en móvil */}
      <div className="flex px-3 sm:px-5 border-b border-monday-border gap-1 shrink-0 overflow-x-auto scroll-touch overflow-y-hidden">
        <div className="flex gap-1 flex-nowrap min-w-0">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 py-2.5 px-2 text-[12px] font-medium border-b-2 transition-colors shrink-0 ${
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
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-touch bg-monday-bg" ref={feedRef}>
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
            ) : updates.filter(u => !(u.content || '').startsWith(AUDIT_PREFIX)).length === 0 ? (
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
                <AnimatePresence initial={false}>
                  {updates
                    .filter(u => !(u.content || '').startsWith(AUDIT_PREFIX))
                    .map(u => (
                    <motion.div
                      key={u.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="flex gap-3"
                    >
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
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Info' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-monday-border shadow-monday-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-monday-text">Resumen</div>
                  <div className="text-[12px] text-monday-subtext mt-0.5">
                    {group?.name ? `Grupo: ${group.name}` : 'Grupo no disponible'}
                  </div>
                </div>
                <div className="text-[11px] text-monday-subtext shrink-0">
                  Elemento · ID #{item.id.slice(0, 8)}
                </div>
              </div>

              {(activitySummary.statusEntries.length > 0 || activitySummary.docEntries.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...activitySummary.statusEntries, ...activitySummary.docEntries].map((e) => (
                    <div
                      key={e.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-monday-border bg-monday-pill px-3 py-1 text-[12px] min-h-[32px]"
                    >
                      <span className="text-monday-subtext font-semibold truncate max-w-[120px]">{e.title}</span>
                      <span className="text-monday-border">·</span>
                      <span className="text-monday-text font-medium truncate max-w-[180px]">{e.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {infoRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10 text-monday-subtext">
                    <Info size={36} className="text-monday-border mb-3" />
                    <p className="text-[13px] font-medium text-monday-text mb-1">Sin información</p>
                    <p className="text-[12px] max-w-[240px]">
                      Este elemento no tiene campos configurados para mostrar.
                    </p>
                  </div>
                ) : (
                  infoRows.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-3 border-t border-monday-border/60 pt-2">
                      <div className="min-w-0">
                        <div className="text-[12px] text-monday-subtext font-semibold truncate">{r.label}</div>
                        <div className="text-[13px] text-monday-text mt-0.5 break-words">{r.value}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Archivos' && (
          <div className="p-4 flex flex-col gap-4">
            {archiveEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
                <FileText size={32} className="text-monday-border mb-3" />
                <p className="text-[13px] font-medium text-monday-text">No hay archivos</p>
                <p className="text-[12px] mt-1">Este elemento no tiene documentos o enlaces configurados.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {archiveEntries.map((e) => (
                  <div key={e.id} className="bg-white rounded-xl border border-monday-border shadow-monday-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-monday-text truncate">{e.primaryLabel}</div>
                        <div className="text-[12px] text-monday-subtext mt-0.5 truncate">{e.columnTitle}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.kind === 'doc' && e.docId ? (
                          <button
                            type="button"
                            onClick={() => openDocById(e.docId!)}
                            className="inline-flex items-center gap-2 bg-monday-blue text-white text-[12px] font-semibold px-3 py-1.5 rounded-monday hover:bg-blue-600 transition-colors"
                          >
                            <FileText size={14} />
                            Abrir doc
                          </button>
                        ) : e.href ? (
                          <a
                            href={e.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-monday-blue text-white text-[12px] font-semibold px-3 py-1.5 rounded-monday hover:bg-blue-600 transition-colors"
                          >
                            <ExternalLink size={14} />
                            Abrir
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Registro de act.' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-monday-border shadow-monday-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-monday-text flex items-center gap-2">
                    <Clock size={18} className="text-monday-blue" />
                    Registro de actividad
                  </div>
                  <div className="text-[12px] text-monday-subtext mt-1">
                    Cambios automáticos de estados y documentos del elemento.
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="w-5 h-5 border-2 border-monday-blue border-t-transparent rounded-full animate-spin" />
                </div>
              ) : updates.filter((u) => (u.content || '').startsWith(AUDIT_PREFIX)).length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 text-monday-subtext">
                  <p className="text-[14px] font-medium text-monday-text mb-1">Sin cambios aún</p>
                  <p className="text-[12px] max-w-[240px]">
                    Cuando se actualicen estados, asignaciones o documentos, aparecerá aquí.
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  {updates
                    .filter((u) => (u.content || '').startsWith(AUDIT_PREFIX))
                    .map((u) => {
                      const msg = (u.content || '').slice(AUDIT_PREFIX.length);
                      const authorAny = u as any;
                      const authorName =
                        authorAny.authorUser?.name ||
                        authorAny.author?.name ||
                        authorAny.authorUser?.username ||
                        authorAny.author?.username ||
                        'Usuario';
                      const authorColor =
                        authorAny.authorUser?.color ||
                        authorAny.author?.color ||
                        '#ccc';
                      const authorInitials =
                        authorAny.authorUser?.initials ||
                        authorAny.author?.initials ||
                        (typeof authorName === 'string' && authorName.trim().length >= 1
                          ? authorName.trim().slice(0, 1).toUpperCase()
                          : '?');
                      return (
                        <div key={u.id} className="flex gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0 mt-0.5 shadow-monday-sm"
                            style={{ backgroundColor: authorColor }}
                          >
                            {authorInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="bg-white rounded-xl border border-monday-border p-3 shadow-monday-sm">
                              <div className="flex items-baseline justify-between mb-1.5">
                                <span className="text-[13px] font-semibold text-monday-text">
                                  {authorName} {msg}
                                </span>
                                <span className="text-[11px] text-monday-subtext">
                                  {formatDateTime(u.createdAt)}
                                </span>
                              </div>
                              {/* Mensaje ya va completo en el título (acción + usuario + timestamp). */}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Wrapper>
  );
};
