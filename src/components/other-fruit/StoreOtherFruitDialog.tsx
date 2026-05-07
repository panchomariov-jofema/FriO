'use client';

import * as React from 'react';
import { useMemo, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OtherFruitReception, ChamberLot, OtherFruitReceptionItem, Chamber } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { useToast } from '@/hooks/use-toast';
import { getSortedCoordinates, getPairedCoordinates } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

interface StoreOtherFruitDialogProps {
  item: PendingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'pareado' | 'aisle-access' }) => void;
  allReceptions: OtherFruitReception[];
  allChamberLots: ChamberLot[];
  chamberStrategies: Record<string, 'secuencial' | 'fifo'>;
  clientConfig?: ClientStorageConfig;
}

const DEFAULT_BINS_PER_COORDINATE = 6;
const DEFAULT_PALLETS_PER_COORDINATE = 3; 

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada de inicio.' }),
  totalQuantity: z.coerce.number().positive('La cantidad total debe ser mayor a 0.'),
  quantityPerLocation: z.coerce.number().positive('La cantidad por ubicación debe ser mayor a 0.'),
  strategy: z.enum(['secuencial', 'pareado', 'aisle-access']).default('secuencial'),
});

type StoreFormValues = z.infer<typeof storeSchema>;


export function StoreOtherFruitDialog({ item, open, onOpenChange, onConfirm, allReceptions, allChamberLots, chamberStrategies, clientConfig }: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
  });
  const { toast } = useToast();

  const selectedChamberId = form.watch('chamberId');
  
  const capacityPerCoord = useMemo(() => {
    if (!item) return DEFAULT_PALLETS_PER_COORDINATE;
    if (item.unit === 'Bins') {
      return clientConfig?.binsPerCoordinate ?? DEFAULT_BINS_PER_COORDINATE;
    }
    return clientConfig?.palletsPerCoordinate ?? DEFAULT_PALLETS_PER_COORDINATE;
  }, [item, clientConfig]);

  const { availableCoordinates, suggestion } = useMemo(() => {
    if (!selectedChamberId || !item) {
      return { availableCoordinates: [], suggestion: null };
    }

    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) {
      return { availableCoordinates: [], suggestion: null };
    }

    const occupancyMap = new Map<string, { lots: {displayLotId: string, binCount: number }[] }>();
    (allChamberLots || []).forEach(lot => {
        if (lot.status === 'Almacenado' && lot.chamberId === selectedChamberId && lot.coordinate && lot.binCount > 0) {
          if (!occupancyMap.has(lot.coordinate)) {
            occupancyMap.set(lot.coordinate, { lots: [] });
          }
          occupancyMap.get(lot.coordinate)!.lots.push({ displayLotId: lot.displayLotId, binCount: lot.binCount });
        }
    });
    
    // We also consider items stored in 'otherFruitReceptions' that aren't yet in chamberLots if they were stored in this session
    (allReceptions || []).forEach(reception => {
        reception.items.forEach(storedItem => {
            if (storedItem.status === 'Almacenado' && storedItem.storageLocation?.chamberId === selectedChamberId && storedItem.storageLocation.coordinate && storedItem.quantity > 0) {
                const lotId = `other_${reception.id}_${storedItem.productCode}`;
                if (!occupancyMap.has(storedItem.storageLocation.coordinate)) {
                    occupancyMap.set(storedItem.storageLocation.coordinate, { lots: [] });
                }
                // Logic check: if already in occupancyMap (from chamberLots), don't duplicate
                const exists = occupancyMap.get(storedItem.storageLocation.coordinate)!.lots.some(l => l.displayLotId === lotId);
                if (!exists) {
                   occupancyMap.get(storedItem.storageLocation.coordinate)!.lots.push({ displayLotId: lotId, binCount: storedItem.quantity });
                }
            }
        });
    });

    const formStrategy = form.getValues('strategy');

    let allPossibleCoords;
    if (formStrategy === 'pareado') {
      allPossibleCoords = getPairedCoordinates(chamberConfig);
    } else if (formStrategy === 'aisle-access') {
      allPossibleCoords = getSortedCoordinates(chamberConfig, 'aisle-access');
    } else {
      // If client has a specific strategy, we should probably default to that in the form, 
      // but here we use whatever the form says.
      const baseStrategy = (chamberStrategies[selectedChamberId] as 'secuencial' | 'fifo') || 'secuencial';
      allPossibleCoords = getSortedCoordinates(chamberConfig, baseStrategy);
    }
    
    const emptyCoords = allPossibleCoords.filter(coord => !occupancyMap.has(coord));
    const currentSuggestion = emptyCoords.length > 0 ? emptyCoords[0] : null;
    
    return { availableCoordinates: emptyCoords, suggestion: currentSuggestion };

  }, [selectedChamberId, item, allReceptions, allChamberLots, chamberStrategies, form.watch('strategy')]);

  useEffect(() => {
    if (open && item) {
       const initialCapacity = item.unit === 'Bins' 
         ? (clientConfig?.binsPerCoordinate ?? DEFAULT_BINS_PER_COORDINATE)
         : (clientConfig?.palletsPerCoordinate ?? DEFAULT_PALLETS_PER_COORDINATE);
       
       const defaultQtyPerLocation = item.unit === 'Pallets' ? 1 : initialCapacity;
       
      form.reset({
        totalQuantity: item.quantity,
        quantityPerLocation: defaultQtyPerLocation,
        chamberId: undefined,
        coordinate: undefined,
        strategy: clientConfig?.strategy ?? 'secuencial',
       });
    }
  }, [item, open, form, clientConfig]);

  useEffect(() => {
    if (suggestion) {
        form.setValue('coordinate', suggestion, { shouldValidate: true });
    } else if (open) {
        form.resetField('coordinate');
    }
  }, [suggestion, open, form]);
  
  const onSubmit = (values: StoreFormValues) => {
    if (!item) return;
    if (values.quantityPerLocation > capacityPerCoord) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `La cantidad por ubicación no puede ser mayor a ${capacityPerCoord} para este cliente.`});
        return;
    }
    if (values.totalQuantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }
    onConfirm(values);
  };
  
  if (!item) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Almacenar Producto</DialogTitle>
          <DialogDescription>
            Guardar <span className="font-semibold">{item.productName}</span> para <span className="font-semibold">{item.clientName}</span>. Pendiente: {item.quantity} {item.unit}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
             <FormField
                control={form.control}
                name="strategy"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel>Estrategia de Almacenamiento</FormLabel>
                        <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="grid grid-cols-2 gap-4"
                            >
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="secuencial" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Secuencial (A1 &rarr; L12)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="inverted-secuencial" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Invertido (A12 &rarr; A1)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="horizontal-secuencial" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Horizontal (A1 &rarr; O1)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="aisle-access" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Pasillo (Fall Creek)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="fifo" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">FIFO (Serpiente)</FormLabel>
                                </FormItem>
                            </RadioGroup>
                        </FormControl>
                        {clientConfig && (
                          <p className="text-[10px] text-primary font-medium uppercase tracking-wider">
                            Sugerido por Configuración de Cliente: {clientConfig.strategy}
                          </p>
                        )}
                        <FormMessage />
                    </FormItem>
                )}
            />
             <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="chamberId" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cámara</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.resetField('coordinate'); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                        {Object.values(chambersConfig).map(chamber => (
                            <SelectItem key={chamber.id} value={chamber.id}>
                              {chamber.name} 
                              {clientConfig?.chamberOverrides?.[chamber.id] && ` (Cap. Reservada: ${clientConfig.chamberOverrides[chamber.id]})`}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="coordinate" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Coordenada de Inicio</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedChamberId}>
                        <FormControl><SelectTrigger><SelectValue placeholder={!selectedChamberId ? "Seleccione cámara" : "Seleccione..."} /></SelectTrigger></FormControl>
                        <SelectContent>
                        {availableCoordinates.length > 0 ? (
                            availableCoordinates.map(coord => (
                            <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                            ))
                        ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">No hay coords. disponibles.</div>
                        )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>
             <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="totalQuantity"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cantidad Total a Almacenar</FormLabel>
                    <FormControl>
                        <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" inputMode="numeric" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground pt-1">
                        Pendiente: {item.quantity} {item.unit}.
                    </p>
                    <FormMessage />
                    </FormItem>
                )}
                />
                 <FormField
                control={form.control}
                name="quantityPerLocation"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cantidad por Ubicación</FormLabel>
                    <FormControl>
                        <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" inputMode="numeric" />
                    </FormControl>
                     <p className="text-xs text-muted-foreground pt-1">
                        Máx: {capacityPerCoord} ({item.unit})
                    </p>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
