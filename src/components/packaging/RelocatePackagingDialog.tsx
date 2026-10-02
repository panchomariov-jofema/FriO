'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Warehouse, Aisle, OtherFruitReception, ChamberLot } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { naturalSort, getEffectiveChamberConfig, getSortedCoordinates } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Warehouse as WarehouseIcon, Snowflake, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface RelocatePackagingData {
  destinationType: 'warehouse' | 'chamber';
  warehouse?: string;
  aisle?: string;
  chamberId?: string;
  coordinate?: string;
}

interface RelocatePackagingDialogProps {
  item: {
      name: string;
      palletCount: number;
      location?: {
          warehouse?: string;
          aisle?: string;
          chamberId?: string;
          coordinate?: string;
      };
      [key: string]: any;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: RelocatePackagingData) => void;
}

const relocateSchema = z.object({
  destinationType: z.enum(['warehouse', 'chamber']).default('warehouse'),
  warehouse: z.string().optional(),
  aisle: z.string().optional(),
  chamberId: z.string().optional(),
  coordinate: z.string().optional(),
});

type RelocateFormValues = z.infer<typeof relocateSchema>;

export function RelocatePackagingDialog({ item, open, onOpenChange, onConfirm }: RelocatePackagingDialogProps) {
  const [destinationType, setDestinationType] = React.useState<'warehouse' | 'chamber'>('warehouse');

  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: { 
      destinationType: 'warehouse',
      warehouse: undefined, 
      aisle: undefined,
      chamberId: undefined,
      coordinate: undefined,
    },
  });
  
  const { data: warehouses, loading: loadingWarehouses } = useFirestoreCollection<Warehouse>('warehouses');
  const { data: allAisles, loading: loadingAisles } = useFirestoreCollection<Aisle>('aisles');
  const { data: allChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: otherFruitReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');

  // Sanitary map: detect which chambers currently contain Fruit vs Packaging
  const chamberSanitaryMap = React.useMemo(() => {
    const map = new Map<string, { hasFruit: boolean; hasPackaging: boolean; totalUnits: number }>();
    Object.keys(chambersConfig).forEach(chId => {
      map.set(chId, { hasFruit: false, hasPackaging: false, totalUnits: 0 });
    });

    // 1. Cherry lots are Fruit
    (allChamberLots || []).forEach(lot => {
      if (lot.status === 'Almacenado' && lot.chamberId && lot.binCount > 0) {
        const entry = map.get(lot.chamberId);
        if (entry) {
          entry.hasFruit = true;
          entry.totalUnits += lot.binCount;
        }
      }
    });

    // 2. OtherFruit Receptions (Fruit vs Packaging)
    (otherFruitReceptions || []).forEach(reception => {
      const isPkg = reception.clientName?.toUpperCase().includes('VITAFOOD') || 
                    reception.clientId?.toUpperCase().includes('VITAFOOD') ||
                    reception.clientName?.toUpperCase().includes('EMBALAJE');
      (reception.items || []).forEach(it => {
        if (it.status === 'Almacenado' && it.storageLocation?.chamberId && it.quantity > 0) {
          const entry = map.get(it.storageLocation.chamberId);
          if (entry) {
            if (isPkg) {
              entry.hasPackaging = true;
            } else {
              entry.hasFruit = true;
            }
            entry.totalUnits += 1;
          }
        }
      });
    });

    return map;
  }, [allChamberLots, otherFruitReceptions]);

  // List of chambers with segregation status
  const chambersList = React.useMemo(() => {
    return Object.entries(chambersConfig).map(([id, config]) => {
      const sanitary = chamberSanitaryMap.get(id);
      const hasFruit = !!sanitary?.hasFruit;
      const isAvailable = !hasFruit;
      return {
        id,
        name: config.name,
        hasFruit,
        isAvailable,
        totalUnits: sanitary?.totalUnits || 0,
      };
    }).sort((a, b) => naturalSort(a.name, b.name));
  }, [chamberSanitaryMap]);

  // Warehouses and Aisles
  const sortedWarehouses = React.useMemo(() => {
    if (!warehouses) return [];
    return [...warehouses].sort((a, b) => naturalSort(a.name, b.name));
  }, [warehouses]);

  const selectedWarehouseName = form.watch('warehouse');
  const selectedChamberId = form.watch('chamberId');

  const filteredAisles = React.useMemo(() => {
    if (!selectedWarehouseName || !allAisles || !warehouses) {
      return [];
    }
    const selectedWarehouse = warehouses.find(w => w.name === selectedWarehouseName);
    if (!selectedWarehouse) {
      return [];
    }
    return allAisles.filter(a => a.warehouseIds && a.warehouseIds.includes(selectedWarehouse.id))
      .sort((a, b) => naturalSort(a.name, b.name));
  }, [selectedWarehouseName, allAisles, warehouses]);

  // Coordinates for the selected chamber
  const availableCoordinates = React.useMemo(() => {
    if (!selectedChamberId) return [];
    const sanitary = chamberSanitaryMap.get(selectedChamberId);
    if (sanitary?.hasFruit) return []; // Block fruit chambers

    const rawChamberConfig = chambersConfig[selectedChamberId];
    if (!rawChamberConfig) return [];
    const isChamberRow13Enabled = !!chamberSettings?.find(s => s.id === selectedChamberId)?.row13Enabled;
    const effectiveChamberConfig = getEffectiveChamberConfig(rawChamberConfig, isChamberRow13Enabled);
    const allCoords = getSortedCoordinates(effectiveChamberConfig, 'secuencial');

    // Calculate occupied coordinates in this chamber
    const occupiedMap = new Map<string, number>();
    (otherFruitReceptions || []).forEach(r => {
      (r.items || []).forEach(it => {
        if (it.status === 'Almacenado' && it.storageLocation?.chamberId === selectedChamberId && it.storageLocation.coordinate) {
          const c = it.storageLocation.coordinate;
          occupiedMap.set(c, (occupiedMap.get(c) || 0) + 1);
        }
      });
    });

    return allCoords.map(coord => {
      const used = occupiedMap.get(coord) || 0;
      const capacity = 2; // Standard 2 pallets per coordinate for packaging
      const isFull = used >= capacity;
      return {
        coordinate: coord,
        used,
        capacity,
        isFull,
      };
    });
  }, [selectedChamberId, chamberSanitaryMap, chamberSettings, otherFruitReceptions]);

  React.useEffect(() => {
    if (open) {
      // Set initial destination tab based on current item location if present
      const isChamber = !!(item?.location?.chamberId || (item?.location?.coordinate && !item?.location?.warehouse));
      const initialType = isChamber ? 'chamber' : 'warehouse';
      setDestinationType(initialType);
      form.reset({ 
        destinationType: initialType,
        warehouse: undefined, 
        aisle: undefined,
        chamberId: undefined,
        coordinate: undefined,
      });
    }
  }, [form, open, item]);

  const handleDestinationChange = (type: 'warehouse' | 'chamber') => {
    setDestinationType(type);
    form.setValue('destinationType', type);
    form.setValue('warehouse', undefined);
    form.setValue('aisle', undefined);
    form.setValue('chamberId', undefined);
    form.setValue('coordinate', undefined);
  };

  const onSubmit = (values: RelocateFormValues) => {
    if (destinationType === 'warehouse') {
      if (!values.warehouse || !values.aisle) return;
      onConfirm({
        destinationType: 'warehouse',
        warehouse: values.warehouse,
        aisle: values.aisle,
      });
    } else {
      if (!values.chamberId || !values.coordinate) return;
      onConfirm({
        destinationType: 'chamber',
        chamberId: values.chamberId,
        coordinate: values.coordinate,
      });
    }
  };

  if (!item) return null;

  const selectedChamberSanitary = selectedChamberId ? chamberSanitaryMap.get(selectedChamberId) : null;
  const isSelectedChamberBlocked = !!selectedChamberSanitary?.hasFruit;

  const isSubmitDisabled = destinationType === 'warehouse'
    ? (!form.watch('warehouse') || !form.watch('aisle'))
    : (!form.watch('chamberId') || !form.watch('coordinate') || isSelectedChamberBlocked);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Reubicar Pallet
          </DialogTitle>
          <DialogDescription>
            Seleccione la nueva ubicación para el pallet <span className="font-semibold text-foreground">{item.name}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <Alert className="bg-muted/50">
            <AlertTitle className="text-xs font-bold uppercase text-muted-foreground">Ubicación Actual</AlertTitle>
            <AlertDescription className="font-bold text-sm text-foreground">
               {item.location?.warehouse && item.location?.aisle
                 ? `🏢 ${item.location.warehouse} / ${item.location.aisle}`
                 : (item.location?.chamberId && item.location?.coordinate
                     ? `❄️ ${chambersConfig[item.location.chamberId]?.name || item.location.chamberId} / ${item.location.coordinate}`
                     : (item.location?.coordinate || 'No especificada'))}
            </AlertDescription>
        </Alert>

        {/* Destination Type Selector */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-muted-foreground uppercase">Tipo de Destino</label>
          <Tabs value={destinationType} onValueChange={(v) => handleDestinationChange(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="warehouse" className="gap-2 font-bold text-xs">
                <WarehouseIcon className="h-4 w-4 text-amber-600" />
                🏢 Almacén / Pasillo
              </TabsTrigger>
              <TabsTrigger value="chamber" className="gap-2 font-bold text-xs">
                <Snowflake className="h-4 w-4 text-sky-600" />
                ❄️ Cámara / Galpón
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            
            {/* 1. Warehouse / Aisle Mode */}
            {destinationType === 'warehouse' && (
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-3 rounded-lg border">
                <FormField
                  control={form.control}
                  name="warehouse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold">Nuevo Almacén</FormLabel>
                      <Select onValueChange={(value) => { field.onChange(value); form.resetField('aisle'); }} value={field.value} disabled={loadingWarehouses}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedWarehouses.map(w => (
                            <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aisle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold">Nuevo Pasillo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={loadingAisles || !selectedWarehouseName}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder={!selectedWarehouseName ? 'Seleccione almacén' : 'Seleccione...'} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredAisles.length > 0 ? (
                            filteredAisles.map(a => (
                              <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">
                              {selectedWarehouseName ? "No hay pasillos." : "Seleccione un almacén."}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* 2. Cold Chamber / Galpón Mode */}
            {destinationType === 'chamber' && (
              <div className="space-y-3 bg-muted/20 p-3 rounded-lg border">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="chamberId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold flex items-center gap-1">
                          Cámara / Galpón
                          <ShieldCheck className="h-3 w-3 text-emerald-600" />
                        </FormLabel>
                        <Select 
                          onValueChange={(value) => { 
                            field.onChange(value); 
                            form.resetField('coordinate'); 
                          }} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleccione cámara..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {chambersList.map(ch => (
                              <SelectItem 
                                key={ch.id} 
                                value={ch.id}
                                disabled={!ch.isAvailable}
                                className={!ch.isAvailable ? "opacity-50 text-destructive" : ""}
                              >
                                <div className="flex items-center justify-between w-full gap-2">
                                  <span>{ch.name}</span>
                                  {ch.hasFruit ? (
                                    <span className="text-[10px] text-destructive font-bold">(Tiene Fruta)</span>
                                  ) : (
                                    <span className="text-[10px] text-emerald-600 font-bold">(Disponible)</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="coordinate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold">Coordenada</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value} 
                          disabled={!selectedChamberId || isSelectedChamberBlocked}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={!selectedChamberId ? 'Elija cámara' : 'Seleccione...'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-52">
                            {availableCoordinates.map(c => (
                              <SelectItem 
                                key={c.coordinate} 
                                value={c.coordinate}
                              >
                                <div className="flex items-center justify-between w-full gap-2">
                                  <span className="font-mono font-bold">{c.coordinate}</span>
                                  {c.isFull ? (
                                    <span className="text-[10px] text-amber-600 font-medium">({c.used}/{c.capacity} Ocup.)</span>
                                  ) : (
                                    <span className="text-[10px] text-emerald-600 font-medium">(Libre)</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Sanitary notice */}
                {isSelectedChamberBlocked && (
                  <div className="p-2 rounded bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs text-destructive font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Regla Sanitaria: Esta cámara contiene fruta activa. No se permite almacenar embalajes aquí.</span>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitDisabled} className="font-bold">
                Confirmar Reubicación
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
