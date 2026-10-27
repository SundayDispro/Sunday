// ============================================================================
// Sunday 3D Workshop — Sign & Lettering Designer Wizard
// Configures channel letters, illuminated signage, panels & creates 3D geometry
// ============================================================================

import React, { useState } from 'react';
import { Type, Sparkles, Layers, CheckCircle } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { generateSign } from '../../workshop/parametric/SignGenerator';
import { SceneObject } from '../../workshop/engine/SceneObject';
import { createBoxGeometry } from '../../workshop/engine/Primitives';

export function SignDesigner() {
  const { scene, dispatch } = useWorkshop();

  const [text, setText] = useState('LETRAS 3D');
  const [letterHeight, setLetterHeight] = useState(150); // mm
  const [letterDepth, setLetterDepth] = useState(60);     // mm
  const [letterSpacing, setLetterSpacing] = useState(15);  // mm
  const [enclosureEnabled, setEnclosureEnabled] = useState(true);
  const [wallThickness, setWallThickness] = useState(3);   // mm
  const [rearPanel, setRearPanel] = useState(true);
  const [frontPanel, setFrontPanel] = useState(true);
  const [illuminated, setIlluminated] = useState(true);

  // Compute live preview
  const signResult = generateSign({
    text,
    fontUrl: '',
    letterHeight,
    letterDepth,
    letterSpacing,
    layout: 'horizontal',
    bevelEnabled: false,
    bevelThickness: 1,
    bevelSize: 0.5,
    enclosureEnabled,
    wallThickness,
    rearPanel,
    frontPanel,
    illuminated,
  });

  const handleGenerateInScene = () => {
    // Create a group for the sign
    const group = scene.createPrimitive('group', `Letrero "${text}"`);

    // Create 3D representations of letter bodies in the scene
    signResult.letterBodies.forEach((lb) => {
      const geom = createBoxGeometry(lb.width, lb.height, lb.depth);
      const letterObj = new SceneObject(
        {
          name: `Letra ${lb.letter} (${lb.width.toFixed(0)}x${lb.height.toFixed(0)}mm)`,
          type: 'box',
          position: lb.position,
          material: {
            color: '#1d60f5',
            opacity: 1,
            wireframe: false,
          },
          parentId: group.id,
        },
        geom
      );
      scene.addObject(letterObj);
      group.childrenIds.push(letterObj.id);
    });

    // If rear panel
    if (rearPanel) {
      const panelGeom = createBoxGeometry(
        signResult.dimensions.totalWidth + 20,
        signResult.dimensions.totalHeight + 20,
        3
      );
      const panelObj = new SceneObject(
        {
          name: 'Panel Trasero Base',
          type: 'box',
          position: {
            x: signResult.dimensions.totalWidth / 2,
            y: signResult.dimensions.totalHeight / 2,
            z: -1.5,
          },
          material: { color: '#333333', opacity: 1, wireframe: false },
          parentId: group.id,
        },
        panelGeom
      );
      scene.addObject(panelObj);
      group.childrenIds.push(panelObj.id);
    }

    // Select the new group
    scene.select(group.id, false);
    dispatch({ type: 'SET_DIRTY', payload: true });
    alert(`¡Letrero "${text}" generado con éxito con ${signResult.letterBodies.length} cuerpos de letra en 3D!`);
  };

  return (
    <div className="w-80 border-l border-monday-border bg-monday-surface p-4 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto space-y-4">
      <div className="flex items-center gap-2 border-b border-monday-border pb-2.5">
        <Type size={18} className="text-monday-blue" />
        <span className="font-semibold text-[13px] uppercase tracking-wider">
          Diseño de Letras y Letreros
        </span>
      </div>

      {/* Text Config */}
      <div>
        <label className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider block mb-1">
          Texto del Letrero
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-monday border border-monday-border bg-monday-bg text-monday-text text-[13px] font-medium outline-none focus:border-monday-blue"
          placeholder="Ej: SUNDAY"
        />
      </div>

      {/* Dimensions Config */}
      <div className="space-y-2.5 bg-monday-bg p-3 rounded-monday border border-monday-border">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
          Dimensiones de Letras (mm)
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-monday-subtext">Altura de letra:</span>
            <span className="font-semibold">{letterHeight} mm</span>
          </div>
          <input
            type="range"
            min="30"
            max="600"
            step="10"
            value={letterHeight}
            onChange={(e) => setLetterHeight(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-monday-subtext">Profundidad (Canto):</span>
            <span className="font-semibold">{letterDepth} mm</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={letterDepth}
            onChange={(e) => setLetterDepth(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-monday-subtext">Separación entre letras:</span>
            <span className="font-semibold">{letterSpacing} mm</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="2"
            value={letterSpacing}
            onChange={(e) => setLetterSpacing(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>
      </div>

      {/* Construction Options */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
          Método de Construcción
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-[12px]">
          <input
            type="checkbox"
            checked={enclosureEnabled}
            onChange={(e) => setEnclosureEnabled(e.target.checked)}
            className="rounded text-monday-blue"
          />
          <span>Carcasa perimetral hueca (Letra cajón)</span>
        </label>

        {enclosureEnabled && (
          <div className="pl-6 flex items-center gap-2 text-[12px]">
            <span className="text-monday-subtext">Espesor de pared:</span>
            <input
              type="number"
              min="1"
              max="10"
              value={wallThickness}
              onChange={(e) => setWallThickness(Math.max(1, Number(e.target.value)))}
              className="w-16 px-1.5 py-0.5 border border-monday-border rounded bg-white text-right text-[12px]"
            />
            <span className="text-monday-subtext">mm</span>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer text-[12px]">
          <input
            type="checkbox"
            checked={rearPanel}
            onChange={(e) => setRearPanel(e.target.checked)}
            className="rounded text-monday-blue"
          />
          <span>Fondo / Placa trasera de sujeción</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-[12px]">
          <input
            type="checkbox"
            checked={frontPanel}
            onChange={(e) => setFrontPanel(e.target.checked)}
            className="rounded text-monday-blue"
          />
          <span>Cara frontal de acrílico difusor</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-[12px]">
          <input
            type="checkbox"
            checked={illuminated}
            onChange={(e) => setIlluminated(e.target.checked)}
            className="rounded text-monday-blue"
          />
          <span className="flex items-center gap-1 font-medium text-amber-600">
            <Sparkles size={13} />
            Preparación para Iluminación LED
          </span>
        </label>
      </div>

      {/* Summary Box */}
      <div className="bg-blue-50 border border-blue-200 p-3 rounded-monday space-y-1.5 text-[12px] text-monday-text">
        <div className="font-semibold text-monday-blue flex items-center gap-1">
          <CheckCircle size={14} />
          <span>Dimensiones calculadas</span>
        </div>
        <div>
          Ancho total: <strong>{signResult.dimensions.totalWidth.toFixed(0)} mm</strong>
        </div>
        <div>
          Alto total: <strong>{signResult.dimensions.totalHeight.toFixed(0)} mm</strong>
        </div>
        <div>
          Cuerpos de letra: <strong>{signResult.letterBodies.length} piezas</strong>
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerateInScene}
        className="w-full py-2 bg-monday-blue text-white rounded-monday font-medium hover:bg-blue-600 transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <Layers size={15} />
        <span>Generar en Escena 3D</span>
      </button>
    </div>
  );
}
