import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserStatus } from '../types';
import { API_BASE, parseResponse } from '../api';

interface UserContextType {
  currentUser: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUserStatus: (status: UserStatus) => Promise<void>;
  users: User[];
  fetchUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('sunday_user');
    if (saved) setCurrentUser(JSON.parse(saved));
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      const data = await parseResponse<User[]>(res);
      if (data != null) setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch users', e);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await parseResponse<User>(res);
      if (data != null) {
        setCurrentUser(data);
        localStorage.setItem('sunday_user', JSON.stringify(data));
        await fetchUsers();
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
    localStorage.removeItem('sunday_user');
    // Marcar como offline en el backend (fire-and-forget)
    if (userId) {
      fetch(`${API_BASE}/api/users/${userId}/status`, {
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
      const res = await fetch(`${API_BASE}/api/users/${userId}/status`, {
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

  return (
    <UserContext.Provider value={{ currentUser, login, logout, setUserStatus, users, fetchUsers }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
};
