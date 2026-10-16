import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setSessionExpiredHandler, tokenStore } from '../services/api.js';

const AuthContext = createContext(null);

const EXPLICIT_ONLY = new Set(['trainers:review', 'courses:review']);

export const ROLE_HOME = {
  admin: '/admin',
  manager: '/dashboard', // retired role: falls back to the learner area
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

  // `identifier` is an email address or a mobile number.
  const login = useCallback(async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    applySession(data);
    return data.user;
  }, [applySession]);

  // Registration returns a session unless email verification is enforced.
  const finishRegistration = useCallback((data) => {
    if (data.accessToken) applySession(data);
    return data;
  }, [applySession]);

  const register = useCallback(async (values) => {
    const { data } = await api.post('/auth/register', values);
    return finishRegistration(data);
  }, [finishRegistration]);

  /** Re-reads the session (e.g. after a trainer application is approved). */
  const refreshSession = useCallback(async () => {
    const data = await api.refresh();
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
    // Mirrors the API: the admin wildcard does not include operational approvals.
    (perm) => permissions.includes(perm) || (permissions.includes('*') && !EXPLICIT_ONLY.has(perm)),
    [permissions],
  );

  const value = useMemo(
    () => ({ user, status, permissions, can, login, register, refreshSession, logout, updateUser, applySession, isAuthenticated: status === 'authenticated' }),
    [user, status, permissions, can, login, register, refreshSession, logout, updateUser, applySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
