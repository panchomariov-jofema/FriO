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
import { getSortedCoordinates } from '@/lib/utils';

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
  onConfirm: (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'fifo' }) => void;
  allReceptions: OtherFruitReception[];
  allChamberLots: ChamberLot[];
  chamberStrategies: Record<string, 'secuencial' | 'fifo'>;
}

const BINS_PER_COORDINATE = 9;
const PALLETS_PER_COORDINATE = 3; 

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada de inicio.' }),
  totalQuantity: z.coerce.number().positive('La cantidad total debe ser mayor a 0.'),
  quantityPerLocation: z.coerce.number().positive('La cantidad por ubicación debe ser mayor a 0.'),
});

type StoreFormValues = z.infer<typeof storeSchema>;


export function StoreOtherFruitDialog({ item, open, onOpenChange, onConfirm, allReceptions, allChamberLots, chamberStrategies }: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
  });
  const { toast } = useToast();

  const selectedChamberId = form.watch('chamberId');
  
  const capacityPerCoord = useMemo(() => {
    if (!item) return PALLETS_PER_COORDINATE;
    return item.unit === 'Bins' ? BINS_PER_COORDINATE : PALLETS_PER_COORDINATE;
  }, [item]);

  const { availableCoordinates, suggestion } = useMemo(() => {
    if (!selectedChamberId || !item) {
      return { availableCoordinates: [], suggestion: null };
    }

    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) {
      return { availableCoordinates: [], suggestion: null };
    }

    const occupiedCoords = new Set<string>();
    (allChamberLots || []).forEach(lot => {
        if (lot.status === 'Almacenado' && lot.chamberId === selectedChamberId && lot.coordinate) {
          occupiedCoords.add(lot.coordinate);
        }
    });
    (allReceptions || []).forEach(reception => {
        reception.items.forEach(storedItem => {
            if (storedItem.status === 'Almacenado' && storedItem.storageLocation?.chamberId === selectedChamberId && storedItem.storageLocation.coordinate) {
                occupiedCoords.add(storedItem.storageLocation.coordinate);
            }
        });
    });
    
    const storageStrategy = chamberStrategies[selectedChamberId] || 'secuencial';
    const allPossibleCoords = getSortedCoordinates(chamberConfig, storageStrategy);
    
    const availableCoords = allPossibleCoords.filter(coord => !occupiedCoords.has(coord));
    const currentSuggestion = availableCoords.length > 0 ? availableCoords[0] : null;
    
    return { availableCoordinates: availableCoords, suggestion: currentSuggestion };

  }, [selectedChamberId, item, allReceptions, allChamberLots, chamberStrategies]);

  useEffect(() => {
    if (open && item) {
       const defaultQtyPerLocation = item.unit === 'Pallets' ? 1 : capacityPerCoord;
      form.reset({
        totalQuantity: item.quantity,
        quantityPerLocation: defaultQtyPerLocation,
        chamberId: undefined,
        coordinate: undefined,
       });
    }
  }, [item, open, form, capacityPerCoord]);

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
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `La cantidad por ubicación no puede ser mayor a ${capacityPerCoord}.`});
        return;
    }
    if (values.totalQuantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }
    const strategy = chamberStrategies[values.chamberId] || 'secuencial';
    onConfirm({ ...values, strategy });
  };
  
  if (!item) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Producto</DialogTitle>
          <DialogDescription>
            Guardar <span className="font-semibold">{item.productName}</span>. Pendiente: {item.quantity} {item.unit}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
             <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="chamberId" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cámara</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.resetField('coordinate'); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                        {Object.values(chambersConfig).map(chamber => (
                            <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
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
                        <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
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
                        <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
                    </FormControl>
                     <p className="text-xs text-muted-foreground pt-1">
                        Máx: {capacityPerCoord}
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
