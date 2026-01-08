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
import type { HidrocoolerLot } from '@/lib/types';

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
  const form = useForm<ProcessFormValues>({
    resolver: zodResolver(processSchema),
    defaultValues: {
      hidrocooler: undefined,
      binCount: lot?.binCount,
    },
  });
  
  React.useEffect(() => {
    if (lot) {
      form.reset({ hidrocooler: undefined, binCount: lot.binCount });
    }
  }, [lot, form, open]);

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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un hidrocooler" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="HIDROCOOLER 1">HIDROCOOLER 1</SelectItem>
                      <SelectItem value="HIDROCOOLER 2">HIDROCOOLER 2</SelectItem>
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
                    <Input type="number" {...field} autoComplete="off" />
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