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
  
  const availableCoordinates = React.useMemo(() => {
    if (!selectedChamberId || !lot) return [];
    
    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) return [];
    
    const allPossibleCoordinates = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);
    
    const occupiedCoordinates = new Set<string>();

    (allChamberLots || [])
        .filter(l => l.chamberId === selectedChamberId && l.coordinate && l.binCount > 0)
        .forEach(l => {
            occupiedCoordinates.add(l.coordinate!);
        });
    
    (allOtherFruitReceptions || []).forEach(reception => {
        reception.items.forEach(item => {
            if(item.status === 'Almacenado' && item.storageLocation?.chamberId === selectedChamberId && item.storageLocation.coordinate) {
                occupiedCoordinates.add(item.storageLocation.coordinate);
            }
        });
    });

    return allPossibleCoordinates.filter(coord => !occupiedCoordinates.has(coord));
  }, [selectedChamberId, lot, allChamberLots, allOtherFruitReceptions]);


  React.useEffect(() => {
    if (availableCoordinates.length > 0) {
        if (!form.getValues('coordinate') || !availableCoordinates.includes(form.getValues('coordinate'))) {
             form.setValue('coordinate', availableCoordinates[0]);
        }
    } else {
         form.setValue('coordinate', '');
    }
  }, [availableCoordinates, form]);


  React.useEffect(() => {
    if (open) {
      form.reset({ chamberId: undefined, coordinate: undefined });
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
            Seleccione la cámara y la coordenada de inicio para los {lot.binCount} bins del exportador <span className='font-bold'>{lot.exporterId}</span>.
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
                  <Select onValueChange={(value) => { field.onChange(value); form.setValue('coordinate', '') }} value={field.value}>
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
            
            <FormField
              control={form.control}
              name="coordinate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coordenada de Inicio</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value} disabled={!selectedChamberId || availableCoordinates.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={!selectedChamberId ? "Seleccione una cámara" : "Seleccione una coordenada"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCoordinates.length > 0 ? (
                        availableCoordinates.map(coord => (
                          <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-xs text-center text-muted-foreground">No hay coordenadas disponibles.</div>
                      )}
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
              <Button type="submit" disabled={!form.formState.isValid}>Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
