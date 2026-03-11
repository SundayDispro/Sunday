import React, { useState } from 'react';
import { User } from '../types';
import { useUser } from '../store/UserContext';
import { X, Plus, ShieldAlert } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AdminUsersPanel: React.FC<Props> = ({ open, onOpenChange }) => {
  const { currentUser, users, fetchUsers } = useUser();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'VENTAS' | 'DISENO' | 'TALLER'>('VENTAS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Security fallback, theoretically the button shouldn't exist if not admin
  if (currentUser?.role !== 'ADMIN') return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !name.trim() || !password.trim()) {
      setError('Por favor llena todos los campos');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch('http://localhost:3001/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password, adminId: currentUser.id, role })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear usuario');
      }

      setSuccess(true);
      setUsername('');
      setName('');
      setPassword('');
      fetchUsers(); // Refresh the list
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[100] fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 w-[500px] z-[101] zoom-in">
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ShieldAlert className="text-monday-blue" size={24} />
              <Dialog.Title className="text-lg font-bold text-monday-text">Gestión de Usuarios</Dialog.Title>
            </div>
            <Dialog.Close className="text-monday-subtext hover:text-monday-text transition-colors">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-6">
            
            {/* Create User Form */}
            <div className="flex flex-col border-r border-monday-border pr-6">
              <h3 className="text-[14px] font-bold text-monday-text mb-4">Crear nuevo usuario</h3>
              
              <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-monday-text ml-1">Nombre</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full h-8 px-2 py-1 text-[13px] border border-monday-border rounded bg-monday-bg outline-none focus:border-monday-blue transition-colors"
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-monday-text ml-1">Usuario</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Ej. juan"
                    className="w-full h-8 px-2 py-1 text-[13px] border border-monday-border rounded bg-monday-bg outline-none focus:border-monday-blue transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-monday-text ml-1">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-8 px-2 py-1 text-[13px] border border-monday-border rounded bg-monday-bg outline-none focus:border-monday-blue transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1 mb-2">
                  <label className="text-[12px] font-semibold text-monday-text ml-1">Rol</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as 'ADMIN' | 'VENTAS' | 'DISENO' | 'TALLER')}
                    className="w-full h-8 px-2 py-1 text-[13px] border border-monday-border rounded bg-monday-bg outline-none focus:border-monday-blue transition-colors"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="VENTAS">Ventas</option>
                    <option value="DISENO">Diseño</option>
                    <option value="TALLER">Taller</option>
                  </select>
                </div>

                {error && <div className="text-[12px] text-monday-red font-medium">{error}</div>}
                {success && <div className="text-[12px] text-monday-green font-medium">Usuario creado con éxito</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-8 bg-monday-blue text-white rounded text-[13px] font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-1 mt-auto"
                >
                  <Plus size={14} />
                  {loading ? 'Creando...' : 'Crear Usuario'}
                </button>
              </form>
            </div>

            {/* User List */}
            <div className="flex flex-col">
              <h3 className="text-[14px] font-bold text-monday-text mb-4">Usuarios ({users.length})</h3>
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[250px] custom-scrollbar pr-2">
                {users.map(user => (
                  <div key={user.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-monday-bg transition-colors border border-transparent hover:border-monday-border">
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.initials}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-[13px] text-monday-text font-medium truncate leading-tight">{user.name}</span>
                      <div className="flex items-center gap-1">
                        {user.role === 'ADMIN' && (
                          <span className="text-[9px] bg-monday-orange text-white px-1 py-0.5 rounded-sm font-bold leading-none mt-0.5">ADMIN</span>
                        )}
                        {user.role === 'VENTAS' && (
                          <span className="text-[9px] bg-green-600 text-white px-1 py-0.5 rounded-sm font-bold leading-none mt-0.5">VENTAS</span>
                        )}
                        {user.role === 'DISENO' && (
                          <span className="text-[9px] bg-purple-600 text-white px-1 py-0.5 rounded-sm font-bold leading-none mt-0.5">DISEÑO</span>
                        )}
                        {user.role === 'TALLER' && (
                          <span className="text-[9px] bg-monday-blue text-white px-1 py-0.5 rounded-sm font-bold leading-none mt-0.5">TALLER</span>
                        )}
                        {user.role === 'USER' && (
                          <span className="text-[9px] bg-monday-hover text-monday-subtext px-1 py-0.5 rounded-sm font-bold leading-none mt-0.5">USER</span>
                        )}
                        <span className="text-[11px] text-monday-subtext truncate leading-tight">{user.username}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
