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
  onProcess: (data: { hidrocooler: Hidrocooler; binCount: number }) => void;
}

const processSchema = z.object({
  hidrocoolerId: z.string({ required_error: 'Debe seleccionar un hidrocooler.' }),
  binCount: z.coerce.number().positive('La cantidad de bins debe ser mayor a 0.'),
});

type ProcessFormValues = z.infer<typeof processSchema>;

export function ProcessLotDialog({ lot, open, onOpenChange, onProcess }: ProcessLotDialogProps) {
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
      form.reset({ hidrocoolerId: undefined, binCount: lot.binCount });
    }
  }, [open, lot, form]);
  
  React.useEffect(() => {
    if (lot && selectedHidrocoolerId) {
      const selectedHidrocooler = hidrocoolers.find(h => h.id === selectedHidrocoolerId);
      
      if (selectedHidrocooler) {
        const defaultBinCount = selectedHidrocooler.binCount;
        const finalBinCount = Math.min(defaultBinCount, lot.binCount);
        form.setValue('binCount', finalBinCount);
      }
    }
  }, [selectedHidrocoolerId, lot, form, hidrocoolers]);


  const onSubmit = (values: ProcessFormValues) => {
    if (!lot) return;
    if (values.binCount > lot.binCount) {
      form.setError('binCount', { message: `La cantidad no puede ser mayor a ${lot.binCount}.`});
      return;
    }
    const selectedHidrocooler = hidrocoolers.find(h => h.id === values.hidrocoolerId);
    if (!selectedHidrocooler) return;

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
