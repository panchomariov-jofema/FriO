import type { Chamber } from './types';

interface ChambersConfig {
    [key: string]: Chamber;
}

const columns1to3 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const columns4to6 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
const rows = Array.from({ length: 13 }, (_, i) => i + 1);

const blockedCoordsC1C3 = [
    ...Array.from({ length: 5 }, (_, i) => `E${i + 9}`), // E9-E13
    ...Array.from({ length: 5 }, (_, i) => `F${i + 9}`), // F9-F13
    ...Array.from({ length: 5 }, (_, i) => `G${i + 9}`), // G9-G13
    ...Array.from({ length: 5 }, (_, i) => `H${i + 9}`), // H9-H13
];

const blockedCoordsC4C5 = [
    ...Array.from({ length: 5 }, (_, i) => `F${i + 9}`), // F9-F13
    ...Array.from({ length: 5 }, (_, i) => `G${i + 9}`), // G9-G13
    ...Array.from({ length: 5 }, (_, i) => `H${i + 9}`), // H9-H13
    ...Array.from({ length: 5 }, (_, i) => `I${i + 9}`), // I9-I13
    ...Array.from({ length: 5 }, (_, i) => `J${i + 9}`), // J9-J13
    ...Array.from({ length: 5 }, (_, i) => `K${i + 9}`), // K9-K13
];


export const chambersConfig: ChambersConfig = {
    'CAMARA-1': {
        id: 'CAMARA-1',
        name: 'CÁMARA 1',
        capacity: 800,
        columns: columns1to3,
        rows,
        blocked: blockedCoordsC1C3,
    },
    'CAMARA-2': {
        id: 'CAMARA-2',
        name: 'CÁMARA 2',
        capacity: 800,
        columns: columns1to3,
        rows,
        blocked: blockedCoordsC1C3,
    },
    'CAMARA-3': {
        id: 'CAMARA-3',
        name: 'CÁMARA 3',
        capacity: 800,
        columns: columns1to3,
        rows,
        blocked: blockedCoordsC1C3,
    },
    'CAMARA-4': {
        id: 'CAMARA-4',
        name: 'CÁMARA 4',
        capacity: 1500,
        columns: columns4to6,
        rows,
        blocked: blockedCoordsC4C5,
    },
    'CAMARA-5': {
        id: 'CAMARA-5',
        name: 'CÁMARA 5',
        capacity: 1500,
        columns: columns4to6,
        rows,
        blocked: blockedCoordsC4C5,
    },
    'CAMARA-6': {
        id: 'CAMARA-6',
        name: 'CÁMARA 6',
        capacity: 1500,
        columns: columns4to6,
        rows,
    },
};
