/**
 * Ventana de vista previa para generar PDF 1:1.
 * Se abre desde Docs con "Generar PDF"; muestra el mismo contenido que el preview
 * y permite "Guardar como PDF" capturando la vista como imagen e incrustándola en un PDF.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PdfTemplateEditor, PAGE_WIDTH_PX_96DPI, PAGE_HEIGHT_PX_96DPI } from './PdfTemplateEditor';
import type { TemplateConfigState } from './pdfTemplateConfig';
import type { PdfDocType } from './pdfTemplateConfig';
import { Download, X, MessageCircle, Mail } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { apiFetch } from '../../../api';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');
const STORAGE_KEY = 'sunday_pdf_preview';

/** Escala para captura a ~300 dpi (300/96). */
const CAPTURE_SCALE = 300 / 96;

type StoredPayload = {
  docType: PdfDocType;
  content: Record<string, unknown>;
  templateConfig?: TemplateConfigState | null;
  documentTitle?: string;
};

export default function DocsPdfPreviewPage() {
  const [payload, setPayload] = useState<StoredPayload | null>(null);
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const onExportReady = useCallback(() => setExportReady(true), []);

  // Leer datos que la ventana padre guardó en localStorage
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) {
        // En desarrollo con React StrictMode este efecto puede ejecutarse dos veces;
        // si no hay datos simplemente mostramos estado de carga y dejamos que el
        // usuario vuelva a abrir la ventana desde "Generar PDF".
        setError(null);
        return;
      }
      const data = JSON.parse(raw) as StoredPayload;
      if (!data.docType || !data.content || typeof data.content !== 'object') {
        setError('Datos de vista previa inválidos.');
        return;
      }
      setPayload(data);
    } catch {
      setError('Error al leer los datos de vista previa.');
    }
  }, []);

  // Cargar plantilla PDF (fondo)
  useEffect(() => {
    if (!payload?.docType) return;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/templates/${payload.docType}`);
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setTemplatePdfUrl(objectUrl);
      } catch {
        // Sin plantilla: fondo blanco
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [payload?.docType]);

  // Fallback: si no hay onExportReady (ej. sin plantilla), habilitar guardar tras un breve retraso
  useEffect(() => {
    if (!payload) return;
    const t = setTimeout(() => setExportReady(true), 2000);
    return () => clearTimeout(t);
  }, [payload]);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  const handleSavePdf = useCallback(async () => {
    const el = captureRef.current;
    if (!el || !payload) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = await html2canvas(el, {
        scale: CAPTURE_SCALE,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
      });
      pdf.addImage(imgData, 'PNG', 0, 0, 612, 792);
      pdf.save(`${payload.docType}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el PDF.');
    } finally {
      setSaving(false);
    }
  }, [payload]);

  const docTitle = (payload?.documentTitle ?? payload?.docType ?? 'Documento').trim() || 'Documento';
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(docTitle + ' ' + shareUrl)}`;
  const mailtoHref = `mailto:?subject=${encodeURIComponent(docTitle)}&body=${encodeURIComponent('Revisa este documento: ' + shareUrl)}`;

  if (error && !payload) {
    return (
      <div className="min-h-screen bg-monday-bg flex flex-col items-center justify-center p-6">
        <p className="text-white/90 text-center mb-4">{error}</p>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-monday border border-monday-border text-monday-text hover:bg-monday-hover"
        >
          <X size={18} />
          Cerrar
        </button>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-monday-bg flex items-center justify-center">
        <p className="text-white/70">Cargando vista previa…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-monday-bg flex flex-col">
      <header className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-monday-bg/95">
        <h1 className="text-sm font-medium text-white/90 truncate">
          Vista para PDF — {payload.docType}
        </h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {error && (
            <span className="text-red-400 text-sm mr-1">{error}</span>
          )}
          <button
            type="button"
            onClick={handleSavePdf}
            disabled={saving || !exportReady}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90 disabled:opacity-60"
          >
            <Download size={16} />
            {saving ? 'Guardando…' : exportReady ? 'Guardar como PDF' : 'Preparando…'}
          </button>
          <a
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-white/90 hover:bg-white/10"
          >
            <MessageCircle size={16} />
            <span className="hidden sm:inline">Enviar por WhatsApp</span>
          </a>
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-white/90 hover:bg-white/10"
          >
            <Mail size={16} />
            <span className="hidden sm:inline">Enviar por correo</span>
          </a>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] font-medium text-white/90 hover:bg-white/10"
          >
            <X size={16} />
            Cerrar
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 flex justify-center items-start min-h-0">
        <div
          ref={captureRef}
          className="bg-white flex flex-col shrink-0 shadow-xl rounded-monday overflow-hidden"
          style={{
            width: PAGE_WIDTH_PX_96DPI,
            height: PAGE_HEIGHT_PX_96DPI,
            minWidth: PAGE_WIDTH_PX_96DPI,
            minHeight: PAGE_HEIGHT_PX_96DPI,
          }}
        >
          <PdfTemplateEditor
            docType={payload.docType}
            value={payload.content}
            onChange={() => {}}
            docId=""
            templateConfig={payload.templateConfig ?? null}
            viewerOnly
            templatePdfUrlProp={templatePdfUrl}
            onExportReady={onExportReady}
          />
        </div>
      </main>
    </div>
  );
}
