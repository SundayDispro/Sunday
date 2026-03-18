import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { PenTool as FabricPenTool } from 'fabric-pen-tool';
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
  const penToolRef = useRef<FabricPenTool | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [tool, setTool] = useState<DesignTool>('select');
  const [zoom, setZoom] = useState(1);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName);
  const [objects, setObjects] = useState<fabric.Object[]>([]);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const syncObjects = () => {
    const c = fabricRef.current;
    if (c) {
      setObjects(c.getObjects());
      setActiveObject(c.getActiveObject() ?? null);
    }
  };

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
      syncObjects();
    };

    canvas.on('object:added', handleModified);
    canvas.on('object:modified', handleModified);
    canvas.on('object:removed', handleModified);
    canvas.on('selection:created', () => syncObjects());
    canvas.on('selection:updated', () => syncObjects());
    canvas.on('selection:cleared', () => setActiveObject(null));

    const payload = initialContent && typeof initialContent === 'object' ? initialContent : {};
    try {
      canvas.loadFromJSON(payload as object, () => {
        canvas.renderAll();
        syncObjects();
        setIsDirty(false);
      });
    } catch {
      // ignore
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
        return;
      }
      const c = fabricRef.current;
      if (!c) return;
      const target = evt.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (evt.key === 'Delete' || evt.key === 'Backspace') {
        evt.preventDefault();
        const active = c.getActiveObject();
        if (active) {
          c.remove(active);
          if (active instanceof fabric.ActiveSelection) {
            (active as fabric.ActiveSelection).getObjects().forEach((o) => c.remove(o));
            (active as fabric.ActiveSelection).canvas?.renderAll();
          }
          setIsDirty(true);
          syncObjects();
        }
        return;
      }
      if (evt.ctrlKey || evt.metaKey) {
        if (evt.key === 'd') {
          evt.preventDefault();
          const active = c.getActiveObject();
          if (active) {
            active.clone((cloned: fabric.Object) => {
              cloned.set({
                left: (active.left ?? 0) + 20,
                top: (active.top ?? 0) + 20,
              });
              if (cloned.setCoords) cloned.setCoords();
              c.add(cloned);
              c.setActiveObject(cloned);
              setIsDirty(true);
              syncObjects();
              c.requestRenderAll();
            });
          }
          return;
        }
        if (evt.key === 'g') {
          evt.preventDefault();
          const active = c.getActiveObject();
          if (active && (active instanceof fabric.ActiveSelection ? active.size() > 1 : false)) {
            (active as fabric.ActiveSelection).toGroup();
            setIsDirty(true);
            syncObjects();
            c.requestRenderAll();
          } else if (active && !(active instanceof fabric.Group)) {
            const sel = new fabric.ActiveSelection([active], { canvas: c });
            c.setActiveObject(sel);
            syncObjects();
            c.requestRenderAll();
          }
          return;
        }
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
        return;
      }
      const c = fabricRef.current;
      if (!c) return;
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
      } else if (tool === 'text') {
        const text = new fabric.IText('Texto', {
          left: evt.offsetX,
          top: evt.offsetY,
          fontSize: 24,
          fontFamily: 'Arial',
          fill: '#111827',
        });
        c.add(text);
        c.setActiveObject(text);
      }
      if (tool !== 'select' && tool !== 'pen') syncObjects();
    };

    const handleMouseMove = (evt: MouseEvent) => {
      if (!isPanningRef.current || !lastPosRef.current) return;
      const c = fabricRef.current;
      if (!c) return;
      const vpt = c.viewportTransform;
      if (!vpt) return;
      vpt[4] += evt.clientX - lastPosRef.current.x;
      vpt[5] += evt.clientY - lastPosRef.current.y;
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
      if (penToolRef.current) {
        penToolRef.current.destroy();
        penToolRef.current = null;
      }
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [initialContent, tool]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!penToolRef.current) {
      penToolRef.current = new FabricPenTool(canvas, {
        stroke: '#111827',
        strokeWidth: 1,
        fill: '',
      });
    }
    if (tool === 'pen') {
      penToolRef.current.open();
    } else {
      penToolRef.current.close();
      canvas.isDrawingMode = false;
    }
  }, [tool]);

  const handleSelectObject = (obj: fabric.Object | null) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (obj) canvas.setActiveObject(obj);
    else canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveObject(obj);
  };

  const handleChangeObject = (updater: (obj: fabric.Object) => void) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    updater(obj);
    if (obj.setCoords) obj.setCoords();
    canvas.requestRenderAll();
    setIsDirty(true);
    setActiveObject(obj);
  };

  const handleLayerDelete = (obj: fabric.Object) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.remove(obj);
    setIsDirty(true);
    syncObjects();
    canvas.requestRenderAll();
  };

  const handleLayerDuplicate = (obj: fabric.Object) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    obj.clone((cloned: fabric.Object) => {
      cloned.set({
        left: (obj.left ?? 0) + 20,
        top: (obj.top ?? 0) + 20,
      });
      if (cloned.setCoords) cloned.setCoords();
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      setIsDirty(true);
      syncObjects();
      canvas.requestRenderAll();
    });
  };

  const handleBringFront = (obj: fabric.Object) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.bringObjectToFront(obj);
    setIsDirty(true);
    syncObjects();
    canvas.requestRenderAll();
  };

  const handleSendBack = (obj: fabric.Object) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.sendObjectToBack(obj);
    setIsDirty(true);
    syncObjects();
    canvas.requestRenderAll();
  };

  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const json = canvas.toJSON();
      const svg = canvas.toSVG();
      await onSave({
        name: name.trim() || 'Sin título',
        content: { json, svg },
      });
      setIsDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleExportSVG = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const svg = canvas.toSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'diseño').replace(/\s+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${(name || 'diseño').replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const handleImageToolClick = () => {
    setTool('image');
    imageInputRef.current?.click();
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const url = URL.createObjectURL(file);
    fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
      .then((img) => {
        URL.revokeObjectURL(url);
        const center = canvas.getCenter();
        const w = img.get('width') ?? 200;
        const h = img.get('height') ?? 200;
        img.set({
          left: (center?.left ?? 200) - w / 2,
          top: (center?.top ?? 200) - h / 2,
        });
        const cw = canvas.getWidth() ?? 800;
        const ch = canvas.getHeight() ?? 600;
        if (w > cw * 0.8 || h > ch * 0.8) {
          const scale = Math.min((cw * 0.8) / w, (ch * 0.8) / h);
          img.scale(scale);
        }
        canvas.add(img);
        canvas.setActiveObject(img);
        setIsDirty(true);
        syncObjects();
        canvas.requestRenderAll();
        setTool('select');
      })
      .catch(() => {
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="flex flex-col h-full gap-2 min-h-0">
      <div className="shrink-0 flex items-center justify-between px-2 py-1.5 border-b border-monday-border bg-monday-bg/80 backdrop-blur-md flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              onChangeName(e.target.value);
              setIsDirty(true);
            }}
            className="px-2 py-1 rounded-lg bg-white/90 border border-monday-border text-[13px] text-monday-text min-w-[180px]"
          />
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="Cambios sin guardar" />
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-monday-subtext flex-wrap">
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
                canvas.zoomToPoint(new fabric.Point(center?.left ?? 0, center?.top ?? 0), clamped);
                setZoom(clamped);
                canvas.requestRenderAll();
              }}
            />
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={handleExportSVG}
            className="px-2 py-1.5 rounded-lg border border-monday-border bg-white text-monday-text hover:bg-monday-hover text-[11px]"
          >
            Exportar SVG
          </button>
          <button
            type="button"
            onClick={handleExportPNG}
            className="px-2 py-1.5 rounded-lg border border-monday-border bg-white text-monday-text hover:bg-monday-hover text-[11px]"
          >
            Exportar PNG
          </button>
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
      <div className="flex flex-1 gap-2 overflow-hidden min-h-0">
        <div className="shrink-0 px-2 pt-2">
          <Toolbar
            activeTool={tool}
            onChangeTool={setTool}
            onImageClick={handleImageToolClick}
          />
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFile}
        />
        <div ref={wrapperRef} className="relative flex-1 min-w-0 bg-[#111827] rounded-2xl overflow-hidden">
          <canvas ref={canvasRef} />
        </div>
        <div className="flex flex-col gap-2 pr-2 py-2 shrink-0">
          <LayersPanel
            objects={objects}
            activeObject={activeObject}
            onSelectObject={handleSelectObject}
            onDelete={handleLayerDelete}
            onDuplicate={handleLayerDuplicate}
            onBringFront={handleBringFront}
            onSendBack={handleSendBack}
          />
          <PropertiesPanel activeObject={activeObject} onChange={handleChangeObject} />
        </div>
      </div>
    </div>
  );
};
