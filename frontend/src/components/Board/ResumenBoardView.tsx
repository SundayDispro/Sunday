import React, { useMemo } from 'react';
import { Board, Item, BoardColumn, Group } from '../../types';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
}

export const ResumenBoardView: React.FC<Props> = ({ board, onRowClick }) => {
  const stats = useMemo(() => {
    const allItems: { item: Item; group: Group }[] = [];
    board.groups.forEach(g => g.items.forEach(item => allItems.push({ item, group: g })));

    const statusCol = board.columns.find(c => (c.type === 'status' || c.type === 'priority') && c.title === 'Estado');
    const personCol = board.columns.find(c => c.type === 'person');
    const dateCol = board.columns.find(c => c.type === 'date' && /vencimiento|fecha/i.test(c.title));
    const estadoFactCol = board.columns.find(c => c.type === 'status' && c.title === 'Estado Facturación');

    let byStatus: Record<string, number> = {};
    let byPerson: Record<string, number> = {};
    let vencidos = 0;
    let pendientesFacturar = 0;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    allItems.forEach(({ item }) => {
      if (statusCol) {
        const cv = item.columnValues.find(v => v.columnId === statusCol.id);
        if (cv?.value) {
          try {
            const p = JSON.parse(cv.value) as { optionId?: string };
            const id = p?.optionId ?? cv.value;
            byStatus[id] = (byStatus[id] ?? 0) + 1;
          } catch {
            byStatus[cv.value] = (byStatus[cv.value] ?? 0) + 1;
          }
        }
      }
      if (personCol) {
        const cv = item.columnValues.find(v => v.columnId === personCol.id);
        if (cv?.value) {
          try {
            const ids = JSON.parse(cv.value) as string[];
            (Array.isArray(ids) ? ids : [cv.value]).forEach((id: string) => {
              byPerson[id] = (byPerson[id] ?? 0) + 1;
            });
          } catch {
            byPerson[cv.value] = (byPerson[cv.value] ?? 0) + 1;
          }
        }
      }
      if (dateCol) {
        const cv = item.columnValues.find(v => v.columnId === dateCol.id);
        if (cv?.value) {
          const d = new Date(cv.value);
          if (!isNaN(d.getTime()) && d < now) vencidos++;
        }
      }
      if (estadoFactCol) {
        const cv = item.columnValues.find(v => v.columnId === estadoFactCol.id);
        if (cv?.value) {
          try {
            const p = JSON.parse(cv.value) as { optionId?: string };
            if ((p?.optionId ?? cv.value) === 'pendiente_factura' || (p?.optionId ?? cv.value) === 'pendiente') pendientesFacturar++;
          } catch {
            if (cv.value.toLowerCase().includes('pendiente')) pendientesFacturar++;
          }
        }
      }
    });

    const statusLabels: Record<string, string> = {};
    if (statusCol?.settings) {
      try {
        const opts = (JSON.parse(statusCol.settings) as { options?: { id: string; label: string }[] })?.options ?? [];
        opts.forEach((o: { id: string; label: string }) => { statusLabels[o.id] = o.label; });
      } catch { /* ignore */ }
    }

    return {
      totalItems: allItems.length,
      totalGroups: board.groups.length,
      byStatus: Object.entries(byStatus).map(([id, count]) => ({ id, label: statusLabels[id] || id, count })),
      byPerson,
      vencidos,
      pendientesFacturar,
      allItems,
    };
  }, [board]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Total elementos</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.totalItems}</p>
        </div>
        <div className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Grupos</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.totalGroups}</p>
        </div>
        <div className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Vencidos</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.vencidos}</p>
        </div>
        <div className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Pend. facturar</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.pendientesFacturar}</p>
        </div>
      </div>

      {stats.byStatus.length > 0 && (
        <div className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm mb-6">
          <h3 className="text-[13px] font-semibold text-monday-text mb-3">Por estado</h3>
          <ul className="space-y-2">
            {stats.byStatus.map(({ id, label, count }) => (
              <li key={id} className="flex items-center justify-between text-[13px]">
                <span className="text-monday-text">{label}</span>
                <span className="font-medium text-monday-text">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(stats.byPerson).length > 0 && (
        <div className="bg-white border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <h3 className="text-[13px] font-semibold text-monday-text mb-3">Por responsable (IDs)</h3>
          <ul className="space-y-2">
            {Object.entries(stats.byPerson)
              .sort((a, b) => b[1] - a[1])
              .map(([userId, count]) => (
                <li key={userId} className="flex items-center justify-between text-[13px]">
                  <span className="text-monday-subtext font-mono truncate max-w-[200px]">{userId}</span>
                  <span className="font-medium text-monday-text">{count} elementos</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {stats.totalItems === 0 && (
        <p className="text-monday-subtext text-[13px]">No hay elementos en este tablero.</p>
      )}
    </div>
  );
};
