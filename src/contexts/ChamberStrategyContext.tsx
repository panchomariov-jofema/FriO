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

const LOCAL_STORAGE_KEY = 'chamber_layout_strategies';

export function ChamberStrategyProvider({ children }: { children: React.ReactNode }) {
  const [chamberStrategies, setChamberStrategies] = React.useState<ChamberStrategies>(() => {
    // Default initial state. Actual state will be loaded from localStorage client-side.
    return Object.keys(chambersConfig).reduce((acc, chamberId) => {
      acc[chamberId] = 'secuencial';
      return acc;
    }, {} as ChamberStrategies);
  });

  // On initial client-side mount, load the saved strategies from localStorage.
  React.useEffect(() => {
    try {
      const savedStrategies = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedStrategies) {
        setChamberStrategies(JSON.parse(savedStrategies));
      }
    } catch (error) {
      console.warn("Could not load chamber strategies from localStorage", error);
    }
  }, []);

  // Whenever the strategies change, save them back to localStorage.
  React.useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(chamberStrategies));
    } catch (error) {
      console.warn("Could not save chamber strategies to localStorage", error);
    }
  }, [chamberStrategies]);

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
