/**
 * Entrada para el bundle del servidor (Node).
 * Exporta renderDocumentHtml que renderiza DocumentPageForPdf a HTML estático.
 * Compilar con: esbuild frontend/src/renderDocumentToHtml.tsx --bundle --platform=node --outfile=backend/dist/documentViewBundle.cjs --external:react --external:react-dom --format=cjs
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentPageForPdf } from './components/pages/docs/DocumentPageForPdf';

export interface RenderDocumentHtmlProps {
  content: Record<string, unknown>;
  backgroundImageDataUrl?: string | null;
}

export function renderDocumentHtml(props: RenderDocumentHtmlProps): string {
  return renderToStaticMarkup(React.createElement(DocumentPageForPdf, props));
}
