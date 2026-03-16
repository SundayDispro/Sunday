import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserStatus } from '../types';
import { API_BASE, apiFetch, buildAuthHeaders, clearAuthStorage, parseResponse } from '../api';

interface UserContextType {
  currentUser: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUserStatus: (status: UserStatus) => Promise<void>;
  users: User[];
  fetchUsers: () => Promise<void>;
  ensurePushSubscription: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const savedUser = localStorage.getItem('sunday_user');
    if (savedUser) setCurrentUser(JSON.parse(savedUser));
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/users`);
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

  const ensurePushSubscription = async () => {
    try {
      if (!currentUser) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      let subscription = existingSub;

      if (!subscription) {
        const vapidKey = await getVapidPublicKey();
        if (!vapidKey) return;
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      if (subscription) {
        await apiFetch(`${API_BASE}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, subscription }),
        });
      }
    } catch (e) {
      console.error('Error asegurando suscripción push', e);
    }
  };

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
        await fetchUsers();
        await ensurePushSubscription();
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
      fetch(`${API_BASE}/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
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
      const res = await fetch(`${API_BASE}/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
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

  return (
    <UserContext.Provider value={{ currentUser, login, logout, setUserStatus, users, fetchUsers, ensurePushSubscription }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
};
