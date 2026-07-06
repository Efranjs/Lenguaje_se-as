import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchAuthMe, fetchLogin, fetchLogout } from '../api/lspClient';

const AuthContext = createContext(null);

export function AuthProvider({ apiUrl, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuthMe(apiUrl).then((data) => {
      if (data.authenticated) {
        setUser({ username: data.username, isAdmin: data.is_admin });
      }
    }).finally(() => setLoading(false));
  }, [apiUrl]);

  const login = useCallback(async (username, password) => {
    const data = await fetchLogin(username, password, apiUrl);
    setUser({ username: data.username, isAdmin: data.is_admin });
    return data;
  }, [apiUrl]);

  const logout = useCallback(async () => {
    await fetchLogout(apiUrl);
    setUser(null);
  }, [apiUrl]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
