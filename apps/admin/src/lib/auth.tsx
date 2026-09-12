import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { can as roleCan, type Permission } from '@avida/types';
import { ApiError, get, post } from './api';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  twoFactor: boolean;
  permissions: Permission[];
}

interface AuthState {
  user: Me | null;
  checking: boolean;
  /** The API is the authority; this only decides what to show (§45). */
  can: (p: Permission) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: Me | null) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await get<Me>('/admin/me'));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSignedOut = () => setUser(null);
    window.addEventListener('admin:signed-out', onSignedOut);
    return () => window.removeEventListener('admin:signed-out', onSignedOut);
  }, [refresh]);

  const signOut = useCallback(async () => {
    await post('/admin/auth/logout').catch(() => undefined);
    setUser(null);
  }, []);

  const can = useCallback((p: Permission) => roleCan(user?.role, p), [user]);

  return <Ctx.Provider value={{ user, checking, can, refresh, signOut, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
