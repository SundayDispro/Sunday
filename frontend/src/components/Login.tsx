import React, { useState } from 'react';
import { useUser } from '../store/UserContext';
import { ArrowRight } from 'lucide-react';
import { AnimatedLogo } from './AnimatedLogo';

type LoginProps = {
  theme: 'light' | 'dark' | 'night' | 'dawn' | 'fog' | 'plum' | 'ember';
};

const LOGIN_LOGO_COLORS: Record<LoginProps['theme'], string> = {
  light: '#222221',
  dark: '#f8fafc',
  night: '#f8fafc',
  dawn: '#23150a',
  fog: '#111111',
  plum: '#f3e9ff',
  ember: '#23150a',
};

const LOGIN_CARD_CLASS: Record<LoginProps['theme'], string> = {
  light: 'bg-white',
  dark: 'bg-[#1f2937]',
  night: 'bg-[#141414]',
  dawn: 'bg-[#d4c4ab]',
  fog: 'bg-[#a3a3a3]',
  plum: 'bg-[#1b1026]',
  ember: 'bg-[#ff8a00]',
};

export const Login: React.FC<LoginProps> = ({ theme }) => {
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
    <div className="min-h-screen bg-[#1a0828] flex items-center justify-center p-4 font-sans overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.04),transparent_24%)]" />

      <div className={`relative w-full max-w-[1120px] min-h-[520px] rounded-[30px] border border-white/10 bg-[#241036]/95 shadow-[0_30px_90px_rgba(0,0,0,0.4)] overflow-hidden ${LOGIN_CARD_CLASS[theme]}`}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_28%)]" />
        <div className="relative z-10 grid min-h-[520px] lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative flex items-center justify-center px-8 py-10 lg:px-12">
            <div className="w-full max-w-[390px]">
              <div className="rounded-[26px] border border-white/10 bg-white/[0.03] px-8 py-9 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <AnimatedLogo size={250} color={LOGIN_LOGO_COLORS[theme]} />
              </div>
            </div>
          </div>

          <div className="relative flex items-center px-7 py-8 lg:px-10">
            <div className="w-full max-w-[390px]">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60 bg-white/5 border border-white/10">
                Sunday
              </span>
              <h1 className="mt-4 text-[38px] leading-[1.05] font-medium tracking-tight text-white">
                Bienvenido
                <br />
                a Sunday
              </h1>
              <p className="mt-4 max-w-[270px] text-[13px] leading-5 text-white/70">
                Una ventana simple, horizontal y limpia. El logo vive a la izquierda y el acceso a la derecha.
              </p>

              <div className="mt-8 h-px w-full bg-white/10" />

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                {error && (
                  <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-100">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[12px] text-white/80">usuario:</label>
                  <input
                    type="text"
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Ej. tu_usuario"
                    className="h-11 w-full rounded-[10px] border border-white/10 bg-white text-[#2a1c33] px-3 text-[14px] outline-none focus:border-[#7d63ff]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] text-white/80">contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-[10px] border border-white/10 bg-white text-[#2a1c33] px-3 text-[14px] outline-none focus:border-[#7d63ff]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 h-11 w-full rounded-[10px] bg-[#2088ff] text-white font-medium hover:bg-[#1b78e8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? 'Entrando...' : 'Continuar'}
                  {!loading && <ArrowRight size={15} />}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
