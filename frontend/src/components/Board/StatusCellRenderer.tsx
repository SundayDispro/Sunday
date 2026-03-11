import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue, StatusSettings } from '../../types';
import * as Popover from '@radix-ui/react-popover';
import { socket } from '../../store/socket';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const StatusCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const settings: StatusSettings = column.settings ? JSON.parse(column.settings) : { options: [] };
  const currentOptionId = value?.value ? JSON.parse(value.value).optionId : 'default';
  const currentOption = settings.options.find(o => o.id === currentOptionId) || { label: '', color: '#c4c4c4', id: 'default' };

  const [open, setOpen] = useState(false);

  const handleSelect = (optionId: string) => {
    socket.emit('update_column_value', {
      itemId: item.id,
      columnId: column.id,
      value: JSON.stringify({ optionId })
    });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="w-full h-full min-h-[42px] flex items-center justify-center text-white text-[13px] font-medium transition hover:brightness-110 relative group/cell"
          style={{ backgroundColor: currentOption.color }}
        >
           {currentOption.label}
           {/* Fold corner effect on hover, typical of Monday */}
           <div className="absolute top-0 right-0 w-3 h-3 bg-black/10 opacity-0 group-hover/cell:opacity-100 transition" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>
        </button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content
          className="z-50 bg-white p-3 rounded-md shadow-2xl border border-monday-border w-[220px] flex flex-col gap-1.5"
          sideOffset={2}
          align="center"
        >
          {settings.options.map(opt => (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              className="w-full text-center py-1.5 text-white text-[13px] font-medium hover:opacity-90 transition rounded-[2px]"
              style={{ backgroundColor: opt.color }}
            >
              {opt.label || '\u00A0'}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
