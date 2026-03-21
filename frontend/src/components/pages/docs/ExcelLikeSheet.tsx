import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Palette, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { FONT_OPTIONS, FONT_SIZES } from '../../docs/TextFormatBar';
import type { CellStyleDef, CellStylesMap } from './sheetCellTypes';

// --- Fórmulas tipo Excel para la hoja (suma, resta, multiplicación, división, SUM) ---
function parseCellRef(ref: string): { r: number; c: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const colStr = m[1];
  const row = parseInt(m[2], 10) - 1;
  if (row < 0) return null;
  let c = 0;
  for (let i = 0; i < colStr.length; i++) {
    c = c * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { r: row, c: c - 1 };
}

function getCellNum(table: string[][], r: number, c: number): number {
  const raw = table[r]?.[c] ?? '';
  if (raw === '') return 0;
  const n = parseFloat(raw.replace(/,/g, '.'));
  if (!Number.isNaN(n)) return n;
  if (raw.startsWith('=')) return 0;
  return 0;
}

function evaluateFormula(
  table: string[][],
  formula: string,
  currentR: number,
  currentC: number,
  visited?: Set<string>
): string | number {
  const vis = visited ?? new Set<string>();
  const expr = formula.replace(/^=/, '').trim();
  if (!expr) return '';

  const key = `${currentR},${currentC}`;
  if (vis.has(key)) return '#CIRCULAR';
  vis.add(key);

  try {
    // SUM(A1:A5) o SUM(A1,B2,C3)
    const sumMatch = expr.match(/^SUM\s*\((.*)\)$/i);
    if (sumMatch) {
      const arg = sumMatch[1].trim();
      let total = 0;
      if (arg.includes(':')) {
        const [start, end] = arg.split(':').map(s => parseCellRef(s.trim())).filter(Boolean) as { r: number; c: number }[];
        if (!start || !end) return '#ERROR';
        const minR = Math.min(start.r, end.r);
        const maxR = Math.max(start.r, end.r);
        const minC = Math.min(start.c, end.c);
        const maxC = Math.max(start.c, end.c);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const cell = table[r]?.[c] ?? '';
            if (cell.startsWith('=')) {
              const v = evaluateFormula(table, cell, r, c, new Set(vis));
              total += typeof v === 'number' ? v : 0;
            } else {
              const n = parseFloat(String(cell).replace(/,/g, '.'));
              total += Number.isNaN(n) ? 0 : n;
            }
          }
        }
      } else {
        arg.split(',').forEach(part => {
          const ref = parseCellRef(part.trim());
          if (ref) {
            const cell = table[ref.r]?.[ref.c] ?? '';
            if (cell.startsWith('=')) {
              const v = evaluateFormula(table, cell, ref.r, ref.c, new Set(vis));
              total += typeof v === 'number' ? v : 0;
            } else {
              const n = parseFloat(String(cell).replace(/,/g, '.'));
              total += Number.isNaN(n) ? 0 : n;
            }
          }
        });
      }
      return total;
    }

    // Helper: collect numeric values from range or list (same as SUM arg)
    const collectNumbers = (arg: string): number[] => {
      const nums: number[] = [];
      if (arg.includes(':')) {
        const [start, end] = arg.split(':').map(s => parseCellRef(s.trim())).filter(Boolean) as { r: number; c: number }[];
        if (!start || !end) return [];
        const minR = Math.min(start.r, end.r);
        const maxR = Math.max(start.r, end.r);
        const minC = Math.min(start.c, end.c);
        const maxC = Math.max(start.c, end.c);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const cell = table[r]?.[c] ?? '';
            if (cell.startsWith('=')) {
              const v = evaluateFormula(table, cell, r, c, new Set(vis));
              if (typeof v === 'number') nums.push(v);
            } else {
              const n = parseFloat(String(cell).replace(/,/g, '.'));
              if (!Number.isNaN(n)) nums.push(n);
            }
          }
        }
      } else {
        arg.split(',').forEach(part => {
          const ref = parseCellRef(part.trim());
          if (ref) {
            const cell = table[ref.r]?.[ref.c] ?? '';
            if (cell.startsWith('=')) {
              const v = evaluateFormula(table, cell, ref.r, ref.c, new Set(vis));
              if (typeof v === 'number') nums.push(v);
            } else {
              const n = parseFloat(String(cell).replace(/,/g, '.'));
              if (!Number.isNaN(n)) nums.push(n);
            }
          }
        });
      }
      return nums;
    };

    const avgMatch = expr.match(/^AVERAGE\s*\((.*)\)$/i);
    if (avgMatch) {
      const nums = collectNumbers(avgMatch[1].trim());
      if (nums.length === 0) return 0;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    const minMatch = expr.match(/^MIN\s*\((.*)\)$/i);
    if (minMatch) {
      const nums = collectNumbers(minMatch[1].trim());
      if (nums.length === 0) return 0;
      return Math.min(...nums);
    }
    const maxMatch = expr.match(/^MAX\s*\((.*)\)$/i);
    if (maxMatch) {
      const nums = collectNumbers(maxMatch[1].trim());
      if (nums.length === 0) return 0;
      return Math.max(...nums);
    }
    const countMatch = expr.match(/^COUNT\s*\((.*)\)$/i);
    if (countMatch) {
      const nums = collectNumbers(countMatch[1].trim());
      return nums.length;
    }

    // Expresión simple: A1+B1, A1-B1, A1*B1, A1/B1, (A1+B1)*C1, etc.
    const tokens: string[] = [];
    let rest = expr.replace(/\s/g, '');
    while (rest.length > 0) {
      const refMatch = rest.match(/^([A-Z]+\d+)/i);
      const numMatch = rest.match(/^\d+(?:[.,]\d+)?/);
      const opMatch = rest.match(/^([+\-*/()])/);
      if (refMatch) {
        const ref = parseCellRef(refMatch[1]);
        const val = ref ? getCellNum(table, ref.r, ref.c) : 0;
        const cellContent = ref ? (table[ref.r]?.[ref.c] ?? '') : '';
        if (cellContent.startsWith('=')) {
          const v = evaluateFormula(table, cellContent, ref!.r, ref!.c, new Set(vis));
          tokens.push(typeof v === 'number' ? String(v) : '0');
        } else {
          tokens.push(String(val));
        }
        rest = rest.slice(refMatch[1].length);
      } else if (numMatch) {
        tokens.push(numMatch[1].replace(/,/g, '.'));
        rest = rest.slice(numMatch[1].length);
      } else if (opMatch) {
        tokens.push(opMatch[1]);
        rest = rest.slice(1);
      } else {
        return '#ERROR';
      }
    }

    const rpn = toRPN(tokens);
    const result = evalRPN(rpn);
    return typeof result === 'number' && Number.isFinite(result) ? result : '#ERROR';
  } catch {
    return '#ERROR';
  }
}

