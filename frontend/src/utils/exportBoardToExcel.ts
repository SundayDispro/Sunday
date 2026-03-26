import * as XLSX from 'xlsx';
import type { Board } from '../types';

/** Exporta el tablero activo a un .xlsx (valores de celdas como texto). */
export function exportBoardToExcel(board: Board, filenameBase?: string) {
  const rows: string[][] = [];
  const headers = ['Grupo', 'Ítem', ...board.columns.map((c) => c.title)];
  rows.push(headers);
  for (const g of board.groups) {
    for (const it of g.items) {
      const vals = board.columns.map((col) => {
        const cv = it.columnValues.find((x) => x.columnId === col.id);
        const raw = cv?.value ?? '';
        try {
          const p = JSON.parse(raw);
          if (p && typeof p === 'object' && 'label' in p) return String((p as { label?: string }).label ?? raw);
        } catch {
          /* texto plano */
        }
        return raw;
      });
      rows.push([g.name, it.name, ...vals]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tablero');
  const safe = (filenameBase || board.name || 'tablero').replace(/[\\/:*?"<>|]/g, '-');
  XLSX.writeFile(wb, `${safe}.xlsx`);
}
