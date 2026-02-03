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
  if (strategy === 'fifo') {
    const fifoCoords: string[] = [];
    const reversedRows = [...chamberConfig.rows].reverse();
    chamberConfig.columns.forEach((col, index) => {
      // Odd columns (A, C, E...) go down, Even columns (B, D, F...) go up
      const isEvenColumn = index % 2 !== 0; 
      const rowsToIterate = isEvenColumn ? reversedRows : chamberConfig.rows;
      for (const row of rowsToIterate) {
        const coord = `${col.name}${row}`;
        if (!chamberConfig.blocked?.includes(coord)) {
          fifoCoords.push(coord);
        }
      }
    });
    return fifoCoords;
  }

  // Default 'secuencial' strategy
  return chamberConfig.columns
    .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
    .filter(coord => !chamberConfig.blocked?.includes(coord))
    .sort(naturalSort);
};
