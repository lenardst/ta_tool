import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

interface AuthContextValue {
  token: string | null;
  username: string | null;
  login: (token: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  username: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('auth_username'));

  const login = useCallback((t: string, u: string) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('auth_username', u);
    setToken(t);
    setUsername(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('activeClass');
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo(() => ({ token, username, login, logout }), [token, username, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
