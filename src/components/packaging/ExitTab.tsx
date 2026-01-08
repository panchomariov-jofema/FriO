'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, PackagingMaster, PackagingReception } from '@/lib/types';
import { packagingExitSchema, type StockLocation } from '@/lib/schemas';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { SelectLocationDialog } from './SelectLocationDialog';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

const defaultItem = {
  packagingMasterId: '',
  packagingMasterCode: '',
  packagingMasterName: '',
  palletCount: 1,
  locations: [],
};

export function ExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [itemToSelectLocation, setItemToSelectLocation] = React.useState<number | null>(null);

  const form = useForm<ExitFormValues>({
    resolver: zodResolver(packagingExitSchema),
    defaultValues: {
      clientId: '',
      document: '',
      items: [defaultItem],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const selectedClientId = form.watch('clientId');

  const packagingClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toLowerCase() === 'embalaje');
  }, [allClients]);

  const stockByMaterial = React.useMemo(() => {
    const stock: Record<string, StockLocation[]> = {};
    (allReceptions || [])
      .filter(lot => lot.status === 'Almacenado' && lot.storageLocation)
      .forEach(lot => {
        lot.items.forEach(item => {
          if (!stock[item.packagingMasterId]) {
            stock[item.packagingMasterId] = [];
          }
          stock[item.packagingMasterId].push({
            receptionId: lot.id,
            location: `${lot.storageLocation!.warehouse} / ${lot.storageLocation!.aisle}`,
            available: item.palletCount,
          });
        });
      });
    return stock;
  }, [allReceptions]);

  const handleClientChange = (value: string) => {
    form.reset({
      clientId: value,
      document: '',
      items: [defaultItem],
    });
  };

  const handleCodeBlur = (index: number) => {
    const code = form.getValues(`items.${index}.packagingMasterCode`);
    if (!code || !selectedClientId) return;
    
    const foundMaster = (allPackagingMasters || []).find(m => m.clientId === selectedClientId && m.code === code);
    
    if (foundMaster) {
      update(index, {
        ...form.getValues(`items.${index}`),
        packagingMasterId: foundMaster.id,
        packagingMasterName: foundMaster.name,
      });
      form.clearErrors(`items.${index}.packagingMasterCode`);
    } else {
      form.setError(`items.${index}.packagingMasterCode`, { message: 'Código no encontrado.' });
    }
  };

  const getTotalPalletsForItem = (index: number) => {
    return form.getValues(`items.${index}.locations`).reduce((sum, loc) => sum + loc.palletsToWithdraw, 0);
  };

  const onSubmit = async (values: ExitFormValues) => {
    if (!firestore) return;
    
    const itemsToProcess = values.items.filter(item => getTotalPalletsForItem(values.items.indexOf(item)) > 0);
    if (itemsToProcess.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debe especificar la cantidad a retirar para al menos un artículo.' });
        return;
    }
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const movementRef = doc(collection(firestore, 'packagingMovements'));
            const movementData = {
                type: 'salida' as const,
                clientId: values.clientId,
                document: values.document,
                items: itemsToProcess.map(item => ({
                    packagingMasterId: item.packagingMasterId,
                    packagingMasterCode: item.packagingMasterCode,
                    packagingMasterName: item.packagingMasterName,
                    palletCount: getTotalPalletsForItem(values.items.indexOf(item)),
                })),
                createdAt: serverTimestamp(),
            };
            transaction.set(movementRef, movementData);

            for (const item of itemsToProcess) {
                for (const loc of item.locations) {
                    const receptionRef = doc(firestore, 'packagingReceptions', loc.receptionId);
                    const receptionDoc = await transaction.get(receptionRef);
                    if (!receptionDoc.exists()) throw new Error(`Recepción ${loc.receptionId} no encontrada.`);

                    const receptionData = receptionDoc.data() as PackagingReception;
                    const itemIndex = receptionData.items.findIndex(i => i.packagingMasterId === item.packagingMasterId);
                    if (itemIndex === -1) throw new Error(`Artículo no encontrado en la recepción ${loc.receptionId}`);
                    
                    const currentPallets = receptionData.items[itemIndex].palletCount;
                    if (loc.palletsToWithdraw > currentPallets) throw new Error(`Stock insuficiente en ${loc.location}`);

                    receptionData.items[itemIndex].palletCount -= loc.palletsToWithdraw;

                    // Remove item if pallet count is zero
                    const updatedItems = receptionData.items.filter(i => i.palletCount > 0);

                    if (updatedItems.length === 0) {
                        transaction.delete(receptionRef);
                    } else {
                        transaction.update(receptionRef, { items: updatedItems });
                    }
                }
            }
        });

        toast({ title: 'Éxito', description: 'Salida de embalaje registrada correctamente.' });
        handleClientChange(values.clientId);
    } catch (error: any) {
        console.error("Error creating packaging exit:", error);
        toast({ variant: 'destructive', title: 'Error de transacción', description: error.message || 'No se pudo registrar la salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingMovements',
            operation: 'write',
            requestResourceData: {info: 'La transacción falló. Puede ser un error de permisos en `packagingMovements` o `packagingReceptions`.'}
        }));
    }
  };

  const isLoading = loadingClients || loadingMasters || loadingReceptions;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Salida de Pallets de Embalaje</CardTitle>
          <CardDescription>Registre la salida de materiales por cliente y descuente el stock de bodega.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField control={form.control} name="clientId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente de Embalaje</FormLabel>
                      <Select onValueChange={handleClientChange} value={field.value} disabled={isLoading}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger></FormControl>
                        <SelectContent>{packagingClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="document" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Documento de Salida (Vale de consumo)</FormLabel>
                      <FormControl><Input {...field} autoComplete="off" /></FormControl>
                      <FormMessage />
                    </FormItem>
                )} />
              </div>

              <div className="space-y-4">
                <FormLabel>Ítems a Retirar</FormLabel>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2 p-3 border rounded-md">
                    <div className="flex-1 grid sm:grid-cols-3 gap-4 items-start">
                      <FormField control={form.control} name={`items.${index}.packagingMasterCode`} render={({ field: itemField }) => (
                          <FormItem>
                            <FormLabel>Cod. Artículo</FormLabel>
                            <FormControl><Input {...itemField} onBlur={() => handleCodeBlur(index)} autoComplete="off" disabled={!selectedClientId || isLoading} /></FormControl>
                            <FormMessage />
                          </FormItem>
                      )} />
                      <div className="space-y-2">
                        <FormLabel>Descripción</FormLabel>
                        <p className="font-medium text-sm h-10 flex items-center">{form.watch(`items.${index}.packagingMasterName`) || '--'}</p>
                      </div>
                      <div className="space-y-2">
                          <FormLabel>Cant. a Retirar</FormLabel>
                          <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setItemToSelectLocation(index)} disabled={!form.watch(`items.${index}.packagingMasterId`)}>
                              {getTotalPalletsForItem(index)} Pallets
                          </Button>
                      </div>
                    </div>
                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append(defaultItem)}><PlusCircle className="mr-2 h-4 w-4" />Agregar Artículo</Button>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Registrando...' : 'Confirmar Salida'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <SelectLocationDialog
        itemIndex={itemToSelectLocation}
        onClose={() => setItemToSelectLocation(null)}
        form={form}
        stockByMaterial={stockByMaterial}
      />
    </>
  );
}
