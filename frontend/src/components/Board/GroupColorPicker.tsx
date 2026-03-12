import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

/** Paleta tipo Monday: verdes, azules, teal, morados, amarillos, rojos, rosas, naranja, marrón, grises (4x5). Exportada para usar al crear grupos. */
export const GROUP_PALETTE = [
  '#00c875', '#7fba00', '#e6e600', '#f5ca00', '#6b8c00',
  '#579bfc', '#0073ea', '#00c2e0', '#2ee5c7', '#5559df',
  '#c377e0', '#ff5ac4', '#ffcb00', '#ff9d00', '#e2445c',
  '#b57900', '#7f5347', '#42526e', '#8993a4', '#c4c4c4',
];

export interface GroupColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Tamaño del cuadrado indicador (ej. 'w-4 h-4') */
  swatchClassName?: string;
  /** Si true, el popover se alinea debajo del trigger */
  align?: 'start' | 'center' | 'end';
}

export const GroupColorPicker: React.FC<GroupColorPickerProps> = ({
  value,
  onChange,
  swatchClassName = 'w-4 h-4',
  align = 'start',
}) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (color: string) => {
    onChange(color);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`${swatchClassName} rounded shrink-0 border border-monday-border hover:ring-2 hover:ring-monday-blue/40 transition-shadow cursor-pointer flex-shrink-0`}
          style={{ backgroundColor: value || '#c4c4c4' }}
          title="Cambiar color del grupo"
          onClick={e => e.stopPropagation()}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border p-1.5 fade-in box-border"
          sideOffset={6}
          side="bottom"
          align={align}
          onClick={e => e.stopPropagation()}
        >
          <div className="grid grid-cols-5 gap-0.5 w-[132px]">
            {GROUP_PALETTE.map(color => (
              <button
                key={color}
                type="button"
                className="w-5 h-5 rounded-sm border border-monday-border/60 transition-all hover:scale-110 focus:outline-none focus:ring-1 focus:ring-monday-blue"
                style={{
                  backgroundColor: color,
                  borderColor: value === color ? '#401694' : 'transparent',
                }}
                onClick={() => handleSelect(color)}
                title={color}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
