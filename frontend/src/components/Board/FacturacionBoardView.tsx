import React, { useMemo, useState } from 'react';
import { Board, Item, BoardColumn, Group, StatusSettings } from '../../types';
import { DocsCellRenderer } from './DocsCellRenderer';
import { StatusCellRenderer } from './StatusCellRenderer';
import { BillingDocsCellRenderer } from './BillingDocsCellRenderer';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  isMobile?: boolean;
  isLandscapeShort?: boolean;
}

export const FacturacionBoardView: React.FC<Props> = ({ board, onRowClick, isMobile = false }) => {
  const estadoTallerColumn: BoardColumn | undefined = board.columns.find(
    c => (c.type === 'status' || c.type === 'priority') && c.title === 'Estado Taller'
  );
  const docsColumn: BoardColumn | undefined = board.columns.find(
    c => c.type === 'docs'
  );
  const billingDocsColumn: BoardColumn | undefined = board.columns.find(
    c => c.type === 'billing_docs' || c.title === 'Documentos Facturación'
  );
  const estadoFacturacionColumn: BoardColumn | undefined = board.columns.find(
    c => c.type === 'status' && c.title === 'Estado Facturación'
  );

  const facturacionRows: { item: Item; group: Group }[] = [];

  if (estadoTallerColumn) {
    board.groups.forEach(group => {
      group.items.forEach(item => {
        const cv = item.columnValues.find(v => v.columnId === estadoTallerColumn.id);
        if (!cv?.value) return;
        try {
          const parsed = JSON.parse(cv.value);
          if (parsed?.optionId === 'colocado') {
            facturacionRows.push({ item, group });
          }
        } catch {
          // ignorar valores no JSON
        }
      });
    });
  }

  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstadoFacturacion, setFilterEstadoFacturacion] = useState<string | null>(null);

  const estadoFacturacionOptions = useMemo(() => {
    if (!estadoFacturacionColumn?.settings) return [];
    try {
      const parsed = JSON.parse(estadoFacturacionColumn.settings) as StatusSettings;
      return parsed.options ?? [];
    } catch {
      return [];
    }
  }, [estadoFacturacionColumn]);

  const filteredRows = useMemo(() => {
    let rows = facturacionRows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(({ item }) => item.name.toLowerCase().includes(q));
    }
    if (filterEstadoFacturacion && estadoFacturacionColumn) {
      rows = rows.filter(({ item }) => {
        const cv = item.columnValues.find(v => v.columnId === estadoFacturacionColumn.id);
        if (!cv?.value) return false;
        try {
          const p = JSON.parse(cv.value);
          return (p?.optionId ?? cv.value) === filterEstadoFacturacion;
        } catch {
          return cv.value === filterEstadoFacturacion;
        }
      });
    }
    return rows;
  }, [facturacionRows, searchQuery, filterEstadoFacturacion, estadoFacturacionColumn]);

  return (
    <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0 flex flex-col">
      {/* Filtros: en móvil en columna */}
      <div className={`flex items-center justify-between mb-3 gap-3 shrink-0 ${isMobile ? 'flex-col items-stretch' : 'flex-wrap'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar elemento..."
            className="px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-[var(--monday-surface)] text-monday-text placeholder:text-monday-subtext outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue min-w-0 flex-1 min-h-[44px]"
          />
        </div>
        {estadoFacturacionColumn && estadoFacturacionOptions.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-monday-subtext shrink-0">Estado facturación:</span>
            <select
              value={filterEstadoFacturacion ?? ''}
              onChange={e => setFilterEstadoFacturacion(e.target.value || null)}
              className="px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-[var(--monday-surface)] text-monday-text outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue min-h-[44px] flex-1 min-w-0"
            >
              <option value="">Todos</option>
              {estadoFacturacionOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label || opt.id}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {facturacionRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-monday-subtext flex-1">
          <p className="text-[15px] font-medium text-monday-text">Sin elementos para facturación</p>
          <p className="text-[13px] mt-1">No hay elementos con Estado Taller &quot;Colocado&quot; en este tablero.</p>
        </div>
      ) : isMobile ? (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {filteredRows.map(({ item }) => {
            const docsValue = docsColumn ? item.columnValues.find(v => v.columnId === docsColumn.id) : undefined;
            const facturacionValue = estadoFacturacionColumn ? item.columnValues.find(v => v.columnId === estadoFacturacionColumn.id) : undefined;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onRowClick(item)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(item); } }}
                className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm text-left min-h-[48px] touch-manipulation active:bg-monday-hover/30"
              >
                <div className="font-medium text-monday-text text-[14px] mb-2">{item.name}</div>
                <div className="space-y-1.5 text-[12px]">
                  {docsColumn && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-monday-subtext">Docs</span>
                      {docsValue ? <DocsCellRenderer item={item} column={docsColumn} value={docsValue} /> : <span className="text-monday-subtext">Sin hoja de trabajo</span>}
                    </div>
                  )}
                  {billingDocsColumn && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-monday-subtext">Documentos Facturación</span>
                      <BillingDocsCellRenderer item={item} column={billingDocsColumn} value={item.columnValues.find(v => v.columnId === billingDocsColumn.id)} />
                    </div>
                  )}
                  {estadoFacturacionColumn && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-monday-subtext">Estado Facturación</span>
                      <StatusCellRenderer item={item} column={estadoFacturacionColumn} value={facturacionValue} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="border border-monday-border rounded-xl overflow-hidden shadow-monday-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-monday-hover/60 border-b border-monday-border">
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                Elemento
              </th>
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                Docs
              </th>
              {billingDocsColumn && (
                <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                  Documentos Facturación
                </th>
              )}
              <th className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider px-4 py-3">
                Estado Facturación
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ item }) => {
              const docsValue = docsColumn
                ? item.columnValues.find(v => v.columnId === docsColumn.id)
                : undefined;
              const facturacionValue = estadoFacturacionColumn
                ? item.columnValues.find(v => v.columnId === estadoFacturacionColumn.id)
                : undefined;
              return (
              <tr
                key={item.id}
                className="border-b border-monday-border last:border-0 hover:bg-monday-hover/30 transition-colors"
              >
                <td className="px-4 py-3 text-[13px] font-medium text-monday-blue">
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => onRowClick(item)}
                  >
                    {item.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-[13px] text-monday-text align-middle">
                  {docsColumn && docsValue ? (
                    <div className="max-w-xs">
                      <DocsCellRenderer item={item} column={docsColumn} value={docsValue} />
                    </div>
                  ) : (
                    <span className="text-monday-subtext text-[13px]">Sin hoja de trabajo</span>
                  )}
                </td>
                {billingDocsColumn && (
                  <td className="px-4 py-3 text-[13px] text-monday-text align-middle">
                    <div className="max-w-xs">
                      <BillingDocsCellRenderer
                        item={item}
                        column={billingDocsColumn}
                        value={
                          item.columnValues.find(v => v.columnId === billingDocsColumn.id)
                        }
                      />
                    </div>
                  </td>
                )}
                <td className="px-4 py-3 text-[13px] text-monday-text font-medium align-middle">
                  {estadoFacturacionColumn && (
                    <div className="min-w-[140px] max-w-xs">
                      <StatusCellRenderer
                        item={item}
                        column={estadoFacturacionColumn}
                        value={facturacionValue}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};
