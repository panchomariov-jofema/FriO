'use client';

import type { Timestamp } from "firebase/firestore";

export interface Exporter {
  id: string;
  exporterId: string;
  name: string;
  type: string;
}

export interface Producer {
  id: string;
  producerId: string;
  shortName: string;
  name: string;
  exporterId: string;
}

export interface BinMaterial {
  id: string;
  code: string;
  name: string;
  exporterId: string;
  type: string;
}

export interface BinMaterialMovement {
  id: string;
  type: 'entrada' | 'salida';
  document: string;
  exporterId: string;
  producerId: string;
  items: {
    binMaterialId: string;
    binMaterialCode: string;
    binMaterialName: string;
    quantity: number;
  }[];
  createdAt: Timestamp;
}

export interface BinMaterialStock {
  id: string;
  binMaterialId: string;
  binMaterialCode: string;
  binMaterialName: string;
  exporterId: string;
  quantity: number;
  lastUpdatedAt: Timestamp;
}

export interface OtherClient {
  id: string;
  clientId: string;
  name: string;
  type: string;
  unit: 'Bins' | 'Pallets';
}

export interface PackagingMaster {
  id: string;
  code: string;
  name: string;
  clientId: string;
}

export interface PackagingReception {
  id: string;
  clientId: string;
  clientName: string;
  document: string;
  items: {
    packagingMasterId: string;
    packagingMasterName: string;
    palletCount: number;
  }[];
  status: 'Pendiente de almacenar' | 'Almacenado';
  createdAt: Timestamp;
  storageLocation?: {
    warehouse: string;
    aisle: string;
  };
  storedAt?: Timestamp;
}


export interface Packing {
  id: string;
  exporterId: string;
  name: string;
}

export interface UserMaster {
  id: string;
  userName: string;
  profileId: string;
}

export interface Profile {
  id: string;
  profileId: string;
  name: string;
  modulesAccess: string[];
}

export type Variety = 'SANTINA' | 'LAPINS' | 'REGINA' | 'KORDIA' | 'SKEENA' | 'SWEETHEART' | 'SYLVIA' | 'SUNBURST';

export interface ReceptionLot {
    id: string;
    displayLotId: string;
    exporterId: string;
    producerId: string;
    document: string;
    variety: Variety;
    binCount: number;
    toteCount: number;
    emptyTotes?: number;
    status: 'Pendiente de Peso' | 'Pendiente de Pre-Hidro' | 'Pendiente de Post-Hidro' | 'Cerrado';
    totalWeight?: number;
    preHydroTemp?: number;
    postHydroTemp?: number;
    createdAt: Timestamp | null;
}

export interface HidrocoolerLot {
  id: string;
  displayLotId: string;
  producerShortName: string;
  binCount: number;
  status: 'Pendiente de Pre-Hidro';
  createdAt: Timestamp;
}

export interface ProcessingLot {
  id: string;
  originalLotId: string;
  displayLotId: string;
  producerShortName: string;
  binCount: number;
  hidrocooler: string;
  status: 'En Proceso' | 'Finalizado';
  createdAt: Timestamp;
}

export interface ChamberLot {
    id: string;
    displayLotId: string;
    exporterId: string;
    producerShortName: string;
    binCount: number;
    variety: Variety;
    hidrocooler: string;
    chamberId?: string;
    coordinate?: string;
    status: 'Pendiente por Almacenar' | 'Almacenado' | 'Despachado';
    storedAt: Timestamp;
}

export interface Chamber {
    id: string;
    name: string;
    capacity: number;
    columns: string[];
    rows: number[];
}

export interface Dispatch {
  id: string;
  exporterId: string;
  exporterName: string;
  packingId?: string | null;
  totalBins: number;
  status: 'Pendiente de Salida' | 'Completado';
  createdAt: Timestamp;
  bins: {
    chamberLotId: string;
    displayLotId: string;
    chamberId: string;
    coordinate: string;
    binCount: number;
  }[];
}


export type MasterData = Exporter | Producer | BinMaterial | OtherClient | PackagingMaster | UserMaster | Profile | Packing;

    
