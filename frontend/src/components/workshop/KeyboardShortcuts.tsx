// ============================================================================
// Sunday 3D Workshop — Keyboard Shortcuts Handler & Overlay Modal
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';

export function KeyboardShortcuts() {
  const {
    dispatch,
    deleteSelected,
    duplicateSelected,
    groupSelected,
    ungroupSelected,
    undo,
    redo,
    scene,
  } = useWorkshop();

  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Help
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // Escape -> clear selection or close help
      if (e.key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
        } else {
          scene.clearSelection();
        }
        return;
      }

      // Transform modes
      if (e.key.toLowerCase() === 'w') {
        dispatch({ type: 'SET_TRANSFORM_MODE', payload: 'translate' });
      } else if (e.key.toLowerCase() === 'e') {
        dispatch({ type: 'SET_TRANSFORM_MODE', payload: 'rotate' });
      } else if (e.key.toLowerCase() === 'r') {
        dispatch({ type: 'SET_TRANSFORM_MODE', payload: 'scale' });
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }

      // Shortcuts with Ctrl / Cmd
      if (e.ctrlKey || e.metaKey) {
        // Select All
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          scene.selectAll();
        }

        // Duplicate
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicateSelected();
        }

        // Group / Ungroup
        if (e.key.toLowerCase() === 'g') {
          e.preventDefault();
          if (e.shiftKey) {
            ungroupSelected();
          } else {
            groupSelected();
          }
        }

        // Undo / Redo
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, duplicateSelected, groupSelected, ungroupSelected, undo, redo, scene, showHelp, dispatch]);

  if (!showHelp) return null;

  const shortcuts = [
    { key: 'W', desc: 'Modo Mover (Trasladar)' },
    { key: 'E', desc: 'Modo Rotar' },
    { key: 'R', desc: 'Modo Escalar' },
    { key: 'Supr / Backspace', desc: 'Eliminar objeto seleccionado' },
    { key: 'Ctrl + D', desc: 'Duplicar objeto' },
    { key: 'Ctrl + G', desc: 'Agrupar objetos seleccionados' },
    { key: 'Ctrl + Shift + G', desc: 'Desagrupar' },
    { key: 'Ctrl + A', desc: 'Seleccionar todos los objetos' },
    { key: 'Esc', desc: 'Deseleccionar todo' },
    { key: 'Ctrl + Z', desc: 'Deshacer última acción' },
    { key: 'Ctrl + Y', desc: 'Rehacer' },
    { key: '?', desc: 'Abrir / cerrar esta ayuda' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-monday-surface border border-monday-border rounded-xl shadow-monday-lg w-full max-w-sm overflow-hidden flex flex-col text-[13px] text-monday-text">
        <div className="p-3.5 border-b border-monday-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-monday-blue" />
            <span className="font-semibold text-[14px]">Atajos de Teclado</span>
          </div>
          <button
            onClick={() => setShowHelp(false)}
            className="p-1 rounded hover:bg-monday-hover text-monday-subtext hover:text-monday-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 divide-y divide-monday-border max-h-80 overflow-y-auto">
          {shortcuts.map((sc, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 text-[12px]">
              <span className="text-monday-subtext">{sc.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-monday-bg border border-monday-border font-mono text-[11px] font-semibold">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
