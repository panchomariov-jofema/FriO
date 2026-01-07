'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MasterDataShell } from '@/components/master-data/MasterDataShell';
import type {
  Exporter,
  Producer,
  BinMaterial,
  OtherClient,
  PackagingMaster,
  UserMaster,
  Profile,
} from '@/lib/types';
import {
  exporterSchema,
  producerSchema,
  binMaterialSchema,
  otherClientSchema,
  packagingMasterSchema,
  userMasterSchema,
  profileSchema,
} from '@/lib/schemas';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ExporterForm = ({ form }: { form: any }) => (
  <>
    <FormField control={form.control} name="exporterId" render={({ field }) => (
      <FormItem><FormLabel>ID Exportador</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="name" render={({ field }) => (
      <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="type" render={({ field }) => (
      <FormItem><FormLabel>Tipo</FormLabel><FormControl><Input {...field} placeholder="Ej: exportador, productor_exportador" /></FormControl><FormMessage /></FormItem>
    )} />
  </>
);

const ProducerForm = ({ form }: { form: any }) => {
  const { data: exporters } = useFirestoreCollection<Exporter>('exporters');
  return (
    <>
      <FormField control={form.control} name="producerId" render={({ field }) => (
        <FormItem><FormLabel>ID Productor</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="shortName" render={({ field }) => (
        <FormItem><FormLabel>Nombre Corto</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="exporterId" render={({ field }) => (
        <FormItem><FormLabel>Exportador</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un exportador" /></SelectTrigger></FormControl>
          <SelectContent>{exporters.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
    </>
  )
};

const BinMaterialForm = ({ form }: { form: any }) => {
    const { data: exporters } = useFirestoreCollection<Exporter>('exporters');
    return (
    <>
      <FormField control={form.control} name="code" render={({ field }) => (
        <FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="exporterId" render={({ field }) => (
        <FormItem><FormLabel>Exportador</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un exportador" /></SelectTrigger></FormControl>
          <SelectContent>{exporters.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="type" render={({ field }) => (
        <FormItem><FormLabel>Tipo</FormLabel><FormControl><Input {...field} placeholder="Ej: bin, material" /></FormControl><FormMessage /></FormItem>
      )} />
    </>
  )
};

const OtherClientForm = ({ form }: { form: any }) => (
    <>
      <FormField control={form.control} name="clientId" render={({ field }) => (
        <FormItem><FormLabel>ID Cliente</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="type" render={({ field }) => (
        <FormItem><FormLabel>Tipo</FormLabel><FormControl><Input {...field} placeholder="Ej: embalajes, frio_hortofruticola" /></FormControl><FormMessage /></FormItem>
      )} />
    </>
);

const PackagingMasterForm = ({ form }: { form: any }) => {
    const { data: otherClients } = useFirestoreCollection<OtherClient>('otherClients');
    return (
    <>
      <FormField control={form.control} name="code" render={({ field }) => (
        <FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
       <FormField control={form.control} name="clientId" render={({ field }) => (
        <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl>
          <SelectContent>{otherClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
    </>
  )
};

const UserMasterForm = ({ form }: { form: any }) => {
    const { data: profiles } = useFirestoreCollection<Profile>('profiles');
    return (
    <>
      <FormField control={form.control} name="userName" render={({ field }) => (
        <FormItem><FormLabel>Nombre Usuario</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="profileId" render={({ field }) => (
        <FormItem><FormLabel>Perfil</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un perfil" /></SelectTrigger></FormControl>
          <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.profileId}>{p.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
    </>
  )
};

const ProfileForm = ({ form }: { form: any }) => (
    <>
      <FormField control={form.control} name="profileId" render={({ field }) => (
        <FormItem><FormLabel>ID Perfil</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="modulesAccess" render={({ field }) => (
        <FormItem><FormLabel>Acceso a Módulos</FormLabel><FormControl><Input {...field} placeholder="Dashboard,Recepción,Cámaras..." /></FormControl><FormMessage /></FormItem>
      )} />
    </>
);


const tabs = [
    { value: 'exporters', label: 'Exportadores', collection: 'exporters', schema: exporterSchema,
      columns: [{key: 'exporterId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'type', header: 'Tipo'}],
      form: ExporterForm, docName: 'name', csvHeaders: ['exporterId', 'name', 'type'], csvFile: 'plantilla_exportadores.csv'
    },
    { value: 'producers', label: 'Productores', collection: 'producers', schema: producerSchema,
      columns: [{key: 'producerId', header: 'ID'}, {key: 'shortName', header: 'Nombre Corto'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}],
      form: ProducerForm, docName: 'name', csvHeaders: ['producerId', 'shortName', 'name', 'exporterId'], csvFile: 'plantilla_productores.csv'
    },
    { value: 'binMaterials', label: 'Bins y Mat.', collection: 'binMaterials', schema: binMaterialSchema,
      columns: [{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}, {key: 'type', header: 'Tipo'}],
      form: BinMaterialForm, docName: 'name', csvHeaders: ['code', 'name', 'exporterId', 'type'], csvFile: 'plantilla_bins_y_materiales.csv'
    },
    { value: 'otherClients', label: 'Otros Clientes', collection: 'otherClients', schema: otherClientSchema,
      columns: [{key: 'clientId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'type', header: 'Tipo'}],
      form: OtherClientForm, docName: 'name', csvHeaders: ['clientId', 'name', 'type'], csvFile: 'plantilla_otros_clientes.csv'
    },
    { value: 'packagingMaster', label: 'Embalajes', collection: 'packagingMaster', schema: packagingMasterSchema,
      columns: [{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'clientId', header: 'ID Cliente'}],
      form: PackagingMasterForm, docName: 'name', csvHeaders: ['code', 'name', 'clientId'], csvFile: 'plantilla_embalajes.csv'
    },
    { value: 'usersMaster', label: 'Usuarios', collection: 'usersMaster', schema: userMasterSchema,
      columns: [{key: 'userName', header: 'Usuario'}, {key: 'profileId', header: 'ID Perfil'}],
      form: UserMasterForm, docName: 'userName', csvHeaders: ['userName', 'profileId'], csvFile: 'plantilla_usuarios.csv'
    },
    { value: 'profiles', label: 'Perfiles', collection: 'profiles', schema: profileSchema,
      columns: [{key: 'profileId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'modulesAccess', header: 'Módulos'}],
      form: ProfileForm, docName: 'name', csvHeaders: ['profileId', 'name', 'modulesAccess'], csvFile: 'plantilla_perfiles.csv'
    },
];

export default function DatosMaestrosPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos Maestros</CardTitle>
        <CardDescription>Gestione los datos centrales de la aplicación.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="exporters" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <MasterDataShell
                collectionName={tab.collection}
                schema={tab.schema}
                columns={tab.columns as any}
                renderForm={tab.form}
                docNameField={tab.docName as any}
                csvHeaders={tab.csvHeaders as any}
                csvTemplateFileName={tab.csvFile}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
