import type { Chamber } from './types';

interface ChambersConfig {
    [key: string]: Chamber;
}

const columns1to3 = [
    { name: 'A', id: 'A' }, { name: 'B', id: 'B' }, { name: 'C', id: 'C' }, { name: 'D', id: 'D' }, 
    { name: 'E', id: 'E' }, { name: 'F', id: 'F' }, { name: 'G', id: 'G' }, { name: 'H', id: 'H' }, 
    { name: 'I', id: 'I' }, { name: 'J', id: 'J' }, { name: 'K', id: 'K' }, { name: 'L', id: 'L' }
];
const columns4to6 = [
    { name: 'A', id: 'A' }, { name: 'B', id: 'B' }, { name: 'C', id: 'C' }, { name: 'D', id: 'D' }, 
    { name: 'E', id: 'E' }, { name: 'F', id: 'F' }, { name: 'G', id: 'G' }, { name: 'H', id: 'H' }, 
    { name: 'I', id: 'I' }, { name: 'J', id: 'J' }, { name: 'K', id: 'K' }, { name: 'L', id: 'L' }, 
    { name: 'M', id: 'M' }, { name: 'N', id: 'N' }, { name: 'O', id: 'O' }
];

const rows = Array.from({ length: 14 }, (_, i) => i + 1);

const blockedRows = [13, 14];
const blocked1to3 = columns1to3.flatMap(col => blockedRows.map(row => `${col.name}${row}`));
const blocked4to6 = columns4to6.flatMap(col => blockedRows.map(row => `${col.name}${row}`));


export const chambersConfig: ChambersConfig = {
    'CAMARA-1': {
        id: 'CAMARA-1',
        name: 'CÁMARA 1',
        capacity: 1000,
        columns: columns1to3,
        rows,
        blocked: blocked1to3,
    },
    'CAMARA-2': {
        id: 'CAMARA-2',
        name: 'CÁMARA 2',
        capacity: 1000,
        columns: columns1to3,
        rows,
        blocked: blocked1to3,
    },
    'CAMARA-3': {
        id: 'CAMARA-3',
        name: 'CÁMARA 3',
        capacity: 1000,
        columns: columns1to3,
        rows,
        blocked: blocked1to3,
    },
    'CAMARA-4': {
        id: 'CAMARA-4',
        name: 'CÁMARA 4',
        capacity: 1800,
        columns: columns4to6,
        rows,
        blocked: blocked4to6,
    },
    'CAMARA-5': {
        id: 'CAMARA-5',
        name: 'CÁMARA 5',
        capacity: 1800,
        columns: columns4to6,
        rows,
        blocked: blocked4to6,
    },
    'CAMARA-6': {
        id: 'CAMARA-6',
        name: 'CÁMARA 6',
        capacity: 1800,
        columns: columns4to6,
        rows,
        blocked: blocked4to6,
    },
};

// Asignación de cámaras exclusivas por ID de exportador
export const exporterChamberAssignments: Record<string, string[]> = {
  'SUBSOLE': ['CAMARA-2', 'CAMARA-3'],
  'MEYER': ['CAMARA-3', 'CAMARA-6'],
  'BLOSSOM': ['CAMARA-3', 'CAMARA-5'],
  // Agrega aquí otras asignaciones si es necesario
  // Ejemplo: 'OTRO_EXPORTADOR': ['CAMARA-1']
};
