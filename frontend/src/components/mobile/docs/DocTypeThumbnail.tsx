import React from 'react';
import type { DocType } from '../../../types';
import { isPdfDocType } from '../../pages/docs/docTypes';

/** Documento / plantilla: SVG con líneas de contenido (no solo rectángulo blanco). */
function DocumentPaperThumb({ variant }: { variant: 'text' | 'pdf' }) {
  const isPdf = variant === 'pdf';
  return (
    <div
      className="mx-auto w-[min(100%,148px)] shrink-0"
      style={{ aspectRatio: '612/792', minHeight: 108, maxHeight: 188 }}
    >
      <svg
        viewBox="0 0 612 792"
        width="100%"
        height="100%"
        className="block drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <rect x="3" y="3" width="606" height="786" rx="8" fill="#ffffff" stroke="#9ca3af" strokeWidth="5" />
        {isPdf && (
          <rect x="36" y="36" width="540" height="44" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="2" />
        )}
        {/* Línea de margen izquierdo (estilo cuaderno) */}
        <line x1="52" y1="40" x2="52" y2="756" stroke="#e5e7eb" strokeWidth="2" />
        {/* Líneas de texto */}
        {Array.from({ length: isPdf ? 9 : 11 }).map((_, i) => {
          const y = (isPdf ? 110 : 64) + i * 52;
          return (
            <line key={i} x1="64" y1={y} x2="576" y2={y} stroke="#e8e8ea" strokeWidth="2" />
          );
        })}
        {isPdf && (
          <>
            <rect x="64" y="118" width="220" height="28" rx="4" fill="#f3f4f6" />
            <rect x="64" y="170" width="480" height="22" rx="3" fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />
            <rect x="400" y="118" width="176" height="120" rx="4" fill="#fafafa" stroke="#e5e7eb" strokeWidth="1" />
          </>
        )}
      </svg>
    </div>
  );
}

/** Miniatura hoja de cálculo estilo Excel iOS: cabeceras A–F, filas 1–6, rejilla fina. */
function SheetExcelThumb() {
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rows = 6;
  return (
    <div
      className="mx-auto w-full max-w-[180px] rounded-md overflow-hidden border border-[#c5c9d1] shadow-sm bg-[#f6f7f9]"
      style={{ aspectRatio: '7/8', minHeight: 100, maxHeight: 200 }}
    >
      <svg viewBox="0 0 140 160" width="100%" height="100%" className="block bg-white" aria-hidden>
        {/* Esquina */}
        <rect x="0" y="0" width="20" height="18" fill="#e8eaef" stroke="#b8bec8" strokeWidth="0.5" />
        {/* Letras columna */}
        {colLetters.map((L, i) => (
          <g key={L}>
            <rect x={20 + i * 20} y="0" width="20" height="18" fill="#e8eaef" stroke="#b8bec8" strokeWidth="0.5" />
            <text x={20 + i * 20 + 10} y="12" textAnchor="middle" fontSize="9" fill="#6b7280" fontFamily="system-ui, sans-serif" fontWeight="600">
              {L}
            </text>
          </g>
        ))}
        {/* Filas con número + celdas */}
        {Array.from({ length: rows }).map((_, ri) => (
          <g key={ri}>
            <rect x="0" y={18 + ri * 22.8} width="20" height="22.8" fill="#e8eaef" stroke="#b8bec8" strokeWidth="0.5" />
            <text x="10" y={18 + ri * 22.8 + 14} textAnchor="middle" fontSize="8" fill="#6b7280" fontFamily="system-ui, sans-serif">
              {ri + 1}
            </text>
            <rect x="20" y={18 + ri * 22.8} width="120" height="22.8" fill="#ffffff" stroke="#d1d5db" strokeWidth="0.5" />
            {/* líneas verticales ligeras */}
            {[1, 2, 3, 4, 5].map((ci) => (
              <line
                key={ci}
                x1={20 + ci * 20}
                y1={18 + ri * 22.8}
                x2={20 + ci * 20}
                y2={18 + (ri + 1) * 22.8}
                stroke="#e5e7eb"
                strokeWidth="0.4"
              />
            ))}
          </g>
        ))}
        {/* Celda activa (como Excel iOS) */}
        <rect x="40" y="40.8" width="20" height="22.8" fill="none" stroke="#217346" strokeWidth="1.8" rx="1" />
      </svg>
    </div>
  );
}

/** Miniatura por tipo: texto/PDF con líneas; sheet estilo Excel iOS. */
export function DocTypeThumbnail({ type, className = '' }: { type: DocType; className?: string }) {
  if (type === 'text') {
    return (
      <div
        className={[
          'rounded-xl flex items-center justify-center py-2 px-1 w-full min-h-[112px] bg-monday-hover/20',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <DocumentPaperThumb variant="text" />
      </div>
    );
  }

  if (isPdfDocType(type)) {
    return (
      <div
        className={[
          'rounded-xl flex items-center justify-center py-2 px-1 w-full min-h-[112px] bg-monday-hover/20',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <DocumentPaperThumb variant="pdf" />
      </div>
    );
  }

  if (type === 'sheet') {
    return (
      <div
        className={[
          'rounded-xl flex items-center justify-center py-2 px-1 w-full min-h-[112px] bg-monday-hover/20',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <SheetExcelThumb />
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border border-monday-border bg-monday-hover/30 aspect-[4/5] min-h-[96px] ${className}`} />
  );
}
