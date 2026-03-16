import React, { useMemo } from 'react';
import { Board, Item, Group } from '../../types';
import { FileText } from 'lucide-react';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
}

interface FileEntry {
  item: Item;
  group: Group;
  columnTitle: string;
  type: 'docs' | 'billing_docs';
  value: string;
}

export const ArchivosBoardView: React.FC<Props> = ({ board, onRowClick }) => {
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
      {entries.length === 0 && (
        <p className="text-monday-subtext text-[13px] mt-4">No hay documentos ni archivos de facturación en este tablero.</p>
      )}
    </div>
  );
};
