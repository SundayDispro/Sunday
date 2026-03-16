import React from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Row, flexRender } from '@tanstack/react-table';
import { Item } from '../../types';

interface DraggableRowProps {
  row: Row<Item>;
  groupColor: string;
  isSelected?: boolean;
}

export const DraggableRow: React.FC<DraggableRowProps> = ({ row, groupColor, isSelected }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.original.id,
    data: {
      type: 'Item',
      item: row.original,
    },
  });

  // Solo aplicar transform al arrastrar: si siempre aplicamos transform, cada fila crea un stacking
  // context y puede pintarse por encima del header sticky de otro grupo.
  const style: React.CSSProperties = {
    ...(isDragging
      ? {
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: 50,
          position: 'relative' as const,
          opacity: 0.5,
        }
      : { transition }),
  };

  const Tr = motion.tr;
  return (
    <Tr
      layout={!isDragging}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      ref={setNodeRef}
      style={style}
      className={`h-[42px] transition group/row ${
        isDragging ? 'shadow-xl ring-2 ring-monday-blue bg-white' : isSelected ? 'bg-monday-pill' : 'bg-white hover:bg-monday-hover'
      }`}
    >
      {row.getVisibleCells().map((cell, i) => {
        const isDragHandleCell = cell.column.id === 'dragHandler';

        return (
          <td
            key={cell.id}
            className={`align-middle border-b border-r border-monday-border last:border-r-0 p-0 ${
              i === 2 ? 'border-l-8' : ''
            }`}
            style={{
              width: cell.column.getSize(),
              borderLeftColor: i === 2 ? groupColor : undefined,
            }}
          >
            {isDragHandleCell ? (
              // Wrap ONLY the drag handle with the activator refs and listeners
              <div ref={setActivatorNodeRef} {...attributes} {...listeners} className="h-full w-full flex items-center justify-center">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ) : (
              // All other cells render normally — click isolation is handled at the cell level
              flexRender(cell.column.columnDef.cell, cell.getContext())
            )}
          </td>
        );
      })}
    </Tr>
  );
};
