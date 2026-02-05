'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Hidrocooler, HidrocoolerLot, ProcessingLot } from '@/lib/types';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Skeleton } from '../ui/skeleton';

interface ProcessLotDialogProps {
  lot: HidrocoolerLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProcess: (data: { hidrocooler: Hidrocooler; binCount: number }) => void;
  processingLots: ProcessingLot[];
}

const processSchema = z.object({
  hidrocoolerId: z.string({ required_error: 'Debe seleccionar un hidrocooler.' }),
  binCount: z.coerce.number().positive('La cantidad de bins debe ser mayor a 0.'),
});

type ProcessFormValues = z.infer<typeof processSchema>;

export function ProcessLotDialog({ lot, open, onOpenChange, onProcess, processingLots }: ProcessLotDialogProps) {
  const { data: hidrocoolers, loading: loadingHidrocoolers } = useFirestoreCollection<Hidrocooler>('hidrocoolers');
  
  const form = useForm<ProcessFormValues>({
    resolver: zodResolver(processSchema),
    defaultValues: {
      hidrocoolerId: undefined,
      binCount: undefined,
    },
  });

  const selectedHidrocoolerId = form.watch('hidrocoolerId');

  React.useEffect(() => {
    // Reset form when dialog opens
    if (open && lot) {
      form.reset({ hidrocoolerId: undefined, binCount: undefined });
    }
  }, [open, lot, form]);
  
  React.useEffect(() => {
    // When a hidrocooler is selected, set the binCount intelligently
    if (lot && selectedHidrocoolerId) {
      const selectedHidrocooler = hidrocoolers.find(h => h.id === selectedHidrocoolerId);
      
      if (selectedHidrocooler) {
        const currentLoad = (processingLots || [])
            .filter(p => p.hidrocooler === selectedHidrocooler.name && p.status === 'En Proceso')
            .reduce((sum, p) => sum + p.binCount, 0);
        
        const remainingCapacity = selectedHidrocooler.binCount - currentLoad;

        // The suggested amount is the smaller of the two: remaining capacity or available lot bins
        const finalBinCount = Math.min(remainingCapacity, lot.binCount);

        form.setValue('binCount', finalBinCount > 0 ? finalBinCount : 0);
      }
    }
  }, [selectedHidrocoolerId, lot, form, hidrocoolers, processingLots]);


  const onSubmit = (values: ProcessFormValues) => {
    if (!lot) return;
    const selectedHidrocooler = hidrocoolers.find(h => h.id === values.hidrocoolerId);
    if (!selectedHidrocooler) return;

    const currentLoad = (processingLots || [])
        .filter(p => p.hidrocooler === selectedHidrocooler.name && p.status === 'En Proceso')
        .reduce((sum, p) => sum + p.binCount, 0);

    const remainingCapacity = selectedHidrocooler.binCount - currentLoad;

    if (values.binCount > lot.binCount) {
      form.setError('binCount', { message: `La cantidad no puede ser mayor a los bins del lote (${lot.binCount}).`});
      return;
    }

    if (values.binCount > remainingCapacity) {
      form.setError('binCount', { message: `La capacidad restante del hidrocooler es ${remainingCapacity} bins.`});
      return;
    }

    onProcess({ hidrocooler: selectedHidrocooler, binCount: values.binCount });
    onOpenChange(false);
  };

  if (!lot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Procesar Lote: {lot.displayLotId}</DialogTitle>
          <DialogDescription>
            Seleccione el hidrocooler y la cantidad de bins a procesar. Bins disponibles: {lot.binCount}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="hidrocoolerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hidrocooler</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={loadingHidrocoolers}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un hidrocooler" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {loadingHidrocoolers ? (
                        <div className="p-2">
                          <Skeleton className="h-6 w-full" />
                        </div>
                      ) : (
                        hidrocoolers.map(h => (
                            <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="binCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de Bins a Procesar</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" inputMode="numeric" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Iniciar Proceso</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
