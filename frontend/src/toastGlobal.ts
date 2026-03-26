/** Evita dependencias circulares: api.ts notifica errores sin importar React/Toast. */

export type GlobalToastPayload = {
  message: string;
  variant?: 'info' | 'success' | 'error' | 'warning';
};

type GlobalToastFn = (p: GlobalToastPayload) => void;

let globalToast: GlobalToastFn | null = null;

export function setGlobalToastHandler(fn: GlobalToastFn | null): void {
  globalToast = fn;
}

export function notifyGlobalToast(p: GlobalToastPayload): void {
  globalToast?.(p);
}
