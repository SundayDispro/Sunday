import React, { useEffect, useState } from 'react';
import { BarChart2, LayoutList, Layers, CheckSquare } from 'lucide-react';
import { Board } from '../../types';
import { apiFetch } from '../../api';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

export const DashboardPage: React.FC = () => {
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/api/boards/first`)
      .then(r => r.json())
      .then((data: Board | null) => {
        if (data?.id) setBoard(data);
      })
      .catch(() => {});
  }, []);

  const stats = React.useMemo(() => {
    if (!board) return null;
    let totalItems = 0;
    const statusCounts: Record<string, number> = {};
    const statusCol = board.columns.find(c => c.type === 'status');
    board.groups.forEach(g => {
      totalItems += g.items.length;
      g.items.forEach(item => {
        const cv = item.columnValues.find(v => v.columnId === statusCol?.id);
        let key = 'Sin estado';
        if (cv?.value) {
          try {
            const parsed = JSON.parse(cv.value);
            const opt = statusCol?.settings ? JSON.parse(statusCol.settings).options?.find((o: { id: string }) => o.id === parsed.optionId) : null;
            key = opt?.label ?? 'Sin estado';
          } catch {
            key = cv.value;
          }
        }
        statusCounts[key] = (statusCounts[key] || 0) + 1;
      });
    });
    return {
      totalItems,
      totalGroups: board.groups.length,
      totalColumns: board.columns.length,
      statusCounts,
    };
  }, [board]);

  if (!board) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-monday-subtext p-8">
        <div className="w-10 h-10 border-2 border-monday-blue border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[14px]">Cargando panel...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-6 border-b border-monday-border shrink-0">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <BarChart2 size={22} className="text-monday-blue" />
          Panel
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1">
          Resumen de {board.name}
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar scroll-touch p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-monday-border rounded-xl p-5 shadow-monday-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <CheckSquare size={20} className="text-monday-blue" />
              </div>
              <div>
                <p className="text-[12px] text-monday-subtext uppercase tracking-wider font-medium">Elementos</p>
                <p className="text-[22px] font-semibold text-monday-text">{stats?.totalItems ?? 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-monday-border rounded-xl p-5 shadow-monday-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Layers size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-[12px] text-monday-subtext uppercase tracking-wider font-medium">Grupos</p>
                <p className="text-[22px] font-semibold text-monday-text">{stats?.totalGroups ?? 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-monday-border rounded-xl p-5 shadow-monday-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <LayoutList size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-[12px] text-monday-subtext uppercase tracking-wider font-medium">Columnas</p>
                <p className="text-[22px] font-semibold text-monday-text">{stats?.totalColumns ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
        {stats && Object.keys(stats.statusCounts).length > 0 && (
          <div className="bg-white border border-monday-border rounded-xl p-5 shadow-monday-sm">
            <h2 className="text-[14px] font-semibold text-monday-text mb-4">Por estado</h2>
            <ul className="space-y-2">
              {Object.entries(stats.statusCounts).map(([label, count]) => (
                <li key={label} className="flex items-center justify-between text-[13px]">
                  <span className="text-monday-text">{label}</span>
                  <span className="font-medium text-monday-subtext">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
