import React, { useState } from 'react';
import { useUser } from '../store/UserContext';
import { ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor llena ambos campos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password.trim());
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-monday-bg flex items-center justify-center p-4 font-sans">
      <div className="max-w-[400px] w-full bg-white rounded-2xl shadow-monday-lg border border-monday-border p-8 fade-in">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo.png"
            alt="Sunday"
            className="w-20 h-20 mb-4 object-contain"
          />
          <h1 className="text-2xl font-bold text-monday-text text-center">Bienvenido a Sunday</h1>
          <p className="text-[14px] text-monday-subtext text-center mt-2">Ingresa tus datos para continuar a tu espacio de trabajo.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-monday-red text-[13px] font-medium text-center">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-monday-text ml-1">Usuario</label>
            <input
              type="text"
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ej. tu_usuario"
              className="w-full h-10 px-3 py-2 text-[14px] border border-monday-border rounded-lg outline-none focus:border-monday-blue hover:border-monday-subtext transition-colors bg-monday-bg text-monday-text"
            />
          </div>

          <div className="flex flex-col gap-1.5 mb-2">
            <label className="text-[13px] font-semibold text-monday-text ml-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3 py-2 text-[14px] border border-monday-border rounded-lg outline-none focus:border-monday-blue hover:border-monday-subtext transition-colors bg-monday-bg text-monday-text"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 flex items-center justify-center gap-2 bg-monday-blue text-white rounded-lg font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Continuar'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
};
