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
  driverName: string;
  driverRUT: string;
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
  type: 'embalaje' | 'frio_hortofruticola' | 'fruta';
  unit: 'Bins' | 'Pallets';
}

export interface PackagingMaster {
  id: string;
  code: string;
  name: string;
  clientId: string;
}

export interface PackagingReceptionItem {
    packagingMasterId: string;
    packagingMasterCode: string;
    packagingMasterName: string;
    palletCount: number;
    status: 'Pendiente de almacenar' | 'Almacenado';
    storageLocation?: {
      warehouse: string;
      aisle: string;
    };
    storedAt?: Timestamp | Date;
}


export interface PackagingReception {
  id: string;
  clientId: string;
  clientName: string;
  document: string;
  items: PackagingReceptionItem[];
  status: 'Pendiente de almacenar' | 'Parcialmente Almacenado' | 'Almacenado';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface PackagingMovementItem {
    packagingMasterId: string;
    packagingMasterCode: string;
    packagingMasterName: string;
    palletCount: number;
}

export interface PackagingMovement {
  id: string;
  type: 'entrada' | 'salida';
  clientId: string;
  document: string;
  items: PackagingMovementItem[];
  createdAt: Timestamp;
}

export interface PackagingExitItemLocation {
  locationKey: string;
  receptionId: string;
  itemIndex: number;
  palletsToWithdraw: number;
}

export interface PackagingExitItem {
  packagingMasterId: string;
  packagingMasterCode: string;
  packagingMasterName: string;
  palletCount: number;
  locations: PackagingExitItemLocation[];
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

export type ModulePermission = 
  | string 
  | { name: 'Dashboard', fixedExporterId: string }
  | { name: 'Embalajes', allowedTabs: string[] }
  | { name: 'Otros Hortofrutícolas', allowedTabs: string[] };

export interface Profile {
  id: string;
  profileId: string;
  name: string;
  modulesAccess: ModulePermission[];
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
    noTotes?: number;
    status: 'Pendiente de Peso' | 'Pendiente de Pre-Hidro' | 'Pendiente de Post-Hidro' | 'Cerrado';
    totalWeight?: number;
    netWeightPerBin?: number;
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
  netWeightPerBin?: number;
  receptionDate: Timestamp; // Changed from createdAt
}

export interface ProcessingLot {
  id: string;
  originalLotId: string;
  displayLotId: string;
  producerShortName: string;
  binCount: number;
  hidrocooler: string;
  status: 'En Proceso' | 'Finalizado';
  netWeightPerBin?: number;
  createdAt: Timestamp;
  receptionDate: Timestamp; // Propagated
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
    netWeightPerBin?: number;
    status: 'Pendiente por Almacenar' | 'Almacenado' | 'Despachado';
    receptionDate: Timestamp; // The true FIFO date
    storedAt: Timestamp; // When it was put in the chamber
}

export interface Chamber {
    id: string;
    name: string;
    capacity: number;
    columns: string[];
    rows: number[];
    blocked?: string[];
}

export interface Dispatch {
  id: string;
  exporterId: string;
  exporterName: string;
  packingId?: string | null;
  totalBins: number;
  totalNetWeight?: number;
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

export interface OtherFruitReceptionItem {
    clientLotId?: string;
    productCode: string;
    productName: string;
    quantity: number;
    status: 'Pendiente de almacenar' | 'Almacenado';
    storageLocation?: {
      chamberId: string;
      coordinate: string;
    };
    storedAt?: Timestamp | Date;
}

export interface OtherFruitReception {
  id: string;
  clientId: string;
  clientName: string;
  displayLotId?: string;
  unit: 'Bins' | 'Pallets';
  document: string;
  items: OtherFruitReceptionItem[];
  status: 'Pendiente de almacenar' | 'Parcialmente Almacenado' | 'Almacenado';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface OtherFruitMovement {
  id: string;
  type: 'entrada' | 'salida';
  clientId: string;
  clientName: string;
  unit: 'Bins' | 'Pallets';
  document: string;
  items: {
    productCode: string;
    productName: string;
    quantity: number;
    clientLotId?: string;
  }[];
  createdAt: Timestamp;
}

// Unified type for any stored item in a chamber
export type StoredItem = {
  id: string;
  type: 'producerLot' | 'otherFruit'; // Differentiator
  displayId: string; // e.g., displayLotId or productName
  ownerName: string; // e.g., producerShortName or clientName
  varietyOrProduct: string;
  quantity: number;
  unit: 'Bins' | 'Pallets';
  chamberId: string;
  coordinate: string;
  receptionId: string | null; // ID of the parent document (e.g., otherFruitReceptions)
  itemIndex: number; // Index of the item within the parent document's `items` array
  netWeightPerBin?: number;
}


export type MasterData = Exporter | Producer | BinMaterial | OtherClient | PackagingMaster | UserMaster | Profile | Packing;
