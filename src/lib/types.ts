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

export type MasterData = Exporter | Producer | BinMaterial | OtherClient | PackagingMaster | UserMaster | Profile;
