import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PdfTemplateEditor, PAGE_WIDTH_PX_96DPI, PAGE_HEIGHT_PX_96DPI } from './PdfTemplateEditor';
import type { TemplateConfigState } from './pdfTemplateConfig';
import type { PdfDocType } from './pdfTemplateConfig';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

const PDF_DOC_TYPES: PdfDocType[] = ['cotizacion', 'levantamiento', 'hoja_trabajo'];

function parseContent(content: string | null): Record<string, unknown> {
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export default function DocsExportPreviewPage({
  docId,
  token,
  contentKey,
  exportScale,
}: {
  docId: string;
  token: string;
  contentKey: string | null;
  /** Escala de píxeles (ej. 3.125 para 300 DPI). Si no se pasa, se usa 1. */
  exportScale?: number | null;
}) {
  const pixelScale = exportScale != null && exportScale > 0 ? exportScale : 1;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [templateConfig, setTemplateConfig] = useState<TemplateConfigState | null>(null);
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null);
  const [docType, setDocType] = useState<PdfDocType>('cotizacion');
  const [exportReady, setExportReady] = useState(false);

  const authHeaders = useRef({ Authorization: `Bearer ${token}` });

  useEffect(() => {
    authHeaders.current = { Authorization: `Bearer ${token}` };
  }, [token]);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const verifyRes = await fetch(`${API_BASE}/api/docs/export-verify?token=${encodeURIComponent(token)}`);
        if (!verifyRes.ok) {
          const data = await verifyRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || 'Token inválido');
        }
        const { docId: verifiedDocId } = await verifyRes.json();
        if (verifiedDocId !== docId) throw new Error('Token no coincide con el documento');

        let type: string;
        let contentDraft: Record<string, unknown>;

        if (contentKey) {
          const contentRes = await fetch(
            `${API_BASE}/api/docs/export-content?contentKey=${encodeURIComponent(contentKey)}&token=${encodeURIComponent(token)}`
          );
          if (!contentRes.ok) {
            const data = await contentRes.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error || 'Contenido de exportación no disponible');
          }
          const { content, docType: dt } = await contentRes.json();
          type = (dt as string) || 'cotizacion';
          contentDraft = content && typeof content === 'object' ? content : {};
        } else {
          const docRes = await fetch(`${API_BASE}/api/docs/${docId}`, { headers: authHeaders.current });
          if (!docRes.ok) throw new Error('No se pudo cargar el documento');
          const doc = await docRes.json();
          type = (doc.type as string) || 'cotizacion';
          contentDraft = parseContent(doc.content);
        }

        if (!PDF_DOC_TYPES.includes(type as PdfDocType)) throw new Error('Tipo de documento no soportado para export');
        setDocType(type as PdfDocType);
        setDraft(contentDraft);

        const configRes = await fetch(`${API_BASE}/api/templates/${type}/config`, { headers: authHeaders.current });
        const config = configRes.ok
          ? ((await configRes.json()) as TemplateConfigState)
          : null;
        setTemplateConfig(config);

        const blobRes = await fetch(`${API_BASE}/api/templates/${type}`, { headers: authHeaders.current });
        if (blobRes.ok && blobRes.blob) {
          const blob = await blobRes.blob();
          if (!revoked) {
            objectUrl = URL.createObjectURL(blob);
            setTemplatePdfUrl(objectUrl);
          } else if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        }
        if (!revoked) setStatus('ready');
      } catch (e) {
        if (!revoked) {
          setErrorMessage(e instanceof Error ? e.message : 'Error al cargar');
          setStatus('error');
        }
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 500);
    };
  }, [docId, token, contentKey]);

  const onExportReady = useCallback(() => {
    setExportReady(true);
  }, []);

  useEffect(() => {
    const prevMargin = document.body.style.margin;
    const prevPadding = document.body.style.padding;
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    return () => {
      document.body.style.margin = prevMargin;
      document.body.style.padding = prevPadding;
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-red-600 p-4">
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-600">
        <p>Cargando vista de exportación…</p>
      </div>
    );
  }

  const widthPx = Math.round(PAGE_WIDTH_PX_96DPI * pixelScale);
  const heightPx = Math.round(PAGE_HEIGHT_PX_96DPI * pixelScale);

  return (
    <div
      className="bg-white"
      style={{
        width: widthPx,
        height: heightPx,
        minWidth: widthPx,
        minHeight: heightPx,
        position: 'relative',
        flexShrink: 0,
      }}
      data-export-ready={exportReady ? 'true' : undefined}
    >
      <PdfTemplateEditor
        docType={docType}
        docId={docId}
        value={draft}
        onChange={() => {}}
        templateConfig={templateConfig}
        viewerOnly
        templatePdfUrlProp={templatePdfUrl}
        onExportReady={onExportReady}
        exportPixelScale={pixelScale}
      />
    </div>
  );
}
