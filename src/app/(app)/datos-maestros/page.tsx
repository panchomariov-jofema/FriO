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
  ModulePermission,
  BusinessEntity,
  Warehouse,
  Aisle,
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
  businessEntitySchema,
  warehouseSchema,
  aisleSchema,
} from '@/lib/schemas';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ModulePermissionsSelector } from '@/components/master-data/ModulePermissionsSelector';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
    <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <FormLabel>Estado</FormLabel>
              <FormDescription>
                Pausa la operación de este exportador.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value !== 'inactivo'}
                onCheckedChange={(checked) => field.onChange(checked ? 'activo' : 'inactivo')}
              />
            </FormControl>
          </FormItem>
        )}
      />
    <LogisticsConfigFields form={form} />
  </>
);

const LogisticsConfigFields = ({ form }: { form: any }) => (
  <Accordion type="single" collapsible className="w-full mt-4 border rounded-md px-4 bg-muted/30">
    <AccordionItem value="logistics" className="border-b-0">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-full">
            <Settings2 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold">Configuración de Logística</span>
            <span className="text-xs text-muted-foreground font-normal">Modelos de almacenamiento y densidades</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pt-2 pb-4">
        <FormField
          control={form.control}
          name="storageStrategy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Modelo de Almacenamiento</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un modelo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="secuencial">Vertical Estándar (A1 &rarr; A12)</SelectItem>
                  <SelectItem value="horizontal-secuencial">Horizontal Estándar (A1 &rarr; L1)</SelectItem>
                  <SelectItem value="inverted-secuencial">Vertical FIFO (A12 &rarr; A1)</SelectItem>
                  <SelectItem value="fifo">Serpiente (Z-pattern)</SelectItem>
                  <SelectItem value="aisle-access">Acceso Pasillos (Fall Creek)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className="text-[10px]">Define el orden de llenado sugerido por el sistema.</FormDescription>
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="binsPerCoordinate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Bins / Coordenada</FormLabel>
                <FormControl>
                  <Input type="number" {...field} placeholder="Ej: 9" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="palletsPerCoordinate"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Pallets / Coordenada</FormLabel>
                <FormControl>
                  <Input type="number" {...field} placeholder="Ej: 3" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);

