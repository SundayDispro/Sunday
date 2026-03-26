import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useViewport } from '../hooks/useViewport';
import { setGlobalToastHandler } from '../toastGlobal';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  message: string;
  variant?: ToastVariant;
  /** ms; por defecto 4000, o 8000 si hay acción */
  duration?: number;
  action?: ToastAction;
  onExpire?: () => void;
};

interface ToastMessage extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: ((text: string, variant?: ToastVariant) => number) & ((opts: ToastOptions) => number);
  /** Si runExpire es true (por defecto), se llama onExpire antes de quitar (p. ej. confirmar borrado al cerrar). Deshacer debe usar runExpire: false. */
  dismiss: (id: number, opts?: { runExpire?: boolean }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function variantClasses(v: ToastVariant): string {
  switch (v) {
    case 'error':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'success':
      return 'bg-green-50 border-green-200 text-green-800';
    case 'warning':
      return 'bg-amber-50 border-amber-200 text-amber-900';
    default:
      return 'bg-white border-monday-border text-monday-text';
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const { isMobile } = useViewport();

  const dismiss = useCallback((id: number, opts?: { runExpire?: boolean }) => {
    const t = timersRef.current.get(id);
    if (t != null) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    const runExpire = opts?.runExpire !== false;
    setMessages((prev) => {
      const msg = prev.find((m) => m.id === id);
      if (runExpire && msg?.onExpire) {
        try {
          msg.onExpire();
        } catch {
          /* ignore */
        }
      }
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const toastImpl = useCallback((a: string | ToastOptions, maybeVariant?: ToastVariant): number => {
    const opts: ToastOptions =
      typeof a === 'string'
        ? { message: a, variant: maybeVariant ?? 'info' }
        : { ...a, variant: a.variant ?? 'info' };
    const duration =
      opts.duration ??
      (opts.action ? 8000 : 4000);

    const id = ++idRef.current;
    setMessages((prev) => [...prev, { ...opts, id }]);

    const tid = setTimeout(() => {
      timersRef.current.delete(id);
      dismiss(id);
    }, duration);
    timersRef.current.set(id, tid);
    return id;
  }, [dismiss]);

  useEffect(() => {
    setGlobalToastHandler(({ message, variant }) => {
      toastImpl({ message, variant: variant ?? 'error' });
    });
    return () => setGlobalToastHandler(null);
  }, [toastImpl]);

  const value: ToastContextValue = {
    toast: toastImpl as ToastContextValue['toast'],
    dismiss,
  };

  const containerClass = isMobile
    ? 'fixed top-4 left-3 right-3 z-[9999] flex flex-col gap-2 max-w-[100%] pointer-events-none'
    : 'fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-[360px] pointer-events-none';

  const stack = (
    <div className={containerClass} aria-live="polite">
      <div className="flex flex-col gap-2 pointer-events-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`
              flex flex-col gap-2 px-4 py-3 rounded-xl shadow-lg border text-[13px]
              ${variantClasses(m.variant ?? 'info')}
            `}
          >
            <div className="flex items-start gap-3">
              <span className="flex-1 pt-0.5">{m.message}</span>
              <div className="flex items-center gap-1 shrink-0">
                {m.action && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        m.action!.onClick();
                      } catch {
                        /* ignore */
                      }
                      dismiss(m.id, { runExpire: false });
                    }}
                    className="text-[12px] font-semibold text-monday-blue hover:underline px-1"
                  >
                    {m.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(m.id)}
                  className="p-1 rounded hover:bg-black/10 transition-colors shrink-0"
                  aria-label="Cerrar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="h-0.5 w-full rounded-full bg-black/10 overflow-hidden">
              <div
                className="h-full bg-monday-blue/60 origin-left toast-progress-shrink"
                style={
                  {
                    animationDuration: `${m.duration ?? (m.action ? 8000 : 4000)}ms`,
                  } as React.CSSProperties
                }
              />
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-progress-shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        .toast-progress-shrink {
          animation-name: toast-progress-shrink;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
      `}</style>
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' ? createPortal(stack, document.body) : stack}
    </ToastContext.Provider>
  );
}
