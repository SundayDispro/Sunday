// ============================================================================
// Sunday 3D Workshop — Main Workshop Page Component
// Professional 3D Design, Sign-making, Enclosures & Manufacturing Module
// ============================================================================

import React, { useState } from 'react';
import {
  Box,
  Layers,
  Type,
  Zap,
  Package,
  DollarSign,
  Download,
  Folder,
  Sliders,
  HelpCircle,
  Save,
} from 'lucide-react';
import { WorkshopProvider, useWorkshop } from './WorkshopContext';
import { Viewport3D } from './Viewport3D';
import { Toolbar } from './Toolbar';
import { SceneHierarchy } from './SceneHierarchy';
import { PropertiesPanel } from './PropertiesPanel';
import { SignDesigner } from './SignDesigner';
import { EnclosureDesigner } from './EnclosureDesigner';
import { LEDLayoutPanel } from './LEDLayoutPanel';
import { MaterialsPanel } from './MaterialsPanel';
import { CostingPanel } from './CostingPanel';
import { ExportDialog } from './ExportDialog';
import { ProjectManager } from './ProjectManager';
import { KeyboardShortcuts } from './KeyboardShortcuts';

function WorkshopInner({ workspaceId }: { workspaceId: string | null }) {
  const { activePanel, dispatch, projectName, isDirty } = useWorkshop();

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);

  const tabs = [
    { id: 'properties', label: 'Propiedades', icon: <Sliders size={14} /> },
    { id: 'sign', label: 'Letreros 3D', icon: <Type size={14} /> },
    { id: 'enclosure', label: 'Carcasas', icon: <Box size={14} /> },
    { id: 'led', label: 'LED & Potencia', icon: <Zap size={14} /> },
    { id: 'materials', label: 'Materiales', icon: <Package size={14} /> },
    { id: 'costs', label: 'Costos y Cotización', icon: <DollarSign size={14} /> },
  ] as const;

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-monday-bg">
      {/* Workshop Header */}
      <header className="h-12 border-b border-monday-border bg-monday-surface flex items-center justify-between px-4 shrink-0 z-30 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-monday-blue to-cyan-400 flex items-center justify-center text-white shadow-sm font-bold text-[13px]">
              3D
            </div>
            <div>
              <span className="font-bold text-[14px] text-monday-text">Taller 3D Sunday</span>
              <span className="text-[11px] text-monday-subtext ml-2">Diseño y Fabricación</span>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-monday-border mx-2" />

          {/* Project Name & Dirty badge */}
          <button
            onClick={() => setProjectManagerOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-monday-hover text-[13px] font-medium text-monday-text transition-colors"
            title="Abrir o guardar proyectos"
          >
            <Folder size={15} className="text-monday-blue" />
            <span>{projectName}</span>
            {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500" title="Cambios sin guardar" />}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setProjectManagerOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-monday border border-monday-border bg-monday-surface hover:bg-monday-hover text-monday-text text-[12px] font-medium transition-colors"
          >
            <Save size={14} />
            <span>Guardar</span>
          </button>

          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-monday bg-monday-blue text-white hover:bg-blue-600 text-[12px] font-medium shadow-sm transition-colors"
          >
            <Download size={14} />
            <span>Exportar (STL / OBJ)</span>
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Hierarchy */}
        <SceneHierarchy />

        {/* Center: 3D Viewport */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <Viewport3D />
        </div>

        {/* Right: Specialized Modules & Properties */}
        <div className="flex flex-col h-full">
          {/* Tab buttons */}
          <div className="flex border-b border-monday-border bg-monday-surface overflow-x-auto text-[11px] font-medium">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: tab.id })}
                className={`flex items-center gap-1 px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                  activePanel === tab.id
                    ? 'border-monday-blue text-monday-blue bg-blue-50/20 font-semibold'
                    : 'border-transparent text-monday-subtext hover:text-monday-text hover:bg-monday-hover'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Active Panel Body */}
          <div className="flex-1 overflow-hidden">
            {activePanel === 'properties' && <PropertiesPanel />}
            {activePanel === 'sign' && <SignDesigner />}
            {activePanel === 'enclosure' && <EnclosureDesigner />}
            {activePanel === 'led' && <LEDLayoutPanel />}
            {activePanel === 'materials' && <MaterialsPanel />}
            {activePanel === 'costs' && <CostingPanel />}
          </div>
        </div>
      </div>

      {/* Modals & Handlers */}
      <KeyboardShortcuts />
      <ExportDialog isOpen={exportModalOpen} onClose={() => setExportModalOpen(false)} />
      <ProjectManager
        isOpen={projectManagerOpen}
        onClose={() => setProjectManagerOpen(false)}
        workspaceId={workspaceId}
      />
    </div>
  );
}

export default function WorkshopPage({ workspaceId }: { workspaceId: string | null }) {
  return (
    <WorkshopProvider>
      <WorkshopInner workspaceId={workspaceId} />
    </WorkshopProvider>
  );
}