const ProducerForm = ({ form, exporters }: { form: any; exporters: Exporter[] }) => {
  const selectedExporterIds = form.watch('exporterId') || [];
  const exporterIdArray = React.useMemo(() => {
    return Array.isArray(selectedExporterIds) ? selectedExporterIds : (selectedExporterIds ? [selectedExporterIds] : []);
  }, [selectedExporterIds]);

  return (
    <>
      <FormField control={form.control} name="producerId" render={({ field }) => (
        <FormItem><FormLabel>ID Productor</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="shortName" render={({ field }) => (
        <FormItem><FormLabel>Nombre Corto</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      
      <FormField
        control={form.control}
        name="exporterId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Exportador / Dueño (Seleccione uno o más)</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between h-auto min-h-10 text-left font-normal",
                      !exporterIdArray.length && "text-muted-foreground"
                    )}
                  >
                    <div className="flex flex-wrap gap-1">
                      {exporterIdArray.length > 0 ? (
                        exporterIdArray.map((id: string) => (
                          <Badge key={id} variant="secondary" className="font-normal">
                            {exporters.find(e => e.exporterId === id)?.name || id}
                          </Badge>
                        ))
                      ) : (
                        "Seleccione exportadores..."
                      )}
                    </div>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <ScrollArea className="h-60">
                  <div className="p-2 space-y-1">
                    {exporters.filter(e => e.status !== 'inactivo').map((exporter) => (
                      <div
                        key={exporter.exporterId}
                        className={cn(
                          "flex items-center space-x-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent hover:text-accent-foreground",
                          exporterIdArray.includes(exporter.exporterId) && "bg-accent/50"
                        )}
                        onClick={() => {
                          const current = [...exporterIdArray];
                          const index = current.indexOf(exporter.exporterId);
                          if (index > -1) {
                            current.splice(index, 1);
                          } else {
                            current.push(exporter.exporterId);
                          }
                          field.onChange(current);
                        }}
                      >
                        <Checkbox
                          checked={exporterIdArray.includes(exporter.exporterId)}
                          onCheckedChange={() => {}} // handled by parent div click
                        />
                        <span className="flex-1 truncate text-sm">{exporter.name}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />

       <FormField control={form.control} name="rut" render={({ field }) => (
        <FormItem><FormLabel>RUT</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="giro" render={({ field }) => (
        <FormItem><FormLabel>Giro</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="direccion" render={({ field }) => (
        <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="comuna" render={({ field }) => (
        <FormItem><FormLabel>Comuna</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="ciudad" render={({ field }) => (
        <FormItem><FormLabel>Ciudad</FormLabel><FormControl><Input {...field} value={field.value ?? ''} autoComplete="off" /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <FormLabel>Estado</FormLabel>
              <FormDescription>
                Productores inactivos no se mostrarán en otras listas.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value !== 'inactivo'}
                onCheckedChange={(checked) => field.onChange(checked ? 'activo' : 'inactivo')}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  )
};

const BinMaterialForm = ({ form, exporters, binMaterials }: { form: any, exporters: Exporter[], binMaterials: BinMaterial[] }) => {
    const nextCode = React.useMemo(() => {
        if (!binMaterials || binMaterials.length === 0) return '10016';
        const numericCodes = binMaterials
            .map(m => parseInt(m.code, 10))
            .filter(c => !isNaN(c));
        const maxCode = numericCodes.length > 0 ? Math.max(...numericCodes) : 10015;
        return String(Math.max(10015, maxCode) + 1);
    }, [binMaterials]);

    const currentCode = form.watch('code');

    React.useEffect(() => {
        if (!currentCode) {
            form.setValue('code', nextCode);
        }
    }, [nextCode, currentCode, form]);

    return (
    <>
      <FormField control={form.control} name="code" render={({ field }) => (
        <FormItem>
          <FormLabel>Código</FormLabel>
          <FormControl>
            <Input {...field} readOnly className="bg-muted font-bold" autoComplete="off" />
          </FormControl>
          <FormMessage />
        </FormItem>
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
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <FormLabel>Estado</FormLabel>
              <FormDescription>
                Clientes inactivos no se mostrarán en otras listas.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value !== 'inactivo'}
                onCheckedChange={(checked) => field.onChange(checked ? 'activo' : 'inactivo')}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <LogisticsConfigFields form={form} />
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
      <FormField
        control={form.control}
        name="modulesAccess"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Acceso a Módulos</FormLabel>
             <ModulePermissionsSelector
                value={field.value ?? []}
                onChange={field.onChange}
              />
            <FormMessage />
          </FormItem>
        )}
      />
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

const BusinessEntityForm = ({ form }: { form: any }) => (
  <>
    <FormField control={form.control} name="rut" render={({ field }) => (
      <FormItem><FormLabel>RUT</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="razonSocial" render={({ field }) => (
      <FormItem><FormLabel>Razón Social</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="direccion" render={({ field }) => (
      <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="ciudad" render={({ field }) => (
      <FormItem><FormLabel>Ciudad</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="comuna" render={({ field }) => (
      <FormItem><FormLabel>Comuna</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="giro" render={({ field }) => (
      <FormItem><FormLabel>Giro/Actividad</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField control={form.control} name="actividadComercial" render={({ field }) => (
      <FormItem><FormLabel>Act. Comercial</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
  </>
);

const WarehouseForm = ({ form }: { form: any }) => (
  <>
    <FormField control={form.control} name="name" render={({ field }) => (
      <FormItem><FormLabel>Nombre del Almacén</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
  </>
);

const AisleForm = ({ form, warehouses }: { form: any; warehouses: Warehouse[] }) => {
  const warehouseIds = form.watch('warehouseIds') || [];
  const areAllSelected = warehouses.length > 0 && warehouseIds.length === warehouses.length;

  const handleToggleSelectAll = () => {
    if (areAllSelected) {
      form.setValue('warehouseIds', [], { shouldDirty: true });
    } else {
      const allWarehouseIds = warehouses.map(w => w.id);
      form.setValue('warehouseIds', allWarehouseIds, { shouldDirty: true });
    }
  };

  return (
  <>
    <FormField control={form.control} name="name" render={({ field }) => (
      <FormItem><FormLabel>Nombre del Pasillo</FormLabel><FormControl><Input {...field} autoComplete="off" /></FormControl><FormMessage /></FormItem>
    )} />
    <FormField
      control={form.control}
      name="warehouseIds"
      render={({ field }) => (
        <FormItem>
          <div className="mb-2">
            <FormLabel className="text-base">
              Almacenes Asociados
            </FormLabel>
            <FormDescription>
              Seleccione los almacenes a los que pertenece este pasillo.
            </FormDescription>
          </div>
          <div className="mb-2">
            <Button type="button" variant="outline" size="sm" onClick={handleToggleSelectAll} disabled={warehouses.length === 0}>
                {areAllSelected ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
            </Button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-2 rounded-md border p-4">
            {warehouses.map((warehouse) => (
              <FormField
                key={warehouse.id}
                control={form.control}
                name="warehouseIds"
                render={({ field }) => {
                  return (
                    <FormItem
                      key={warehouse.id}
                      className="flex flex-row items-start space-x-3 space-y-0"
                    >
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(warehouse.id)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([
                                  ...(field.value || []),
                                  warehouse.id,
                                ])
                              : field.onChange(
                                  field.value?.filter(
                                    (value: string) => value !== warehouse.id
                                  )
                                );
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {warehouse.name}
                      </FormLabel>
                    </FormItem>
                  );
                }}
              />
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  </>
  );
};


export default function DatosMaestrosPage() {
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherClients, loading: loadingOtherClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
  const { data: warehouses, loading: loadingWarehouses } = useFirestoreCollection<Warehouse>('warehouses');
  const { data: binMaterials, loading: loadingBinMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');

  const warehouseMap = React.useMemo(() => {
    if (loadingWarehouses || !warehouses) return new Map<string, string>();
    return new Map(warehouses.map(w => [w.id, w.name]));
  }, [warehouses, loadingWarehouses]);


  const tabs = [
    { value: 'exporters', label: 'Exportadores' },
    { value: 'producers', label: 'Productores' },
    { value: 'binMaterials', label: 'Bins y Mat.' },
    { value: 'otherClients', label: 'Otros Clientes' },
    { value: 'packagingMaster', label: 'Embalajes' },
    { value: 'warehouses', label: 'Almacenes (Emb.)' },
    { value: 'aisles', label: 'Pasillos (Emb.)' },
    { value: 'packing', label: 'Packing' },
    { value: 'usersMaster', label: 'Usuarios' },
    { value: 'profiles', label: 'Perfiles' },
    { value: 'hidrocoolers', label: 'Hidro-coolers' },
    { value: 'businessEntities', label: 'Datos Matriz' },
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
            <MasterDataShell<Exporter>
              title="Exportadores"
              collectionName="exporters"
              schema={exporterSchema}
              columns={[
                {key: 'exporterId', header: 'ID'}, 
                {key: 'name', header: 'Nombre'}, 
                {key: 'type', header: 'Tipo'},
                {key: 'status', header: 'Estado'}
              ]}
              RenderFormComponent={ExporterForm}
              docNameField="name"
              csvHeaders={['exporterId', 'name', 'type', 'status']}
              csvTemplateFileName="plantilla_exportadores.csv"
              formProps={{}}
            />
          </TabsContent>
          <TabsContent value="producers" className="mt-4">
            <MasterDataShell<Producer>
              title="Productores"
              collectionName="producers"
              schema={producerSchema}
              columns={[
                {key: 'producerId', header: 'ID'}, 
                {key: 'shortName', header: 'Nombre Corto'}, 
                {key: 'name', header: 'Nombre'}, 
                {key: 'status', header: 'Estado'},
                {
                    key: 'exporterId', 
                    header: 'ID Exportador',
                    render: (item: Producer) => {
                        if (Array.isArray(item.exporterId)) {
                            return item.exporterId.join(', ');
                        }
                        return item.exporterId || '—';
                    }
                },
                {key: 'rut', header: 'RUT'},
                {key: 'giro', header: 'Giro'},
                {key: 'direccion', header: 'Dirección'},
                {key: 'comuna', header: 'Comuna'},
                {key: 'ciudad', header: 'Ciudad'}
              ]}
              RenderFormComponent={ProducerForm}
              docNameField="name"
              csvHeaders={['producerId', 'shortName', 'name', 'exporterId', 'rut', 'giro', 'direccion', 'comuna', 'ciudad', 'status']}
              csvTemplateFileName="plantilla_productores.csv"
              formProps={{ exporters: loadingExporters ? [] : exporters }}
            />
          </TabsContent>
          <TabsContent value="binMaterials" className="mt-4">
            <MasterDataShell<BinMaterial>
              title="Bins y Materiales"
              collectionName="binMaterials"
              schema={binMaterialSchema}
              columns={[{key: 'code', header: 'Código'}, {key: 'name', header: 'Nombre'}, {key: 'exporterId', header: 'ID Exportador'}, {key: 'type', header: 'Tipo'}]}
              RenderFormComponent={BinMaterialForm}
              docNameField="name"
              csvHeaders={['code', 'name', 'exporterId', 'type']}
              csvTemplateFileName="plantilla_bins_y_materiales.csv"
              formProps={{ 
                exporters: loadingExporters ? [] : exporters,
                binMaterials: loadingBinMaterials ? [] : binMaterials
              }}
            />
          </TabsContent>
          <TabsContent value="otherClients" className="mt-4">
            <MasterDataShell<OtherClient>
              title="Otros Clientes"
              collectionName="otherClients"
              schema={otherClientSchema}
              columns={[{key: 'clientId', header: 'ID'}, {key: 'name', header: 'Nombre'}, {key: 'type', header: 'Tipo'}, {key: 'unit', header: 'Unidad'}, {key: 'status', header: 'Estado'}]}
              RenderFormComponent={OtherClientForm}
              docNameField="name"
              csvHeaders={['clientId', 'name', 'type', 'unit', 'status']}
              csvTemplateFileName="plantilla_otros_clientes.csv"
              formProps={{}}
            />
          </TabsContent>
          <TabsContent value="packagingMaster" className="mt-4">
             <MasterDataShell<PackagingMaster>
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
           <TabsContent value="warehouses" className="mt-4">
            <MasterDataShell<Warehouse>
              title="Almacenes de Embalaje"
              collectionName="warehouses"
              schema={warehouseSchema}
              columns={[{key: 'name', header: 'Nombre'}]}
              RenderFormComponent={WarehouseForm}
              docNameField="name"
              csvHeaders={['name']}
              csvTemplateFileName="plantilla_almacenes.csv"
              formProps={{}}
            />
          </TabsContent>
          <TabsContent value="aisles" className="mt-4">
            <MasterDataShell<Aisle>
              title="Pasillos de Embalaje"
              collectionName="aisles"
              schema={aisleSchema}
              columns={[
                {key: 'name', header: 'Nombre'},
                {
                    key: 'warehouseIds', 
                    header: 'Almacenes',
                    render: (item: Aisle) => {
                        if (!item.warehouseIds || item.warehouseIds.length === 0) return 'N/A';
                        return item.warehouseIds.map(id => warehouseMap.get(id) || id).join(', ');
                    }
                }
              ]}
              RenderFormComponent={AisleForm}
              docNameField="name"
              csvHeaders={['name', 'warehouseIds']}
              csvTemplateFileName="plantilla_pasillos.csv"
              formProps={{ warehouses: loadingWarehouses ? [] : warehouses }}
              exportDataTransform={(dataToTransform: Aisle[]) =>
                dataToTransform.map(aisle => ({
                  ...aisle,
                  warehouseIds: (aisle.warehouseIds || [])
                    .map(id => warehouseMap.get(id) || id)
                    .join(', '),
                }))
              }
            />
          </TabsContent>
           <TabsContent value="packing" className="mt-4">
             <MasterDataShell<Packing>
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
             <MasterDataShell<UserMaster>
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
            <MasterDataShell<Profile>
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
            <MasterDataShell<Hidrocooler>
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
          <TabsContent value="businessEntities" className="mt-4">
            <MasterDataShell<BusinessEntity>
              title="Datos Matriz"
              collectionName="businessEntities"
              schema={businessEntitySchema}
              columns={[
                {key: 'rut', header: 'RUT'}, 
                {key: 'razonSocial', header: 'Razón Social'}, 
                {key: 'giro', header: 'Giro'}, 
                {key: 'actividadComercial', header: 'Act. Comercial'}
              ]}
              RenderFormComponent={BusinessEntityForm}
              docNameField="razonSocial"
              csvHeaders={['rut', 'razonSocial', 'direccion', 'ciudad', 'comuna', 'giro', 'actividadComercial']}
              csvTemplateFileName="plantilla_datos_matriz.csv"
              formProps={{}}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
