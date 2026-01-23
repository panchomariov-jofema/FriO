'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PendingItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    productName: string;
    quantity: number;
    unit: 'Bins' | 'Pallets';
}

interface StoreOtherFruitDialogProps {
  item: PendingItem | null;
  target: { chamberId: string; coordinate: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { quantity: number }) => void;
}

const storeSchema = z.object({
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreOtherFruitDialog({ item, target, open, onOpenChange, onConfirm }: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
  });

  React.useEffect(() => {
    if (item) {
      form.reset({ quantity: item.quantity });
    }
  }, [item, form, open]);

  if (!item || !target) return null;

  const onSubmit = (values: StoreFormValues) => {
    if (values.quantity > item.quantity) {
      form.setError('quantity', { message: `No puede almacenar más de lo pendiente (${item.quantity}).`});
      return;
    }
    onConfirm(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Producto</DialogTitle>
          <DialogDescription>
            Confirme la cantidad de <span className="font-semibold">{item.unit}</span> de <span className="font-semibold">{item.productName}</span> a almacenar en <span className="font-mono">{target.chamberId}/{target.coordinate}</span>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad a Almacenar (Pendiente: {item.quantity})</FormLabel>
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
              <Button type="submit">Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
