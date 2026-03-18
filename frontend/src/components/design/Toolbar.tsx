import React from 'react';
import { MousePointer2, PenTool, Square, Circle, Type, Image as ImageIcon } from 'lucide-react';
import type { DesignTool } from './designTypes';

interface ToolbarProps {
  activeTool: DesignTool;
  onChangeTool: (tool: DesignTool) => void;
  onImageClick?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ activeTool, onChangeTool, onImageClick }) => {
  const buttonBase =
    'flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors';

  const isActive = (tool: DesignTool) =>
    activeTool === tool ? 'bg-white/15 text-white border-monday-blue' : '';

  return (
    <div className="backdrop-blur-md bg-black/30 border border-white/10 rounded-2xl p-1 flex flex-col gap-1 shadow-lg">
      <button
        type="button"
        className={`${buttonBase} ${isActive('select')}`}
        onClick={() => onChangeTool('select')}
        title="Selección (V)"
      >
        <MousePointer2 size={18} />
      </button>
      <button
        type="button"
        className={`${buttonBase} ${isActive('pen')}`}
        onClick={() => onChangeTool('pen')}
        title="Pluma (P)"
      >
        <PenTool size={18} />
      </button>
      <button
        type="button"
        className={`${buttonBase} ${isActive('rect')}`}
        onClick={() => onChangeTool('rect')}
        title="Rectángulo (R)"
      >
        <Square size={18} />
      </button>
      <button
        type="button"
        className={`${buttonBase} ${isActive('ellipse')}`}
        onClick={() => onChangeTool('ellipse')}
        title="Elipse (E)"
      >
        <Circle size={18} />
      </button>
      <button
        type="button"
        className={`${buttonBase} ${isActive('text')}`}
        onClick={() => onChangeTool('text')}
        title="Texto (T)"
      >
        <Type size={18} />
      </button>
      <button
        type="button"
        className={`${buttonBase} ${isActive('image')}`}
        onClick={() => (onImageClick ? onImageClick() : onChangeTool('image'))}
        title="Imagen"
      >
        <ImageIcon size={18} />
      </button>
    </div>
  );
};

