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
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const movementItemSchema = z.object({
  binMaterialId: z.string().min(1, 'Debe seleccionar un material.'),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});

const movementSchema = z.object({
  document: z.string().min(1, 'El documento es obligatorio.'),
  items: z.array(movementItemSchema).min(1, 'Debe agregar al menos un ítem.'),
});

type MovementFormValues = z.infer<typeof movementSchema>;

interface ExitsTabProps {
  exporterId: string;
  producerId: string;
}

export function ExitsTab({ exporterId, producerId }: ExitsTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { materials, loading: loadingMaterials } = useBinMaterialsByExporter(exporterId);
  
  // We need the stock data to validate quantities
  const { data: stockData } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', items: [{ binMaterialId: '', quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  
  const getStockForMaterial = (binMaterialId: string) => {
    const stockItem = stockData.find(s => s.exporterId === exporterId && s.binMaterialId === binMaterialId);
    return stockItem?.quantity || 0;
  }

  const onSubmit = async (values: MovementFormValues) => {
    if (!firestore) return;

    // Frontend validation for stock
    for (const item of values.items) {
        const availableStock = getStockForMaterial(item.binMaterialId);
        if (item.quantity > availableStock) {
            const material = materials.find(m => m.id === item.binMaterialId);
            toast({
                variant: 'destructive',
                title: 'Error de Stock',
                description: `No hay suficiente stock para "${material?.name}". Disponible: ${availableStock}, Solicitado: ${item.quantity}.`
            });
            return;
        }
    }


    try {
      await runTransaction(firestore, async (transaction) => {
        // 1. Add to movements log
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        const movementData = {
          type: 'salida' as const,
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

          const stockSnap = await getDocs(stockQuery);

          if (stockSnap.empty) {
            throw new Error(`No existe stock para el material con ID ${item.binMaterialId}.`);
          }
          
          const stockDoc = stockSnap.docs[0];
          const stockRef = stockDoc.ref;
          const currentQuantity = stockDoc.data().quantity || 0;

          if (item.quantity > currentQuantity) {
            const material = materials.find(m => m.id === item.binMaterialId);
            throw new Error(`Stock insuficiente para ${material?.name}.`);
          }

          transaction.update(stockRef, {
            quantity: currentQuantity - item.quantity,
            lastUpdatedAt: serverTimestamp(),
          });
        }
      });

      toast({ title: 'Éxito', description: 'Salida registrada y stock actualizado.' });
      form.reset({ document: '', items: [{ binMaterialId: '', quantity: 1 }] });

    } catch (error: any) {
      console.error('Error processing exit:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo procesar la salida.' });
       errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements or binMaterialStock',
          operation: 'write'
      }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Salida</CardTitle>
        <CardDescription>Ingrese un documento y los materiales que salen del inventario.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="document"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documento de Salida</FormLabel>
                  <FormControl><Input {...field} placeholder="Ej: Vale de Consumo 456" autoComplete="off" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <Label>Materiales</Label>
              {fields.map((field, index) => {
                const selectedMaterialId = form.watch(`items.${index}.binMaterialId`);
                const availableStock = getStockForMaterial(selectedMaterialId);

                return (
                  <div key={field.id} className="flex items-end gap-2 p-2 border rounded-md">
                    <FormField
                      control={form.control}
                      name={`items.${index}.binMaterialId`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select onValueChange={field.onChange} value={field.value} disabled={loadingMaterials}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Seleccione un material..." /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {materials.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
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
                        <FormItem className="w-36">
                          <FormControl><Input type="number" {...field} autoComplete="off" /></FormControl>
                          <FormMessage />
                          {selectedMaterialId && <p className="text-xs text-muted-foreground pt-1">Stock: {availableStock}</p>}
                        </FormItem>
                      )}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )
              })}
              <Button type="button" size="sm" variant="outline" onClick={() => append({ binMaterialId: '', quantity: 1 })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Ítem
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Registrar Salida'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
    