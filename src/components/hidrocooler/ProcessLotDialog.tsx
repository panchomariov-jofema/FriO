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
import type { Hidrocooler, HidrocoolerLot } from '@/lib/types';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Skeleton } from '../ui/skeleton';

interface ProcessLotDialogProps {
  lot: HidrocoolerLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProcess: (data: { hidrocooler: string; binCount: number }) => void;
}

const processSchema = z.object({
  hidrocooler: z.string({ required_error: 'Debe seleccionar un hidrocooler.' }),
  binCount: z.coerce.number().positive('La cantidad de bins debe ser mayor a 0.'),
});

type ProcessFormValues = z.infer<typeof processSchema>;

export function ProcessLotDialog({ lot, open, onOpenChange, onProcess }: ProcessLotDialogProps) {
  const { data: hidrocoolers, loading: loadingHidrocoolers } = useFirestoreCollection<Hidrocooler>('hidrocoolers');
  
  const form = useForm<ProcessFormValues>({
    resolver: zodResolver(processSchema),
    defaultValues: {
      hidrocooler: undefined,
      binCount: lot?.binCount,
    },
  });

  const selectedHidrocooler = form.watch('hidrocooler');

  React.useEffect(() => {
    if (lot) {
      // Set default bin count based on selected hidrocooler
      let defaultBinCount = lot.binCount;
      if (selectedHidrocooler === 'HIDROCOOLER 1') {
        defaultBinCount = 10;
      } else if (selectedHidrocooler === 'HIDROCOOLER 2') {
        defaultBinCount = 8;
      }
      
      // Ensure default does not exceed available
      const finalBinCount = Math.min(defaultBinCount, lot.binCount);

      // Only update if the hidrocooler has been selected, to avoid overwriting initial state
      if(selectedHidrocooler) {
          form.setValue('binCount', finalBinCount);
      } else {
         form.reset({ hidrocooler: undefined, binCount: lot.binCount });
      }

    }
  }, [selectedHidrocooler, lot, form]);
  
  React.useEffect(() => {
    // Reset form when dialog opens
    if (open && lot) {
      form.reset({ hidrocooler: undefined, binCount: lot.binCount });
    }
  }, [open, lot, form]);


  const onSubmit = (values: ProcessFormValues) => {
    if (!lot) return;
    if (values.binCount > lot.binCount) {
      form.setError('binCount', { message: `La cantidad no puede ser mayor a ${lot.binCount}.`});
      return;
    }
    onProcess(values);
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
              name="hidrocooler"
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
                            <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>
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
                    <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
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
