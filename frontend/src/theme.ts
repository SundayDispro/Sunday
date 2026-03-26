/**
 * Temas de la app: IDs estables para data-theme y localStorage.
 * Selector lateral (rápido): claro, oscuro, noche, plum.
 * Lista completa: paleta Ctrl/Cmd+K → /temas
 */

export const SIDEBAR_THEME_IDS = ['light', 'dark', 'night', 'plum'] as const;
export type SidebarQuickTheme = (typeof SIDEBAR_THEME_IDS)[number];

export const ALL_THEME_IDS = [
  'light',
  'dark',
  'night',
  'dawn',
  'fog',
  'plum',
  'cacao',
  'aurora',
  'forest',
  'rose',
  'slate',
  'ember',
  'cobalt',
  'sand',
  'ink',
  'mint',
  'sunset',
  'graphite',
] as const;

export type AppTheme = (typeof ALL_THEME_IDS)[number];

const LEGACY_IDS = new Set(['zen', 'zenPlus', 'ember']);

export function normalizeStoredTheme(raw: string | null): AppTheme | null {
  if (!raw) return null;
  if (raw === 'zen') return 'dawn';
  if (raw === 'zenPlus') return 'fog';
  if (raw === 'ember') return 'cacao';
  if (LEGACY_IDS.has(raw)) return null;
  return (ALL_THEME_IDS as readonly string[]).includes(raw) ? (raw as AppTheme) : null;
}

export const THEME_LABELS: Record<AppTheme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  night: 'Noche',
  dawn: 'Dawn',
  fog: 'Fog',
  plum: 'Plum',
  cacao: 'Cacao',
  aurora: 'Aurora',
  forest: 'Bosque',
  rose: 'Rosa',
  slate: 'Pizarra',
  ember: 'Brasas',
  cobalt: 'Cobalto',
  sand: 'Arena',
  ink: 'Tinta',
  mint: 'Menta',
  sunset: 'Atardecer',
  graphite: 'Grafito',
};

/** Color para meta theme-color (PWA / barra del sistema). */
export const THEME_COLORS: Record<AppTheme, string> = {
  light: '#f6f7fb',
  dark: '#111827',
  night: '#0a0a0a',
  dawn: '#e1d4c0',
  fog: '#b8b8b8',
  plum: '#1b1026',
  cacao: '#1a1410',
  aurora: '#091821',
  forest: '#0c1812',
  rose: '#1a0f14',
  slate: '#1e293b',
  ember: '#1c0f0a',
  cobalt: '#0c1e3d',
  sand: '#ebe4d8',
  ink: '#070b12',
  mint: '#e8f5f0',
  sunset: '#2a1810',
  graphite: '#2d2d32',
};

export const THEME_SWATCHES: Record<AppTheme, [string, string]> = {
  light: ['#f6f7fb', '#d0d4e4'],
  dark: ['#111827', '#374151'],
  night: ['#0a0a0a', '#262626'],
  dawn: ['#e1d4c0', '#bda78a'],
  fog: ['#b8b8b8', '#8f8f8f'],
  plum: ['#12091a', '#3a244f'],
  cacao: ['#1a1410', '#4a3526'],
  aurora: ['#091821', '#234252'],
  forest: ['#0c1812', '#1e4a38'],
  rose: ['#1a0f14', '#8b3a5c'],
  slate: ['#1e293b', '#64748b'],
  ember: ['#1c0f0a', '#b4532a'],
  cobalt: ['#0c1e3d', '#2563eb'],
  sand: ['#ebe4d8', '#c4b8a5'],
  ink: ['#070b12', '#1e3a5f'],
  mint: ['#e8f5f0', '#5eead4'],
  sunset: ['#2a1810', '#ea580c'],
  graphite: ['#2d2d32', '#71717a'],
};
