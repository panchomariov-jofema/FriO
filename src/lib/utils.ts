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

// Sequential or "Snake" (FIFO) layout.
export const getSortedCoordinates = (chamberConfig: Chamber, strategy?: 'secuencial' | 'fifo'): string[] => {
  if (strategy === 'fifo') {
    const coords: string[] = [];
    chamberConfig.columns.forEach((col, colIndex) => {
      const isOddColumn = colIndex % 2 !== 0;
      
      const unblockedRows = chamberConfig.rows.filter(row => !chamberConfig.blocked?.includes(`${col.name}${row}`));
      
      const rowsToIterate = isOddColumn ? [...unblockedRows].reverse() : unblockedRows;

      rowsToIterate.forEach(row => {
        coords.push(`${col.name}${row}`);
      });
    });
    return coords;
  }
  
  // Default to sequential column-by-column sort
  return chamberConfig.columns
    .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
    .filter(coord => !chamberConfig.blocked?.includes(coord))
    .sort(naturalSort);
};

// Paired / Z-pattern layout for Fall Creek
export const getPairedCoordinates = (chamberConfig: Chamber): string[] => {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rows = chamberConfig.rows;

    // Process columns in pairs (A,B), (C,D), etc.
    for (let i = 0; i < columns.length; i += 2) {
        const col1Name = columns[i];
        const col2Name = i + 1 < columns.length ? columns[i + 1] : null;

        rows.forEach(row => {
            // Add from first column in the pair
            const coord1 = `${col1Name}${row}`;
            if (!chamberConfig.blocked?.includes(coord1)) {
                coords.push(coord1);
            }
            
            // If there's a second column in the pair, add from it
            if (col2Name) {
                const coord2 = `${col2Name}${row}`;
                if (!chamberConfig.blocked?.includes(coord2)) {
                    coords.push(coord2);
                }
            }
        });
    }
    return coords;
};
