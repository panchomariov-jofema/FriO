'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChamberLot, OtherFruitReception } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { getSortedCoordinates } from '@/lib/utils';

interface StoreInChamberDialogProps {
  lot: ChamberLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStore: (data: { chamberId: string, coordinate: string }) => void;
  allChamberLots: ChamberLot[];
  allOtherFruitReceptions: OtherFruitReception[];
  chamberStrategies?: Record<string, 'secuencial' | 'fifo' | 'aisle-access' | 'serpentina-vertical'>;
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada.' }),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreInChamberDialog({ lot, open, onOpenChange, onStore, allChamberLots, allOtherFruitReceptions, chamberStrategies = {} }: StoreInChamberDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
        coordinate: undefined,
    }
  });

  const selectedChamberId = form.watch('chamberId');

  const { availableCoordinatesForNewLots, suggestion } = React.useMemo(() => {
    if (!selectedChamberId || !lot) {
      return { availableCoordinatesForNewLots: [], suggestion: null };
    }

    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) {
      return { availableCoordinatesForNewLots: [], suggestion: null };
    }

    // Get all occupied coordinates
    const occupiedCoords = new Set<string>();
    allChamberLots.forEach(l => {
        if (l.status === 'Almacenado' && l.chamberId === selectedChamberId && l.coordinate) {
            occupiedCoords.add(l.coordinate);
        }
    });
    allOtherFruitReceptions.forEach(r => {
        r.items.forEach(item => {
            if (item.status === 'Almacenado' && item.storageLocation?.chamberId === selectedChamberId && item.storageLocation.coordinate) {
                occupiedCoords.add(item.storageLocation.coordinate);
            }
        });
    });

    // Determine strategy to find the SUGGESTION
    const strategy = chamberStrategies?.[selectedChamberId] || 'secuencial';

    // Get the full sorted list based on the strategy to find the first available spot
    const strategyPath = getSortedCoordinates(chamberConfig, strategy);
    const firstAvailable = strategyPath.find(coord => !occupiedCoords.has(coord)) || null;

    // For the dropdown, always show a simple sequential list of what's empty.
    const allEmptyCoordinatesSequentially = getSortedCoordinates(chamberConfig, 'secuencial')
        .filter(coord => !occupiedCoords.has(coord));
    
    return {
        availableCoordinatesForNewLots: allEmptyCoordinatesSequentially,
        suggestion: firstAvailable
    };
  }, [selectedChamberId, lot, allChamberLots, allOtherFruitReceptions, chamberStrategies]);


  // Effect to suggest a coordinate when a chamber is selected
  React.useEffect(() => {
    if (suggestion) {
        form.setValue('coordinate', suggestion, { shouldValidate: true });
        form.trigger('coordinate');
    } else {
        form.resetField('coordinate');
    }
  }, [suggestion, form]);


  // Effect to reset form when dialog opens
  React.useEffect(() => {
    if (!open) {
      form.reset({ chamberId: undefined, coordinate: undefined });
    }
  }, [open, form]);


  const onSubmit = (values: StoreFormValues) => {
    onStore(values);
  };

  if (!lot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Lote: {lot.displayLotId}</DialogTitle>
          <DialogDescription>
            Seleccione una cámara para almacenar {lot.binCount} bins del exportador <span className='font-bold'>{lot.exporterId}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
                        {availableCoordinatesForNewLots.length > 0 ? (
                            availableCoordinatesForNewLots.map(coord => (
                            <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                            ))
                        ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">No hay coordenadas vacías.</div>
                        )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>

            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={!form.formState.isValid}>Confirmar</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
