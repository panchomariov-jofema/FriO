'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChamberLot, OtherFruitReception } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { useToast } from '@/hooks/use-toast';
import { naturalSort } from '@/lib/utils';

// This will represent a single, located item from an OtherFruitReception
interface StoredOtherFruitItem {
    id: string; // receptionId_itemIndex
    receptionId: string;
    itemIndex: number;
    clientName: string;
    productName: string;
    quantity: number;
    unit: 'Bins' | 'Pallets';
    location: {
        chamberId: string;
        coordinate: string;
    }
}

interface RelocateOtherFruitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelocate: (data: { targetChamberId: string; targetCoordinate: string }) => void;
  item: StoredOtherFruitItem | null;
  allChamberLots: ChamberLot[];
  allOtherFruitReceptions: OtherFruitReception[];
}

const relocateSchema = z.object({
  targetChamberId: z.string({ required_error: 'Debe seleccionar una cámara de destino.' }),
  targetCoordinate: z.string({ required_error: 'Debe seleccionar una coordenada de destino.' }),
});

type RelocateFormValues = z.infer<typeof relocateSchema>;

export function RelocateOtherFruitDialog({
  open,
  onOpenChange,
  onRelocate,
  item,
  allChamberLots,
  allOtherFruitReceptions,
}: RelocateOtherFruitDialogProps) {
  const { toast } = useToast();
  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: {
      targetChamberId: undefined,
      targetCoordinate: undefined,
    },
  });
  
  const targetChamberId = form.watch('targetChamberId');

  const { availableCoordinates } = React.useMemo(() => {
    if (!targetChamberId) return { availableCoordinates: [] };

    const chamberConfig = chambersConfig[targetChamberId];
    if (!chamberConfig) return { availableCoordinates: [] };

    const allPossibleCoords = chamberConfig.columns.flatMap(col => chamberConfig.rows.map(row => `${col}${row}`)).sort(naturalSort);
    
    const occupiedCoords = new Set<string>();

    allChamberLots.forEach(lot => {
      if (lot.status === 'Almacenado' && lot.chamberId === targetChamberId && lot.coordinate) {
        occupiedCoords.add(lot.coordinate);
      }
    });

    allOtherFruitReceptions.forEach(reception => {
        reception.items.forEach(item => {
            if(item.status === 'Almacenado' && item.storageLocation?.chamberId === targetChamberId && item.storageLocation.coordinate) {
                 occupiedCoords.add(item.storageLocation.coordinate);
            }
        });
    });
    
    const available = allPossibleCoords.filter(coord => !occupiedCoords.has(coord) && !chamberConfig.blocked?.includes(coord));

    return { 
        availableCoordinates: available,
    };
  }, [targetChamberId, allChamberLots, allOtherFruitReceptions]);


  React.useEffect(() => {
    if (open) {
      form.reset({
        targetChamberId: undefined,
        targetCoordinate: undefined,
      });
    }
  }, [open, form]);

  const onSubmit = (values: RelocateFormValues) => {
    if (item && values.targetChamberId === item.location.chamberId && values.targetCoordinate === item.location.coordinate) {
        toast({ variant: 'destructive', title: 'Error', description: 'La ubicación de destino no puede ser la misma que la de origen.'});
        return;
    }
    onRelocate(values);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reubicar Producto</DialogTitle>
          <DialogDescription>
            Mover los {item.quantity} {item.unit} de <span className="font-semibold">{item.productName}</span> de la coordenada <span className="font-mono font-semibold">{item.location.coordinate}</span> en <span className="font-semibold">{chambersConfig[item.location.chamberId]?.name}</span> a una nueva ubicación.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="targetChamberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cámara de Destino</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue('targetCoordinate', ''); // Reset coordinate on chamber change
                  }} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una cámara" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(chambersConfig).map(chamber => (
                        <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetCoordinate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coordenada de Destino (Solo vacías)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!targetChamberId || availableCoordinates.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={!targetChamberId ? "Seleccione una cámara primero" : "Seleccione una coordenada vacía"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCoordinates.length > 0 ? (
                        availableCoordinates.map(coord => (
                          <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-center text-muted-foreground">No hay coordenadas vacías.</div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
