import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { UserProvider } from './store/UserContext.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { AppTooltipProvider } from './components/AppTooltip.tsx';

const enableServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js?v=10', { updateViaCache: 'none' })
        .then((registration) => {
          // Revisar actualizaciones cada 1 hora
          setInterval(() => {
            registration.update();
          }, 1000 * 60 * 60);

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    // Hay una nueva versión instalada y lista para ser activada (por skipWaiting)
                    console.log('Nueva versión disponible. Recargando...');
                  }
                }
              };
            }
          };
        })
        .catch((err) => console.error('Error registrando service worker:', err));
    });

    // Escuchar cuando el nuevo SW tome el control (gracias a skipWaiting + claim)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
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
        <AppTooltipProvider>
          <App />
        </AppTooltipProvider>
      </ToastProvider>
    </UserProvider>
  </StrictMode>
);
