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
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface StoreInChamberDialogProps {
  lot: ChamberLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStore: (data: { chamberId: string }) => void;
  allChamberLots: ChamberLot[];
  allOtherFruitReceptions: OtherFruitReception[];
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreInChamberDialog({ lot, open, onOpenChange, onStore, allChamberLots, allOtherFruitReceptions }: StoreInChamberDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
    }
  });

  const selectedChamberId = form.watch('chamberId');
  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  const availableChambers = React.useMemo(() => {
    if (!lot) return [];
    
    const assignedChamberIds = exporterChamberAssignments[lot.exporterId];
    
    if (assignedChamberIds && assignedChamberIds.length > 0) {
        return Object.values(chambersConfig).filter(chamber => 
            assignedChamberIds.includes(chamber.id)
        );
    }
    
    return Object.values(chambersConfig);

  }, [lot]);

  React.useEffect(() => {
      if (selectedChamberId && lot) {
        const chamberConfig = chambersConfig[selectedChamberId];
        if (!chamberConfig) {
            setSuggestion(null);
            return;
        };

        const allPossibleCoordinates = chamberConfig.columns
            .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
            .filter(coord => !chamberConfig.blocked?.includes(coord))
            .sort(naturalSort);
        
        const occupiedCoordinates = new Set<string>();

        // Find partially filled coordinates of the same lot first
        const sameLotPartiallyFilledCoords = new Map<string, number>();
        (allChamberLots || [])
            .filter(l => l.chamberId === selectedChamberId && l.displayLotId === lot.displayLotId && l.coordinate)
            .forEach(l => {
                occupiedCoordinates.add(l.coordinate!);
                const currentBins = sameLotPartiallyFilledCoords.get(l.coordinate!) || 0;
                sameLotPartiallyFilledCoords.set(l.coordinate!, currentBins + l.binCount);
            });
        
        for (const [coord, binsInCoord] of sameLotPartiallyFilledCoords.entries()) {
            if (binsInCoord < 6) {
                setSuggestion(coord);
                return;
            }
        }
        
        // Find fully occupied coordinates from other lots
        (allChamberLots || [])
            .filter(l => l.chamberId === selectedChamberId && l.displayLotId !== lot.displayLotId && l.coordinate)
            .forEach(l => occupiedCoordinates.add(l.coordinate!));
        
        (allOtherFruitReceptions || []).forEach(reception => {
            reception.items.forEach(item => {
                if(item.status === 'Almacenado' && item.storageLocation?.chamberId === selectedChamberId && item.storageLocation.coordinate) {
                    occupiedCoordinates.add(item.storageLocation.coordinate);
                }
            });
        });

        const firstAvailable = allPossibleCoordinates.find(coord => !occupiedCoordinates.has(coord));
        setSuggestion(firstAvailable || 'No disponible');
      } else {
        setSuggestion(null);
      }
  }, [selectedChamberId, lot, allChamberLots, allOtherFruitReceptions]);


  React.useEffect(() => {
    if (open) {
      form.reset({ chamberId: undefined });
      setSuggestion(null);
    }
  }, [form, open]);

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
            Seleccione la cámara de destino para los {lot.binCount} bins del exportador <span className='font-bold'>{lot.exporterId}</span>.
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una cámara" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableChambers.map(chamber => (
                        <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
                      ))}
                       {availableChambers.length === 0 && (
                          <div className="p-4 text-sm text-center text-muted-foreground">
                            No hay cámaras asignadas para este exportador.
                          </div>
                        )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {suggestion && (
                <Alert variant={suggestion === 'No disponible' ? 'destructive' : 'default'}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ubicación Sugerida</AlertTitle>
                    <AlertDescription>
                        {suggestion === 'No disponible'
                        ? 'No hay espacio disponible en esta cámara.'
                        : <>Diríjase a la ubicación: <span className="font-bold font-mono">{suggestion}</span></>}
                    </AlertDescription>
                </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={!selectedChamberId || suggestion === 'No disponible'}>Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
