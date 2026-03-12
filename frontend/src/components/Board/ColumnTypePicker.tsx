import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Tag, Calendar, User, AlignLeft, Clock, BarChart2, X, Paperclip, Mail, FileSpreadsheet, FileText, Hash
} from 'lucide-react';
import { useUser } from '../../store/UserContext';

interface ColumnType {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const COLUMN_TYPES: ColumnType[] = [
  { id: 'status',     label: 'Estado',     icon: <Tag size={18} />,           color: '#00c875', description: 'Seguimiento de estado con etiquetas de color' },
  { id: 'priority',   label: 'Seguimiento', icon: <BarChart2 size={18} />,    color: '#fdab3d', description: 'Etiquetas personalizables: Sin respuesta, Aprobado, etc.' },
  { id: 'date',       label: 'Fecha',      icon: <Calendar size={18} />,     color: '#0073ea', description: 'Fecha de entrada del proyecto' },
  { id: 'person',     label: 'Personas',   icon: <User size={18} />,         color: '#6e3cbb', description: 'Asigna miembros del equipo' },
  { id: 'text',       label: 'Texto',      icon: <AlignLeft size={18} />,     color: '#676879', description: 'Escribe cualquier nota corta' },
  { id: 'folio',      label: 'Folio',      icon: <Hash size={18} />,          color: '#0f766e', description: 'Número de folio del proyecto' },
  { id: 'contact',    label: 'Contacto',   icon: <Mail size={18} />,          color: '#e2445c', description: 'Correo, teléfono o enlace a WhatsApp' },
  { id: 'timeline',   label: 'Producción', icon: <Clock size={18} />,       color: '#5559df', description: 'Rango de fechas de tiempo de producción (se marca en el calendario)' },
  { id: 'excel',      label: 'Excel',      icon: <FileSpreadsheet size={18} />, color: '#217346', description: 'Enlace al archivo Excel del proyecto' },
  { id: 'docs',       label: 'Docs',       icon: <FileText size={18} />,     color: '#4285f4', description: 'Levantamiento, cotización y hoja de trabajo' },
  { id: 'billing_docs', label: 'Documentos Facturación', icon: <FileText size={18} />, color: '#f97316', description: 'Facturas, comprobantes y otros documentos de cobro' },
  { id: 'file',       label: 'Archivos',   icon: <Paperclip size={18} />,   color: '#676879', description: 'Adjuntar archivos a la tarea' },
  { id: 'colocacion', label: 'Colocación', icon: <Calendar size={18} />,    color: '#00c2e0', description: 'Fecha de colocación del proyecto' },
];

interface Props {
  children: React.ReactNode;
  onSelect: (type: string, label: string) => void;
}

export const ColumnTypePicker: React.FC<Props> = ({ children, onSelect }) => {
  const [open, setOpen] = React.useState(false);
  const { currentUser } = useUser();

  const isAdminOrVentas = currentUser?.role === 'ADMIN' || currentUser?.role === 'VENTAS';

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
            {COLUMN_TYPES.filter(type => {
              if (type.id === 'billing_docs' && !isAdminOrVentas) return false;
              return true;
            }).map(type => (
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
