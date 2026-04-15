'use client';

import type { Timestamp } from "firebase/firestore";

export interface Exporter {
  id: string;
  exporterId: string;
  name: string;
  type: string;
  status?: 'activo' | 'inactivo';
}

export interface Producer {
  id: string;
  producerId: string;
  shortName: string;
  name: string;
  exporterId: string;
  rut?: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  status?: 'activo' | 'inactivo';
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
  packingId?: string | null;
  items: {
    binMaterialId: string;
    binMaterialCode: string;
    binMaterialName: string;
    quantity: number;
  }[];
  createdAt: Timestamp;
  observation?: string;
  userId?: string;
  userName?: string;
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
  status?: 'activo' | 'inactivo';
}

export interface PackagingMaster {
  id: string;
  code: string;
  name: string;
  clientId: string;
}

export interface PackagingReceptionItem {
    lote?: string;
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
  userId?: string;
  userName?: string;
}

export interface PackagingExitItemLocation {
  locationKey: string;
  receptionId: string;
  itemIndex: number;
  palletsToWithdraw: number;
  locationString?: string;
  available?: number;
}

export interface PackagingMovementItem {
    lote?: string;
    packagingMasterId: string;
    packagingMasterCode: string;
    packagingMasterName: string;
    palletCount: number;
    locations?: PackagingExitItemLocation[];
}

export interface PackagingMovement {
  id: string;
  type: 'entrada' | 'salida';
  clientId: string;
  document: string;
  items: PackagingMovementItem[];
  status: 'Pendiente de Picking' | 'Completado';
  createdAt: Timestamp;
  userId?: string;
  userName?: string;
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
  | { name: 'Socios Comerciales', allowedTabs: string[] }
  | { name: 'Bins y Materiales', allowedTabs: string[] };

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
    userId?: string;
    userName?: string;
}

export interface HidrocoolerLot {
  id: string;
  displayLotId: string;
  exporterId: string;
  producerShortName: string;
  binCount: number;
  status: 'Pendiente de Pre-Hidro';
  netWeightPerBin?: number;
  receptionDate: Timestamp; // Changed from createdAt
  userId?: string;
  userName?: string;
}

export interface Hidrocooler {
  id: string;
  name: string;
  binCount: number;
}

export interface ProcessingLot {
  id: string;
  originalLotId: string;
  displayLotId: string;
  exporterId: string;
  producerShortName: string;
  binCount: number;
  hidrocooler: string;
  status: 'En Proceso' | 'Finalizado';
  netWeightPerBin?: number;
  createdAt: Timestamp;
  receptionDate: Timestamp; // Propagated
  userId?: string;
  userName?: string;
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
    userId?: string;
    userName?: string;
}

export interface ChamberColumn {
    name: string;
    id: string;
}
export interface Chamber {
    id: string;
    name: string;
    capacity: number;
    columns: ChamberColumn[];
    rows: number[];
    blocked?: string[];
}

export interface ChamberTemperature {
  id: string;
  chamberId: string;
  temperature: number;
  timestamp: Timestamp;
  userId?: string;
  userName?: string;
}

export interface Dispatch {
  id: string;
  exporterId: string;
  exporterName: string;
  packingId?: string | null;
  totalBins: number;
  totalNetWeight?: number;
  status: 'Pendiente de Picking' | 'Completado';
  createdAt: Timestamp;
  bins: {
    chamberLotId: string;
    displayLotId: string;
    chamberId: string;
    coordinate: string;
    binCount: number;
  }[];
  userId?: string;
  userName?: string;
}

export interface OtherFruitReceptionItem {
    clientLotId?: string;
    productCode: string;
    productName: string;
    quantity: number;
    weight?: number;
    status: 'Pendiente de almacenar' | 'Almacenado' | 'Despachado';
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
  temperature?: number;
  items: OtherFruitReceptionItem[];
  status: 'Pendiente de almacenar' | 'Parcialmente Almacenado' | 'Almacenado' | 'Despachado';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  userId?: string;
  userName?: string;
}

export interface OtherFruitMovementLocation {
  receptionId: string;
  itemIndex: number;
  quantity: number;
  unit: 'Bins' | 'Pallets';
  productCode: string;
  productName: string;
  clientLotId?: string;
  location: {
    chamberId: string;
    coordinate: string;
  };
}

export interface OtherFruitMovement {
  id: string;
  type: 'entrada' | 'salida';
  clientId: string;
  clientName: string;
  unit: 'Bins' | 'Pallets';
  document?: string;
  destinationClientName?: string;
  destinationClientRUT?: string;
  items: {
    productCode: string;
    productName: string;
    quantity: number;
    weight?: number;
    clientLotId?: string;
  }[];
  createdAt: Timestamp;
  status?: 'Pendiente de Picking' | 'Completado';
  locations?: OtherFruitMovementLocation[];
  userId?: string;
  userName?: string;
}

export interface DTEGuiaDespacho {
  id: string;
  idDoc: {
    tipoDTE: number;
    folio: number;
    fchEmis: string; // YYYY-MM-DD
  };
  emisor: {
    RUTEmisor: string;
    RznSocEmisor: string;
    GiroEmis: string;
    Acteco?: number;
    DirOrigen: string;
    CmnaOrigen: string;
  };
  receptor: {
    RUTRecep: string;
    RznSocRecep: string;
    GiroRecep: string;
    DirRecep: string;
    CmnaRecep: string;
    CiudadRecep: string;
  };
  transporte?: {
    Patente: string;
    DirDest: string;
    CmnaDest: string;
    CiudadDest: string;
  };
  totales: {
    MntNeto: number;
    MntExe?: number;
    IVA?: number;
    MntTotal: number;
  };
  detalle: {
    NroLinDet: number;
    NmbItem: string;
    QtyItem: number;
    UnmdItem: string;
    PrcItem?: number;
    MontoItem: number;
  }[];
  referencias?: {
    NroLinRef: number;
    TpoDocRef: string;
    FolioRef: number;
    FchRef: string; // YYYY-MM-DD
  }[];
  estado: 'PENDIENTE' | 'GENERADO';
  sourceMovementId: string;
  createdAt: Timestamp;
}


// Unified type for any stored item in a chamber
export type StoredItem = {
  id: string;
  type: 'producerLot' | 'otherFruit'; // Differentiator
  displayId: string; // e.g., displayLotId or productName
  lotIdForColor: string; // ID used for grouping and coloring
  ownerName: string; // e.g., producerShortName or clientName
  varietyOrProduct: string;
  quantity: number;
  unit: 'Bins' | 'Pallets';
  chamberId: string;
  coordinate: string;
  receptionId: string | null; // ID of the parent document (e.g., otherFruitReceptions)
  itemIndex: number; // Index of the item within the parent document's `items` array
  netWeightPerBin?: number;
  clientLotId?: string;
}

export interface BusinessEntity {
  id: string;
  rut: string;
  razonSocial: string;
  direccion: string;
  ciudad: string;
  comuna: string;
  giro: string;
  actividadComercial: string;
}

export interface Warehouse {
  id: string;
  name: string;
}

export interface Aisle {
  id: string;
  name: string;
  warehouseIds: string[];
}

export type MasterData = Exporter | Producer | BinMaterial | OtherClient | PackagingMaster | UserMaster | Profile | Packing | Hidrocooler | BusinessEntity | Warehouse | Aisle;

    