import React, { createContext, useCallback, useContext, useState } from 'react';
import { X } from 'lucide-react';

type ToastVariant = 'info' | 'success' | 'error';

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (text: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const idRef = React.useRef(0);

  const toast = useCallback((text: string, variant: ToastVariant = 'info') => {
    const id = ++idRef.current;
    setMessages((prev) => [...prev, { id, text, variant }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-[360px] pointer-events-none"
        aria-live="polite"
      >
        <div className="flex flex-col gap-2 pointer-events-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-[13px] text-monday-text
                ${m.variant === 'error' ? 'bg-red-50 border-red-200 text-red-800' : ''}
                ${m.variant === 'success' ? 'bg-green-50 border-green-200 text-green-800' : ''}
                ${m.variant === 'info' ? 'bg-white border-monday-border' : ''}
              `}
            >
              <span className="flex-1">{m.text}</span>
              <button
                type="button"
                onClick={() => dismiss(m.id)}
                className="p-1 rounded hover:bg-black/10 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
