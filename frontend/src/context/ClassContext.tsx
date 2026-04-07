import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Class } from '../api/client';

interface ClassContextValue {
  activeClass: Class | null;
  setActiveClass: (c: Class | null) => void;
}

const ClassContext = createContext<ClassContextValue>({
  activeClass: null,
  setActiveClass: () => {},
});

export function ClassProvider({ children }: { children: ReactNode }) {
  const [activeClass, setActiveClassState] = useState<Class | null>(() => {
    try {
      const stored = localStorage.getItem('activeClass');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setActiveClass = useCallback((c: Class | null) => {
    setActiveClassState(c);
    if (c) localStorage.setItem('activeClass', JSON.stringify(c));
    else localStorage.removeItem('activeClass');
  }, []);

  const value = useMemo(
    () => ({ activeClass, setActiveClass }),
    [activeClass, setActiveClass],
  );

  return (
    <ClassContext.Provider value={value}>
      {children}
    </ClassContext.Provider>
  );
}

export function useActiveClass() {
  return useContext(ClassContext);
}
