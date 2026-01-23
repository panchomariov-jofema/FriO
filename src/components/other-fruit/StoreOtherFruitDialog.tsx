'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OtherFruitReception, ChamberLot, OtherFruitReceptionItem } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { useToast } from '@/hooks/use-toast';

interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

interface StoreOtherFruitDialogProps {
  item: PendingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { chamberId: string; coordinate: string; quantity: number }) => void;
  allReceptions: OtherFruitReception[];
  allChamberLots: ChamberLot[];
  preselectedLocation: { chamberId: string; coordinate: string } | null;
}

const storeSchema = z.object({
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreOtherFruitDialog({ item, open, onOpenChange, onConfirm, preselectedLocation }: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
  });
  const { toast } = useToast();


  React.useEffect(() => {
    if (open && item) {
      form.reset({ quantity: item.quantity });
    }
  }, [item, open, form]);

  if (!item || !preselectedLocation) return null;
  
  const { chamberId, coordinate } = preselectedLocation;
  const chamber = chambersConfig[chamberId];

  const onSubmit = (values: StoreFormValues) => {
    const { unit } = item;
    const { quantity } = values;
    const BINS_PER_COORDINATE = 6;
    const PALLETS_PER_COORDINATE = 3; 

    if (unit === 'Bins' && quantity > BINS_PER_COORDINATE) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `Una coordenada no puede tener más de ${BINS_PER_COORDINATE} bins.`});
        return;
    }
    if (unit === 'Pallets' && quantity > PALLETS_PER_COORDINATE) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `Una coordenada no puede tener más de ${PALLETS_PER_COORDINATE} pallets.`});
        return;
    }
    if (quantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }
    onConfirm({ ...values, chamberId, coordinate });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Almacenamiento</DialogTitle>
          <DialogDescription>
            Guardar <span className="font-semibold">{item.productName}</span> en <span className="font-semibold">{chamber.name}</span>, coordenada <span className="font-mono font-semibold">{coordinate}</span>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad a Almacenar ({item.unit})</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground pt-1">
                      Pendiente: {item.quantity} {item.unit}.
                  </p>
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
