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
import { OtherFruitReception, ChamberLot, OtherFruitReceptionItem } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { naturalSort } from '@/lib/utils';
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
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada.' }),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreOtherFruitDialog({ item, open, onOpenChange, onConfirm, allReceptions, allChamberLots }: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
  });
  const { toast } = useToast();

  const selectedChamberId = form.watch('chamberId');

  React.useEffect(() => {
    if (open && item) {
      form.reset({ chamberId: undefined, coordinate: undefined, quantity: item.quantity });
    }
  }, [item, open, form]);

  const availableCoordinates = React.useMemo(() => {
    if (!selectedChamberId) return [];

    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) return [];
    
    const allPossibleCoords = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);
    
    const occupiedCoords = new Set<string>();
    (allChamberLots || []).forEach(lot => {
      if (lot.status === 'Almacenado' && lot.chamberId === selectedChamberId && lot.coordinate) {
        occupiedCoords.add(lot.coordinate);
      }
    });
    (allReceptions || []).forEach(reception => {
        reception.items.forEach(item => {
            if (item.status === 'Almacenado' && item.storageLocation?.chamberId === selectedChamberId && item.storageLocation.coordinate) {
                occupiedCoords.add(item.storageLocation.coordinate);
            }
        });
    });

    return allPossibleCoords.filter(coord => !occupiedCoords.has(coord));
  }, [selectedChamberId, allChamberLots, allReceptions]);
  

  if (!item) return null;

  const onSubmit = (values: StoreFormValues) => {
    const { unit } = item;
    const { quantity } = values;
    const BINS_PER_COORDINATE = 6;
    const PALLETS_PER_COORDINATE = 3; // 1 pallet ~ 2 bin spaces

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
    onConfirm(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Producto</DialogTitle>
          <DialogDescription>
            Seleccione la ubicación para {item.productName} ({item.quantity} {item.unit} pendientes).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="chamberId" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cámara</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.resetField('coordinate'); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                        {Object.values(chambersConfig).map(chamber => (
                            <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="coordinate" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Coordenada Vacía</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedChamberId}>
                        <FormControl><SelectTrigger><SelectValue placeholder={!selectedChamberId ? "Seleccione cámara" : "Seleccione..."} /></SelectTrigger></FormControl>
                        <SelectContent>
                        {availableCoordinates.length > 0 ? (
                            availableCoordinates.map(coord => (
                            <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                            ))
                        ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">No hay coordenadas vacías.</div>
                        )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad a Almacenar ({item.unit})</FormLabel>
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
