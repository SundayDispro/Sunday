import React from 'react';
import { Download, Eye } from 'lucide-react';
import { CotizacionForm } from './CotizacionForm';
import { LevantamientoForm } from './LevantamientoForm';
import { HojaTrabajoForm } from './HojaTrabajoForm';

const API_BASE = 'http://localhost:3001';

type PdfDocType = 'cotizacion' | 'levantamiento' | 'hoja_trabajo';

interface Props {
  docType: PdfDocType;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  docId: string;
}

export const PdfTemplateEditor: React.FC<Props> = ({ docType, value, onChange, docId }) => {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const handleGeneratePdf = async (action: 'preview' | 'download') => {
    try {
      const res = await fetch(`${API_BASE}/api/templates/${docType}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al generar PDF');
      }
      const blob = await res.blob();
      if (action === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${docType}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const prev = previewUrl;
        setPreviewUrl(URL.createObjectURL(blob));
        if (prev) URL.revokeObjectURL(prev);
      }
    } catch (e) {
      console.error('PDF generate error', e);
      alert(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    }
  };

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const form =
    docType === 'cotizacion' ? (
      <CotizacionForm value={value} onChange={onChange} />
    ) : docType === 'levantamiento' ? (
      <LevantamientoForm value={value} onChange={onChange} />
    ) : (
      <HojaTrabajoForm value={value} onChange={onChange} />
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => handleGeneratePdf('preview')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday border border-monday-border text-[13px] text-monday-text hover:bg-monday-hover"
        >
          <Eye size={14} />
          Vista previa PDF
        </button>
        <button
          type="button"
          onClick={() => handleGeneratePdf('download')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-monday bg-monday-blue text-white text-[13px] hover:bg-monday-blue/90"
        >
          <Download size={14} />
          Descargar PDF
        </button>
      </div>
      {previewUrl && (
        <div className="rounded-xl border border-monday-border overflow-hidden bg-white">
          <div className="flex items-center justify-between px-3 py-2 border-b border-monday-border bg-monday-hover/30">
            <span className="text-[13px] font-medium text-monday-text">Vista previa</span>
            <button
              type="button"
              onClick={() => { setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); }}
              className="text-[12px] text-monday-subtext hover:text-monday-text"
            >
              Cerrar
            </button>
          </div>
          <iframe src={previewUrl} title="Vista previa PDF" className="w-full h-[480px]" />
        </div>
      )}
      <div className="bg-white rounded-xl border border-monday-border p-4 shadow-monday-sm">
        {form}
      </div>
    </div>
  );
};
