import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Tag, Calendar, User, AlignLeft, Clock, Hash, BarChart2, X, Paperclip
} from 'lucide-react';

interface ColumnType {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const COLUMN_TYPES: ColumnType[] = [
  { id: 'status',   label: 'Estado',     icon: <Tag size={18} />,       color: '#00c875', description: 'Seguimiento de estado con etiquetas de color' },
  { id: 'priority', label: 'Prioridad',  icon: <BarChart2 size={18} />, color: '#fdab3d', description: 'Niveles de prioridad: alta, media, baja' },
  { id: 'date',     label: 'Fecha',      icon: <Calendar size={18} />,  color: '#0073ea', description: 'Selecciona una fecha límite' },
  { id: 'person',   label: 'Personas',   icon: <User size={18} />,      color: '#6e3cbb', description: 'Asigna miembros del equipo' },
  { id: 'text',     label: 'Texto',      icon: <AlignLeft size={18} />, color: '#676879', description: 'Escribe cualquier nota corta' },
  { id: 'number',   label: 'Número',     icon: <Hash size={18} />,      color: '#e2445c', description: 'Valores numéricos y cálculos' },
  { id: 'timeline', label: 'Cronograma', icon: <Clock size={18} />,     color: '#5559df', description: 'Rango de fechas de inicio y fin' },
  { id: 'file',     label: 'Archivos',   icon: <Paperclip size={18} />, color: '#676879', description: 'Adjuntar archivos a la tarea' },
];

interface Props {
  children: React.ReactNode;
  onSelect: (type: string, label: string) => void;
}

export const ColumnTypePicker: React.FC<Props> = ({ children, onSelect }) => {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (type: ColumnType) => {
    onSelect(type.id, type.label);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild onClick={e => e.stopPropagation()}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border w-[300px] p-3 fade-in"
          sideOffset={6}
          align="start"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-monday-text">Agregar columna</h3>
            <button onClick={() => setOpen(false)} className="text-monday-subtext hover:text-monday-text transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {COLUMN_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => handleSelect(type)}
                className="flex items-center gap-3 text-left px-3 py-2.5 rounded-monday hover:bg-monday-hover transition-colors group"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: type.color }}
                >
                  {type.icon}
                </div>
                <div>
                  <div className="text-[13px] font-medium text-monday-text">{type.label}</div>
                  <div className="text-[11px] text-monday-subtext">{type.description}</div>
                </div>
              </button>
            ))}
          </div>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
