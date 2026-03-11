import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface UserContextType {
  currentUser: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
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
      const res = await fetch('http://localhost:3001/api/users');
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error('Failed to fetch users', e);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user);
        localStorage.setItem('sunday_user', JSON.stringify(user));
        await fetchUsers();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Autenticación fallida');
      }
    } catch (e) {
      console.error('Login failed', e);
      throw e;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('sunday_user');
  };

  return (
    <UserContext.Provider value={{ currentUser, login, logout, users, fetchUsers }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
};
