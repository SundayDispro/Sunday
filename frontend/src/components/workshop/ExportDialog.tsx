// ============================================================================
// Sunday 3D Workshop — Export Modal Dialog
// Exports STL (3D Printing), OBJ, and Native Sunday 3D Project formats
// ============================================================================

import React, { useState } from 'react';
import { Download, FileBox, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { exportToBinarySTL, exportToOBJ, validateGeometry } from '../../workshop/engine/ExportSTL';
import { serializeProject } from '../../workshop/engine/Serialization';

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { scene, selectedIds, projectName } = useWorkshop();

  const [exportFormat, setExportFormat] = useState<'stl' | 'obj' | 'project'>('stl');
  const [scope, setScope] = useState<'all' | 'selected'>('all');

  if (!isOpen) return null;

  const targetObjects =
    scope === 'selected' && selectedIds.length > 0
      ? scene.getSelectedObjects()
      : scene.getAllObjects();

  // Validate objects
  let totalTriangles = 0;
  const warnings: string[] = [];

  targetObjects.forEach((obj) => {
    const report = validateGeometry(obj.mesh.geometry);
    totalTriangles += report.triangleCount;
    warnings.push(...report.warnings);
  });

  const handleDownload = () => {
    if (targetObjects.length === 0) {
      alert('No hay objetos seleccionados o visibles para exportar.');
      return;
    }

    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Sunday3D_Export';

    if (exportFormat === 'stl') {
      const buffer = exportToBinarySTL(targetObjects);
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.stl`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === 'obj') {
      const objText = exportToOBJ(targetObjects);
      const blob = new Blob([objText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.obj`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === 'project') {
      const { json } = serializeProject(scene, projectName);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.sunday3d`;
      a.click();
      URL.revokeObjectURL(url);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-monday-surface border border-monday-border rounded-xl shadow-monday-lg w-full max-w-md overflow-hidden flex flex-col text-[13px] text-monday-text">
        {/* Header */}
        <div className="p-3.5 border-b border-monday-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download size={18} className="text-monday-blue" />
            <span className="font-semibold text-[14px]">Exportar Pieza / Proyecto</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-monday-hover text-monday-subtext hover:text-monday-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Format selector */}
          <div>
            <label className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider block mb-1.5">
              Formato de Salida
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setExportFormat('stl')}
                className={`p-2.5 rounded-monday border text-center transition-colors ${
                  exportFormat === 'stl'
                    ? 'border-monday-blue bg-blue-50/50 text-monday-blue font-semibold'
                    : 'border-monday-border bg-monday-bg hover:bg-monday-hover'
                }`}
              >
                <div className="font-bold text-[13px]">STL (.stl)</div>
                <div className="text-[10px] text-monday-subtext">Impresión 3D</div>
              </button>

              <button
                onClick={() => setExportFormat('obj')}
                className={`p-2.5 rounded-monday border text-center transition-colors ${
                  exportFormat === 'obj'
                    ? 'border-monday-blue bg-blue-50/50 text-monday-blue font-semibold'
                    : 'border-monday-border bg-monday-bg hover:bg-monday-hover'
                }`}
              >
                <div className="font-bold text-[13px]">OBJ (.obj)</div>
                <div className="text-[10px] text-monday-subtext">Malla 3D</div>
              </button>

              <button
                onClick={() => setExportFormat('project')}
                className={`p-2.5 rounded-monday border text-center transition-colors ${
                  exportFormat === 'project'
                    ? 'border-monday-blue bg-blue-50/50 text-monday-blue font-semibold'
                    : 'border-monday-border bg-monday-bg hover:bg-monday-hover'
                }`}
              >
                <div className="font-bold text-[13px]">Proyecto</div>
                <div className="text-[10px] text-monday-subtext">.sunday3d</div>
              </button>
            </div>
          </div>

          {/* Scope Selector */}
          <div>
            <label className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider block mb-1.5">
              Alcance de la Exportación
            </label>
            <div className="flex gap-4 text-[12px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                  className="text-monday-blue"
                />
                <span>Todos los objetos ({scene.getAllObjects().length})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'selected'}
                  onChange={() => setScope('selected')}
                  disabled={selectedIds.length === 0}
                  className="text-monday-blue"
                />
                <span className={selectedIds.length === 0 ? 'text-monday-subtext' : ''}>
                  Solo seleccionados ({selectedIds.length})
                </span>
              </label>
            </div>
          </div>

          {/* Validation info */}
          <div className="bg-monday-bg p-3 rounded-monday border border-monday-border space-y-1 text-[12px]">
            <div className="flex justify-between">
              <span className="text-monday-subtext">Objetos incluidos:</span>
              <strong>{targetObjects.length}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-monday-subtext">Total de triángulos:</span>
              <strong>{totalTriangles.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-monday-subtext">Unidades de exportación:</span>
              <strong>Milímetros (mm)</strong>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-monday-border bg-monday-bg/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-monday border border-monday-border hover:bg-monday-hover text-monday-text transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 rounded-monday bg-monday-blue text-white font-medium hover:bg-blue-600 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Download size={14} />
            <span>Descargar Archivo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
