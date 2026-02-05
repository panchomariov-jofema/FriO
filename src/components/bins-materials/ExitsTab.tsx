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
import type { BinMaterialStock, BinMaterialMovement } from '@/lib/types';
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
  driverName: z.string().min(1, 'El nombre del conductor es obligatorio.'),
  driverRUT: z.string().min(1, 'El RUT del conductor es obligatorio.'),
  items: z.array(movementItemSchema),
});

type MovementFormValues = z.infer<typeof movementSchema>;

interface ExitsTabProps {
  exporterId: string;
  producerId: string;
}

// Rules for automatic calculation
const calculationRules: Record<string, { binCode: string; related: Record<string, number> }> = {
    'SUBSOLE': { binCode: '10001', related: { '10002': 24, '10003': 1 } },
    'MEYER': { binCode: '10007', related: { '10008': 24, '10009': 1 } },
    'BLOSSOM': { binCode: '10011', related: { '10012': 24, '10013': 1 } }
};


export function ExitsTab({ exporterId, producerId }: ExitsTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { materials, loading: loadingMaterials } = useBinMaterialsByExporter(exporterId);
  const { data: stockData, loading: loadingStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
  const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', driverName: '', driverRUT: '', items: [] },
  });

  const getMultiplierLabel = (itemCode: string): string => {
    const rules = calculationRules[exporterId];
    if (!rules) return '';
    const multiplier = rules.related[itemCode];
    if (multiplier !== undefined) {
        return ` (x${multiplier})`;
    }
    return '';
  };

  const nextExitNumber = React.useMemo(() => {
    if (!movements) return 1;
    const exitMovements = movements.filter(m => m.type === 'salida' && m.document && !isNaN(parseInt(m.document, 10)));
    if (exitMovements.length === 0) return 1;
    const maxNumber = exitMovements.reduce((max, mov) => {
        const docNum = parseInt(mov.document, 10);
        return docNum > max ? docNum : max;
    }, 0);
    return maxNumber + 1;
  }, [movements]);

  React.useEffect(() => {
    form.setValue('document', String(nextExitNumber));
  }, [nextExitNumber, form]);

  // Effect for automatic quantity calculation
  React.useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (!name || !name.startsWith('items.') || !name.endsWith('.quantity')) {
        return;
      }

      const rules = calculationRules[exporterId];
      if (!rules) return;

      const allItems = value.items;
      if (!allItems || allItems.length === 0) return;

      const changedIndexMatch = name.match(/items\.(\d+)\.quantity/);
      if (!changedIndexMatch) return;
      
      const changedIndex = parseInt(changedIndexMatch[1], 10);
      const changedItem = allItems[changedIndex];

      if (changedItem && changedItem.binMaterialCode === rules.binCode) {
        const pivotQty = changedItem.quantity;
        
        if (typeof pivotQty !== 'number' || isNaN(pivotQty)) return;

        Object.entries(rules.related).forEach(([relatedCode, multiplier]) => {
          const relatedItemIndex = allItems.findIndex(item => item.binMaterialCode === relatedCode);

          if (relatedItemIndex !== -1) {
            const newVal = pivotQty * multiplier;
            if (value.items[relatedItemIndex].quantity !== newVal) {
              form.setValue(`items.${relatedItemIndex}.quantity`, newVal, { shouldValidate: true });
            }
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form, exporterId]);

  const getStockForMaterial = React.useCallback((binMaterialId: string) => {
    const stockItem = stockData.find(s => s.exporterId === exporterId && s.binMaterialId === binMaterialId);
    return stockItem?.quantity || 0;
  }, [stockData, exporterId]);


  React.useEffect(() => {
    if (materials.length > 0) {
      form.reset({
        document: String(nextExitNumber),
        driverName: '',
        driverRUT: '',
        items: materials.map(m => ({
          binMaterialId: m.id,
          binMaterialCode: m.code,
          binMaterialName: m.name,
          quantity: 0,
        })),
      });
    }
  }, [materials, form, nextExitNumber]);

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
          driverName: values.driverName,
          driverRUT: values.driverRUT,
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
      form.reset({ document: String(nextExitNumber + 1), driverName: '', driverRUT: '', items: resetItems });

    } catch (error: any) {
      console.error('Error processing exit:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo procesar la salida.' });
       errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements or binMaterialStock',
          operation: 'write'
      }));
    }
  };
  
  const isLoading = loadingMaterials || loadingStock || loadingMovements;
  const formItems = form.getValues('items');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Salida</CardTitle>
        <CardDescription>Ingrese las cantidades de los materiales que salen del inventario.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                control={form.control}
                name="document"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>N° de Salida</FormLabel>
                    <FormControl><Input {...field} readOnly className="font-bold text-lg bg-muted" /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                 <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Conductor</FormLabel>
                    <FormControl><Input {...field} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="driverRUT"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rut Conductor</FormLabel>
                    <FormControl><Input {...field} autoComplete="off" inputMode="numeric" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
                <FormLabel>Materiales</FormLabel>
                {/* Mobile View */}
                <div className="sm:hidden space-y-3">
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : formItems.map((item, index) => (
                    <div key={item.binMaterialId} className="border p-4 rounded-lg">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">
                                {item.binMaterialName}
                                <span className="text-muted-foreground text-sm font-normal">{getMultiplierLabel(item.binMaterialCode)}</span>
                            </FormLabel>
                            <FormControl>
                                <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" min="0" placeholder="Cantidad a retirar" className="h-12 text-lg" />
                            </FormControl>
                             <p className="text-sm text-muted-foreground pt-1">
                                Stock disponible: {getStockForMaterial(item.binMaterialId)}
                             </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>

                {/* Desktop View */}
                 <div className="hidden sm:block rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="w-[240px]">Cantidad</TableHead>
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
                            ) : formItems.map((item, index) => (
                                <TableRow key={item.binMaterialId}>
                                    <TableCell className="font-medium">
                                        {item.binMaterialName}
                                        <span className="text-muted-foreground text-sm font-normal">{getMultiplierLabel(item.binMaterialCode)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantity`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" min="0" />
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
