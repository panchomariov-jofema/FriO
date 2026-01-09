'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../ui/dialog';

interface EditLotDialogProps {
  lot: ReceptionLot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLotUpdated: () => void;
}

const editSchema = z.object({
  binCount: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).positive("Debe ser mayor a 0.").optional(),
  totalWeight: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).optional(),
  preHydroTemp: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).optional(),
  postHydroTemp: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

export function EditLotDialog({ lot, open, onOpenChange, onLotUpdated }: EditLotDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      binCount: lot.binCount || undefined,
      totalWeight: lot.totalWeight || undefined,
      preHydroTemp: lot.preHydroTemp || undefined,
      postHydroTemp: lot.postHydroTemp || undefined,
    },
  });

  React.useEffect(() => {
    if (lot) {
      form.reset({
        binCount: lot.binCount || undefined,
        totalWeight: lot.totalWeight || undefined,
        preHydroTemp: lot.preHydroTemp || undefined,
        postHydroTemp: lot.postHydroTemp || undefined,
      });
    }
  }, [lot, form, open]);

  const onSubmit = async (values: EditFormValues) => {
    if (!firestore) return;

    try {
        await runTransaction(firestore, async (transaction) => {
            const lotRef = doc(firestore, 'receptionLots', lot.id);
            
            const updateData: Partial<ReceptionLot> = {};
            if (values.binCount) updateData.binCount = values.binCount;
            if (values.totalWeight) updateData.totalWeight = values.totalWeight;
            if (values.preHydroTemp) updateData.preHydroTemp = values.preHydroTemp;
            if (values.postHydroTemp) updateData.postHydroTemp = values.postHydroTemp;

            // 1. Update the reception lot
            transaction.update(lotRef, updateData);

            // 2. If binCount is changed, update the corresponding hidrocooler lot
            if (values.binCount && values.binCount !== lot.binCount) {
                const hidroLotsRef = collection(firestore, 'hidrocoolerLots');
                const q = query(hidroLotsRef, where('displayLotId', '==', lot.displayLotId));
                const hidroLotsSnap = await getDocs(q);

                if (!hidroLotsSnap.empty) {
                    const hidroLotDoc = hidroLotsSnap.docs[0];
                    const hidroLotRef = doc(firestore, 'hidrocoolerLots', hidroLotDoc.id);
                    transaction.update(hidroLotRef, { binCount: values.binCount });
                }
            }
        });

        toast({ title: 'Éxito', description: 'Los datos del lote han sido actualizados.' });
        onLotUpdated();

    } catch (error) {
        console.error("Error updating lot in transaction: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: `receptionLots/${lot.id} or hidrocoolerLots`,
                operation: 'update',
                requestResourceData: values,
            })
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Lote</DialogTitle>
          <DialogDescription>
            Modifique los valores para el lote <span className="font-mono">{lot.displayLotId}</span>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
             <FormField
              control={form.control}
              name="binCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de Bins</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalWeight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Peso Total (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} value={field.value ?? ''} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="preHydroTemp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>T° Pre-Hidro (°C)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" {...field} value={field.value ?? ''} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postHydroTemp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>T° Post-Hidro (°C)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" {...field} value={field.value ?? ''} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Guardar Cambios</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
