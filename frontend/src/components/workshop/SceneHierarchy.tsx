// ============================================================================
// Sunday 3D Workshop — Scene Hierarchy Panel (Left Tree)
// ============================================================================

import React, { useState } from 'react';
import {
  Box,
  Circle,
  Cylinder,
  Cone,
  Triangle,
  Type,
  Layers,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  Check,
} from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { PrimitiveType } from '../../workshop/types';
import { SceneObject } from '../../workshop/engine/SceneObject';

function getPrimitiveIcon(type: PrimitiveType) {
  switch (type) {
    case 'box':
      return <Box size={14} className="text-blue-500" />;
    case 'sphere':
      return <Circle size={14} className="text-emerald-500" />;
    case 'cylinder':
      return <Cylinder size={14} className="text-amber-500" />;
    case 'cone':
      return <Cone size={14} className="text-orange-500" />;
    case 'wedge':
      return <Triangle size={14} className="text-cyan-500" />;
    case 'text':
      return <Type size={14} className="text-purple-500" />;
    case 'group':
      return <Layers size={14} className="text-indigo-500" />;
    default:
      return <Box size={14} className="text-gray-500" />;
  }
}

export function SceneHierarchy() {
  const { scene, selectedIds, dispatch } = useWorkshop();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const objects = scene.getRootObjects();

  const handleStartRename = (obj: SceneObject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(obj.id);
    setNameDraft(obj.name);
  };

  const handleSaveRename = (obj: SceneObject) => {
    if (nameDraft.trim()) {
      scene.renameObject(obj.id, nameDraft.trim());
    }
    setEditingId(null);
  };

  const handleToggleVisibility = (obj: SceneObject, e: React.MouseEvent) => {
    e.stopPropagation();
    scene.setVisibility(obj.id, !obj.visible);
  };

  const handleDelete = (obj: SceneObject, e: React.MouseEvent) => {
    e.stopPropagation();
    scene.removeObject(obj.id);
  };

  return (
    <div className="w-60 border-r border-monday-border bg-monday-surface flex flex-col h-full select-none text-[13px] shrink-0">
      {/* Header */}
      <div className="p-2.5 border-b border-monday-border flex items-center justify-between">
        <span className="font-semibold text-monday-text text-[12px] uppercase tracking-wider">
          Jerarquía ({objects.length})
        </span>
      </div>

      {/* Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {objects.length === 0 ? (
          <div className="py-8 text-center text-monday-subtext text-[12px]">
            No hay objetos en la escena.
            <div className="mt-2 text-[11px] text-monday-blue">
              Usa "+ Añadir" para crear uno.
            </div>
          </div>
        ) : (
          objects.map((obj) => {
            const isSelected = selectedIds.includes(obj.id);
            const isEditing = editingId === obj.id;

            return (
              <div
                key={obj.id}
                onClick={(e) => scene.select(obj.id, e.shiftKey)}
                className={`group flex items-center justify-between px-2 py-1.5 rounded-monday cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-monday-blue font-medium'
                    : 'text-monday-text hover:bg-monday-hover'
                } ${!obj.visible ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                  {getPrimitiveIcon(obj.type)}
                  {isEditing ? (
                    <input
                      type="text"
                      value={nameDraft}
                      autoFocus
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => handleSaveRename(obj)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(obj);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full text-[12px] px-1 py-0.5 border border-monday-blue rounded bg-white outline-none"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => handleStartRename(obj, e)}
                      className="truncate text-[12px]"
                      title={obj.name}
                    >
                      {obj.name}
                    </span>
                  )}
                </div>

                {/* Hover Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleToggleVisibility(obj, e)}
                    className="p-1 hover:bg-white rounded text-monday-subtext hover:text-monday-text transition-colors"
                    title={obj.visible ? 'Ocultar' : 'Mostrar'}
                  >
                    {obj.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    onClick={(e) => handleStartRename(obj, e)}
                    className="p-1 hover:bg-white rounded text-monday-subtext hover:text-monday-text transition-colors"
                    title="Renombrar"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(obj, e)}
                    className="p-1 hover:bg-red-50 rounded text-monday-subtext hover:text-red-500 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
