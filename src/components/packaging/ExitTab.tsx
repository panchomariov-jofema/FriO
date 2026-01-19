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
import type { OtherClient, PackagingReception, PackagingMaster } from '@/lib/types';
import { packagingExitSchema } from '@/lib/schemas';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

const defaultItem = {
    packagingMasterId: '',
    packagingMasterCode: '',
    packagingMasterName: '',
    palletCount: 0,
};

export function ExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();
  
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
    const filtered = (allClients || []).filter(c => c.type.toLowerCase() === 'embalaje');
    return [...new Map(filtered.map(item => [item.clientId, item])).values()];
  }, [allClients]);

  const { inStockMasterCodes, stockByCode } = React.useMemo(() => {
    const codes = new Set<string>();
    const stockMap = new Map<string, number>();

    if (selectedClientId && allReceptions) {
        allReceptions.forEach(reception => {
            if (reception.clientId === selectedClientId) {
                reception.items.forEach(item => {
                    if (item.status === 'Almacenado' && item.palletCount > 0) {
                        codes.add(item.packagingMasterCode);
                        const currentStock = stockMap.get(item.packagingMasterCode) || 0;
                        stockMap.set(item.packagingMasterCode, currentStock + item.palletCount);
                    }
                });
            }
        });
    }
    return { inStockMasterCodes: codes, stockByCode: stockMap };
  }, [selectedClientId, allReceptions]);
  
  const clientPackagingMasters = React.useMemo(() => {
      if (!selectedClientId) return [];
      const mastersForClient = (allPackagingMasters || []).filter(m => m.clientId === selectedClientId);
      const inStockMasters = mastersForClient.filter(m => inStockMasterCodes.has(m.code));
      return [...new Map(inStockMasters.map(item => [item.code, item])).values()];
  }, [selectedClientId, allPackagingMasters, inStockMasterCodes]);


  const onSubmit = async (values: ExitFormValues) => {
    if (!firestore) return;
    const itemsToProcess = values.items.filter(item => item.palletCount > 0);
    if (itemsToProcess.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe agregar al menos un artículo con cantidad mayor a cero.' });
      return;
    }
    
    // Validate stock before submitting
    for (const item of itemsToProcess) {
        const availableStock = stockByCode.get(item.packagingMasterCode) || 0;
        if (item.palletCount > availableStock) {
            toast({
                variant: 'destructive',
                title: 'Stock Insuficiente',
                description: `No hay suficiente stock para "${item.packagingMasterName}". Disponible: ${availableStock}, Solicitado: ${item.palletCount}.`,
            });
            return; // Stop submission
        }
    }

    try {
        const movementData = {
            type: 'salida' as const,
            clientId: values.clientId,
            document: values.document || '',
            items: itemsToProcess.map(item => ({
                packagingMasterId: item.packagingMasterId,
                packagingMasterCode: item.packagingMasterCode,
                packagingMasterName: item.packagingMasterName,
                palletCount: item.palletCount
            })),
            status: 'Pendiente de Picking' as const,
            createdAt: serverTimestamp(),
        };

        await addDoc(collection(firestore, 'packagingMovements'), movementData);
        
        toast({ title: 'Solicitud Creada', description: 'La solicitud de salida ha sido creada y está pendiente de picking.' });
        form.reset({ clientId: values.clientId, document: '', items: [defaultItem] });

    } catch (error) {
        console.error("Error creating packaging exit request:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la solicitud de salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingMovements',
            operation: 'create'
        }));
    }
  };
  
  const handleClientChange = (value: string) => {
    form.reset({ clientId: value, document: '', items: [defaultItem] });
  };
  
  const handleItemCodeChange = (index: number, newCode: string) => {
    const master = clientPackagingMasters.find(m => m.code === newCode);
    if (master) {
      update(index, {
        ...form.getValues(`items.${index}`),
        packagingMasterCode: newCode,
        packagingMasterName: master.name,
        packagingMasterId: master.id || '',
        palletCount: 1,
      });
    }
  };

  const isLoading = loadingClients || loadingMasters || loadingReceptions;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Crear Solicitud de Despacho</CardTitle>
          <CardDescription>Seleccione un cliente y los artículos a retirar. Esto creará una tarea en la pestaña de "Picking".</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente de Embalaje</FormLabel>
                      <Select onValueChange={handleClientChange} value={field.value} disabled={isLoading}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger></FormControl>
                        <SelectContent>{packagingClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="document"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Documento de Salida (Opcional)</FormLabel>
                      <FormControl><Input {...field} autoComplete="off" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="space-y-4">
                <FormLabel>Ítems Solicitados</FormLabel>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-2 p-3 border rounded-md">
                    <div className="flex-1 grid sm:grid-cols-2 gap-4">
                       <FormField
                            control={form.control}
                            name={`items.${index}.packagingMasterCode`}
                            render={({ field: itemField }) => (
                              <FormItem>
                                <FormLabel>Código de Artículo</FormLabel>
                                <Select onValueChange={(value) => handleItemCodeChange(index, value)} value={itemField.value} disabled={!selectedClientId || clientPackagingMasters.length === 0}>
                                    <FormControl><SelectTrigger>
                                        <SelectValue placeholder={!selectedClientId ? "Seleccione cliente" : "Seleccione un código"} />
                                    </SelectTrigger></FormControl>
                                    <SelectContent>
                                      {clientPackagingMasters.map((m) => (
                                          <SelectItem key={m.code} value={m.code}>{m.code} - {m.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        <FormField
                            control={form.control}
                            name={`items.${index}.palletCount`}
                            render={({ field: itemField }) => (
                                <FormItem>
                                    <FormLabel>Cantidad de Pallets</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...itemField} autoComplete="off" min="1" />
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground pt-1">
                                        Stock: {stockByCode.get(form.getValues(`items.${index}.packagingMasterCode`)) || 0}
                                    </p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(defaultItem)}
                  disabled={!selectedClientId}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Agregar Artículo
                </Button>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting || isLoading}>
                  {form.formState.isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Despacho'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
