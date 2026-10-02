import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setSessionExpiredHandler, tokenStore } from '../services/api.js';

const AuthContext = createContext(null);

export const ROLE_HOME = {
  admin: '/admin',
  manager: '/manager',
  trainer: '/trainer',
  learner: '/dashboard',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | authenticated | guest

  const applySession = useCallback((data) => {
    tokenStore.set(data.accessToken);
    setUser(data.user);
    setPermissions(data.permissions || []);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setPermissions([]);
    setStatus('guest');
  }, []);

  // Restore the session on load using the httpOnly refresh cookie.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    api
      .refresh()
      .then(applySession)
      .catch(clearSession);
  }, [applySession, clearSession]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    applySession(data);
    return data.user;
  }, [applySession]);

  const register = useCallback(async (values) => {
    const { data } = await api.post('/auth/register', values);
    applySession(data);
    return data.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const updateUser = useCallback((u) => setUser(u), []);

  const can = useCallback(
    (perm) => permissions.includes('*') || permissions.includes(perm),
    [permissions],
  );

  const value = useMemo(
    () => ({ user, status, permissions, can, login, register, logout, updateUser, applySession, isAuthenticated: status === 'authenticated' }),
    [user, status, permissions, can, login, register, logout, updateUser, applySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
