/**
 * Borrador de emergencia para el editor móvil de plantillas PDF (localStorage).
 * Clave: `sunday_draft_${documentId}` — alineado con el plan mobile-micro-editor (m6).
 */

import type { TemplateConfigState } from '../components/pages/docs/pdfTemplateConfig';

export const EMERGENCY_PDF_DRAFT_KEY = (documentId: string) => `sunday_draft_${documentId}`;

/** TTL por defecto: 7 días (evita ofrecer datos absurdamente viejos). */
export const EMERGENCY_PDF_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type EmergencyPdfTemplateDraftV1 = {
  v: 1;
  documentId: string;
  userId: string | null;
  timestamp: number;
  /** Equivalente a `pdfFormDraft` en DocsPage. */
  content: Record<string, unknown>;
  pdfDocType: 'cotizacion' | 'levantamiento' | 'hoja_trabajo';
  /** Solo ADMIN: snapshot de `templateConfigByType[kind]` para estilos de cajas en panel externo. */
  templateConfigSnapshot?: TemplateConfigState | null;
};

function isPdfDocType(
  t: unknown
): t is EmergencyPdfTemplateDraftV1['pdfDocType'] {
  return t === 'cotizacion' || t === 'levantamiento' || t === 'hoja_trabajo';
}

export function readEmergencyDraftFromStorage(documentId: string): EmergencyPdfTemplateDraftV1 | null {
  if (typeof window === 'undefined' || !documentId) return null;
  try {
    const raw = window.localStorage.getItem(EMERGENCY_PDF_DRAFT_KEY(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EmergencyPdfTemplateDraftV1>;
    if (parsed.v !== 1 || typeof parsed.documentId !== 'string' || parsed.documentId !== documentId) return null;
    if (typeof parsed.timestamp !== 'number' || !Number.isFinite(parsed.timestamp)) return null;
    if (!parsed.content || typeof parsed.content !== 'object' || Array.isArray(parsed.content)) return null;
    if (!isPdfDocType(parsed.pdfDocType)) return null;
    return {
      v: 1,
      documentId: parsed.documentId,
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      timestamp: parsed.timestamp,
      content: parsed.content as Record<string, unknown>,
      pdfDocType: parsed.pdfDocType,
      templateConfigSnapshot:
        parsed.templateConfigSnapshot != null && typeof parsed.templateConfigSnapshot === 'object'
          ? (parsed.templateConfigSnapshot as TemplateConfigState)
          : undefined,
    };
  } catch {
    return null;
  }
}

export function writeEmergencyDraftToStorage(payload: {
  documentId: string;
  userId: string | null;
  timestamp: number;
  content: Record<string, unknown>;
  pdfDocType: EmergencyPdfTemplateDraftV1['pdfDocType'];
  templateConfigSnapshot?: TemplateConfigState | null;
}): void {
  if (typeof window === 'undefined' || !payload.documentId) return;
  const body: EmergencyPdfTemplateDraftV1 = {
    v: 1,
    documentId: payload.documentId,
    userId: payload.userId,
    timestamp: payload.timestamp,
    content: payload.content,
    pdfDocType: payload.pdfDocType,
  };
  if (payload.templateConfigSnapshot != null) {
    body.templateConfigSnapshot = payload.templateConfigSnapshot;
  }
  try {
    window.localStorage.setItem(EMERGENCY_PDF_DRAFT_KEY(payload.documentId), JSON.stringify(body));
  } catch (e) {
    console.warn('[emergencyPdfTemplateDraft] No se pudo escribir localStorage', e);
  }
}

export function clearEmergencyDraftFromStorage(documentId: string): void {
  if (typeof window === 'undefined' || !documentId) return;
  try {
    window.localStorage.removeItem(EMERGENCY_PDF_DRAFT_KEY(documentId));
  } catch {
    /* ignore */
  }
}

/** Clon defensivo para snapshots / restauración (contenido JSON-serializable). */
export function deepCloneJson<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}
