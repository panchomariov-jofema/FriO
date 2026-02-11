'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { PackagingReceptionItem, Warehouse, Aisle } from '@/lib/types';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';

interface StorePackagingDialogProps {
  item: (PackagingReceptionItem & { document?: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { warehouse: string; aisle: string }) => void;
}

const storeSchema = z.object({
  warehouse: z.string({ required_error: 'Debe seleccionar un almacén.' }),
  aisle: z.string({ required_error: 'Debe seleccionar un pasillo.' }),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StorePackagingDialog({ item, open, onOpenChange, onConfirm }: StorePackagingDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: { warehouse: undefined, aisle: undefined },
  });

  const { data: warehouses, loading: loadingWarehouses } = useFirestoreCollection<Warehouse>('warehouses');
  const { data: aisles, loading: loadingAisles } = useFirestoreCollection<Aisle>('aisles');

  React.useEffect(() => {
    if (open) {
      form.reset({ warehouse: undefined, aisle: undefined });
    }
  }, [form, open]);

  const onSubmit = (values: StoreFormValues) => {
    onConfirm(values);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Artículo</DialogTitle>
          <DialogDescription>
            Seleccione la ubicación para {item.palletCount} pallets de <span className="font-semibold">{item.packagingMasterName}</span> del documento <span className="font-mono">{item.document}</span>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="warehouse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Almacén</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingWarehouses}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.map(w => (
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
                    <FormLabel>Pasillo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingAisles}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {aisles.map(a => (
                          <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
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
              <Button type="submit">Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
