'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChamberLot } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';

interface StoreInChamberDialogProps {
  lot: ChamberLot | null;
  storedLots: ChamberLot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStore: (data: { chamberId: string; coordinate: string; }) => void;
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada.'}),
});

type StoreFormValues = z.infer<typeof storeSchema>;

// Helper for natural sorting (e.g., A1, A2, ... A10)
const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1], 10);
  const bNum = parseInt(b.split(re)[1], 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];

  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;
  
  return aNum - bNum;
};


export function StoreInChamberDialog({ lot, storedLots, open, onOpenChange, onStore }: StoreInChamberDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
        coordinate: undefined,
    }
  });

  const selectedChamberId = form.watch('chamberId');

  React.useEffect(() => {
    if (open) {
      form.reset({ chamberId: undefined, coordinate: undefined });
    }
  }, [form, open]);

  const availableCoordinates = React.useMemo(() => {
    if (!selectedChamberId) return [];
    const config = chambersConfig[selectedChamberId];
    if (!config) return [];

    const allCoordinates = config.columns.flatMap(col => config.rows.map(row => `${col}${row}`));
    const occupiedCoordinates = storedLots
        .filter(l => l.chamberId === selectedChamberId && l.coordinate)
        .map(l => l.coordinate!);
    
    // Coordinates that are not occupied at all
    const completelyFree = allCoordinates.filter(c => !occupiedCoordinates.includes(c));

    // Coordinates that are partially occupied by the SAME lot
    const partiallyOccupiedBySameLot = storedLots
        .filter(l => l.chamberId === selectedChamberId && l.displayLotId === lot?.displayLotId && l.binCount < 6)
        .map(l => l.coordinate!);

    // Use a Set to avoid duplicates, then sort naturally
    const uniqueCoordinates = [...new Set([...completelyFree, ...partiallyOccupiedBySameLot])];
    
    return uniqueCoordinates.sort(naturalSort);

  }, [selectedChamberId, storedLots, lot]);


  const onSubmit = (values: StoreFormValues) => {
    if (!lot) return;

    const existingLotInCoordinate = storedLots.find(l => l.chamberId === values.chamberId && l.coordinate === values.coordinate);
    
    // Rule: Cannot mix lots in the same coordinate
    if (existingLotInCoordinate && existingLotInCoordinate.displayLotId !== lot.displayLotId) {
        form.setError('coordinate', { message: 'Esta coordenada ya está ocupada por otro lote.' });
        return;
    }

    // Rule: Cannot exceed 6 bins per coordinate
    const binsInCoordinate = existingLotInCoordinate?.binCount ?? 0;
    if (binsInCoordinate + lot.binCount > 6) {
        form.setError('coordinate', { message: `No se pueden agregar. Capacidad excedida (${binsInCoordinate + lot.binCount} > 6 bins).` });
        return;
    }

    onStore(values);
    onOpenChange(false);
  };

  if (!lot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Lote: {lot.displayLotId}</DialogTitle>
          <DialogDescription>
            Seleccione la cámara y coordenada de destino para los {lot.binCount} bins.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="chamberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cámara de Destino</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue('coordinate', undefined); // Reset coordinate on chamber change
                  }} defaultValue={field.value} value={field.value}>
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
              name="coordinate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coordenada</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={!selectedChamberId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={!selectedChamberId ? "Seleccione una cámara primero" : "Seleccione una coordenada"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCoordinates.length > 0 ? availableCoordinates.map(coord => (
                        <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                      )) : <div className="p-2 text-sm text-muted-foreground text-center">No hay coordenadas disponibles.</div>}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
