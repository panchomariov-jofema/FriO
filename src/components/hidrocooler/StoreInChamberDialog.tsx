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
import { chambersConfig, exporterChamberAssignments } from '@/lib/chambers-config';
import { naturalSort } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

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
  const [isManualOverride, setIsManualOverride] = React.useState(false);

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
        coordinate: undefined,
    }
  });

  const selectedChamberId = form.watch('chamberId');

  // --- Suggestion Logic ---
  const suggestion = React.useMemo(() => {
    if (!lot) return null;

    const assignedChamberIds = exporterChamberAssignments[lot.exporterId] || Object.keys(chambersConfig);
    if (assignedChamberIds.length === 0) return null;
    
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
    
    // Check for coordinates that have the same lot already to prioritize filling them
    const sameLotCoordsByChamber: Record<string, string[]> = {};
    allChamberLots
        .filter(l => l.displayLotId === lot.displayLotId && l.chamberId && l.coordinate && (l.binCount < 6))
        .forEach(l => {
            if (!sameLotCoordsByChamber[l.chamberId!]) sameLotCoordsByChamber[l.chamberId!] = [];
            sameLotCoordsByChamber[l.chamberId!].push(l.coordinate!);
        });


    for (const chamberId of assignedChamberIds) {
        // 1. Prioritize same lot, partially filled coordinates
        if (sameLotCoordsByChamber[chamberId]?.length > 0) {
            const sortedSameLotCoords = sameLotCoordsByChamber[chamberId].sort(naturalSort);
            return { chamberId, coordinate: sortedSameLotCoords[0] };
        }

        // 2. Find the first empty coordinate in the chamber
        const chamberConfig = chambersConfig[chamberId];
        const occupiedInChamber = allOccupiedCoordsByChamber[chamberId] || new Set();

        const allPossibleCoordinates = chamberConfig.columns
            .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
            .filter(coord => !chamberConfig.blocked?.includes(coord))
            .sort(naturalSort);
        
        const firstAvailable = allPossibleCoordinates.find(coord => !occupiedInChamber.has(coord));

        if (firstAvailable) {
            return { chamberId, coordinate: firstAvailable };
        }
    }
    
    return null; // No available space found in any assigned chamber
  }, [lot, allChamberLots, allOtherFruitReceptions]);


  // --- Manual Override Logic ---
  const availableChambersForManual = React.useMemo(() => Object.values(chambersConfig), []);
  const availableCoordinatesForManual = React.useMemo(() => {
    if (!selectedChamberId || !lot) return [];
    
    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) return [];
    
    const occupiedCoordinates = new Set<string>();
    (allChamberLots || [])
        .filter(l => l.chamberId === selectedChamberId && l.coordinate)
        .forEach(l => occupiedCoordinates.add(l.coordinate!));
    
    (allOtherFruitReceptions || []).forEach(reception => {
        reception.items.forEach(item => {
            if(item.storageLocation?.chamberId === selectedChamberId && item.storageLocation.coordinate) {
                occupiedCoordinates.add(item.storageLocation.coordinate);
            }
        });
    });

    const allPossibleCoordinates = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);

    return allPossibleCoordinates.filter(coord => !occupiedCoordinates.has(coord));
  }, [selectedChamberId, lot, allChamberLots, allOtherFruitReceptions]);


  // Effect to set form values based on suggestion or reset
  React.useEffect(() => {
    if (open) {
      setIsManualOverride(false); // Always start with suggestion
      if (suggestion) {
        form.reset({ chamberId: suggestion.chamberId, coordinate: suggestion.coordinate });
      } else {
        form.reset({ chamberId: undefined, coordinate: undefined });
      }
    }
  }, [suggestion, open, form]);


  const onSubmit = (values: StoreFormValues) => {
    // If the suggestion was used, ensure values are from the suggestion
    if (!isManualOverride && suggestion) {
        onStore({ chamberId: suggestion.chamberId, coordinate: suggestion.coordinate });
    } else {
        // Otherwise use the values from the form (manual override)
        onStore(values);
    }
  };

  if (!lot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Lote: {lot.displayLotId}</DialogTitle>
          <DialogDescription>
            Almacenar {lot.binCount} bins del exportador <span className='font-bold'>{lot.exporterId}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">

            {!isManualOverride ? (
              // --- SUGGESTION VIEW ---
              <div className="space-y-4">
                {suggestion ? (
                  <Alert>
                    <AlertTitle>Ubicación Sugerida</AlertTitle>
                    <AlertDescription className="flex flex-col gap-1">
                      <span className="text-base">Diríjase a la cámara: <span className="font-semibold">{chambersConfig[suggestion.chamberId]?.name}</span></span>
                      <span className="text-lg">Posiciónese en la coordenada: <span className="font-bold text-xl font-mono">{suggestion.coordinate}</span></span>
                       <p className="text-xs text-muted-foreground pt-2">
                        El sistema llenará las coordenadas secuencialmente a partir de este punto.
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertTitle>No hay espacio disponible</AlertTitle>
                    <AlertDescription>
                      No se encontró espacio de almacenamiento automático en las cámaras asignadas.
                      Puede intentar seleccionar una ubicación manualmente.
                    </AlertDescription>
                  </Alert>
                )}
                 <Button type="button" variant="link" onClick={() => setIsManualOverride(true)}>
                    O cambiar la ubicación manualmente
                </Button>
              </div>
            ) : (
              // --- MANUAL OVERRIDE VIEW ---
              <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="chamberId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cámara</FormLabel>
                        <Select onValueChange={(value) => { field.onChange(value); form.setValue('coordinate', '') }} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            {availableChambersForManual.map(chamber => (
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
                        <Select onValueChange={field.onChange} value={field.value} disabled={!selectedChamberId || availableCoordinatesForManual.length === 0}>
                          <FormControl><SelectTrigger><SelectValue placeholder={!selectedChamberId ? "Seleccione cámara" : "Seleccione..."} /></SelectTrigger></FormControl>
                          <SelectContent>
                            {availableCoordinatesForManual.length > 0 ? (
                              availableCoordinatesForManual.map(coord => (
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
                 <Button type="button" variant="link" onClick={() => setIsManualOverride(false)}>
                    Volver a la ubicación sugerida
                 </Button>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={!form.formState.isValid && (isManualOverride || !suggestion)}>Confirmar</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
