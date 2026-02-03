import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Chamber } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper for natural sorting (e.g., A1, A2, ... A10)
export const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1] || '0', 10);
  const bNum = parseInt(b.split(re)[1] || '0', 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];

  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;

  return aNum - bNum;
};

export const getSortedCoordinates = (chamberConfig: Chamber, strategy: 'secuencial' | 'fifo'): string[] => {
  // Per the user's request, the "serpent" (FIFO) layout now follows a simple
  // sequential order (A1...A12, then B1...B12).
  return chamberConfig.columns
    .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
    .filter(coord => !chamberConfig.blocked?.includes(coord))
    .sort(naturalSort);
};
