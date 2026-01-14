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
import { chambersConfig, exporterChamberAssignments } from '@/lib/chambers-config';

interface StoreInChamberDialogProps {
  lot: ChamberLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStore: (data: { chamberId: string }) => void;
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreInChamberDialog({ lot, open, onOpenChange, onStore }: StoreInChamberDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
    }
  });

  const availableChambers = React.useMemo(() => {
    if (!lot) return [];
    
    const assignedChamberIds = exporterChamberAssignments[lot.exporterId];
    
    // If the exporter has specific chambers assigned, filter by them
    if (assignedChamberIds && assignedChamberIds.length > 0) {
        return Object.values(chambersConfig).filter(chamber => 
            assignedChamberIds.includes(chamber.id)
        );
    }
    
    // If no specific assignment, show all chambers
    return Object.values(chambersConfig);

  }, [lot]);


  React.useEffect(() => {
    if (open) {
      form.reset({ chamberId: undefined });
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
            Seleccione la cámara de destino para los {lot.binCount} bins del exportador <span className='font-bold'>{lot.exporterId}</span>. El sistema asignará la primera coordenada disponible.
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
