import React, { useState, useEffect } from 'react';
import { useUser } from '../store/UserContext';
import { ArrowRight } from 'lucide-react';
import { AnimatedLogo } from './AnimatedLogo';

type LoginProps = {
  theme: 'light' | 'dark' | 'night' | 'dawn' | 'fog' | 'plum' | 'ember';
  layout?: 'horizontal' | 'vertical';
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

/* Tiempo tras el cual se pasa a idle (≥ duración de entrada del logo) */
const LOGIN_LOGO_ENTER_MS = 900;

const INPUT_BASE_CLASS =
  /* iOS/Safari: evitar zoom automático en inputs (>=16px en móvil) */
  'h-10 w-full rounded-[12px] border border-white/10 bg-black/15 text-white placeholder:text-white/40 px-3.5 text-[16px] sm:text-[14px] outline-none ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px] ' +
  'focus:border-[#7d63ff]/65 focus:bg-black/20 focus:shadow-[0_0_0_4px_rgba(125,99,255,0.16),0_10px_26px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)] ' +
  'transition-[border-color,box-shadow,background-color] duration-160';

const INPUT_LIGHT_CLASS =
  /* iOS/Safari: evitar zoom automático en inputs (>=16px en móvil) */
  'h-10 w-full rounded-[12px] border border-black/10 bg-white text-[#2a1c33] placeholder:text-[#2a1c33]/45 px-3.5 text-[16px] sm:text-[14px] outline-none ' +
  'shadow-[0_10px_22px_rgba(0,0,0,0.08)] ' +
  'focus:border-[#6d28d9]/45 focus:shadow-[0_0_0_4px_rgba(109,40,217,0.14),0_14px_30px_rgba(0,0,0,0.12)] ' +
  'transition-[border-color,box-shadow,background-color] duration-160';

export const Login: React.FC<LoginProps> = ({ theme, layout = 'horizontal' }) => {
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoEntered, setLogoEntered] = useState(false);

  useEffect(() => {
    // Mensaje consistente al redirigir por 401 (sesión expirada).
    try {
      const reason = sessionStorage.getItem('logout_reason');
      if (reason === 'session_expired') {
        setError('Tu sesión expiró. Inicia sesión nuevamente.');
        sessionStorage.removeItem('logout_reason');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setLogoEntered(true), LOGIN_LOGO_ENTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  const verticalIsDark = theme === 'dark' || theme === 'night' || theme === 'plum';
  const verticalCardClass = verticalIsDark
    ? 'relative w-full max-w-[430px] rounded-[22px] border border-white/10 bg-[#12091a] shadow-[0_28px_72px_rgba(0,0,0,0.55)] overflow-hidden'
    : 'relative w-full max-w-[430px] rounded-[22px] border border-black/10 bg-[#fbf7ef] shadow-[0_28px_72px_rgba(0,0,0,0.28)] overflow-hidden';
  const verticalBgOverlayClass = verticalIsDark
    ? 'absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_40%)]'
    : 'absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(91,33,182,0.10),transparent_42%),linear-gradient(180deg,rgba(0,0,0,0.02),transparent_40%)]';
  const verticalCurveFill = verticalIsDark ? '#12091a' : '#fbf7ef';
  const verticalLogoColor = verticalIsDark ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.92)';
  const verticalTitleTopClass = verticalIsDark ? 'text-white' : 'text-[#5b21b6]';
  const verticalTitleBottomClass = verticalIsDark ? 'text-white/90' : 'text-[#2a1c33]';
  const verticalLabelClass = verticalIsDark ? 'text-white/70' : 'text-[#5b21b6]/80';
  const verticalInputClass = verticalIsDark
    ? `${INPUT_BASE_CLASS} text-white`
    : `${INPUT_LIGHT_CLASS} text-[#2a1c33]`;
  const verticalButtonClass = verticalIsDark
    ? 'mt-1 h-10 w-full rounded-[12px] bg-white text-[#12091a] font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_14px_34px_rgba(255,255,255,0.14)]'
    : 'mt-1 h-10 w-full rounded-[12px] bg-[#5b21b6] text-white font-semibold hover:bg-[#6d28d9] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_14px_34px_rgba(91,33,182,0.28)]';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor llena ambos campos.');
      return;
    }
    // En móvil (especialmente iOS), forzar blur evita que el zoom del input persista tras navegar/loguear.
    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
    } catch {
      // ignore
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

      {/* Skin vertical inspirado en referencia: tarjeta clara + header degradado + separador curvo */}
      <div
        className={
          layout === 'vertical'
            ? verticalCardClass
            : `relative w-full max-w-[460px] rounded-[22px] border border-white/10 bg-[#241036]/92 shadow-[0_22px_58px_rgba(0,0,0,0.36)] overflow-hidden ${LOGIN_CARD_CLASS[theme]}`
        }
      >
        <div
          className={
            layout === 'vertical'
              ? verticalBgOverlayClass
              : 'absolute inset-0 bg-[radial-gradient(circle_at_18%_30%,rgba(255,255,255,0.06),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_28%)]'
          }
        />

        {layout === 'vertical' ? (
          <div className="relative z-10">
            <div className="relative h-[270px] bg-[radial-gradient(circle_at_20%_20%,#ff4aa8,transparent_55%),radial-gradient(circle_at_80%_15%,#7c3aed,transparent_58%),radial-gradient(circle_at_60%_85%,#ffb100,transparent_55%),linear-gradient(135deg,#ff2f7d,#6d28d9,#ffb100)]">
              <div className="absolute inset-x-0 top-0 p-5 flex items-start justify-between gap-4">
                <h1 className={`text-left text-[44px] leading-[1.02] font-semibold tracking-tight ${verticalTitleTopClass}`}>
                  Bienvenido
                  <br />
                  <span className={verticalTitleBottomClass}>a Sunday</span>
                </h1>
                <div className={`shrink-0 ${logoEntered ? 'login-logo-idle' : 'login-logo-enter'}`} aria-hidden="true">
                  <AnimatedLogo size={34} color={verticalLogoColor} />
                </div>
              </div>
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute -bottom-px left-0 w-full h-[56px]">
                <path d="M0,12 C22,28 78,28 100,12 L100,30 L0,30 Z" fill={verticalCurveFill} />
              </svg>
            </div>

            <div className="px-5 pb-6 pt-3">
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 max-w-[300px] mx-auto">
              {error && (
                <div className={`rounded-lg border px-3 py-2 text-[12px] ${verticalIsDark ? 'border-red-400/25 bg-red-500/10 text-red-100' : 'border-red-500/20 bg-red-500/10 text-red-800'}`}>
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className={`text-[12px] font-medium ${verticalLabelClass}`}>usuario:</label>
                <input
                  type="text"
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Ej. tu_usuario"
                  className={verticalInputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={`text-[12px] font-medium ${verticalLabelClass}`}>contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={verticalInputClass}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className={verticalButtonClass}
              >
                {loading ? 'Entrando...' : 'Continuar'}
                {!loading && <ArrowRight size={15} />}
              </button>
            </form>
            </div>
          </div>
        ) : (
          <div className="relative z-10 grid lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative px-6 py-7 lg:px-7 lg:py-8 flex items-center justify-center">
              <div className="absolute inset-0 bg-white/[0.02]" />
              <div className="absolute top-0 bottom-0 right-0 w-px bg-white/10 hidden lg:block" />
              <div className={`relative flex items-center justify-center min-h-[190px] ${logoEntered ? 'login-logo-idle' : 'login-logo-enter'}`} aria-hidden="true">
                <AnimatedLogo size={190} color={LOGIN_LOGO_COLORS[theme]} />
              </div>
            </div>

            <div className="px-6 py-7 lg:px-7 lg:py-8 flex flex-col justify-center">
              <h1 className="text-[28px] lg:text-[34px] leading-[1.05] font-medium tracking-tight text-white">
                Bienvenido
                <br />
                a Sunday
              </h1>

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
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
                    className={INPUT_BASE_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-white/80">contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={INPUT_BASE_CLASS}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 h-10 w-full rounded-[12px] bg-[#2088ff] text-white font-medium hover:bg-[#1b78e8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(32,136,255,0.22)]"
                >
                  {loading ? 'Entrando...' : 'Continuar'}
                  {!loading && <ArrowRight size={15} />}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
