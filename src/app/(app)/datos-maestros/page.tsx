'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MasterDataShell } from '@/components/master-data/MasterDataShell';
import { TelegramSettings } from '@/components/master-data/TelegramSettings';
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
import { ChevronDown, Settings2, QrCode, Printer, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import QRCode from 'qrcode';

interface QRLabelItemProps {
    code: string;
    width?: number;
    height?: number;
    showLabelText?: boolean;
}

function QRLabelItem({ code, width = 100, height = 100, showLabelText = true }: QRLabelItemProps) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, code, {
                width: width,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }, (error) => {
                if (error) console.error("Error generating QR code:", error);
            });
        }
    }, [code, width]);

    return (
        <div className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-dashed border-slate-300">
            <canvas ref={canvasRef} className="max-w-full" style={{ width: `${width}px`, height: `${height}px` }} />
            {showLabelText && (
                <span className="mt-2 text-xs font-mono font-bold text-slate-500">{code}</span>
            )}
        </div>
    );
}

function PrintableQRLabel({ code }: { code: string }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, code, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }, (error) => {
                if (error) console.error("Error generating QR code:", error);
            });
        }
    }, [code]);

    return (
        <div className="print-label">
            <canvas ref={canvasRef} />
        </div>
    );
}

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
                  <SelectItem value="serpentina-vertical">Serpentina Vertical</SelectItem>
                  <SelectItem value="modelo-sof">Modelo SOF (Serpentina Continua)</SelectItem>
                  <SelectItem value="fifo-vertical">FIFO Vertical (Puerta &rarr; Fondo)</SelectItem>
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
                  <Input type="number" {...field} value={field.value ?? ''} placeholder="Ej: 9" />
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
                  <Input type="number" {...field} value={field.value ?? ''} placeholder="Ej: 3" />
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

  const { toast } = useToast();

  // States for QR generator
  const [labelPrefix, setLabelPrefix] = React.useState('BIN-FC-');
  const [labelStartNum, setLabelStartNum] = React.useState(1);
  const [labelQuantity, setLabelQuantity] = React.useState(50);
  const [labelPadding, setLabelPadding] = React.useState(4);
  const [labelDimensions, setLabelDimensions] = React.useState('100x60');
  const [customWidth, setCustomWidth] = React.useState(100);
  const [customHeight, setCustomHeight] = React.useState(60);
  const [qrPrintSize, setQrPrintSize] = React.useState(30);

  const generatedCodes = React.useMemo(() => {
      const codes: string[] = [];
      const start = Number(labelStartNum) || 1;
      const qty = Number(labelQuantity) || 0;
      const pad = Number(labelPadding) || 4;
      for (let i = 0; i < qty; i++) {
          const num = (start + i).toString().padStart(pad, '0');
          codes.push(`${labelPrefix}${num}`);
      }
      return codes;
  }, [labelPrefix, labelStartNum, labelQuantity, labelPadding]);

  const handleDownloadCSV = () => {
      let csvContent = "data:text/csv;charset=utf-8,Codigo,Texto\n";
      generatedCodes.forEach(code => {
          csvContent += `"${code}","${code}"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      
      const cleanPrefix = labelPrefix.replace(/[^a-zA-Z0-9]/g, '');
      link.setAttribute("download", `etiquetas_qr_${cleanPrefix}_x${generatedCodes.length}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
          title: "CSV Descargado",
          description: `Se han exportado ${generatedCodes.length} códigos para BarTender.`
      });
  };

  const handlePrintLabels = () => {
      window.print();
  };

  const tabs = [
    { value: 'exporters', label: 'Exportadores' },
    { value: 'producers', label: 'Productores' },
    { value: 'binMaterials', label: 'Bins y Mat.' },
    { value: 'otherClients', label: 'Clientes' },
    { value: 'packagingMaster', label: 'Embalajes' },
    { value: 'warehouses', label: 'Almacenes (Emb.)' },
    { value: 'aisles', label: 'Pasillos (Emb.)' },
    { value: 'packing', label: 'Packing' },
    { value: 'usersMaster', label: 'Usuarios' },
    { value: 'profiles', label: 'Perfiles' },
    { value: 'hidrocoolers', label: 'Hidro-coolers' },
    { value: 'businessEntities', label: 'Datos Matriz' },
    { value: 'labels', label: 'Generar Etiquetas' },
    { value: 'telegram', label: 'Config. Telegram' },
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
              title="Clientes"
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
          <TabsContent value="labels" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Generador Masivo de Etiquetas QR
                </CardTitle>
                <CardDescription>
                  Configure la numeración secuencial de los Bins para generar los códigos de barra correspondientes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-muted/30 rounded-lg border">
                  <div className="space-y-1">
                    <Label htmlFor="label-prefix">Prefijo</Label>
                    <Input 
                      id="label-prefix" 
                      value={labelPrefix} 
                      onChange={e => setLabelPrefix(e.target.value)} 
                      placeholder="Ej: BIN-FC-" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="label-start">N° Inicial</Label>
                    <Input 
                      id="label-start" 
                      type="number" 
                      value={labelStartNum} 
                      onChange={e => setLabelStartNum(parseInt(e.target.value) || 1)} 
                      min="1" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="label-qty">Cantidad</Label>
                    <Input 
                      id="label-qty" 
                      type="number" 
                      value={labelQuantity} 
                      onChange={e => setLabelQuantity(parseInt(e.target.value) || 0)} 
                      min="1" 
                      max="500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="label-pad">Padding (Dígitos)</Label>
                    <Input 
                      id="label-pad" 
                      type="number" 
                      value={labelPadding} 
                      onChange={e => setLabelPadding(parseInt(e.target.value) || 1)} 
                      min="1" 
                      max="10" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="label-dim">Dimensiones</Label>
                    <select 
                      id="label-dim" 
                      value={labelDimensions} 
                      onChange={e => setLabelDimensions(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="60x100">PP 60x100 mm (Vertical)</option>
                      <option value="100x60">PP 100x60 mm (Horizontal)</option>
                      <option value="custom">Personalizado (mm)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="qr-size">Tamaño QR (mm)</Label>
                    <Input 
                      id="qr-size" 
                      type="number" 
                      value={qrPrintSize} 
                      onChange={e => setQrPrintSize(parseInt(e.target.value) || 30)} 
                      min="10" 
                      max="150" 
                    />
                  </div>
                  {labelDimensions === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 md:col-span-6 pt-2">
                      <div className="space-y-1">
                        <Label htmlFor="custom-w">Ancho (mm)</Label>
                        <Input 
                          id="custom-w" 
                          type="number" 
                          value={customWidth} 
                          onChange={e => setCustomWidth(parseInt(e.target.value) || 100)} 
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="custom-h">Alto (mm)</Label>
                        <Input 
                          id="custom-h" 
                          type="number" 
                          value={customHeight} 
                          onChange={e => setCustomHeight(parseInt(e.target.value) || 60)} 
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <Button 
                    onClick={handleDownloadCSV} 
                    variant="outline" 
                    className="border-[#7aba28] text-[#7aba28] hover:bg-[#7aba28]/10 font-medium"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Descargar CSV para BarTender
                  </Button>
                  <Button 
                    onClick={handlePrintLabels} 
                    className="bg-primary hover:bg-primary/90 text-white font-semibold"
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir Etiquetas (Solo QR)
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="font-semibold text-slate-700">Vista Previa de Códigos</h3>
                    <Badge variant="secondary" className="bg-primary/10 text-primary font-mono">
                      {generatedCodes.length} etiquetas
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[300px] overflow-y-auto p-2 bg-slate-50 border rounded-md">
                    {generatedCodes.map((code) => (
                      <QRLabelItem key={code} code={code} />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Print area container with isolated stylesheets dynamically applied on printing */}
            <div className="hidden print:block" style={{
              ['--page-width' as any]: labelDimensions === '60x100' ? '60mm' : labelDimensions === '100x60' ? '100mm' : `${customWidth}mm`,
              ['--page-height' as any]: labelDimensions === '60x100' ? '100mm' : labelDimensions === '100x60' ? '60mm' : `${customHeight}mm`,
              ['--qr-size' as any]: `${qrPrintSize}mm`,
            }}>
              <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  body * {
                    visibility: hidden !important;
                  }
                  #react-print-area, #react-print-area * {
                    visibility: visible !important;
                  }
                  #react-print-area {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  @page {
                    size: var(--page-width, 100mm) var(--page-height, 60mm);
                    margin: 0 !important;
                  }
                  .print-label {
                    width: var(--page-width, 100mm) !important;
                    height: var(--page-height, 60mm) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    page-break-after: always !important;
                    page-break-inside: avoid !important;
                    box-sizing: border-box !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                  }
                  .print-label canvas {
                    width: var(--qr-size, 30mm) !important;
                    height: var(--qr-size, 30mm) !important;
                    display: block !important;
                    margin: auto !important;
                  }
                }
              `}} />
              <div id="react-print-area">
                {generatedCodes.map((code) => (
                  <PrintableQRLabel key={code} code={code} />
                ))}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="telegram" className="mt-4">
            <TelegramSettings />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
