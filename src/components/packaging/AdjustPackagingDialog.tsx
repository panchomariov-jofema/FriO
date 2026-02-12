'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface StoredPackagingItem {
    id: string;
    name: string;
    palletCount: number;
    location: {
        warehouse: string;
        aisle: string;
    }
}

interface AdjustPackagingDialogProps {
  item: StoredPackagingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newQuantity: number) => void;
}

const adjustSchema = z.object({
  newQuantity: z.coerce.number().min(0, 'La cantidad no puede ser negativa.'),
});

type AdjustFormValues = z.infer<typeof adjustSchema>;

export function AdjustPackagingDialog({ item, open, onOpenChange, onConfirm }: AdjustPackagingDialogProps) {
  const form = useForm<AdjustFormValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { newQuantity: 0 },
  });

  React.useEffect(() => {
    if (open && item) {
      form.reset({ newQuantity: item.palletCount });
    }
  }, [form, open, item]);

  const onSubmit = (values: AdjustFormValues) => {
    onConfirm(values.newQuantity);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar Stock de Pallets</DialogTitle>
          <DialogDescription>
            Ajuste la cantidad de pallets para el artículo <span className="font-semibold">{item.name}</span>.
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
              <FormField
                control={form.control}
                name="newQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nueva Cantidad de Pallets</FormLabel>
                    <FormControl>
                        <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
                    </FormControl>
                    <p className="text-sm text-muted-foreground pt-1">
                        Cantidad actual: {item.palletCount}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Guardar Ajuste</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
