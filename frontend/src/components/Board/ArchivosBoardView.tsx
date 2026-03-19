import React, { useMemo } from 'react';
import { Board, Item, Group } from '../../types';
import { FileText } from 'lucide-react';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  isMobile?: boolean;
  isLandscapeShort?: boolean;
}

interface FileEntry {
  item: Item;
  group: Group;
  columnTitle: string;
  type: 'docs' | 'billing_docs';
  value: string;
}

export const ArchivosBoardView: React.FC<Props> = ({ board, onRowClick, isMobile = false }) => {
  const entries = useMemo(() => {
    const docsCol = board.columns.find(c => c.type === 'docs');
    const billingCol = board.columns.find(c => c.type === 'billing_docs' || c.title === 'Documentos Facturación');
    const list: FileEntry[] = [];

    board.groups.forEach(group => {
      group.items.forEach(item => {
        if (docsCol) {
          const cv = item.columnValues.find(v => v.columnId === docsCol.id);
          if (cv?.value?.trim()) {
            list.push({
              item,
              group,
              columnTitle: docsCol.title,
              type: 'docs',
              value: cv.value.trim(),
            });
          }
        }
        if (billingCol) {
          const cv = item.columnValues.find(v => v.columnId === billingCol.id);
          if (cv?.value?.trim()) {
            try {
              const parsed = JSON.parse(cv.value) as { url?: string; name?: string } | string;
              const url = typeof parsed === 'object' && parsed?.url ? parsed.url : typeof parsed === 'string' ? parsed : '';
              if (url) {
                list.push({
                  item,
                  group,
                  columnTitle: billingCol.title,
                  type: 'billing_docs',
                  value: url,
                });
              }
            } catch {
              if (cv.value.trim()) {
                list.push({
                  item,
                  group,
                  columnTitle: billingCol.title,
                  type: 'billing_docs',
                  value: cv.value.trim(),
                });
              }
            }
          }
        }
      });
    });

    return list;
  }, [board]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0">
        <p className="text-monday-subtext text-[13px]">No hay documentos ni archivos de facturación en este tablero.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0">
        <div className="flex flex-col gap-3">
          {entries.map((e, idx) => (
            <div
              key={`${e.item.id}-${e.columnTitle}-${idx}`}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(e.item)}
              onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onRowClick(e.item); } }}
              className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm text-left min-h-[48px] touch-manipulation active:bg-monday-hover/30"
            >
              <div className="font-medium text-monday-text text-[14px] mb-1">{e.item.name}</div>
              <div className="text-[12px] text-monday-subtext">{e.group.name} · {e.columnTitle}</div>
              <div className="mt-2">
                {e.value.startsWith('http') ? (
                  <a
                    href={e.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-monday-blue hover:underline inline-flex items-center gap-1 text-[13px] min-h-[44px]"
                    onClick={ev => ev.stopPropagation()}
                  >
                    <FileText size={14} />
                    Abrir
                  </a>
                ) : (
                  <span className="text-monday-text truncate block text-[13px]">{e.value}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0">
      <div className="border border-monday-border rounded-xl overflow-hidden shadow-monday-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-monday-hover/60 border-b border-monday-border">
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">Elemento</th>
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">Grupo</th>
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">Tipo</th>
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">Documento / Enlace</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, idx) => (
              <tr
                key={`${e.item.id}-${e.columnTitle}-${idx}`}
                className="border-b border-monday-border last:border-0 hover:bg-monday-hover/30 transition-colors"
              >
                <td className="px-4 py-3 text-[13px]">
                  <button
                    type="button"
                    className="font-medium text-monday-blue hover:underline"
                    onClick={() => onRowClick(e.item)}
                  >
                    {e.item.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-[13px] text-monday-text">{e.group.name}</td>
                <td className="px-4 py-3 text-[13px] text-monday-text">{e.columnTitle}</td>
                <td className="px-4 py-3 text-[13px]">
                  {e.value.startsWith('http') ? (
                    <a
                      href={e.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-monday-blue hover:underline inline-flex items-center gap-1"
                    >
                      <FileText size={14} />
                      Abrir
                    </a>
                  ) : (
                    <span className="text-monday-text truncate max-w-xs block">{e.value}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
