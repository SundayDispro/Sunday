import React, { useEffect } from 'react';
import { Users, UserCircle2 } from 'lucide-react';
import { User } from '../../types';
import { useUser } from '../../store/UserContext';

export const TeamPage: React.FC = () => {
  const { users, fetchUsers } = useUser();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-monday-border">
        <h1 className="text-[20px] font-semibold text-monday-text flex items-center gap-2">
          <Users size={22} className="text-monday-blue" />
          Equipo
        </h1>
        <p className="text-[13px] text-monday-subtext mt-1">
          Miembros del workspace ({users.length})
        </p>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-monday-subtext">
            <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4">
              <UserCircle2 size={28} className="opacity-60" />
            </div>
            <p className="text-[14px]">No hay miembros cargados.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {users.map((u: User) => (
              <li
                key={u.id}
                className="flex items-center gap-4 p-4 rounded-monday bg-white border border-monday-border hover:border-monday-blue/30 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-full text-white text-sm font-semibold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: u.color }}
                >
                  {u.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-monday-text truncate">{u.name}</p>
                  <p className="text-[12px] text-monday-subtext truncate">@{u.username}</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                  u.role === 'VENTAS' ? 'bg-green-100 text-green-700' :
                  u.role === 'DISENO' ? 'bg-purple-100 text-purple-600' :
                  u.role === 'TALLER' ? 'bg-blue-100 text-blue-700' :
                  'bg-monday-hover text-monday-subtext'
                }`}>
                  {u.role === 'ADMIN' ? 'Admin' : u.role === 'VENTAS' ? 'Ventas' : u.role === 'DISENO' ? 'Diseño' : u.role === 'TALLER' ? 'Taller' : 'Usuario'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
