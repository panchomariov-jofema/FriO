import type { StoredItem, OtherFruitReception, OtherClient, Producer } from './types';

export const mockProducers: Producer[] = [
  {
    id: 'mock-producer-1',
    producerId: 'PROD-001',
    shortName: 'Fundo El Pino',
    name: 'Agrícola El Pino Ltda.',
    exporterId: 'EXP004',
    rut: '76.123.456-7',
    status: 'activo'
  },
  {
    id: 'mock-producer-2',
    producerId: 'PROD-002',
    shortName: 'Fundo Las Flores',
    name: 'Agrícola Las Flores S.A.',
    exporterId: 'EXP004',
    rut: '77.987.654-3',
    status: 'activo'
  }
];

export const mockOtherClients: OtherClient[] = [
  {
    id: 'mock-fall-creek-client',
    clientId: 'EXP004',
    name: 'FALL CREEK',
    type: 'fruta',
    unit: 'Bins',
    status: 'activo',
    storageStrategy: 'fifo-vertical',
    binsPerCoordinate: 9,
  }
];

export const mockOtherFruitReceptions: OtherFruitReception[] = [
  {
    id: 'mock-pl-001',
    clientId: 'EXP004',
    clientName: 'FALL CREEK',
    displayLotId: 'PL-001',
    unit: 'Bins',
    document: 'PL-001',
    status: 'Almacenado',
    createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    items: [
      { clientLotId: 'PL-001', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'A1' } },
      { clientLotId: 'PL-001', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'A2' } },
      { clientLotId: 'PL-001', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'A3' } },
      { clientLotId: 'PL-001', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'A4' } },
      { clientLotId: 'PL-001', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 3, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'A5' } },
    ]
  },
  {
    id: 'mock-pl-002',
    clientId: 'EXP004',
    clientName: 'FALL CREEK',
    displayLotId: 'PL-002',
    unit: 'Bins',
    document: 'PL-002',
    status: 'Almacenado',
    createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    items: [
      { clientLotId: 'PL-002', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'B1' } },
      { clientLotId: 'PL-002', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'B2' } },
      { clientLotId: 'PL-002', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'B3' } },
      { clientLotId: 'PL-002', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'B4' } },
      { clientLotId: 'PL-002', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 3, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'A5' } },
    ]
  },
  {
    id: 'mock-pl-003',
    clientId: 'EXP004',
    clientName: 'FALL CREEK',
    displayLotId: 'PL-003',
    unit: 'Bins',
    document: 'PL-003',
    status: 'Almacenado',
    createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    items: [
      { clientLotId: 'PL-003', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C1' } },
      { clientLotId: 'PL-003', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C2' } },
      { clientLotId: 'PL-003', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C3' } },
      { clientLotId: 'PL-003', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C4' } },
      { clientLotId: 'PL-003', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C5' } },
      { clientLotId: 'PL-003', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 5, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C6' } },
    ]
  },
  {
    id: 'mock-pl-004',
    clientId: 'EXP004',
    clientName: 'FALL CREEK',
    displayLotId: 'PL-004',
    unit: 'Bins',
    document: 'PL-004',
    status: 'Almacenado',
    createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    items: [
      { clientLotId: 'PL-004', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'D1' } },
      { clientLotId: 'PL-004', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'D2' } },
      { clientLotId: 'PL-004', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'D3' } },
      { clientLotId: 'PL-004', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'D4' } },
      { clientLotId: 'PL-004', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'D5' } },
      { clientLotId: 'PL-004', productCode: 'FC-04', productName: 'FC11-164', quantity: 4, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'C6' } },
    ]
  },
  {
    id: 'mock-pl-005',
    clientId: 'EXP004',
    clientName: 'FALL CREEK',
    displayLotId: 'PL-005',
    unit: 'Bins',
    document: 'PL-005',
    status: 'Almacenado',
    createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    items: [
      { clientLotId: 'PL-005', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E1' } },
      { clientLotId: 'PL-005', productCode: 'SC-01', productName: 'Sekoya Crunch®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E2' } },
      { clientLotId: 'PL-005', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E3' } },
      { clientLotId: 'PL-005', productCode: 'SG-02', productName: 'Sekoya Grande®', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E4' } },
      { clientLotId: 'PL-005', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E5' } },
      { clientLotId: 'PL-005', productCode: 'SF-03', productName: 'Sekoya Fiesta™', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E6' } },
      { clientLotId: 'PL-005', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E7' } },
      { clientLotId: 'PL-005', productCode: 'FC-04', productName: 'FC11-164', quantity: 6, status: 'Almacenado', storageLocation: { chamberId: 'CAMARA-5', coordinate: 'E8' } },
    ]
  }
];

export const mockStoredItems: StoredItem[] = mockOtherFruitReceptions.flatMap(reception => 
  reception.items.map((item, index) => ({
    id: `${reception.id}-${index}`,
    type: 'otherFruit' as const,
    displayId: item.productCode,
    lotIdForColor: item.clientLotId 
      ? `${reception.displayLotId || reception.id}-${item.clientLotId}-${item.productName}` 
      : `${reception.displayLotId || reception.id}-${item.productName}`,
    ownerName: reception.clientName,
    varietyOrProduct: item.productName,
    quantity: item.quantity,
    unit: reception.unit,
    chamberId: item.storageLocation!.chamberId,
    coordinate: item.storageLocation!.coordinate,
    receptionId: reception.id,
    itemIndex: index,
    clientLotId: item.clientLotId,
    netWeightPerBin: 0,
    isMixedVariety: item.isMixedVariety,
    observation: item.observation,
  }))
);
