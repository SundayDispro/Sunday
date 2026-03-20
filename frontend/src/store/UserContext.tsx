import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserStatus } from '../types';
import { API_BASE, apiFetch, buildAuthHeaders, clearAuthStorage, parseResponse } from '../api';
import { reconnectSocketWithAuth } from './socket';

interface UserContextType {
  currentUser: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUserStatus: (status: UserStatus) => Promise<void>;
  updateAvatar: (file: File) => Promise<void>;
  users: User[];
  fetchUsers: () => Promise<void>;
  ensurePushSubscription: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('sunday_user');
      const savedToken = localStorage.getItem('sunday_token');
      if (savedUser && savedToken) {
        return JSON.parse(savedUser) as User;
      }

      // Estado inconsistente: limpiar sesión almacenada para evitar parpadeos de login/app
      localStorage.removeItem('sunday_user');
      localStorage.removeItem('sunday_token');
      return null;
    } catch {
      return null;
    }
  });
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/users`);
      // Sin sesión es normal recibir 401; no spamear consola en la pantalla de login.
      if (res.status === 401) return;
      const data = await parseResponse<User[]>(res);
      if (data != null) setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch users', e);
    }
  };

  const getVapidPublicKey = async (): Promise<string | null> => {
    try {
      const res = await apiFetch(`${API_BASE}/api/push/public-key`);
      const data = await parseResponse<{ publicKey: string }>(res);
      if (data && data.publicKey) return data.publicKey;
    } catch (e) {
      console.error('Error obteniendo VAPID public key', e);
    }
    return null;
  };

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const ensurePushSubscription = async (opts?: { allowRequestPermission?: boolean }) => {
    try {
      if (!currentUser) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        try {
          localStorage.setItem('sunday_push_last_error', 'Push no soportado (serviceWorker/PushManager/Notification faltan).');
        } catch {/* ignore */}
        return;
      }

      const allowRequestPermission = opts?.allowRequestPermission ?? true;

      // iOS Safari solo permite Web Push en contextos seguros (HTTPS) y con PWA instalada.
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        try {
          localStorage.setItem('sunday_push_last_error', 'Push requiere contexto seguro (HTTPS) y PWA instalada.');
        } catch {/* ignore */}
        console.warn('[push] isSecureContext=false; Web Push no funcionará en Safari.');
        return;
      }

      // Verificamos el estado antes de pedir permiso: si ya está "granted", no re-preguntamos.
      // Si está "default", solicitamos permiso solo cuando el usuario abre la app en modo PWA.
      const permission = Notification.permission;
      if (permission === 'denied') return;
      if (permission === 'default' && allowRequestPermission) {
        const next = await Notification.requestPermission();
        if (next !== 'granted') return;
      }
      if (Notification.permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      let subscription = existingSub;

      if (!subscription) {
        const vapidKey = await getVapidPublicKey();
        if (!vapidKey) return;
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as any,
        });
      }

      if (subscription) {
        await apiFetch(`${API_BASE}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, subscription }),
        });
      }

      // Depuración: confirmar que backend ve la suscripción.
      try {
        const statusRes = await apiFetch(`${API_BASE}/api/push/status`);
        if (statusRes.ok) {
          const status = await statusRes.json();
          // eslint-disable-next-line no-console
          console.log('[push] status', status);
        }
      } catch {
        // ignore
      }
    } catch (e) {
      console.error('Error asegurando suscripción push', e);
      try {
        localStorage.setItem('sunday_push_last_error', String(e));
      } catch {/* ignore */}
    }
  };

  // Al abrir la app como PWA (standalone), verificamos el estado de push y activamos suscripción si hace falta.
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    try {
      // Intentar suscribir a notificaciones push incluso si no es PWA standalone (útil en web también)
      // Pero solo pedir permiso explícito si es PWA o si el usuario interactúa
      const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone === true;
      ensurePushSubscription({ allowRequestPermission: standalone });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await parseResponse<{ user: User; token: string }>(res);
      if (data != null) {
        setCurrentUser(data.user);
        localStorage.setItem('sunday_user', JSON.stringify(data.user));
        localStorage.setItem('sunday_token', data.token);
        reconnectSocketWithAuth();
        await fetchUsers();
        // Login sí cuenta como "gesto" para pedir permiso si hace falta.
        await ensurePushSubscription({ allowRequestPermission: true });
      }
      // Si !res.ok, parseResponse ya lanzó con el mensaje de error
    } catch (e) {
      console.error('Login failed', e);
      throw e;
    }
  };

  const logout = () => {
    const userId = currentUser?.id;
    setCurrentUser(null);
    clearAuthStorage();
    // Marcar como offline en el backend (fire-and-forget)
    if (userId) {
      apiFetch(`${API_BASE}/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'offline' }),
      }).catch(() => {});
    }
  };

  const setUserStatus = async (status: UserStatus) => {
    const userId = currentUser?.id;
    if (!userId) return;
    const prevUser = currentUser;
    setCurrentUser((u) => (u ? { ...u, status } : null));
    localStorage.setItem('sunday_user', JSON.stringify({ ...currentUser, status }));
    try {
      const res = await apiFetch(`${API_BASE}/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const updated = await parseResponse<User>(res);
      if (updated != null) {
        setCurrentUser(updated);
        localStorage.setItem('sunday_user', JSON.stringify(updated));
        await fetchUsers();
      } else {
        setCurrentUser(prevUser);
        localStorage.setItem('sunday_user', JSON.stringify(prevUser));
      }
    } catch (e) {
      console.error('Failed to update status', e);
      setCurrentUser(prevUser);
      localStorage.setItem('sunday_user', JSON.stringify(prevUser));
    }
  };

  const updateAvatar = async (file: File) => {
    const userId = currentUser?.id;
    if (!userId) return;
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await apiFetch(`${API_BASE}/api/users/${userId}/avatar`, {
      method: 'PATCH',
      body: formData,
    });
    const updated = await parseResponse<User>(res);
    if (updated != null) {
      setCurrentUser(updated);
      localStorage.setItem('sunday_user', JSON.stringify(updated));
      await fetchUsers();
    }
  };

  return (
    <UserContext.Provider value={{ currentUser, login, logout, setUserStatus, updateAvatar, users, fetchUsers, ensurePushSubscription }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
};
