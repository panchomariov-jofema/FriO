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
import { useBinMaterialsByExporter } from '@/hooks/use-bin-materials-by-exporter';
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

interface EntriesTabProps {
  exporterId: string;
  producerId: string;
}

// Rules for automatic calculation
const calculationRules: Record<string, { binCode: string; related: Record<string, number> }> = {
    'SUBSOLE': { // Exporter ID
        binCode: '10001', // BINS GENERICO
        related: { 
            '10002': 24, // TOTES PLASTICO
        }
    },
    'MEYER': { // Exporter ID
        binCode: '10007',
        related: { '10008': 24 }
    },
    'BLOSSOM': { // Exporter ID
        binCode: '10011',
        related: { '10012': 24, '10013': 24 }
    }
};

export function EntriesTab({ exporterId, producerId }: EntriesTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { materials, loading: loadingMaterials } = useBinMaterialsByExporter(exporterId);

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', driverName: '', driverRUT: '', items: [] },
  });

  const items = form.watch('items');
  
  React.useEffect(() => {
    const rules = calculationRules[exporterId];
    if (!rules || !items) return;

    const binItem = items.find(item => item.binMaterialCode === rules.binCode);
    if (!binItem) return;

    const binQuantity = binItem.quantity;
    
    Object.entries(rules.related).forEach(([relatedCode, multiplier]) => {
        const relatedItemIndex = items.findIndex(item => item.binMaterialCode === relatedCode);
        if (relatedItemIndex !== -1) {
            const currentVal = items[relatedItemIndex].quantity;
            const newVal = binQuantity * multiplier;
            if (currentVal !== newVal) {
                form.setValue(`items.${relatedItemIndex}.quantity`, newVal);
            }
        }
    });

  }, [items, exporterId, form]);


  React.useEffect(() => {
    if (materials.length > 0) {
      form.reset({
        document: form.getValues('document'),
        driverName: form.getValues('driverName'),
        driverRUT: form.getValues('driverRUT'),
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

    try {
      await runTransaction(firestore, async (transaction) => {
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        const movementData = {
          type: 'entrada' as const,
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
            const newStockRef = doc(collection(firestore, 'binMaterialStock'));
            transaction.set(newStockRef, {
              binMaterialId: item.binMaterialId,
              binMaterialCode: item.binMaterialCode,
              binMaterialName: item.binMaterialName,
              exporterId: exporterId,
              quantity: item.quantity,
              lastUpdatedAt: serverTimestamp(),
            });
          } else {
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
      const resetItems = materials.map(m => ({
        binMaterialId: m.id,
        binMaterialCode: m.code,
        binMaterialName: m.name,
        quantity: 0
      }));
      form.reset({ document: '', driverName: '', driverRUT: '', items: resetItems });

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
        <CardDescription>Ingrese un documento y las cantidades de los materiales que ingresan al inventario.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
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
                    <FormControl><Input {...field} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
                <FormLabel>Materiales</FormLabel>
                <div className="rounded-md border max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="w-[150px]">Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingMaterials ? (
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
              <Button type="submit" disabled={form.formState.isSubmitting || loadingMaterials}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Registrar Entrada'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

    