import React, { useMemo } from 'react';
import { Board, Item, BoardColumn, Group } from '../../types';
import { useUser } from '../../store/UserContext';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  isMobile?: boolean;
  isLandscapeShort?: boolean;
}

export const ResumenBoardView: React.FC<Props> = ({ board, onRowClick, isMobile = false }) => {
  const { currentUser } = useUser();
  const statCardStyle = (accent: string) => ({
    borderColor: `${accent}66`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 14%, var(--monday-surface)), var(--monday-surface))`,
  });
  const stats = useMemo(() => {
    const allItems: { item: Item; group: Group }[] = [];
    board.groups.forEach(g => g.items.forEach(item => allItems.push({ item, group: g })));

    const statusCol = board.columns.find(c => (c.type === 'status' || c.type === 'priority') && c.title === 'Estado');
    const personCol = board.columns.find(c => c.type === 'person');
    const dateCol = board.columns.find(c => c.type === 'date' && /vencimiento|fecha/i.test(c.title));
    const estadoFactCol = board.columns.find(c => c.type === 'status' && c.title === 'Estado Facturación');

    let byStatus: Record<string, number> = {};
    let vencidos = 0;
    let pendientesFacturar = 0;
    let myAssigned = 0;
    let myDueSoon = 0;
    let myOverdue = 0;
    const myUpcoming: { item: Item; date: Date }[] = [];

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
      const isAssignedToMe = (() => {
        if (!personCol || !currentUser) return false;
        const cv = item.columnValues.find(v => v.columnId === personCol.id);
        if (!cv?.value) return false;
        try {
          const ids = JSON.parse(cv.value) as string[];
          return Array.isArray(ids) ? ids.includes(currentUser.id) : cv.value === currentUser.id;
        } catch {
          return cv.value === currentUser.id;
        }
      })();
      if (isAssignedToMe) myAssigned++;

      if (dateCol) {
        const cv = item.columnValues.find(v => v.columnId === dateCol.id);
        if (cv?.value) {
          const d = new Date(cv.value);
          if (!isNaN(d.getTime())) {
            if (d < now) {
              vencidos++;
              if (isAssignedToMe) myOverdue++;
            }
            const diffDays = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            if (isAssignedToMe && diffDays >= 0 && diffDays <= 7) {
              myDueSoon++;
              myUpcoming.push({ item, date: d });
            }
          }
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
      vencidos,
      pendientesFacturar,
      myAssigned,
      myDueSoon,
      myOverdue,
      myUpcoming: myUpcoming.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5),
    };
  }, [board, currentUser]);

  const statusMax = Math.max(1, ...stats.byStatus.map((s) => s.count));
  const statusPalette = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#6c63ff', '#7f56d9'];

  return (
    <div className="flex-1 overflow-auto scroll-touch custom-scrollbar p-4 sm:p-6 min-h-0 bg-gradient-to-b from-monday-bg to-monday-hover/20">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="border rounded-xl p-4 shadow-monday-sm min-h-[52px]" style={statCardStyle('#579bfc')}>
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Total elementos</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.totalItems}</p>
        </div>
        <div className="border rounded-xl p-4 shadow-monday-sm min-h-[52px]" style={statCardStyle('#00c875')}>
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Grupos</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.totalGroups}</p>
        </div>
        <div className="border rounded-xl p-4 shadow-monday-sm min-h-[52px]" style={statCardStyle('#fdab3d')}>
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Vencidos</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.vencidos}</p>
        </div>
        <div className="border rounded-xl p-4 shadow-monday-sm min-h-[52px]" style={statCardStyle('#e2445c')}>
          <p className="text-[12px] font-semibold text-monday-subtext uppercase tracking-wider">Pend. facturar</p>
          <p className="text-2xl font-bold text-monday-text mt-1">{stats.pendientesFacturar}</p>
        </div>
      </div>

      {stats.byStatus.length > 0 && (
        <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm mb-6">
          <h3 className="text-[13px] font-semibold text-monday-text mb-3">Distribución por estado</h3>
          <div className="space-y-3">
            {stats.byStatus
              .sort((a, b) => b.count - a.count)
              .map(({ id, label, count }, idx) => (
                <div key={id}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="text-monday-text truncate">{label}</span>
                    <span className="font-semibold text-monday-text">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-monday-hover overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, (count / statusMax) * 100)}%`,
                        backgroundColor: statusPalette[idx % statusPalette.length],
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {currentUser && (
        <div className="bg-[var(--monday-surface)] border border-monday-border rounded-xl p-4 shadow-monday-sm">
          <h3 className="text-[13px] font-semibold text-monday-text mb-3">Mi enfoque</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-monday-border p-3 bg-monday-hover/20">
              <p className="text-[11px] uppercase tracking-wide text-monday-subtext">Asignados a mí</p>
              <p className="text-[20px] font-bold text-monday-text mt-1">{stats.myAssigned}</p>
            </div>
            <div className="rounded-lg border border-monday-border p-3 bg-monday-hover/20">
              <p className="text-[11px] uppercase tracking-wide text-monday-subtext">Vencen en 7 días</p>
              <p className="text-[20px] font-bold text-monday-text mt-1">{stats.myDueSoon}</p>
            </div>
            <div className="rounded-lg border border-monday-border p-3 bg-monday-hover/20">
              <p className="text-[11px] uppercase tracking-wide text-monday-subtext">Atrasados</p>
              <p className="text-[20px] font-bold text-monday-text mt-1">{stats.myOverdue}</p>
            </div>
          </div>
          {stats.myUpcoming.length > 0 ? (
            <div>
              <p className="text-[12px] font-semibold text-monday-subtext mb-2">Próximos asignados</p>
              <ul className="space-y-2">
                {stats.myUpcoming.map(({ item, date }) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <button type="button" onClick={() => onRowClick(item)} className="text-monday-blue hover:underline truncate text-left">
                      {item.name}
                    </button>
                    <span className="text-monday-subtext shrink-0">
                      {date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[12px] text-monday-subtext">Sin próximos vencimientos asignados para ti.</p>
          )}
        </div>
      )}

      {stats.totalItems === 0 && (
        <p className="text-monday-subtext text-[13px]">No hay elementos en este tablero.</p>
      )}
    </div>
  );
};
