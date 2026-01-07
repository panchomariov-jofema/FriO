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

const ProducerForm = ({ form, exporters }: { form: any; exporters: Exporter[] }) => {
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
          <SelectContent>{exporters?.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
    </>
  )
};

const BinMaterialForm = ({ form, exporters }: { form: any, exporters: Exporter[] }) => {
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
          <SelectContent>{exporters?.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
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

const PackagingMasterForm = ({ form, otherClients }: { form: any, otherClients: OtherClient[] }) => {
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
          <SelectContent>{otherClients?.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
    </>
  )
};

const UserMasterForm = ({ form, profiles }: { form: any, profiles: Profile[] }) => {
    return (
    <>
      <FormField control={form.control} name="userName" render={({ field }) => (
        <FormItem><FormLabel>Nombre Usuario</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="profileId" render={({ field }) => (
        <FormItem><FormLabel>Perfil</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un perfil" /></SelectTrigger></FormControl>
          <SelectContent>{profiles?.map(p => <SelectItem key={p.id} value={p.profileId}>{p.name}</SelectItem>)}</SelectContent>
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

export default function DatosMaestrosPage() {
  const { data: exporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: profiles } = useFirestoreCollection<Profile>('profiles');

  const tabs = [
    { value: 'exporters', label: 'Exportadores' },
    { value: 'producers', label: 'Productores' },
    { value: 'binMaterials', label: 'Bins y Mat.' },
    { value: 'otherClients', label: 'Otros Clientes' },
    { value: 'packagingMaster', label: 'Embalajes' },
    { value: 'usersMaster', label: 'Usuarios' },
    { value: 'profiles', label: 'Perfiles' },
  ];

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
          
          <TabsContent value="exporters" className="mt-4">
            <MasterDataShell
              collectionName="exporters"
              schema={exporterSchema}
              columns={[{key: 'exporterId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'type', header: 'Tipo'}]}
              RenderFormComponent={ExporterForm}
              docNameField="name"
              csvHeaders={['exporterId', 'name', 'type']}
              csvTemplateFileName="plantilla_exportadores.csv"
              formProps={{}}
            />
          </TabsContent>
          <TabsContent value="producers" className="mt-4">
            <MasterDataShell
              collectionName="producers"
              schema={producerSchema}
              columns={[{key: 'producerId', header: 'ID'}, {key: 'shortName', header: 'Nombre Corto'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}]}
              RenderFormComponent={ProducerForm}
              docNameField="name"
              csvHeaders={['producerId', 'shortName', 'name', 'exporterId']}
              csvTemplateFileName="plantilla_productores.csv"
              formProps={{ exporters }}
            />
          </TabsContent>
          <TabsContent value="binMaterials" className="mt-4">
            <MasterDataShell
              collectionName="binMaterials"
              schema={binMaterialSchema}
              columns={[{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}, {key: 'type', header: 'Tipo'}]}
              RenderFormComponent={BinMaterialForm}
              docNameField="name"
              csvHeaders={['code', 'name', 'exporterId', 'type']}
              csvTemplateFileName="plantilla_bins_y_materiales.csv"
              formProps={{ exporters }}
            />
          </TabsContent>
          <TabsContent value="otherClients" className="mt-4">
            <MasterDataShell
              collectionName="otherClients"
              schema={otherClientSchema}
              columns={[{key: 'clientId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'type', header: 'Tipo'}]}
              RenderFormComponent={OtherClientForm}
              docNameField="name"
              csvHeaders={['clientId', 'name', 'type']}
              csvTemplateFileName="plantilla_otros_clientes.csv"
              formProps={{}}
            />
          </TabsContent>
          <TabsContent value="packagingMaster" className="mt-4">
             <MasterDataShell
                collectionName="packagingMaster"
                schema={packagingMasterSchema}
                columns={[{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'clientId', header: 'ID Cliente'}]}
                RenderFormComponent={PackagingMasterForm}
                docNameField="name"
                csvHeaders={['code', 'name', 'clientId']}
                csvTemplateFileName="plantilla_embalajes.csv"
                formProps={{ otherClients }}
              />
          </TabsContent>
           <TabsContent value="usersMaster" className="mt-4">
             <MasterDataShell
                collectionName="usersMaster"
                schema={userMasterSchema}
                columns={[{key: 'userName', header: 'Usuario'}, {key: 'profileId', header: 'ID Perfil'}]}
                RenderFormComponent={UserMasterForm}
                docNameField="userName"
                csvHeaders={['userName', 'profileId']}
                csvTemplateFileName="plantilla_usuarios.csv"
                formProps={{ profiles }}
              />
          </TabsContent>
          <TabsContent value="profiles" className="mt-4">
            <MasterDataShell
              collectionName="profiles"
              schema={profileSchema}
              columns={[{key: 'profileId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'modulesAccess', header: 'Módulos'}]}
              RenderFormComponent={ProfileForm}
              docNameField="name"
              csvHeaders={['profileId', 'name', 'modulesAccess']}
              csvTemplateFileName="plantilla_perfiles.csv"
              formProps={{}}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
