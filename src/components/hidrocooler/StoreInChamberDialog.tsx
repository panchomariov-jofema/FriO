'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ProcessingLot } from '@/lib/types';

interface StoreInChamberDialogProps {
  lot: ProcessingLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStore: (data: { chamberId: string }) => void;
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
});

type StoreFormValues = z.infer<typeof storeSchema>;

// Example chambers. In a real app, this might come from a "Chambers" master data collection.
const chambers = [
    'CÁMARA 1', 'CÁMARA 2', 'CÁMARA 3', 'CÁMARA 4', 'CÁMARA 5', 
    'TÚNEL 1', 'TÚNEL 2', 'TÚNEL 3', 'TÚNEL 4',
];

export function StoreInChamberDialog({ lot, open, onOpenChange, onStore }: StoreInChamberDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
        chamberId: undefined,
    }
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ chamberId: undefined });
    }
  }, [form, open]);

  const onSubmit = (values: StoreFormValues) => {
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
            Seleccione la cámara de destino para los {lot.binCount} bins de este lote.
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una cámara" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {chambers.map(chamber => (
                        <SelectItem key={chamber} value={chamber}>{chamber}</SelectItem>
                      ))}
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
              <Button type="submit">Almacenar en Cámara</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
