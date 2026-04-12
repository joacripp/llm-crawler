import { useState, useCallback } from 'react';
import { api } from '../api.js';

interface User { id: string; email: string; }

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const signup = useCallback(async (email: string, password: string) => {
    const result = await api.signup(email, password); setUser(result); return result;
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password); setUser(result); return result;
  }, []);
  const logout = useCallback(async () => { await api.logout(); setUser(null); }, []);
  return { user, signup, login, logout, isAuthenticated: !!user };
}