function toRPN(tokens: string[]): string[] {
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  for (const t of tokens) {
    if (t === '(') ops.push(t);
    else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      ops.pop();
    } else if (prec[t] != null) {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()!);
      ops.push(t);
    } else {
      out.push(t);
    }
  }
  while (ops.length) out.push(ops.pop()!);
  return out;
}

function evalRPN(rpn: string[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t === '+') stack.push((stack.pop() ?? 0) + (stack.pop() ?? 0));
    else if (t === '-') { const b = stack.pop() ?? 0; const a = stack.pop() ?? 0; stack.push(a - b); }
    else if (t === '*') stack.push((stack.pop() ?? 0) * (stack.pop() ?? 0));
    else if (t === '/') { const b = stack.pop() ?? 0; const a = stack.pop() ?? 0; stack.push(b === 0 ? 0 : a / b); }
    else stack.push(parseFloat(t) || 0);
  }
  return stack[0] ?? 0;
}

function getCellDisplayValue(
  table: string[][],
  r: number,
  c: number,
  isFocused: boolean,
  focusedCell: { r: number; c: number } | null
): string {
  const raw = table[r]?.[c] ?? '';
  if (isFocused) return raw;
  if (!raw.startsWith('=')) return raw;
  const result = evaluateFormula(table, raw, r, c);
  if (typeof result === 'number') return Number.isInteger(result) ? String(result) : result.toFixed(2);
  return result;
}

