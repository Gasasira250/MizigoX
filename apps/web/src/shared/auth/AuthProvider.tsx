import type { LoginResponse, SessionUser } from '@mizigox/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, refreshAccessToken, setAccessToken } from '../api/client';

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: {
    token: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const token = await refreshAccessToken();
      if (!token) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }

      try {
        const session = await apiGet<{ user: SessionUser }>('/auth/me');
        if (!cancelled) {
          setUser(session.user);
        }
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      login: async (email: string, password: string) => {
        const result = await apiPost<LoginResponse>('/auth/login', { email, password });
        setAccessToken(result.accessToken);
        setUser(result.user);
        return result.user;
      },
      register: async (input) => {
        const result = await apiPost<LoginResponse>('/auth/register', input);
        setAccessToken(result.accessToken);
        setUser(result.user);
        return result.user;
      },
      logout: async () => {
        try {
          await apiPost('/auth/logout');
        } finally {
          setAccessToken(null);
          setUser(null);
        }
      },
    }),
    [ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
