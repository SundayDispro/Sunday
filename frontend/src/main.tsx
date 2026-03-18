import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { UserProvider } from './store/UserContext.tsx';
import { ToastProvider } from './components/Toast.tsx';

const enableServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.error('Error registrando service worker:', err));
    });
  }
};

enableServiceWorker();

// Evitar que errores de iframes de terceros (Google, etc.) disparen el overlay de error de React en desarrollo.
// React Refresh se engancha a window.onerror; si dejamos pasar estos errores cross‑origin, tapa toda la UI con un screen morado.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as EventTarget | null;
      if (target instanceof HTMLIFrameElement) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </UserProvider>
  </StrictMode>
);
