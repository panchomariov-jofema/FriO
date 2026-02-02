'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChamberLot } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { Alert, AlertDescription } from '../ui/alert';

interface RelocateLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelocate: (data: { targetChamberId: string; targetCoordinate: string }) => void;
  sourceChamberId: string;
  sourceCoordinate: string;
  lotsInCoordinate: ChamberLot[];
  allLots: ChamberLot[];
}

const relocateSchema = z.object({
  targetChamberId: z.string({ required_error: 'Debe seleccionar una cámara de destino.' }),
  targetCoordinate: z.string({ required_error: 'Debe seleccionar una coordenada de destino.' }),
});

type RelocateFormValues = z.infer<typeof relocateSchema>;

// Helper for natural sorting
const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1] || '0', 10);
  const bNum = parseInt(b.split(re)[1] || '0', 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];
  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;
  return aNum - bNum;
};

export function RelocateLotDialog({
  open,
  onOpenChange,
  onRelocate,
  sourceChamberId,
  sourceCoordinate,
  lotsInCoordinate,
  allLots
}: RelocateLotDialogProps) {
  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: {
      targetChamberId: undefined,
      targetCoordinate: undefined,
    },
  });

  const targetChamberId = form.watch('targetChamberId');

  const availableCoordinates = React.useMemo(() => {
    if (!targetChamberId) return [];
    
    const chamberConfig = chambersConfig[targetChamberId];
    if (!chamberConfig) return [];
    
    const allPossibleCoords = chamberConfig.columns.flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`));
    const occupiedCoords = new Set(allLots.filter(l => l.chamberId === targetChamberId).map(l => l.coordinate));
    
    // Add the source coordinate to the list if moving within the same chamber
    if (sourceChamberId === targetChamberId) {
        occupiedCoords.delete(sourceCoordinate);
    }
    
    return allPossibleCoords.filter(coord => !occupiedCoords.has(coord)).sort(naturalSort);
  }, [targetChamberId, allLots, sourceChamberId, sourceCoordinate]);

  React.useEffect(() => {
    if (open) {
      form.reset({
        targetChamberId: undefined,
        targetCoordinate: undefined,
      });
    }
  }, [open, form]);

  const onSubmit = (values: RelocateFormValues) => {
    onRelocate(values);
  };

  const lotInfo = lotsInCoordinate[0];
  const totalBins = lotsInCoordinate.reduce((sum, lot) => sum + lot.binCount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reubicar Coordenada</DialogTitle>
          <DialogDescription>
            Mover todo el contenido de la coordenada <span className="font-mono font-semibold">{sourceCoordinate}</span> en <span className="font-semibold">{chambersConfig[sourceChamberId]?.name}</span> a una nueva ubicación.
          </DialogDescription>
        </DialogHeader>

        {lotInfo && (
          <Alert variant="default" className="my-4">
             <AlertDescription>
                <div className="flex justify-between items-center text-sm">
                    <span>Lote: <span className="font-semibold">{lotInfo.displayLotId}</span></span>
                    <span>Productor: <span className="font-semibold">{lotInfo.producerShortName}</span></span>
                    <span>Bins: <span className="font-semibold">{totalBins}</span></span>
                </div>
             </AlertDescription>
          </Alert>
        )}

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
