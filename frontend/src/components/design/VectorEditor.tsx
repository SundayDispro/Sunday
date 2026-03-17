import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { createFabricCanvas } from './canvasSetup';
import { Toolbar } from './Toolbar';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import type { DesignTool } from './designTypes';

interface VectorEditorProps {
  designId: string;
  initialName: string;
  initialContent: unknown;
  onChangeName: (name: string) => void;
  onSave: (payload: { name: string; content: unknown }) => Promise<void>;
}

export const VectorEditor: React.FC<VectorEditorProps> = ({
  designId,
  initialName,
  initialContent,
  onChangeName,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [tool, setTool] = useState<DesignTool>('select');
  const [zoom, setZoom] = useState(1);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName);
  const [objects, setObjects] = useState<fabric.Object[]>([]);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;
    const canvas = createFabricCanvas(el);
    fabricRef.current = canvas;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvas.setWidth(width);
          canvas.setHeight(height);
          canvas.renderAll();
        }
      }
    });
    ro.observe(wrapper);

    const handleModified = () => {
      setIsDirty(true);
      setObjects(canvas.getObjects());
      setActiveObject(canvas.getActiveObject() ?? null);
    };

    canvas.on('object:added', handleModified);
    canvas.on('object:modified', handleModified);
    canvas.on('object:removed', handleModified);
    canvas.on('selection:created', () => {
      setActiveObject(canvas.getActiveObject() ?? null);
    });
    canvas.on('selection:updated', () => {
      setActiveObject(canvas.getActiveObject() ?? null);
    });
    canvas.on('selection:cleared', () => {
      setActiveObject(null);
    });

    if (initialContent && typeof initialContent === 'object') {
      try {
        canvas.loadFromJSON(initialContent as any, () => {
          canvas.renderAll();
          setObjects(canvas.getObjects());
          setIsDirty(false);
        });
      } catch {
        // ignore
      }
    }

    const handleWheel = (evt: WheelEvent) => {
      if (!wrapper.contains(evt.target as Node)) return;
      evt.preventDefault();
      const delta = evt.deltaY;
      const factor = delta > 0 ? 0.9 : 1.1;
      const nextZoom = Math.min(100, Math.max(0.1, canvas.getZoom() * factor));
      canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), nextZoom);
      setZoom(nextZoom);
      canvas.renderAll();
    };

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.code === 'Space' && !evt.repeat) {
        isPanningRef.current = true;
      }
    };

    const handleKeyUp = (evt: KeyboardEvent) => {
      if (evt.code === 'Space') {
        isPanningRef.current = false;
        lastPosRef.current = null;
      }
    };

    const handleMouseDown = (evt: MouseEvent) => {
      if (!wrapper.contains(evt.target as Node)) return;
      if (isPanningRef.current) {
        lastPosRef.current = { x: evt.clientX, y: evt.clientY };
      } else {
        if (!fabricRef.current) return;
        const c = fabricRef.current;
        if (tool === 'rect') {
          const rect = new fabric.Rect({
            left: evt.offsetX,
            top: evt.offsetY,
            width: 120,
            height: 80,
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1,
          });
          c.add(rect);
          c.setActiveObject(rect);
        } else if (tool === 'ellipse') {
          const ell = new fabric.Ellipse({
            left: evt.offsetX,
            top: evt.offsetY,
            rx: 60,
            ry: 40,
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1,
          });
          c.add(ell);
          c.setActiveObject(ell);
        }
      }
    };

    const handleMouseMove = (evt: MouseEvent) => {
      if (!isPanningRef.current || !lastPosRef.current) return;
      const c = fabricRef.current;
      if (!c) return;
      const vpt = c.viewportTransform;
      if (!vpt) return;
      const dx = evt.clientX - lastPosRef.current.x;
      const dy = evt.clientY - lastPosRef.current.y;
      vpt[4] += dx;
      vpt[5] += dy;
      c.setViewportTransform(vpt);
      lastPosRef.current = { x: evt.clientX, y: evt.clientY };
    };

    const handleMouseUp = () => {
      lastPosRef.current = null;
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      ro.disconnect();
      canvas.dispose();
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [initialContent, tool]);

  const handleSelectObject = (obj: fabric.Object | null) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (obj) {
      canvas.setActiveObject(obj);
    } else {
      canvas.discardActiveObject();
    }
    canvas.requestRenderAll();
    setActiveObject(obj);
  };

  const handleChangeObject = (updater: (obj: fabric.Object) => void) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    updater(obj);
    obj.setCoords();
    canvas.requestRenderAll();
    setIsDirty(true);
    setActiveObject(obj);
  };

  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const json = canvas.toJSON();
      await onSave({ name: name.trim() || 'Sin título', content: json });
      setIsDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-monday-border bg-monday-bg/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onChangeName(e.target.value);
              setIsDirty(true);
            }}
            className="px-2 py-1 rounded-lg bg-white/90 border border-monday-border text-[13px] text-monday-text min-w-[200px]"
          />
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="Cambios sin guardar" />
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-monday-subtext">
          <div className="flex items-center gap-1">
            <span>Zoom</span>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={zoom}
              onChange={(e) => {
                const canvas = fabricRef.current;
                if (!canvas) return;
                const value = Number(e.target.value) || 1;
                const clamped = Math.min(5, Math.max(0.1, value));
                const center = canvas.getCenter();
                canvas.zoomToPoint(new fabric.Point(center.left, center.top), clamped);
                setZoom(clamped);
                canvas.requestRenderAll();
              }}
            />
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-monday-blue text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      <div className="flex flex-1 gap-2 overflow-hidden">
        <div className="px-2 pt-2">
          <Toolbar activeTool={tool} onChangeTool={setTool} />
        </div>
        <div ref={wrapperRef} className="relative flex-1 bg-[#111827] rounded-2xl overflow-hidden">
          <canvas ref={canvasRef} />
        </div>
        <div className="flex flex-col gap-2 pr-2 py-2">
          <LayersPanel objects={objects} activeObject={activeObject} onSelectObject={handleSelectObject} />
          <PropertiesPanel activeObject={activeObject} onChange={handleChangeObject} />
        </div>
      </div>
    </div>
  );
};

