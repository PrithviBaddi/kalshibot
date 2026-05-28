'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearAccessToken, fetchMe, login as authLogin, register as authRegister, type AuthUser } from '@/lib/auth';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await fetchMe();
        if (active) setUser(me);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authLogin(email, password);
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const u = await authRegister(email, password);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, login, register, logout }),
    [user, loading, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
