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
import { packagingReceptionSchema } from '@/lib/schemas';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

type ReceptionFormValues = z.infer<typeof packagingReceptionSchema>;

export function ReceptionTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<ReceptionFormValues>({
    resolver: zodResolver(packagingReceptionSchema),
    defaultValues: {
      clientId: '',
      document: '',
      items: [{ packagingMasterId: '', palletCount: 1, packagingMasterName: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const selectedClientId = form.watch('clientId');

  const packagingClients = React.useMemo(() => {
    return allClients.filter(c => c.type === 'embalajes' && c.unit === 'Pallets');
  }, [allClients]);

  const availableMasters = React.useMemo(() => {
    if (!selectedClientId) return [];
    return allPackagingMasters.filter(m => m.clientId === selectedClientId);
  }, [selectedClientId, allPackagingMasters]);

  const onSubmit = async (values: ReceptionFormValues) => {
    if (!firestore) return;

    const selectedClient = packagingClients.find(c => c.clientId === values.clientId);
    if (!selectedClient) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cliente no válido.' });
        return;
    }

    const receptionData = {
        ...values,
        clientName: selectedClient.name,
        status: 'Pendiente de almacenar' as const,
        createdAt: serverTimestamp(),
    };
    
    try {
        const collRef = collection(firestore, 'packagingReceptions');
        await addDoc(collRef, receptionData);
        toast({ title: 'Éxito', description: 'Recepción de embalaje registrada. Ahora puede asignar una ubicación.' });
        form.reset({
            clientId: '',
            document: '',
            items: [{ packagingMasterId: '', palletCount: 1, packagingMasterName: '' }],
        });
    } catch (error) {
        console.error("Error creating packaging reception:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la recepción.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingReceptions',
            operation: 'create',
            requestResourceData: receptionData
        }));
    }
  };

  const handleMaterialChange = (value: string, index: number) => {
    const selectedMaster = availableMasters.find(m => m.id === value);
    if (selectedMaster) {
        form.setValue(`items.${index}.packagingMasterId`, selectedMaster.id);
        form.setValue(`items.${index}.packagingMasterName`, selectedMaster.name);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Recepción de Pallets de Embalaje</CardTitle>
        <CardDescription>Registre la entrada de materiales de embalaje de un cliente.</CardDescription>
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingClients}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un cliente..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {packagingClients.map(c => (
                          <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
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
                    <FormLabel>Documento de Entrada (Guía)</FormLabel>
                    <FormControl><Input {...field} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="space-y-4">
              <FormLabel>Ítems Recibidos</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2 p-3 border rounded-md">
                  <div className="flex-1 grid sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`items.${index}.packagingMasterId`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>Material</FormLabel>
                           <Select onValueChange={(value) => handleMaterialChange(value, index)} value={itemField.value} disabled={!selectedClientId || loadingMasters}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione material..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableMasters.map(m => (
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
                      name={`items.${index}.palletCount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cant. Pallets</FormLabel>
                          <FormControl><Input type="number" {...field} autoComplete="off" min="1" /></FormControl>
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
                onClick={() => append({ packagingMasterId: '', palletCount: 1, packagingMasterName: '' })}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Agregar Material
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Confirmar Recepción'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
