'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ProcessingLot, HidrocoolerLot } from '@/lib/types';
import { Alert, AlertDescription } from '../ui/alert';

interface EditProcessingLotDialogProps {
  lot: ProcessingLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { newBinCount: number }) => void;
  pendingLots: HidrocoolerLot[];
}

const editSchema = z.object({
  newBinCount: z.coerce.number().positive('La cantidad de bins debe ser mayor a 0.'),
});

type EditFormValues = z.infer<typeof editSchema>;

export function EditProcessingLotDialog({
  lot,
  open,
  onOpenChange,
  onConfirm,
  pendingLots,
}: EditProcessingLotDialogProps) {
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      newBinCount: lot?.binCount,
    },
  });

  const originalPendingLot = React.useMemo(() => {
    return pendingLots.find(p => p.id === lot?.originalLotId);
  }, [pendingLots, lot]);

  React.useEffect(() => {
    if (lot) {
      form.reset({ newBinCount: lot.binCount });
    }
  }, [lot, form, open]);

  const onSubmit = (values: EditFormValues) => {
    onConfirm(values);
  };

  if (!lot) return null;
  
  const difference = (form.watch('newBinCount') || lot.binCount) - lot.binCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Lote en Proceso: {lot.displayLotId}</DialogTitle>
          <DialogDescription>
            Ajuste la cantidad de bins para este lote. El lote pendiente original se ajustará automáticamente.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="newBinCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nueva Cantidad de Bins</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Alert variant={difference === 0 ? "default" : difference > 0 ? "destructive" : "default"}>
                <AlertDescription>
                   {difference > 0 && `Se tomarán ${difference} bins del lote pendiente.`}
                   {difference < 0 && `Se devolverán ${Math.abs(difference)} bins al lote pendiente.`}
                   {difference === 0 && `No hay cambios en la cantidad de bins.`}
                   <br />
                   <span className="text-xs text-muted-foreground">
                        Bins pendientes disponibles: {originalPendingLot?.binCount ?? 0}
                   </span>
                </AlertDescription>
            </Alert>
            
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit">Guardar Cambios</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
