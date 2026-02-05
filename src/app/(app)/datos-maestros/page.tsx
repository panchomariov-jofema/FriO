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
  Packing,
  UserMaster,
  Profile,
  Hidrocooler,
} from '@/lib/types';
import {
  exporterSchema,
  producerSchema,
  binMaterialSchema,
  otherClientSchema,
  packagingMasterSchema,
  packingSchema,
  userMasterSchema,
  profileSchema,
  hidrocoolerSchema,
} from '@/lib/schemas';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const ExporterForm = ({ form }: { form: any }) => (
  <>
    <FormField control={form.control} name="exporterId" render={({ field }) => (
      <FormItem><FormLabel>ID Exportador</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="name" render={({ field }) => (
      <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="type" render={({ field }) => (
      <FormItem><FormLabel>Tipo</FormLabel><FormControl><Input {...field} placeholder="Ej: exportador, productor_exportador" autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
  </>
);

const ProducerForm = ({ form, exporters }: { form: any; exporters: Exporter[] }) => {
  return (
    <>
      <FormField control={form.control} name="producerId" render={({ field }) => (
        <FormItem><FormLabel>ID Productor</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="shortName" render={({ field }) => (
        <FormItem><FormLabel>Nombre Corto</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="exporterId" render={({ field }) => (
        <FormItem><FormLabel>Exportador</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
        <FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="exporterId" render={({ field }) => (
        <FormItem><FormLabel>Exportador</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un exportador" /></SelectTrigger></FormControl>
          <SelectContent>{exporters?.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="type" render={({ field }) => (
        <FormItem><FormLabel>Tipo</FormLabel><FormControl><Input {...field} placeholder="Ej: bin, material" autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
    </>
  )
};

const OtherClientForm = ({ form }: { form: any }) => (
    <>
      <FormField control={form.control} name="clientId" render={({ field }) => (
        <FormItem><FormLabel>ID Cliente</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="type" render={({ field }) => (
        <FormItem><FormLabel>Tipo</FormLabel>
        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un tipo" /></SelectTrigger></FormControl>
          <SelectContent>
            <SelectItem value="embalaje">Embalaje</SelectItem>
            <SelectItem value="frio_hortofruticola">Frío Hortofrutícola</SelectItem>
            <SelectItem value="fruta">Fruta</SelectItem>
          </SelectContent>
        </Select>
        <FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="unit" render={({ field }) => (
        <FormItem><FormLabel>Unidad</FormLabel>
        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione una unidad" /></SelectTrigger></FormControl>
          <SelectContent>
            <SelectItem value="Bins">Bins</SelectItem>
            <SelectItem value="Pallets">Pallets</SelectItem>
          </SelectContent>
        </Select>
        <FormMessage /></FormItem>
      )} />
    </>
);

const PackagingMasterForm = ({ form, otherClients }: { form: any, otherClients: OtherClient[] }) => {
    return (
    <>
      <FormField control={form.control} name="code" render={({ field }) => (
        <FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
       <FormField control={form.control} name="clientId" render={({ field }) => (
        <FormItem><FormLabel>Cliente</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl>
          <SelectContent>{otherClients?.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
    </>
  )
};

const PackingForm = ({ form, exporters }: { form: any; exporters: Exporter[] }) => {
  return (
    <>
      <FormField control={form.control} name="exporterId" render={({ field }) => (
        <FormItem><FormLabel>Exportador</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un exportador" /></SelectTrigger></FormControl>
          <SelectContent>{exporters?.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
        </Select><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
    </>
  )
};

const UserMasterForm = ({ form, profiles }: { form: any, profiles: Profile[] }) => {
    return (
    <>
      <FormField control={form.control} name="userName" render={({ field }) => (
        <FormItem><FormLabel>Nombre Usuario</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="profileId" render={({ field }) => (
        <FormItem><FormLabel>Perfil</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
        <FormItem><FormLabel>ID Perfil</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="modulesAccess" render={({ field }) => (
        <FormItem>
          <FormLabel>Acceso a Módulos (JSON o simple)</FormLabel>
          <FormControl>
            <Textarea {...field} placeholder='["Dashboard", {"name": "Cámaras", "rules":...}] o Dashboard,Recepción,Cámaras...' autoComplete="off" rows={5} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </>
);

const HidrocoolerForm = ({ form }: { form: any }) => (
    <>
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="binCount" render={({ field }) => (
        <FormItem><FormLabel>Cantidad de Bins</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
    </>
);

export default function DatosMaestrosPage() {
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherClients, loading: loadingOtherClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');

  const tabs = [
    { value: 'exporters', label: 'Exportadores' },
    { value: 'producers', label: 'Productores' },
    { value: 'binMaterials', label: 'Bins y Mat.' },
    { value: 'otherClients', label: 'Otros Clientes' },
    { value: 'packagingMaster', label: 'Embalajes' },
    { value: 'packing', label: 'Packing' },
    { value: 'usersMaster', label: 'Usuarios' },
    { value: 'profiles', label: 'Perfiles' },
    { value: 'hidrocoolers', label: 'Hidro-coolers' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos Maestros</CardTitle>
        <CardDescription>Gestione los datos centrales de la aplicación.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="exporters" className="w-full">
          <TabsList className="h-auto flex-wrap justify-start">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value="exporters" className="mt-4">
            <MasterDataShell
              title="Exportadores"
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
              title="Productores"
              collectionName="producers"
              schema={producerSchema}
              columns={[{key: 'producerId', header: 'ID'}, {key: 'shortName', header: 'Nombre Corto'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}]}
              RenderFormComponent={ProducerForm}
              docNameField="name"
              csvHeaders={['producerId', 'shortName', 'name', 'exporterId']}
              csvTemplateFileName="plantilla_productores.csv"
              formProps={{ exporters: loadingExporters ? [] : exporters }}
            />
          </TabsContent>
          <TabsContent value="binMaterials" className="mt-4">
            <MasterDataShell
              title="Bins y Materiales"
              collectionName="binMaterials"
              schema={binMaterialSchema}
              columns={[{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}, {key: 'type', header: 'Tipo'}]}
              RenderFormComponent={BinMaterialForm}
              docNameField="name"
              csvHeaders={['code', 'name', 'exporterId', 'type']}
              csvTemplateFileName="plantilla_bins_y_materiales.csv"
              formProps={{ exporters: loadingExporters ? [] : exporters }}
            />
          </TabsContent>
          <TabsContent value="otherClients" className="mt-4">
            <MasterDataShell
              title="Otros Clientes"
              collectionName="otherClients"
              schema={otherClientSchema}
              columns={[{key: 'clientId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'type', header: 'Tipo'}, {key: 'unit', header: 'Unidad'}]}
              RenderFormComponent={OtherClientForm}
              docNameField="name"
              csvHeaders={['clientId', 'name', 'type', 'unit']}
              csvTemplateFileName="plantilla_otros_clientes.csv"
              formProps={{}}
            />
          </TabsContent>
          <TabsContent value="packagingMaster" className="mt-4">
             <MasterDataShell
                title="Maestro de Embalajes"
                collectionName="packagingMaster"
                schema={packagingMasterSchema}
                columns={[{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'clientId', header: 'ID Cliente'}]}
                RenderFormComponent={PackagingMasterForm}
                docNameField="name"
                csvHeaders={['code', 'name', 'clientId']}
                csvTemplateFileName="plantilla_embalajes.csv"
                formProps={{ otherClients: loadingOtherClients ? [] : otherClients }}
              />
          </TabsContent>
           <TabsContent value="packing" className="mt-4">
             <MasterDataShell
                title="Packing"
                collectionName="packings"
                schema={packingSchema}
                columns={[{key: 'exporterId', header: 'ID Exportador'}, {key: 'name', header: 'Nombre'}]}
                RenderFormComponent={PackingForm}
                docNameField="name"
                csvHeaders={['exporterId', 'name']}
                csvTemplateFileName="plantilla_packing.csv"
                formProps={{ exporters: loadingExporters ? [] : exporters }}
              />
          </TabsContent>
           <TabsContent value="usersMaster" className="mt-4">
             <MasterDataShell
                title="Maestro de Usuarios"
                collectionName="usersMaster"
                schema={userMasterSchema}
                columns={[{key: 'userName', header: 'Usuario'}, {key: 'profileId', header: 'ID Perfil'}]}
                RenderFormComponent={UserMasterForm}
                docNameField="userName"
                csvHeaders={['userName', 'profileId']}
                csvTemplateFileName="plantilla_usuarios.csv"
                formProps={{ profiles: loadingProfiles ? [] : profiles }}
              />
          </TabsContent>
          <TabsContent value="profiles" className="mt-4">
            <MasterDataShell
              title="Perfiles"
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
          <TabsContent value="hidrocoolers" className="mt-4">
            <MasterDataShell
              title="Hidrocoolers"
              collectionName="hidrocoolers"
              schema={hidrocoolerSchema}
              columns={[{key: 'name', header: 'Nombre'}, {key: 'binCount', header: 'Cantidad Bins'}]}
              RenderFormComponent={HidrocoolerForm}
              docNameField="name"
              csvHeaders={['name', 'binCount']}
              csvTemplateFileName="plantilla_hidrocoolers.csv"
              formProps={{}}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
