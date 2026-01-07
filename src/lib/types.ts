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

export interface OtherClient {
  id: string;
  clientId: string;
  name: string;
  type: string;
}

export interface PackagingMaster {
  id: string;
  code: string;
  name: string;
  clientId: string;
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
    createdAt: Timestamp;
}

export interface HidrocoolerLot {
  id: string;
  displayLotId: string;
  producerShortName: string;
  binCount: number;
  status: 'Pendiente de Pre-Hidro' | 'En Proceso' | 'Finalizado';
  createdAt: Timestamp;
}


export type MasterData = Exporter | Producer | BinMaterial | OtherClient | PackagingMaster | UserMaster | Profile;