const SHEET_COLOR_PALETTE = [
  '#ffffff', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff', '#fed7aa',
  '#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#d8b4fe', '#fdba74',
  '#facc15', '#4ade80', '#60a5fa', '#f472b6', '#c084fc', '#fb923c',
];

const SHEET_TEXT_COLOR_PALETTE = [
  '#000000', '#374151', '#6b7280', '#ef4444', '#ea580c', '#ca8a04', '#65a30d', '#059669', '#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#c026d3',
];

// Editor de hoja tipo Excel: integrado a la interfaz, barra de fórmula y opciones
export function ExcelLikeSheet({
  tableDraft,
  setTableDraft,
  ensureTableSize,
  cellStyles = {},
  setCellStyles,
  documentTitle,
  readOnly = false,
  pushSheetHistory,
  undoSheet,
  redoSheet,
}: {
  tableDraft: string[][];
  setTableDraft: React.Dispatch<React.SetStateAction<string[][]>>;
  ensureTableSize: (rows: number, cols: number) => void;
  cellStyles?: CellStylesMap;
  setCellStyles?: React.Dispatch<React.SetStateAction<CellStylesMap>>;
  documentTitle?: string;
  readOnly?: boolean;
  pushSheetHistory?: () => void;
  undoSheet?: () => void;
  redoSheet?: () => void;
}) {
  const cols = tableDraft[0]?.length ?? 1;
  const rows = tableDraft.length;
  const [focusedCell, setFocusedCell] = useState<{ r: number; c: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: { r: number; c: number }; end: { r: number; c: number } } | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formatTargetRef = useRef<{ cell: { r: number; c: number } | null; range: { start: { r: number; c: number }; end: { r: number; c: number } } | null }>({ cell: null, range: null });
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false);
  const [fontColorMenuOpen, setFontColorMenuOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const fontColorMenuRef = useRef<HTMLDivElement>(null);
  const formulaBarValue = focusedCell != null ? (tableDraft[focusedCell.r]?.[focusedCell.c] ?? '') : '';

  const colLetters = (n: number) => {
    let s = '';
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s || 'A';
  };

  const setFocusedCellValue = (value: string) => {
    if (focusedCell == null) return;
    setTableDraft(prev => {
      const next = prev.map(row => [...row]);
      const row = next[focusedCell.r];
      if (row) row[focusedCell.c] = value;
      return next;
    });
  };

  const getFormatTarget = () => {
    const range = selectionRange ?? formatTargetRef.current?.range;
    const cell = focusedCell ?? formatTargetRef.current?.cell;
    return { range, cell };
  };

  const applyToCellsInTarget = (applyOne: (key: string, prev: CellStyleDef) => CellStyleDef) => {
    if (!setCellStyles) return;
    pushSheetHistory?.();
    const { range, cell } = getFormatTarget();
    setCellStyles(prev => {
      const next = { ...prev };
      if (range) {
        const minR = Math.min(range.start.r, range.end.r);
        const maxR = Math.max(range.start.r, range.end.r);
        const minC = Math.min(range.start.c, range.end.c);
        const maxC = Math.max(range.start.c, range.end.c);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const key = `${r},${c}`;
            next[key] = applyOne(key, next[key] ?? {});
          }
        }
      } else if (cell != null) {
        const key = `${cell.r},${cell.c}`;
        next[key] = applyOne(key, next[key] ?? {});
      }
      return next;
    });
  };

  const applyColorToTarget = (color: string) => {
    if (!setCellStyles) return;
    pushSheetHistory?.();
    const { range, cell } = getFormatTarget();
    if (range) {
      const minR = Math.min(range.start.r, range.end.r);
      const maxR = Math.max(range.start.r, range.end.r);
      const minC = Math.min(range.start.c, range.end.c);
      const maxC = Math.max(range.start.c, range.end.c);
      setCellStyles(prev => {
        const next = { ...prev };
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const key = `${r},${c}`;
            if (color === '' || color === 'transparent') {
              const cur = next[key];
              if (cur) { const { bg: _, ...rest } = cur; if (Object.keys(rest).length) next[key] = rest; else delete next[key]; }
            } else next[key] = { ...(next[key] ?? {}), bg: color };
          }
        }
        return next;
      });
    } else if (cell != null) {
      const key = `${cell.r},${cell.c}`;
      if (color === '' || color === 'transparent') {
        setCellStyles(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          const { bg: _, ...rest } = cur;
          if (Object.keys(rest).length === 0) { const { [key]: __, ...r } = prev; return r; }
          return { ...prev, [key]: rest };
        });
      } else setCellStyles(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), bg: color } }));
    }
  };

  const applyFontToTarget = (fontFamily: string) => {
    applyToCellsInTarget((_, prev) => ({ ...prev, fontFamily }));
  };

  const applyFontSizeToTarget = (fontSize: string) => {
    applyToCellsInTarget((_, prev) => ({ ...prev, fontSize }));
  };

  const applyTextColorToTarget = (color: string) => {
    applyToCellsInTarget((_, prev) => ({ ...prev, color }));
  };

  const insertRowAbove = () => {
    if (focusedCell == null) {
      ensureTableSize(tableDraft.length + 1, tableDraft[0]?.length || 1);
      return;
    }
    pushSheetHistory?.();
    setTableDraft(prev => {
      const newRow = new Array(prev[0]?.length || 1).fill('');
      const next = [...prev.slice(0, focusedCell.r), newRow, ...prev.slice(focusedCell.r)];
      return next;
    });
    setFocusedCell(prev => prev ? { r: prev.r + 1, c: prev.c } : null);
  };

  const insertColLeft = () => {
    if (focusedCell == null) {
      ensureTableSize(tableDraft.length, (tableDraft[0]?.length || 0) + 1);
      return;
    }
    pushSheetHistory?.();
    setTableDraft(prev => prev.map(row => [...row.slice(0, focusedCell.c), '', ...row.slice(focusedCell.c)]));
    setFocusedCell(prev => prev ? { r: prev.r, c: prev.c + 1 } : null);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent, anchorR: number, anchorC: number) => {
    e.preventDefault();
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.trim()) return;
    const lines = raw.split(/\r?\n/).map(line => line.split('\t'));
    if (lines.length === 0) return;
    const maxCols = Math.max(...lines.map(l => l.length));
    const newRows = anchorR + lines.length;
    const newCols = anchorC + maxCols;
    ensureTableSize(Math.max(rows, newRows), Math.max(cols, newCols));
    setTableDraft(prev => {
      const next = prev.map(r => [...r]);
      lines.forEach((line, dr) => {
        const r = anchorR + dr;
        if (!next[r]) next[r] = [];
        line.forEach((val, dc) => {
          const c = anchorC + dc;
          while (next[r].length <= c) next[r].push('');
          next[r][c] = val;
        });
      });
      return next;
    });
  }, [rows, cols, ensureTableSize]);

  const focusCell = useCallback((r: number, c: number) => {
    const el = gridContainerRef.current?.querySelector(`input[data-cell="${r},${c}"]`) as HTMLInputElement | null;
    el?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, r: number, c: number) => {
    if (readOnly) return;
    let nextR = r;
    let nextC = c;
    let handled = false;
    let extendedSelection = false;
    if (e.key === 'Enter') {
      e.preventDefault();
      nextR = e.shiftKey ? r - 1 : r + 1;
      if (e.shiftKey) {
        const anchor = selectionRange ? selectionRange.start : { r, c };
        setSelectionRange({ start: anchor, end: { r: nextR, c: nextC } });
        extendedSelection = true;
      } else setSelectionRange(null);
      handled = true;
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) nextC = c - 1;
      else nextC = c + 1;
      setSelectionRange(null);
      handled = true;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextR = r - 1;
      if (e.shiftKey) {
        const anchor = selectionRange ? selectionRange.start : { r, c };
        setSelectionRange({ start: anchor, end: { r: nextR, c: nextC } });
        extendedSelection = true;
      } else setSelectionRange(null);
      handled = true;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextR = r + 1;
      if (e.shiftKey) {
        const anchor = selectionRange ? selectionRange.start : { r, c };
        setSelectionRange({ start: anchor, end: { r: nextR, c: nextC } });
        extendedSelection = true;
      } else setSelectionRange(null);
      handled = true;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextC = c - 1;
      if (e.shiftKey) {
        const anchor = selectionRange ? selectionRange.start : { r, c };
        setSelectionRange({ start: anchor, end: { r: nextR, c: nextC } });
        extendedSelection = true;
      } else setSelectionRange(null);
      handled = true;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextC = c + 1;
      if (e.shiftKey) {
        const anchor = selectionRange ? selectionRange.start : { r, c };
        setSelectionRange({ start: anchor, end: { r: nextR, c: nextC } });
        extendedSelection = true;
      } else setSelectionRange(null);
      handled = true;
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) redoSheet?.();
      else undoSheet?.();
      handled = true;
    } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      redoSheet?.();
      handled = true;
    } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (selectionRange) {
        const minR = Math.min(selectionRange.start.r, selectionRange.end.r);
        const maxR = Math.max(selectionRange.start.r, selectionRange.end.r);
        const minC = Math.min(selectionRange.start.c, selectionRange.end.c);
        const maxC = Math.max(selectionRange.start.c, selectionRange.end.c);
        const lines: string[] = [];
        for (let rr = minR; rr <= maxR; rr++) {
          const row = tableDraft[rr] ?? [];
          lines.push(Array.from({ length: maxC - minC + 1 }, (_, cc) => row[minC + cc] ?? '').join('\t'));
        }
        navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
      } else if (focusedCell != null) {
        const val = tableDraft[focusedCell.r]?.[focusedCell.c] ?? '';
        navigator.clipboard.writeText(val).catch(() => {});
      }
      handled = true;
    }
    if (handled && nextR >= 0 && nextC >= 0) {
      ensureTableSize(Math.max(rows, nextR + 1), Math.max(cols, nextC + 1));
      setFocusedCell({ r: nextR, c: nextC });
      if (!extendedSelection) setSelectionRange(null);
      requestAnimationFrame(() => focusCell(nextR, nextC));
    }
  }, [readOnly, rows, cols, tableDraft, selectionRange, focusedCell, ensureTableSize, focusCell, undoSheet, redoSheet]);

  const handleCellMouseDown = useCallback((r: number, c: number) => {
    if (readOnly) return;
    isDraggingRef.current = true;
    setFocusedCell({ r, c });
    setSelectionRange({ start: { r, c }, end: { r, c } });
  }, [readOnly]);

  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (!readOnly && isDraggingRef.current) {
      setSelectionRange(prev => prev ? { ...prev, end: { r, c } } : null);
    }
  }, [readOnly]);

  useEffect(() => {
    const onMouseUp = () => { isDraggingRef.current = false; };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    if (!colorMenuOpen && !fontMenuOpen && !fontSizeMenuOpen && !fontColorMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (colorMenuRef.current?.contains(t) || fontMenuRef.current?.contains(t) || fontSizeMenuRef.current?.contains(t) || fontColorMenuRef.current?.contains(t)) return;
      setColorMenuOpen(false);
      setFontMenuOpen(false);
      setFontSizeMenuOpen(false);
      setFontColorMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [colorMenuOpen, fontMenuOpen, fontSizeMenuOpen, fontColorMenuOpen]);

  const handleImportExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const anchorR = focusedCell?.r ?? 0;
    const anchorC = focusedCell?.c ?? 0;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const ab = ev.target?.result;
        if (!ab || typeof ab === 'string') return;
        const wb = XLSX.read(ab, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) return;
        const ws = wb.Sheets[firstSheetName];
        const data: string[][] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
        const arr = Array.isArray(data) ? data : [];
        if (arr.length === 0) return;
        const maxCols = Math.max(...arr.map((r: string[]) => r.length));
        const newRows = anchorR + arr.length;
        const newCols = anchorC + maxCols;
        ensureTableSize(Math.max(rows, newRows), Math.max(cols, newCols));
        setTableDraft(prev => {
          const next = prev.map(r => [...r]);
          arr.forEach((line: string[], dr: number) => {
            const r = anchorR + dr;
            if (!next[r]) next[r] = [];
            (line as string[]).forEach((val: string, dc: number) => {
              const c = anchorC + dc;
              while (next[r].length <= c) next[r].push('');
              next[r][c] = String(val ?? '');
            });
          });
          return next;
        });
      } catch (err) {
        console.error('Error importing Excel', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [focusedCell, rows, cols, ensureTableSize]);

  const sheetBtn = 'px-2.5 py-1.5 rounded-monday border border-monday-border bg-white text-[12px] text-monday-text hover:bg-monday-hover transition-colors';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-monday-bg/50">
      {!readOnly && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-b border-monday-border shadow-sm flex-wrap">
          <span className="text-[11px] text-monday-subtext font-mono w-8">fx</span>
          <input
            type="text"
            value={formulaBarValue}
            onChange={e => setFocusedCellValue(e.target.value)}
            readOnly={focusedCell == null}
            className="flex-1 max-w-md px-2.5 py-1.5 text-[12px] font-averta bg-monday-hover/50 border border-monday-border rounded-monday text-monday-text placeholder:text-monday-subtext"
            placeholder={focusedCell ? "Fórmula o valor (ej: =A1+B1, =SUM(A1:A5))" : "Selecciona una celda"}
          />
          {focusedCell != null && (
            <span className="text-[11px] text-monday-subtext font-mono shrink-0">
              {colLetters(focusedCell.c)}{focusedCell.r + 1}
            </span>
          )}
          <div className="w-px h-5 bg-monday-border" />
          <button type="button" onClick={() => ensureTableSize(tableDraft.length + 1, tableDraft[0]?.length || 1)} className={sheetBtn}>
            + Fila
          </button>
          <button type="button" onClick={() => ensureTableSize(tableDraft.length, (tableDraft[0]?.length || 0) + 1)} className={sheetBtn}>
            + Columna
          </button>
          {focusedCell != null && (
            <>
              <button type="button" onClick={insertRowAbove} className={sheetBtn} title="Insertar fila arriba">
                Fila ↑
              </button>
              <button type="button" onClick={insertColLeft} className={sheetBtn} title="Insertar columna a la izquierda">
                Col ←
              </button>
            </>
          )}
          {setCellStyles && (
            <>
              <div className="relative inline-block" ref={colorMenuRef}>
                <button
                  type="button"
                  className={`${sheetBtn} flex items-center gap-1.5 ${colorMenuOpen ? 'ring-1 ring-monday-blue bg-monday-hover/50' : ''}`}
                  title="Color de fondo de celda"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    formatTargetRef.current = { cell: focusedCell, range: selectionRange };
                    setColorMenuOpen(v => !v);
                  }}
                >
                  <Palette size={14} />
                  Color
                </button>
                {colorMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-[200] min-w-[140px] rounded-monday border border-monday-border bg-white shadow-monday-lg overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-monday-border bg-monday-hover/30">
                      <span className="text-[11px] font-medium text-monday-subtext">Color de fondo</span>
                    </div>
                    <div className="p-2">
                      <div className="grid grid-cols-6 gap-1">
                        {SHEET_COLOR_PALETTE.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            className="w-6 h-6 rounded border border-monday-border hover:ring-2 hover:ring-monday-blue transition-shadow"
                            style={{ backgroundColor: hex }}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => { applyColorToTarget(hex); setColorMenuOpen(false); }}
                            title={hex}
                          />
                        ))}
                      </div>
                      <button type="button" className="mt-2 w-full py-1.5 text-[11px] text-monday-subtext hover:bg-monday-hover rounded-monday transition-colors" onMouseDown={(e) => e.preventDefault()} onClick={() => { applyColorToTarget(''); setColorMenuOpen(false); }}>
                        Quitar color
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative inline-block" ref={fontMenuRef}>
                <button
                  type="button"
                  className={`${sheetBtn} flex items-center gap-1.5 ${fontMenuOpen ? 'ring-1 ring-monday-blue bg-monday-hover/50' : ''}`}
                  title="Fuente"
                  onMouseDown={(e) => { e.preventDefault(); formatTargetRef.current = { cell: focusedCell, range: selectionRange }; setFontMenuOpen(v => !v); }}
                >
                  Fuente
                </button>
                {fontMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-[200] min-w-[140px] rounded-monday border border-monday-border bg-white shadow-monday-lg overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-monday-border bg-monday-hover/30">
                      <span className="text-[11px] font-medium text-monday-subtext">Fuente</span>
                    </div>
                    <div className="p-1 max-h-[200px] overflow-auto">
                      {FONT_OPTIONS.map(({ label, value }) => (
                        <button key={value} type="button" className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded-monday" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { applyFontToTarget(value); setFontMenuOpen(false); }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative inline-block" ref={fontSizeMenuRef}>
                <button
                  type="button"
                  className={`${sheetBtn} flex items-center gap-1.5 ${fontSizeMenuOpen ? 'ring-1 ring-monday-blue bg-monday-hover/50' : ''}`}
                  title="Tamaño de fuente"
                  onMouseDown={(e) => { e.preventDefault(); formatTargetRef.current = { cell: focusedCell, range: selectionRange }; setFontSizeMenuOpen(v => !v); }}
                >
                  Tamaño
                </button>
                {fontSizeMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-[200] min-w-[100px] rounded-monday border border-monday-border bg-white shadow-monday-lg overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-monday-border bg-monday-hover/30">
                      <span className="text-[11px] font-medium text-monday-subtext">Tamaño</span>
                    </div>
                    <div className="p-1">
                      {FONT_SIZES.map(({ label, value }) => (
                        <button key={value} type="button" className="block w-full px-3 py-1.5 text-left text-[12px] text-monday-text hover:bg-monday-hover rounded-monday" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { applyFontSizeToTarget(value); setFontSizeMenuOpen(false); }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative inline-block" ref={fontColorMenuRef}>
                <button
                  type="button"
                  className={`${sheetBtn} flex items-center gap-1.5 ${fontColorMenuOpen ? 'ring-1 ring-monday-blue bg-monday-hover/50' : ''}`}
                  title="Color de texto"
                  onMouseDown={(e) => { e.preventDefault(); formatTargetRef.current = { cell: focusedCell, range: selectionRange }; setFontColorMenuOpen(v => !v); }}
                >
                  <span className="w-3 h-3 rounded border border-monday-border bg-monday-text" />
                  Color texto
                </button>
                {fontColorMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-[200] min-w-[140px] rounded-monday border border-monday-border bg-white shadow-monday-lg overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-monday-border bg-monday-hover/30">
                      <span className="text-[11px] font-medium text-monday-subtext">Color de texto</span>
                    </div>
                    <div className="p-2">
                      <div className="grid grid-cols-6 gap-1">
                        {SHEET_TEXT_COLOR_PALETTE.map((hex) => (
                          <button key={hex} type="button" className="w-6 h-6 rounded border border-monday-border hover:ring-2 hover:ring-monday-blue transition-shadow" style={{ backgroundColor: hex }} onMouseDown={(ev) => ev.preventDefault()} onClick={() => { applyTextColorToTarget(hex); setFontColorMenuOpen(false); }} title={hex} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={handleImportExcel}
          />
          <button type="button" className={`${sheetBtn} flex items-center gap-1.5`} title="Importar desde Excel" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            Importar Excel
          </button>
          <button
            type="button"
            className={`${sheetBtn} flex items-center gap-1.5`}
            title="Descargar como Excel"
            onClick={() => {
              const ws = XLSX.utils.aoa_to_sheet(tableDraft);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
              const name = (documentTitle || 'Hoja').replace(/[^\w\s-]/g, '').trim() || 'Hoja';
              XLSX.writeFile(wb, `${name}.xlsx`);
            }}
          >
            <Download size={14} />
            Descargar Excel
          </button>
          <span className="text-[11px] text-monday-subtext px-2">Hoja</span>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto scroll-touch custom-scrollbar p-4" ref={gridContainerRef} onPaste={e => { if (!readOnly && focusedCell != null) { e.preventDefault(); handlePaste(e, focusedCell.r, focusedCell.c); } }}>
        <div className="mx-auto w-[816px] max-w-full min-h-[1056px] bg-white rounded-lg border border-monday-border shadow-monday-lg p-6">
          <div className="w-full h-full overflow-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-10 h-8 bg-monday-hover/60 border border-monday-border text-[11px] text-monday-subtext font-medium" />
                {Array.from({ length: cols }, (_, i) => (
                  <th key={i} className="min-w-[110px] h-8 px-1 bg-monday-hover/60 border border-monday-border text-[11px] text-monday-subtext font-medium">
                    {colLetters(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableDraft.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td className="w-10 h-8 px-0 bg-monday-hover/40 border border-monday-border text-[11px] text-monday-subtext text-center font-medium">
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => {
                    const isFocused = !readOnly && focusedCell?.r === rIdx && focusedCell?.c === cIdx;
                    const inSelection = selectionRange && (() => {
                      const minR = Math.min(selectionRange.start.r, selectionRange.end.r);
                      const maxR = Math.max(selectionRange.start.r, selectionRange.end.r);
                      const minC = Math.min(selectionRange.start.c, selectionRange.end.c);
                      const maxC = Math.max(selectionRange.start.c, selectionRange.end.c);
                      return rIdx >= minR && rIdx <= maxR && cIdx >= minC && cIdx <= maxC;
                    })();
                    const displayVal = getCellDisplayValue(tableDraft, rIdx, cIdx, isFocused, focusedCell);
                    const cellStyle = cellStyles[`${rIdx},${cIdx}`] ?? {};
                    const bgStyle = cellStyle.bg;
                    const cellBg = bgStyle ?? 'transparent';
                    return (
                      <td
                        key={cIdx}
                        className="border border-monday-border p-0"
                        style={cellBg !== 'transparent' ? { backgroundColor: cellBg } : undefined}
                        onMouseDown={() => handleCellMouseDown(rIdx, cIdx)}
                        onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                      >
                        {readOnly ? (
                          <div className="w-full min-w-[110px] min-h-8 h-8 px-2 py-1 text-monday-text flex items-center" style={{ ...(cellBg !== 'transparent' ? { backgroundColor: cellBg } : { backgroundColor: '#fff' }), fontFamily: cellStyle.fontFamily ?? undefined, fontSize: cellStyle.fontSize ?? '12px', color: cellStyle.color ?? undefined }}>
                            {displayVal}
                          </div>
                        ) : (
                          <input
                            data-cell={`${rIdx},${cIdx}`}
                            value={displayVal}
                            onChange={e => {
                              const v = e.target.value;
                              setTableDraft(prev => {
                                const next = prev.map(r => [...r]);
                                next[rIdx][cIdx] = v;
                                return next;
                              });
                            }}
                            onFocus={() => { setFocusedCell({ r: rIdx, c: cIdx }); }}
                            onBlur={() => { setFocusedCell(null); }}
                            onPaste={e => handlePaste(e, rIdx, cIdx)}
                            onKeyDown={e => handleKeyDown(e, rIdx, cIdx)}
                            readOnly={!isFocused}
                            className={`w-full min-w-[110px] h-8 px-2 text-monday-text outline-none focus:ring-1 focus:ring-inset focus:ring-monday-blue focus:border-monday-blue ${!isFocused ? 'cursor-cell' : ''}`}
                            style={{
                              ...(cellBg !== 'transparent' ? { backgroundColor: cellBg } : inSelection ? { backgroundColor: 'rgba(25, 118, 210, 0.12)' } : { backgroundColor: '#fff' }),
                              fontFamily: cellStyle.fontFamily ?? undefined,
                              fontSize: cellStyle.fontSize ?? '12px',
                              color: cellStyle.color ?? undefined,
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-monday-subtext">Haz clic en una celda para editar. Fórmulas: =A1+B1, =A1*B2, =SUM(A1:A5). Usa + Fila / + Columna para ampliar.</p>
      </div>
    </div>
  );
}
