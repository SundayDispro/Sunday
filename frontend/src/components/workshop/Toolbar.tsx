// ============================================================================
// Sunday 3D Workshop — Top Toolbar Component
// ============================================================================

import React, { useState } from 'react';
import {
  Box,
  Circle,
  Cylinder,
  Cone,
  Triangle,
  Move,
  RotateCcw,
  Maximize2,
  Trash2,
  Copy,
  Layers,
  Undo2,
  Redo2,
  Grid,
  Magnet,
  Type,
  Upload,
  Combine,
  MinusCircle,
  SquaresIntersect,
} from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { PrimitiveType } from '../../workshop/types';
import { performBooleanOperation } from '../../workshop/engine/BooleanOps';

export function Toolbar() {
  const {
    createPrimitive,
    deleteSelected,
    duplicateSelected,
    groupSelected,
    ungroupSelected,
    undo,
    redo,
    canUndo,
    canRedo,
    transformMode,
    gridEnabled,
    snapEnabled,
    snapSize,
    selectedIds,
    scene,
    dispatch,
  } = useWorkshop();

  const [showAddMenu, setShowAddMenu] = useState(false);

  const handleAddPrimitive = (type: PrimitiveType) => {
    createPrimitive(type);
    setShowAddMenu(false);
  };

  const handleBoolean = (op: 'union' | 'subtract' | 'intersect') => {
    if (selectedIds.length < 2) return;
    const objA = scene.getObject(selectedIds[0]);
    const objB = scene.getObject(selectedIds[1]);
    if (!objA || !objB) return;

    const res = performBooleanOperation(objA, objB, op);
    if (res.success && res.object) {
      scene.removeObject(objA.id);
      scene.removeObject(objB.id);
      scene.addObject(res.object);
      scene.select(res.object.id, false);
    } else if (res.error) {
      alert(res.error);
    }
  };

  const hasSelection = selectedIds.length > 0;
  const canBoolean = selectedIds.length >= 2;

  return (
    <div className="h-11 border-b border-monday-border bg-monday-surface flex items-center justify-between px-3 text-[13px] text-monday-text select-none shrink-0 z-20">
      {/* Left section: Creation & Modes */}
      <div className="flex items-center gap-1">
        {/* Primitives Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-monday-blue text-white rounded-monday font-medium hover:bg-blue-600 transition-colors shadow-sm text-[12px]"
            title="Añadir objeto 3D"
          >
            <Box size={15} />
            <span>+ Añadir</span>
          </button>

          {showAddMenu && (
            <div
              className="absolute left-0 top-full mt-1.5 w-44 bg-monday-surface border border-monday-border rounded-monday shadow-monday-lg py-1 z-50 animate-fade-in-up"
              onMouseLeave={() => setShowAddMenu(false)}
            >
              <div className="text-[11px] font-semibold text-monday-subtext px-2.5 py-1 uppercase tracking-tight">
                Primitivas 3D
              </div>
              <button
                onClick={() => handleAddPrimitive('box')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Box size={14} className="text-monday-blue" />
                <span>Cubo</span>
              </button>
              <button
                onClick={() => handleAddPrimitive('sphere')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Circle size={14} className="text-monday-blue" />
                <span>Esfera</span>
              </button>
              <button
                onClick={() => handleAddPrimitive('cylinder')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Cylinder size={14} className="text-monday-blue" />
                <span>Cilindro</span>
              </button>
              <button
                onClick={() => handleAddPrimitive('cone')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Cone size={14} className="text-monday-blue" />
                <span>Cono</span>
              </button>
              <button
                onClick={() => handleAddPrimitive('wedge')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Triangle size={14} className="text-monday-blue" />
                <span>Cuña</span>
              </button>
              <button
                onClick={() => handleAddPrimitive('torus')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Circle size={14} className="text-monday-blue" />
                <span>Toroide</span>
              </button>

              <div className="border-t border-monday-border my-1" />
              <button
                onClick={() => {
                  createPrimitive('text');
                  setShowAddMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-monday-hover text-left transition-colors"
              >
                <Type size={14} className="text-purple-600" />
                <span>Texto 3D</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-4 w-[1px] bg-monday-border mx-1" />

        {/* Transform Modes */}
        <div className="flex items-center bg-monday-bg p-0.5 rounded-monday border border-monday-border">
          <button
            onClick={() => dispatch({ type: 'SET_TRANSFORM_MODE', payload: 'translate' })}
            className={`p-1.5 rounded-monday transition-colors ${
              transformMode === 'translate' ? 'bg-monday-surface text-monday-blue shadow-sm font-semibold' : 'text-monday-subtext hover:text-monday-text'
            }`}
            title="Mover (W)"
          >
            <Move size={15} />
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_TRANSFORM_MODE', payload: 'rotate' })}
            className={`p-1.5 rounded-monday transition-colors ${
              transformMode === 'rotate' ? 'bg-monday-surface text-monday-blue shadow-sm font-semibold' : 'text-monday-subtext hover:text-monday-text'
            }`}
            title="Rotar (E)"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_TRANSFORM_MODE', payload: 'scale' })}
            className={`p-1.5 rounded-monday transition-colors ${
              transformMode === 'scale' ? 'bg-monday-surface text-monday-blue shadow-sm font-semibold' : 'text-monday-subtext hover:text-monday-text'
            }`}
            title="Escalar (R)"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        <div className="h-4 w-[1px] bg-monday-border mx-1" />

        {/* Boolean Operations */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleBoolean('union')}
            disabled={!canBoolean}
            className={`p-1.5 rounded-monday transition-colors ${
              canBoolean ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
            }`}
            title="Unión Booleana (requiere 2 objetos)"
          >
            <Combine size={15} />
          </button>
          <button
            onClick={() => handleBoolean('subtract')}
            disabled={!canBoolean}
            className={`p-1.5 rounded-monday transition-colors ${
              canBoolean ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
            }`}
            title="Sustracción Booleana (requiere 2 objetos)"
          >
            <MinusCircle size={15} />
          </button>
          <button
            onClick={() => handleBoolean('intersect')}
            disabled={!canBoolean}
            className={`p-1.5 rounded-monday transition-colors ${
              canBoolean ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
            }`}
            title="Intersección Booleana (requiere 2 objetos)"
          >
            <SquaresIntersect size={15} />
          </button>
        </div>

        <div className="h-4 w-[1px] bg-monday-border mx-1" />

        {/* Object Actions */}
        <button
          onClick={duplicateSelected}
          disabled={!hasSelection}
          className={`p-1.5 rounded-monday transition-colors ${
            hasSelection ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
          }`}
          title="Duplicar (Ctrl+D)"
        >
          <Copy size={15} />
        </button>
        <button
          onClick={deleteSelected}
          disabled={!hasSelection}
          className={`p-1.5 rounded-monday transition-colors ${
            hasSelection ? 'hover:bg-red-50 text-red-600' : 'opacity-40 cursor-not-allowed text-monday-subtext'
          }`}
          title="Eliminar (Supr)"
        >
          <Trash2 size={15} />
        </button>
        <button
          onClick={groupSelected}
          disabled={selectedIds.length < 2}
          className={`p-1.5 rounded-monday transition-colors ${
            selectedIds.length >= 2 ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
          }`}
          title="Agrupar (Ctrl+G)"
        >
          <Layers size={15} />
        </button>
      </div>

      {/* Right section: Undo/Redo & Grid */}
      <div className="flex items-center gap-1.5">
        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`p-1.5 rounded-monday transition-colors ${
            canUndo ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
          }`}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`p-1.5 rounded-monday transition-colors ${
            canRedo ? 'hover:bg-monday-hover text-monday-text' : 'opacity-40 cursor-not-allowed text-monday-subtext'
          }`}
          title="Rehacer (Ctrl+Y)"
        >
          <Redo2 size={15} />
        </button>

        <div className="h-4 w-[1px] bg-monday-border mx-1" />

        {/* Grid and Snapping */}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_GRID' })}
          className={`p-1.5 rounded-monday transition-colors ${
            gridEnabled ? 'bg-monday-hover text-monday-blue font-semibold' : 'text-monday-subtext hover:text-monday-text'
          }`}
          title="Cuadrícula (Grid)"
        >
          <Grid size={15} />
        </button>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SNAP' })}
          className={`p-1.5 rounded-monday transition-colors ${
            snapEnabled ? 'bg-monday-hover text-monday-blue font-semibold' : 'text-monday-subtext hover:text-monday-text'
          }`}
          title="Ajuste a Cuadrícula (Snap)"
        >
          <Magnet size={15} />
        </button>

        {snapEnabled && (
          <select
            value={snapSize}
            onChange={(e) => dispatch({ type: 'SET_SNAP_SIZE', payload: Number(e.target.value) })}
            className="h-7 px-1.5 text-[11px] rounded-monday border border-monday-border bg-monday-surface text-monday-text focus:outline-none"
            title="Paso de cuadrícula"
          >
            <option value={1}>1 mm</option>
            <option value={5}>5 mm</option>
            <option value={10}>10 mm</option>
            <option value={25}>25 mm</option>
            <option value={50}>50 mm</option>
          </select>
        )}
      </div>
    </div>
  );
}
