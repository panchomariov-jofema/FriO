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
  toteCount: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).min(0, "No puede ser negativo.").optional(),
  laminaCount: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).min(0, "No puede ser negativo.").optional(),
  emptyTotes: z.coerce.number({invalid_type_error: 'Debe ser un número.'}).min(0, "No puede ser negativo.").optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

export function EditLotDialog({ lot, open, onOpenChange, onLotUpdated }: EditLotDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      binCount: lot.binCount ?? 0,
      toteCount: lot.toteCount ?? 0,
      laminaCount: lot.laminaCount ?? lot.binCount ?? 0,
      emptyTotes: lot.emptyTotes ?? 0,
    },
  });

  React.useEffect(() => {
    if (lot) {
      form.reset({
        binCount: lot.binCount ?? 0,
        toteCount: lot.toteCount ?? 0,
        laminaCount: lot.laminaCount ?? lot.binCount ?? 0,
        emptyTotes: lot.emptyTotes ?? 0,
      });
    }
  }, [lot, form, open]);

  const onSubmit = async (values: EditFormValues) => {
    if (!firestore) return;

    try {
        await runTransaction(firestore, async (transaction) => {
            const lotRef = doc(firestore, 'receptionLots', lot.id);
            
            const updateData: Partial<ReceptionLot> = {};
            if (values.binCount !== undefined) updateData.binCount = values.binCount;
            if (values.toteCount !== undefined) updateData.toteCount = values.toteCount;
            if (values.laminaCount !== undefined) updateData.laminaCount = values.laminaCount;
            if (values.emptyTotes !== undefined) updateData.emptyTotes = values.emptyTotes;

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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              name="toteCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de Totes</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="laminaCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de Láminas</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emptyTotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Totes Vacíos Adicionales</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" />
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
