'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { packagingStorageConfig } from '@/lib/packaging-storage-config';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface RelocatePackagingDialogProps {
  item: {
      name: string;
      palletCount: number;
      location: {
          warehouse: string;
          aisle: string;
      }
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { warehouse: string; aisle: string }) => void;
}

const relocateSchema = z.object({
  warehouse: z.string({ required_error: 'Debe seleccionar un almacén.' }),
  aisle: z.string({ required_error: 'Debe seleccionar un pasillo.' }),
});

type RelocateFormValues = z.infer<typeof relocateSchema>;

export function RelocatePackagingDialog({ item, open, onOpenChange, onConfirm }: RelocatePackagingDialogProps) {
  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: { warehouse: undefined, aisle: undefined },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ warehouse: undefined, aisle: undefined });
    }
  }, [form, open]);

  const onSubmit = (values: RelocateFormValues) => {
    onConfirm(values);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reubicar Pallet</DialogTitle>
          <DialogDescription>
            Seleccione la nueva ubicación para los {item.palletCount} pallets de <span className="font-semibold">{item.name}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <Alert>
            <AlertTitle>Ubicación Actual</AlertTitle>
            <AlertDescription>
               {item.location.warehouse} / {item.location.aisle}
            </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="warehouse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nuevo Almacén</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {packagingStorageConfig.warehouses.map(w => (
                          <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="aisle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nuevo Pasillo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {packagingStorageConfig.aisles.map(a => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Confirmar Reubicación</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
