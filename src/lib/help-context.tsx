'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface HelpModeCtx {
  helpMode: boolean;
  toggleHelp: () => void;
}

const HelpModeContext = createContext<HelpModeCtx>({
  helpMode: false,
  toggleHelp: () => {},
});

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const [helpMode, setHelpMode] = useState(false);
  return (
    <HelpModeContext.Provider value={{ helpMode, toggleHelp: () => setHelpMode(v => !v) }}>
      {children}
    </HelpModeContext.Provider>
  );
}

export function useHelpMode() {
  return useContext(HelpModeContext);
}
