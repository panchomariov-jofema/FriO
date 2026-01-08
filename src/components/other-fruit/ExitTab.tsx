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
import type { OtherClient, OtherFruitReception } from '@/lib/types';
import { otherFruitExitSchema, type OtherFruitExitItem as ExitItemSchema } from '@/lib/schemas';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { usePackagingMastersByClient } from '@/hooks/usePackagingMastersByClient';

type ExitFormValues = z.infer<typeof otherFruitExitSchema>;

const defaultItem = {
    productCode: '',
    productName: '',
    quantity: 0,
    locations: [],
};

const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;

export function OtherFruitExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<ExitFormValues>({
    resolver: zodResolver(otherFruitExitSchema),
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
  const { data: clientProducts, loading: loadingProducts } = usePackagingMastersByClient(selectedClientId);

  const fruitClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA');
  }, [allClients]);

  const availableStock = React.useMemo(() => {
    if (!selectedClientId || !allReceptions) return {};

    type StockLocation = {
        location: string;
        available: number;
        receptionId: string;
        itemIndex: number;
        unit: 'Bins' | 'Pallets';
    };
    
    type StockMap = Record<string, { name: string, locations: Record<string, StockLocation> }>;

    const stockMap: StockMap = {};

    allReceptions
      .filter(r => r.clientId === selectedClientId && (r.status === 'Almacenado' || r.status === 'Parcialmente Almacenado'))
      .forEach(reception => {
        reception.items.forEach((item, index) => {
          if (item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation) {
            if (!stockMap[item.productCode]) {
              stockMap[item.productCode] = { name: item.productName, locations: {} };
            }
            const locationKey = getLocationKey(reception.id, index);
            stockMap[item.productCode].locations[locationKey] = {
              location: `${item.storageLocation.chamberId} / ${item.storageLocation.coordinate}`,
              available: item.quantity,
              receptionId: reception.id,
              itemIndex: index,
              unit: reception.unit,
            };
          }
        });
      });
    return stockMap;
  }, [selectedClientId, allReceptions]);

  const onSubmit = async (values: ExitFormValues) => {
    if (!firestore) return;

    const itemsToProcess = values.items.filter(item => item.quantity > 0);
    if (itemsToProcess.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe agregar al menos un producto con cantidad mayor a cero.' });
      return;
    }
    
    const client = fruitClients.find(c => c.clientId === values.clientId);
    if (!client) return;

    try {
        const batch = writeBatch(firestore);
        
        // 1. Create movement document
        const movementRef = doc(collection(firestore, 'otherFruitMovements'));
        batch.set(movementRef, {
            type: 'salida',
            clientId: values.clientId,
            clientName: client.name,
            unit: client.unit,
            document: values.document || '',
            items: itemsToProcess.map(item => ({
                productCode: item.productCode,
                productName: item.productName,
                quantity: item.quantity
            })),
            createdAt: serverTimestamp(),
        });

        // 2. Update stock in otherFruitReceptions
        for(const item of itemsToProcess) {
            for(const loc of item.locations) {
                if (loc.quantityToWithdraw > 0) {
                    const receptionDoc = allReceptions.find(r => r.id === loc.receptionId);
                    if (receptionDoc) {
                        const receptionRef = doc(firestore, 'otherFruitReceptions', loc.receptionId);
                        const newItems = [...receptionDoc.items];
                        const itemToUpdate = newItems[loc.itemIndex];

                        if (itemToUpdate && itemToUpdate.quantity >= loc.quantityToWithdraw) {
                            itemToUpdate.quantity -= loc.quantityToWithdraw;
                        }
                        batch.update(receptionRef, { items: newItems, updatedAt: serverTimestamp() });
                    }
                }
            }
        }
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de fruta registrada correctamente.' });
        form.reset({ clientId: '', document: '', items: [defaultItem] });

    } catch (error) {
        console.error("Error creating fruit exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'otherFruitMovements or otherFruitReceptions',
            operation: 'write'
        }));
    }
  };
  
  const handleClientChange = (value: string) => {
    form.reset({ clientId: value, document: '', items: [defaultItem] });
  };
  
  const handleItemCodeChange = (index: number, newCode: string) => {
    const itemInfo = availableStock[newCode];
    if (itemInfo) {
      update(index, {
        ...form.getValues(`items.${index}`),
        productCode: newCode,
        productName: itemInfo.name,
        quantity: 0,
        locations: [],
      });
    }
  };

  const handleLocationChange = (itemIndex: number, locationKey: string, newQuantity: number) => {
    const currentItem = form.getValues(`items.${itemIndex}`);
    const locationData = availableStock[currentItem.productCode].locations[locationKey];
    
    let existingLocations = currentItem.locations || [];
    const existingLocIndex = existingLocations.findIndex(l => l.locationKey === locationKey);
    
    if (existingLocIndex !== -1) {
        if (newQuantity > 0) {
            existingLocations[existingLocIndex].quantityToWithdraw = newQuantity;
        } else {
            existingLocations.splice(existingLocIndex, 1);
        }
    } else if (newQuantity > 0) {
        existingLocations.push({
            locationKey: locationKey,
            receptionId: locationData.receptionId,
            itemIndex: locationData.itemIndex,
            quantityToWithdraw: newQuantity,
        });
    }

    const totalQuantity = existingLocations.reduce((sum, loc) => sum + loc.quantityToWithdraw, 0);

    update(itemIndex, {
      ...currentItem,
      quantity: totalQuantity,
      locations: existingLocations,
    });
  };

  const isLoading = loadingClients || loadingReceptions || loadingProducts;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Salida de Fruta</CardTitle>
        <CardDescription>Seleccione un cliente y registre la salida de productos del stock en cámaras.</CardDescription>
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
                    <FormLabel>Cliente de Fruta</FormLabel>
                    <Select onValueChange={handleClientChange} value={field.value} disabled={isLoading}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger></FormControl>
                      <SelectContent>{fruitClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
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
                    <FormLabel>Documento de Salida</FormLabel>
                    <FormControl><Input {...field} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="space-y-4">
              <FormLabel>Productos a Despachar</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-3 p-4 border rounded-md">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 grid sm:grid-cols-2 gap-4">
                       <FormField
                          control={form.control}
                          name={`items.${index}.productCode`}
                          render={({ field: itemField }) => (
                            <FormItem>
                              <FormLabel>Código de Producto</FormLabel>
                               <Select onValueChange={(value) => handleItemCodeChange(index, value)} value={itemField.value} disabled={!selectedClientId || Object.keys(availableStock).length === 0}>
                                  <FormControl><SelectTrigger>
                                      <SelectValue placeholder={!selectedClientId ? "Seleccione cliente" : "Seleccione un producto"} />
                                  </SelectTrigger></FormControl>
                                  <SelectContent>
                                    {Object.entries(availableStock).map(([code, { name }]) => (
                                        <SelectItem key={code} value={code}>{code} - {name}</SelectItem>
                                    ))}
                                  </SelectContent>
                               </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                         <div className="space-y-2">
                            <p className="font-medium text-sm h-10 flex items-center">
                                Total a sacar: {form.watch(`items.${index}.quantity`)} {fruitClients.find(c => c.clientId === selectedClientId)?.unit || ''}
                            </p>
                        </div>
                    </div>
                     <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {form.watch(`items.${index}.productCode`) && (
                     <div className="space-y-2 pl-2 border-l-2">
                        <FormLabel className="text-xs">Ubicaciones Disponibles</FormLabel>
                        {(availableStock[form.getValues(`items.${index}.productCode`)]?.locations && Object.keys(availableStock[form.getValues(`items.${index}.productCode`)]?.locations).length > 0) ? (
                            Object.entries(availableStock[form.getValues(`items.${index}.productCode`)].locations).map(([key, loc]) => (
                               <div key={key} className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded">
                                   <span className="flex-1">{loc.location}</span>
                                   <span className="w-28">Disp: {loc.available} {loc.unit}</span>
                                   <Input
                                       type="number"
                                       className="w-32 h-8"
                                       placeholder="Cantidad"
                                       max={loc.available}
                                       min={0}
                                       defaultValue={(form.getValues(`items.${index}.locations`) || []).find(l => l.locationKey === key)?.quantityToWithdraw || 0}
                                       onChange={(e) => handleLocationChange(index, key, parseInt(e.target.value) || 0)}
                                   />
                               </div>
                            ))
                        ) : <p className="text-sm text-muted-foreground">No hay ubicaciones con stock para este producto.</p>
                        }
                    </div>
                  )}

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
                Agregar Producto
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting || isLoading}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Confirmar Salida'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
