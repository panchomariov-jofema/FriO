export const packagingStorageConfig = {
  warehouses: [
    { id: 'ALMACEN-1', name: 'Almacén 1' },
    { id: 'ALMACEN-2', name: 'Almacén 2' },
  ],
  aisles: Array.from({ length: 20 }, (_, i) => `Pasillo ${i + 1}`),
};
