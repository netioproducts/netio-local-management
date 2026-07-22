import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CompactModeContextType {
  compactMode: boolean;
  setCompactMode: (value: boolean) => void;
}

const CompactModeContext = createContext<CompactModeContextType | undefined>(undefined);

export const CompactModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    return localStorage.getItem('compactMode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('compactMode', compactMode.toString());
  }, [compactMode]);

  return (
    <CompactModeContext.Provider value={{ compactMode, setCompactMode }}>
      {children}
    </CompactModeContext.Provider>
  );
};

export const useCompactMode = (): CompactModeContextType => {
  const context = useContext(CompactModeContext);
  if (context === undefined) {
    throw new Error('useCompactMode must be used within a CompactModeProvider');
  }
  return context;
};
