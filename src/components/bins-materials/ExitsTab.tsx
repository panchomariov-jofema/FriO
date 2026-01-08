'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, runTransaction, serverTimestamp, getDocs, doc } from 'firebase/firestore';
import type { BinMaterialStock } from '@/lib/types';
import { useBinMaterialsByExporter } from '@/hooks/use-bin-materials-by-exporter';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '../ui/table';
import { Skeleton } from '../ui/skeleton';

const movementItemSchema = z.object({
  binMaterialId: z.string(),
  binMaterialCode: z.string(),
  binMaterialName: z.string(),
  quantity: z.coerce.number().min(0, 'La cantidad no puede ser negativa.'),
});

const movementSchema = z.object({
  document: z.string().min(1, 'El documento es obligatorio.'),
  items: z.array(movementItemSchema),
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
  
  const { data: stockData, loading: loadingStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', items: [] },
  });

  const getStockForMaterial = React.useCallback((binMaterialId: string) => {
    const stockItem = stockData.find(s => s.exporterId === exporterId && s.binMaterialId === binMaterialId);
    return stockItem?.quantity || 0;
  }, [stockData, exporterId]);


  React.useEffect(() => {
    if (materials.length > 0) {
      form.reset({
        document: form.getValues('document'),
        items: materials.map(m => ({
          binMaterialId: m.id,
          binMaterialCode: m.code,
          binMaterialName: m.name,
          quantity: 0,
        })),
      });
    }
  }, [materials, form]);

  const onSubmit = async (values: MovementFormValues) => {
    if (!firestore) return;

    const itemsToProcess = values.items.filter(item => item.quantity > 0);

    if (itemsToProcess.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin ítems',
        description: 'Debe ingresar una cantidad para al menos un material.',
      });
      return;
    }

    for (const item of itemsToProcess) {
        const availableStock = getStockForMaterial(item.binMaterialId);
        if (item.quantity > availableStock) {
            toast({
                variant: 'destructive',
                title: 'Error de Stock',
                description: `No hay suficiente stock para "${item.binMaterialName}". Disponible: ${availableStock}, Solicitado: ${item.quantity}.`
            });
            return;
        }
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        const movementData = {
          type: 'salida' as const,
          document: values.document,
          exporterId,
          producerId,
          items: itemsToProcess,
          createdAt: serverTimestamp(),
        };
        transaction.set(movementRef, movementData);
        
        for (const item of itemsToProcess) {
          const stockQuery = query(
            collection(firestore, 'binMaterialStock'),
            where('exporterId', '==', exporterId),
            where('binMaterialId', '==', item.binMaterialId)
          );

          const stockSnap = await getDocs(stockQuery);

          if (stockSnap.empty) {
            throw new Error(`No existe stock para el material "${item.binMaterialName}".`);
          }
          
          const stockDoc = stockSnap.docs[0];
          const stockRef = stockDoc.ref;
          const currentQuantity = stockDoc.data().quantity || 0;

          if (item.quantity > currentQuantity) {
            throw new Error(`Stock insuficiente para "${item.binMaterialName}".`);
          }

          transaction.update(stockRef, {
            quantity: currentQuantity - item.quantity,
            lastUpdatedAt: serverTimestamp(),
          });
        }
      });

      toast({ title: 'Éxito', description: 'Salida registrada y stock actualizado.' });
      const resetItems = materials.map(m => ({
        binMaterialId: m.id,
        binMaterialCode: m.code,
        binMaterialName: m.name,
        quantity: 0
      }));
      form.reset({ document: '', items: resetItems });

    } catch (error: any) {
      console.error('Error processing exit:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo procesar la salida.' });
       errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements or binMaterialStock',
          operation: 'write'
      }));
    }
  };
  
  const isLoading = loadingMaterials || loadingStock;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Salida</CardTitle>
        <CardDescription>Ingrese un documento y las cantidades de los materiales que salen del inventario.</CardDescription>
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

            <div className="space-y-2">
                <FormLabel>Materiales</FormLabel>
                 <div className="rounded-md border max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="w-[200px]">Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                        <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : form.getValues('items').map((item, index) => (
                                <TableRow key={item.binMaterialId}>
                                    <TableCell className="font-medium">{item.binMaterialName}</TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantity`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input type="number" {...field} autoComplete="off" min="0" />
                                                    </FormControl>
                                                     <p className="text-xs text-muted-foreground pt-1">
                                                        Stock: {getStockForMaterial(item.binMaterialId)}
                                                     </p>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting || isLoading}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Registrar Salida'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
