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
import type { OtherClient, OtherFruitReceptionItem } from '@/lib/types';
import { otherFruitReceptionSchema } from '@/lib/schemas';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Label } from '@/components/ui/label';
import { usePackagingMastersByClient } from '@/hooks/usePackagingMastersByClient';

type ReceptionFormValues = z.infer<typeof otherFruitReceptionSchema>;

const defaultItem = {
  productCode: '',
  productName: '',
  quantity: 1,
};

export function OtherFruitReceptionTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = React.useState<OtherClient | null>(null);

  const form = useForm<ReceptionFormValues>({
    resolver: zodResolver(otherFruitReceptionSchema),
    defaultValues: {
      clientId: '',
      document: '',
      items: [defaultItem],
    },
  });
  
  const selectedClientId = form.watch('clientId');
  const { data: clientProducts, loading: loadingProducts } = usePackagingMastersByClient(selectedClientId);


  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const fruitClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA');
  }, [allClients]);

  const handleClientChange = (clientId: string) => {
    const client = fruitClients.find(c => c.clientId === clientId);
    setSelectedClient(client || null);
    form.setValue('clientId', clientId);
    form.reset({
      ...form.getValues(),
      clientId: clientId,
      items: [defaultItem]
    });
  };

  const onSubmit = async (values: ReceptionFormValues) => {
    if (!firestore || !selectedClient) return;
    
    const itemsWithStatus: OtherFruitReceptionItem[] = values.items.map(item => ({
        ...item,
        status: 'Pendiente de almacenar'
    }));

    const clientAbbreviation = selectedClient.name.substring(0, 4).toUpperCase();
    const displayLotId = `${clientAbbreviation}-${values.document}`;

    const receptionData = {
        clientId: values.clientId,
        clientName: selectedClient.name,
        unit: selectedClient.unit,
        document: values.document,
        displayLotId: displayLotId,
        items: itemsWithStatus,
        status: 'Pendiente de almacenar' as const,
        createdAt: serverTimestamp(),
    };
    
    try {
        const collRef = collection(firestore, 'otherFruitReceptions');
        await addDoc(collRef, receptionData);
        toast({ title: 'Éxito', description: `Recepción de fruta registrada con lote ${displayLotId}. Ahora puede asignar una ubicación.` });
        form.reset({
            clientId: values.clientId,
            document: '',
            items: [defaultItem],
        });
    } catch (error) {
        console.error("Error creating fruit reception:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la recepción.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'otherFruitReceptions',
            operation: 'create',
            requestResourceData: receptionData
        }));
    }
  };
  
  const handleProductChange = (index: number, productCode: string) => {
    const product = clientProducts.find(p => p.code === productCode);
    if (product) {
      form.setValue(`items.${index}.productCode`, product.code);
      form.setValue(`items.${index}.productName`, product.name);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recepción de Fruta</CardTitle>
        <CardDescription>Registre la entrada de fruta de clientes hortofrutícolas.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4 items-end">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente de Fruta</FormLabel>
                    <Select onValueChange={handleClientChange} value={field.value} disabled={loadingClients}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un cliente..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fruitClients.map(c => (
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
                    <FormControl><Input {...field} autoComplete="off" inputMode="numeric" pattern="[0-9]*" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {selectedClient && (
                <div>
                  <Label>Unidad</Label>
                  <p className="font-medium text-sm h-10 flex items-center">{selectedClient.unit}</p>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <FormLabel>Ítems Recibidos</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2 p-3 border rounded-md">
                  <div className="flex-1 grid sm:grid-cols-3 gap-4 items-end">
                    <FormField
                      control={form.control}
                      name={`items.${index}.productCode`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>Cód. Producto</FormLabel>
                           <Select onValueChange={(value) => handleProductChange(index, value)} value={itemField.value} disabled={!selectedClientId || loadingProducts}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccione un producto..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {clientProducts.map(p => (
                                        <SelectItem key={p.id} value={p.code}>{p.code}</SelectItem>
                                    ))}
                                </SelectContent>
                           </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.productName`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>Nombre Producto</FormLabel>
                           <FormControl>
                               <Input {...itemField} autoComplete="off" placeholder="Seleccione un código" readOnly />
                           </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cantidad ({selectedClient?.unit || 'Unidades'})</FormLabel>
                          <FormControl><Input type="number" {...field} autoComplete="off" min="1" inputMode="numeric" /></FormControl>
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
                disabled={!selectedClient}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Agregar Producto
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting || !selectedClient}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Confirmar Recepción'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
