'use client';

import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, runTransaction, serverTimestamp, getDocs, doc } from 'firebase/firestore';
import type { BinMaterial, BinMaterialStock } from '@/lib/types';
import { useBinMaterialsByExporter } from '@/hooks/use-bin-materials-by-exporter';
import { PlusCircle, Trash2 } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Label } from '@/components/ui/label';

const movementItemSchema = z.object({
  binMaterialId: z.string().min(1, 'Debe seleccionar un material.'),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});

const movementSchema = z.object({
  document: z.string().min(1, 'El documento es obligatorio.'),
  items: z.array(movementItemSchema).min(1, 'Debe agregar al menos un ítem.'),
});

type MovementFormValues = z.infer<typeof movementSchema>;

interface EntriesTabProps {
  exporterId: string;
  producerId: string;
}

export function EntriesTab({ exporterId, producerId }: EntriesTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { materials, loading: loadingMaterials } = useBinMaterialsByExporter(exporterId);

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', items: [{ binMaterialId: '', quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const onSubmit = async (values: MovementFormValues) => {
    if (!firestore) return;

    try {
      await runTransaction(firestore, async (transaction) => {
        // 1. Add to movements log
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        const movementData = {
          type: 'entrada' as const,
          document: values.document,
          exporterId,
          producerId,
          items: values.items.map(item => {
            const material = materials.find(m => m.id === item.binMaterialId);
            return {
              ...item,
              binMaterialCode: material?.code || '',
              binMaterialName: material?.name || ''
            };
          }),
          createdAt: serverTimestamp(),
        };
        transaction.set(movementRef, movementData);
        
        // 2. Update stock for each item
        for (const item of values.items) {
          const stockQuery = query(
            collection(firestore, 'binMaterialStock'),
            where('exporterId', '==', exporterId),
            where('binMaterialId', '==', item.binMaterialId)
          );

          const stockSnap = await getDocs(stockQuery); // Use getDocs within transaction
          const material = materials.find(m => m.id === item.binMaterialId);

          if (stockSnap.empty) {
            // No stock record, create a new one
            const newStockRef = doc(collection(firestore, 'binMaterialStock'));
            transaction.set(newStockRef, {
              binMaterialId: item.binMaterialId,
              binMaterialCode: material?.code || '',
              binMaterialName: material?.name || '',
              exporterId: exporterId,
              quantity: item.quantity,
              lastUpdatedAt: serverTimestamp(),
            });
          } else {
            // Stock record exists, update it
            const stockDoc = stockSnap.docs[0];
            const stockRef = stockDoc.ref;
            const currentQuantity = stockDoc.data().quantity || 0;
            transaction.update(stockRef, {
              quantity: currentQuantity + item.quantity,
              lastUpdatedAt: serverTimestamp(),
            });
          }
        }
      });

      toast({ title: 'Éxito', description: 'Entrada registrada y stock actualizado.' });
      form.reset({ document: '', items: [{ binMaterialId: '', quantity: 1 }] });

    } catch (error: any) {
      console.error('Error processing entry:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la entrada.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements or binMaterialStock',
          operation: 'write'
      }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Entrada</CardTitle>
        <CardDescription>Ingrese un documento y los materiales que ingresan al inventario.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="document"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documento de Entrada</FormLabel>
                  <FormControl><Input {...field} placeholder="Ej: Guía de Despacho 123" autoComplete="off" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <Label>Materiales</Label>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2 p-2 border rounded-md">
                  <FormField
                    control={form.control}
                    name={`items.${index}.binMaterialId`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <Select onValueChange={field.onChange} value={field.value} disabled={loadingMaterials}>
                          <FormControl>
                             <SelectTrigger>
                                <SelectValue placeholder="Seleccione un material..." />
                              </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {materials.map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem className="w-24">
                        <FormControl><Input type="number" {...field} autoComplete="off" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => append({ binMaterialId: '', quantity: 1 })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Ítem
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Registrar Entrada'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
