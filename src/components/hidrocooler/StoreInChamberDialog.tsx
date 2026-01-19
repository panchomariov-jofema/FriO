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
import { naturalSort } from '@/lib/utils';

interface StoreInChamberDialogProps {
  lot: ChamberLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStore: (data: { chamberId: string, coordinate: string }) => void;
  allChamberLots: ChamberLot[];
  allOtherFruitReceptions: OtherFruitReception[];
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada.' }),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreInChamberDialog({ lot, open, onOpenChange, onStore, allChamberLots, allOtherFruitReceptions }: StoreInChamberDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
        coordinate: undefined,
    }
  });

  const selectedChamberId = form.watch('chamberId');

  const availableCoordinates = React.useMemo(() => {
    if (!selectedChamberId || !lot) return [];
    
    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) return [];
    
    const occupiedCoordinates = new Set<string>();
    (allChamberLots || [])
        .filter(l => l.chamberId === selectedChamberId && l.coordinate && l.binCount >= 6) // Only consider full coordinates as occupied for new placements
        .forEach(l => occupiedCoordinates.add(l.coordinate!));
    
    (allOtherFruitReceptions || []).forEach(reception => {
        reception.items.forEach(item => {
            if(item.storageLocation?.chamberId === selectedChamberId && item.storageLocation.coordinate) {
                // This logic might need refinement based on how pallets/bins occupy space
                occupiedCoordinates.add(item.storageLocation.coordinate);
            }
        });
    });

    const allPossibleCoordinates = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);

    // For the dropdown, we only want to show coordinates that are completely empty
    return allPossibleCoordinates.filter(coord => !occupiedCoordinates.has(coord));
  }, [selectedChamberId, lot, allChamberLots, allOtherFruitReceptions]);


  // Effect to suggest a coordinate when a chamber is selected
  React.useEffect(() => {
    if (selectedChamberId && lot) {
        // --- Suggestion Logic ---
        const assignedChamberIds = [selectedChamberId];

        const allOccupiedCoordsByChamber: Record<string, Set<string>> = {};
        allChamberLots
            .filter(l => l.coordinate)
            .forEach(l => {
                if (!allOccupiedCoordsByChamber[l.chamberId!]) allOccupiedCoordsByChamber[l.chamberId!] = new Set();
                allOccupiedCoordsByChamber[l.chamberId!].add(l.coordinate!);
            });
        allOtherFruitReceptions.forEach(reception => {
            reception.items.forEach(item => {
                if(item.storageLocation?.chamberId && item.storageLocation.coordinate) {
                    if (!allOccupiedCoordsByChamber[item.storageLocation.chamberId]) allOccupiedCoordsByChamber[item.storageLocation.chamberId] = new Set();
                    allOccupiedCoordsByChamber[item.storageLocation.chamberId].add(item.storageLocation.coordinate);
                }
            });
        });

        const sameLotCoordsByChamber: Record<string, string[]> = {};
        allChamberLots
            .filter(l => l.displayLotId === lot.displayLotId && l.chamberId && l.coordinate && (l.binCount < 6))
            .forEach(l => {
                if (!sameLotCoordsByChamber[l.chamberId!]) sameLotCoordsByChamber[l.chamberId!] = [];
                sameLotCoordsByChamber[l.chamberId!].push(l.coordinate!);
            });

        let bestSuggestion: string | null = null;

        for (const chamberId of assignedChamberIds) {
            if (sameLotCoordsByChamber[chamberId]?.length > 0) {
                bestSuggestion = sameLotCoordsByChamber[chamberId].sort(naturalSort)[0];
                break;
            }

            const chamberConfig = chambersConfig[chamberId];
            const occupiedInChamber = allOccupiedCoordsByChamber[chamberId] || new Set();

            const allPossibleCoordinates = chamberConfig.columns
                .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
                .filter(coord => !chamberConfig.blocked?.includes(coord))
                .sort(naturalSort);
            
            const firstAvailable = allPossibleCoordinates.find(coord => !occupiedInChamber.has(coord));

            if (firstAvailable) {
                bestSuggestion = firstAvailable;
                break;
            }
        }

        if (bestSuggestion) {
            form.setValue('coordinate', bestSuggestion, { shouldValidate: true });
        } else {
            form.resetField('coordinate');
        }
    }
  }, [selectedChamberId, lot, allChamberLots, allOtherFruitReceptions, form]);


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
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedChamberId || availableCoordinates.length === 0}>
                        <FormControl><SelectTrigger><SelectValue placeholder={!selectedChamberId ? "Seleccione cámara" : "Seleccione..."} /></SelectTrigger></FormControl>
                        <SelectContent>
                        {availableCoordinates.length > 0 ? (
                            availableCoordinates.map(coord => (
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
