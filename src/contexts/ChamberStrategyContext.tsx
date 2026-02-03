'use client';

import * as React from 'react';
import { chambersConfig } from '@/lib/chambers-config';

type Strategy = 'secuencial' | 'fifo';
type ChamberStrategies = Record<string, Strategy>;

interface ChamberStrategyContextType {
  chamberStrategies: ChamberStrategies;
  setChamberStrategies: React.Dispatch<React.SetStateAction<ChamberStrategies>>;
}

const ChamberStrategyContext = React.createContext<ChamberStrategyContextType | undefined>(undefined);

export function ChamberStrategyProvider({ children }: { children: React.ReactNode }) {
  const [chamberStrategies, setChamberStrategies] = React.useState<ChamberStrategies>(() =>
    Object.keys(chambersConfig).reduce((acc, chamberId) => {
      acc[chamberId] = 'secuencial';
      return acc;
    }, {} as ChamberStrategies)
  );

  return (
    <ChamberStrategyContext.Provider value={{ chamberStrategies, setChamberStrategies }}>
      {children}
    </ChamberStrategyContext.Provider>
  );
}

export function useChamberStrategy() {
  const context = React.useContext(ChamberStrategyContext);
  if (context === undefined) {
    throw new Error('useChamberStrategy must be used within a ChamberStrategyProvider');
  }
  return context;
}
