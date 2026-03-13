import React, { useState } from 'react';
import { Item, BoardColumn, ColumnValue, User } from '../../types';
import { socket } from '../../store/socket';
import * as Popover from '@radix-ui/react-popover';
import { useUser } from '../../store/UserContext';
import { UserCircle2 } from 'lucide-react';

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const PersonCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const { users } = useUser();
  const [open, setOpen] = useState(false);

  // Parse current assigned user ID from value (assuming string ID for now)
  const assignedUserId = value?.value;
  const assignedUser = users.find(u => u.id === assignedUserId);

  const handleSelect = (user: User | null) => {
    socket.emit('update_column_value', {
      itemId: item.id,
      columnId: column.id,
      value: user ? user.id : ''
    });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <div
          className="w-full min-h-[38px] flex items-center justify-center cursor-pointer hover:bg-monday-hover transition-colors py-1"
          onClick={e => { e.stopPropagation(); setOpen(true); }}
        >
          {assignedUser ? (
            <div
              className="w-7 h-7 rounded-full text-white text-[11px] flex items-center justify-center font-semibold shadow-monday-sm transition-transform hover:scale-110 flex-shrink-0 leading-none"
              style={{ backgroundColor: assignedUser.color }}
              title={assignedUser.name}
            >
              {assignedUser.initials}
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full border border-dashed border-monday-border text-monday-subtext flex items-center justify-center hover:border-monday-blue hover:text-monday-blue transition-colors flex-shrink-0 [&_svg]:shrink-0">
              <UserCircle2 size={16} strokeWidth={2} aria-hidden />
            </div>
          )}
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-[100] bg-white rounded-xl shadow-monday-lg border border-monday-border w-56 p-2 fade-in box-border"
          sideOffset={5}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-[11px] font-semibold text-monday-subtext mb-2 px-1 uppercase tracking-wider">
            Sugeridos
          </div>
          
          <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar">
            <button
               onClick={() => handleSelect(null)}
               className="w-full flex items-center gap-2.5 px-2 py-1.5 hover:bg-red-50 rounded-monday text-left transition-colors group"
            >
              <div className="w-6 h-6 rounded-full border border-dashed border-monday-red/50 text-monday-red flex items-center justify-center bg-white group-hover:border-monday-red font-bold text-[12px]">
                X
              </div>
              <span className="text-[13px] text-monday-red font-medium">Quitar asignado</span>
            </button>
            
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => handleSelect(u)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 hover:bg-monday-hover rounded-monday text-left transition-colors"
              >
                <div 
                  className="w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center font-semibold shadow-sm shrink-0"
                  style={{ backgroundColor: u.color }}
                >
                  {u.initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] text-monday-text font-medium truncate leading-tight">{u.name}</span>
                  <span className="text-[11px] text-monday-subtext truncate leading-tight">@{u.username}</span>
                </div>
              </button>
            ))}
          </div>

        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
