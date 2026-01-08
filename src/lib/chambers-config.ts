import type { Chamber } from './types';

interface ChambersConfig {
    [key: string]: Chamber;
}

const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
const rows = Array.from({ length: 13 }, (_, i) => i + 1);

export const chambersConfig: ChambersConfig = {
    'CAMARA-1': {
        id: 'CAMARA-1',
        name: 'CÁMARA 1',
        capacity: 800,
        columns,
        rows,
    },
    'CAMARA-2': {
        id: 'CAMARA-2',
        name: 'CÁMARA 2',
        capacity: 800,
        columns,
        rows,
    },
    'CAMARA-3': {
        id: 'CAMARA-3',
        name: 'CÁMARA 3',
        capacity: 800,
        columns,
        rows,
    },
    'CAMARA-4': {
        id: 'CAMARA-4',
        name: 'CÁMARA 4',
        capacity: 1500,
        columns,
        rows,
    },
    'CAMARA-5': {
        id: 'CAMARA-5',
        name: 'CÁMARA 5',
        capacity: 1500,
        columns,
        rows,
    },
    'CAMARA-6': {
        id: 'CAMARA-6',
        name: 'CÁMARA 6',
        capacity: 1500,
        columns,
        rows,
    },
};
