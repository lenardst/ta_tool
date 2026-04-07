import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

interface AuthContextValue {
  token: string | null;
  username: string | null;
  is_admin: boolean;
  login: (token: string, username: string, is_admin: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  username: null,
  is_admin: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('auth_username'));
  const [is_admin, setIsAdmin] = useState<boolean>(() => localStorage.getItem('auth_is_admin') === '1');

  const login = useCallback((t: string, u: string, admin: boolean) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('auth_username', u);
    localStorage.setItem('auth_is_admin', admin ? '1' : '0');
    setToken(t);
    setUsername(u);
    setIsAdmin(admin);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_is_admin');
    localStorage.removeItem('activeClass');
    setToken(null);
    setUsername(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo(() => ({ token, username, is_admin, login, logout }), [token, username, is_admin, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
