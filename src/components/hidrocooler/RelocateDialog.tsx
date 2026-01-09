'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChamberLot, OtherFruitReception, StoredItem } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { Alert, AlertDescription } from '../ui/alert';
import { useToast } from '@/hooks/use-toast';

interface RelocateDialogProps {
  item: StoredItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelocate: (data: { targetChamberId: string; targetCoordinate: string }) => void;
  storedItems: {
    chamberLots: ChamberLot[];
    otherFruitReceptions: OtherFruitReception[];
  }
}

const relocateSchema = z.object({
  targetChamberId: z.string({ required_error: 'Debe seleccionar una cámara de destino.' }),
  targetCoordinate: z.string({ required_error: 'Debe seleccionar una coordenada de destino.' }),
});

type RelocateFormValues = z.infer<typeof relocateSchema>;

// Helper for natural sorting
const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1] || '0', 10);
  const bNum = parseInt(b.split(re)[1] || '0', 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];
  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;
  return aNum - bNum;
};

export function RelocateDialog({
  item,
  open,
  onOpenChange,
  onRelocate,
  storedItems
}: RelocateDialogProps) {
  const { toast } = useToast();
  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: {
      targetChamberId: undefined,
      targetCoordinate: undefined,
    },
  });
  
  const sourceChamberId = item?.chamberId;
  const sourceCoordinate = item?.coordinate;
  const targetChamberId = form.watch('targetChamberId');

  const { allChamberLots = [], allOtherFruitReceptions = [] } = storedItems || {};

  const { availableCoordinates, occupancyMap } = React.useMemo(() => {
    if (!targetChamberId || !item) return { availableCoordinates: [], occupancyMap: new Map() };
    
    const chamberConfig = chambersConfig[targetChamberId];
    if (!chamberConfig) return { availableCoordinates: [], occupancyMap: new Map() };
    
    const allPossibleCoords = chamberConfig.columns.flatMap(col => chamberConfig.rows.map(row => `${col}${row}`)).sort(naturalSort);
    
    const currentOccupancyMap = new Map<string, { bins: number, pallets: number }>();

    const getCoord = (coord: string) => {
      if (!currentOccupancyMap.has(coord)) {
        currentOccupancyMap.set(coord, { bins: 0, pallets: 0 });
      }
      return currentOccupancyMap.get(coord)!;
    };
    
    allChamberLots.forEach(lot => {
        if (lot.status === 'Almacenado' && lot.chamberId === targetChamberId && lot.coordinate) {
            const coordData = getCoord(lot.coordinate);
            coordData.bins += lot.binCount;
        }
    });

    allOtherFruitReceptions.forEach(reception => {
        reception.items.forEach(fruitItem => {
            if(fruitItem.status === 'Almacenado' && fruitItem.storageLocation?.chamberId === targetChamberId && fruitItem.storageLocation.coordinate) {
                const coordData = getCoord(fruitItem.storageLocation.coordinate);
                if (reception.unit === 'Bins') {
                    coordData.bins += fruitItem.quantity;
                } else {
                    coordData.pallets += fruitItem.quantity;
                }
            }
        });
    });
    
    const available = allPossibleCoords.filter(coord => {
      // The source coordinate is always a valid target for relocation within the same chamber
      if (targetChamberId === sourceChamberId && coord === sourceCoordinate) {
          return true;
      }
        
      const occupied = currentOccupancyMap.get(coord);
      if (!occupied) return true; // If no record, it's empty and valid for both

      if (item.unit === 'Pallets') {
        // Can only move to a coordinate with 0 bins and less than 2 pallets.
        return occupied.bins === 0 && occupied.pallets < 2;
      }
      
      if (item.unit === 'Bins') {
        // Can only move to a coordinate with 0 pallets and less than 6 bins.
        return occupied.pallets === 0 && occupied.bins < 6;
      }
      
      return false; // Should not happen
    });

    return { 
        availableCoordinates: available,
        occupancyMap: currentOccupancyMap,
    };
  }, [targetChamberId, allChamberLots, allOtherFruitReceptions, sourceChamberId, sourceCoordinate, item]);


  React.useEffect(() => {
    if (open) {
      form.reset({
        targetChamberId: undefined,
        targetCoordinate: undefined,
      });
    }
  }, [open, form]);

  const onSubmit = (values: RelocateFormValues) => {
    if (!item) return;

    // Re-check capacity on submit to prevent race conditions
    const targetOccupancy = occupancyMap.get(values.targetCoordinate);

    if (targetOccupancy) {
      if (item.unit === 'Pallets') {
          if (targetOccupancy.bins > 0) {
              toast({ variant: 'destructive', title: 'Error de Capacidad', description: 'La coordenada de destino ya contiene bins.'});
              return;
          }
          if (values.targetCoordinate !== sourceCoordinate && targetOccupancy.pallets >= 2) {
              toast({ variant: 'destructive', title: 'Error de Capacidad', description: 'La coordenada de destino ya tiene 2 pallets.'});
              return;
          }
      }
       if (item.unit === 'Bins') {
          if (targetOccupancy.pallets > 0) {
              toast({ variant: 'destructive', title: 'Error de Capacidad', description: 'La coordenada de destino ya contiene pallets.'});
              return;
          }
          if (values.targetCoordinate !== sourceCoordinate && targetOccupancy.bins >= 6) {
              toast({ variant: 'destructive', title: 'Error de Capacidad', description: 'La coordenada de destino ya tiene 6 bins.'});
              return;
          }
      }
    }


    onRelocate(values);
  };

  if (!item || !sourceChamberId || !sourceCoordinate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reubicar Coordenada</DialogTitle>
          <DialogDescription>
            Mover todo el contenido de la coordenada <span className="font-mono font-semibold">{sourceCoordinate}</span> en <span className="font-semibold">{chambersConfig[sourceChamberId]?.name}</span> a una nueva ubicación.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="my-4">
             <AlertDescription>
                <div className="flex justify-between items-center text-sm">
                    <span>
                      {item.type === 'producerLot' ? 'Lote' : 'Producto'}: <span className="font-semibold">{item.displayId}</span>
                    </span>
                    <span>
                      {item.type === 'producerLot' ? 'Productor' : 'Cliente'}: <span className="font-semibold">{item.ownerName}</span>
                    </span>
                    <span>Cant: <span className="font-semibold">{item.quantity} {item.unit}</span></span>
                </div>
             </AlertDescription>
          </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="targetChamberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cámara de Destino</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue('targetCoordinate', ''); // Reset coordinate on chamber change
                  }} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una cámara" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(chambersConfig).map(chamber => (
                        <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetCoordinate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coordenada de Destino</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!targetChamberId || availableCoordinates.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={!targetChamberId ? "Seleccione una cámara primero" : "Seleccione una coordenada"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCoordinates.length > 0 ? (
                        availableCoordinates.map(coord => (
                          <SelectItem key={coord} value={coord}>
                              {coord}
                              {occupancyMap.has(coord) && (
                                  <span className="text-muted-foreground ml-2 text-xs">
                                      (Ocup: {occupancyMap.get(coord)?.bins} Bins, {occupancyMap.get(coord)?.pallets} Pallets)
                                  </span>
                              )}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-center text-muted-foreground">No hay coordenadas válidas disponibles.</div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Confirmar Reubicación</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
