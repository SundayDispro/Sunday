import React from 'react';
import type { TemplateConfigState, PdfDocType } from './pdfTemplateConfig';
import { DocumentPageForPdf } from './DocumentPageForPdf';
import { buildPdfContent } from './buildPdfContent';

interface Props {
  docType: PdfDocType;
  parsedContent: Record<string, unknown>;
  draft: Record<string, unknown>;
  templateConfig?: TemplateConfigState | null;
  selectedDocId?: string | null;
}

/**
 * Preview WYSIWYG de solo lectura para documentos PDF (cotización, levantamiento, hoja de trabajo).
 * Usa exactamente el mismo contenido que se envía al backend y el mismo layout que el worker de PDF.
 */
export const PdfDocumentPreview: React.FC<Props> = ({
  docType,
  parsedContent,
  draft,
  templateConfig,
  selectedDocId,
}) => {
  const { contentToSend } = buildPdfContent({
    docType,
    parsedContent,
    pdfFormDraft: draft,
    templateConfig,
    selectedDocId: selectedDocId ?? undefined,
  });

  return (
    <div className="flex items-center justify-center w-full h-full overflow-auto bg-monday-bg/40">
      <div
        className="bg-white shadow-monday border border-monday-border rounded-lg overflow-hidden"
        style={{
          width: '612pt',
          height: '792pt',
          transformOrigin: 'top left',
          transform: 'scale(0.9)',
        }}
      >
        <DocumentPageForPdf content={contentToSend} />
      </div>
    </div>
  );
};

export default PdfDocumentPreview;

