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
import { otherFruitExitSchema } from '@/lib/schemas';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

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

  const fruitClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA');
  }, [allClients]);

  const availableStockByProductAndLot = React.useMemo(() => {
    if (!selectedClientId || !allReceptions) return {};

    type StockLocation = {
        location: string;
        available: number;
        receptionId: string;
        itemIndex: number;
    };
    
    type LotInfo = {
        createdAt: number;
        unit: 'Bins' | 'Pallets';
        locations: Record<string, StockLocation>;
        totalAvailable: number;
    };

    type ProductStock = Record<string, { name: string, lots: Record<string, LotInfo> }>;

    const productStockMap: ProductStock = {};

    allReceptions
      .filter(r => r.clientId === selectedClientId && (r.status === 'Almacenado' || r.status === 'Parcialmente Almacenado'))
      .forEach(reception => {
        reception.items.forEach((item, index) => {
          if (item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation) {
            const productCode = item.productCode;
            const lotId = reception.displayLotId || reception.document;

            if (!productStockMap[productCode]) {
              productStockMap[productCode] = { name: item.productName, lots: {} };
            }
            if (!productStockMap[productCode].lots[lotId]) {
              productStockMap[productCode].lots[lotId] = {
                createdAt: reception.createdAt?.toMillis() || 0,
                unit: reception.unit,
                locations: {},
                totalAvailable: 0,
              };
            }

            const locationKey = getLocationKey(reception.id, index);
            productStockMap[productCode].lots[lotId].locations[locationKey] = {
              location: `${item.storageLocation.chamberId} / ${item.storageLocation.coordinate}`,
              available: item.quantity,
              receptionId: reception.id,
              itemIndex: index,
            };
            productStockMap[productCode].lots[lotId].totalAvailable += item.quantity;
          }
        });
      });
      
    return productStockMap;
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
    const itemInfo = availableStockByProductAndLot[newCode];
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

  const handleLocationChange = (itemIndex: number, lotId: string, locationKey: string, newQuantity: number) => {
    const currentItem = form.getValues(`items.${itemIndex}`);
    const locationData = availableStockByProductAndLot[currentItem.productCode].lots[lotId].locations[locationKey];
    
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
  
  const handleSelectAllInLot = (itemIndex: number, lotId: string) => {
    const currentItem = form.getValues(`items.${itemIndex}`);
    const lotData = availableStockByProductAndLot[currentItem.productCode]?.lots[lotId];
    if (!lotData) return;

    let newLocations = (currentItem.locations || []).filter(loc => {
        const locationReception = allReceptions.find(r => r.id === loc.receptionId);
        const locationLotId = locationReception?.displayLotId || locationReception?.document;
        return locationLotId !== lotId;
    });

    Object.entries(lotData.locations).forEach(([locationKey, locationDetails]) => {
        newLocations.push({
            locationKey: locationKey,
            receptionId: locationDetails.receptionId,
            itemIndex: locationDetails.itemIndex,
            quantityToWithdraw: locationDetails.available,
        });
    });

    const totalQuantity = newLocations.reduce((sum, loc) => sum + loc.quantityToWithdraw, 0);

    update(itemIndex, {
        ...currentItem,
        quantity: totalQuantity,
        locations: newLocations,
    });
    
    setTimeout(() => {
        const formValues = form.getValues();
        form.reset(formValues);
    }, 0);
  };

  const isLoading = loadingClients || loadingReceptions;

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
              {fields.map((field, index) => {
                const selectedProductCode = form.watch(`items.${index}.productCode`);
                const productStock = availableStockByProductAndLot[selectedProductCode];
                const sortedLots = productStock ? Object.entries(productStock.lots).sort(([, a], [, b]) => a.createdAt - b.createdAt) : [];
                
                return (
                   <Card key={field.id} className="overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between p-4 bg-muted/50">
                        <div className="flex-1 grid sm:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name={`items.${index}.productCode`}
                                render={({ field: itemField }) => (
                                <FormItem>
                                    <FormLabel>Código de Producto</FormLabel>
                                    <Select onValueChange={(value) => handleItemCodeChange(index, value)} value={itemField.value} disabled={!selectedClientId || Object.keys(availableStockByProductAndLot).length === 0}>
                                        <FormControl><SelectTrigger>
                                            <SelectValue placeholder={!selectedClientId ? "Seleccione cliente" : "Seleccione un producto"} />
                                        </SelectTrigger></FormControl>
                                        <SelectContent>
                                        {Object.entries(availableStockByProductAndLot).map(([code, { name }]) => (
                                            <SelectItem key={code} value={code}>{code} - {name}</SelectItem>
                                        ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <div className="space-y-2">
                                <FormLabel>Total a Sacar</FormLabel>
                                <p className="font-semibold text-lg h-10 flex items-center">
                                    {form.watch(`items.${index}.quantity`)} {fruitClients.find(c => c.clientId === selectedClientId)?.unit || ''}
                                </p>
                            </div>
                        </div>
                         <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="p-4">
                        {selectedProductCode && (
                        <div className="space-y-2">
                            <FormLabel className="text-xs font-medium">Lotes Disponibles (FIFO)</FormLabel>
                            {sortedLots.length > 0 ? (
                                <Accordion type="multiple" className="w-full">
                                {sortedLots.map(([lotId, lotData]) => (
                                    <AccordionItem value={lotId} key={lotId}>
                                      <div className="flex items-center w-full gap-4 pr-4">
                                        <AccordionTrigger className="flex-1 py-2">
                                            <div className="flex flex-col text-left">
                                                <span>Lote: <span className="font-mono">{lotId}</span></span>
                                                <span className="text-xs text-muted-foreground">
                                                    Recepción: {new Date(lotData.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </AccordionTrigger>
                                        <div className="flex items-center gap-4 text-sm">
                                            <span className="font-medium">Disp: {lotData.totalAvailable} {lotData.unit}</span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectAllInLot(index, lotId);
                                                }}
                                                className="p-1 h-auto text-sm"
                                                >
                                                Seleccionar Todo el Lote
                                            </Button>
                                        </div>
                                      </div>
                                    <AccordionContent className="pt-2">
                                        <div className="space-y-2 p-2 border-t">
                                        {Object.entries(lotData.locations).map(([key, loc]) => (
                                            <div key={key} className="flex items-center gap-4 text-sm p-2 bg-background rounded">
                                                <span className="flex-1 font-mono">{loc.location}</span>
                                                <span className="w-28">Disp: {loc.available} {lotData.unit}</span>
                                                <Input
                                                    type="number"
                                                    className="w-32 h-8"
                                                    placeholder="Cantidad"
                                                    max={loc.available}
                                                    min={0}
                                                    value={(form.getValues(`items.${index}.locations`) || []).find(l => l.locationKey === key)?.quantityToWithdraw || 0}
                                                    onChange={(e) => handleLocationChange(index, lotId, key, parseInt(e.target.value) || 0)}
                                                />
                                            </div>
                                        ))}
                                        </div>
                                    </AccordionContent>
                                    </AccordionItem>
                                ))}
                                </Accordion>
                            ) : <p className="text-sm text-muted-foreground p-2">No hay lotes con stock para este producto.</p>
                            }
                        </div>
                        )}
                    </CardContent>
                  </Card>
                )
              })}
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
