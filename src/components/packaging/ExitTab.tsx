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
import { PackagingPickingDialog } from './PackagingPickingDialog';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

const defaultItem = {
    packagingMasterId: '',
    packagingMasterCode: '',
    packagingMasterName: '',
    palletCount: 0,
    locations: [],
};

// Helper to get a unique key for a location
const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;

export function ExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [pickingPayload, setPickingPayload] = React.useState<ExitFormValues | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

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

  const availableStock = React.useMemo(() => {
    if (!selectedClientId || !allReceptions) return {};

    const stockMap: Record<string, { name: string, locations: Record<string, { location: string, available: number, receptionId: string, itemIndex: number }> }> = {};

    allReceptions
      .filter(r => r.clientId === selectedClientId && (r.status === 'Almacenado' || r.status === 'Parcialmente Almacenado'))
      .forEach(reception => {
        reception.items.forEach((item, index) => {
          if (item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation) {
            if (!stockMap[item.packagingMasterCode]) {
              stockMap[item.packagingMasterCode] = { name: item.packagingMasterName, locations: {} };
            }
            const locationKey = getLocationKey(reception.id, index);
            stockMap[item.packagingMasterCode].locations[locationKey] = {
              location: `${item.storageLocation.warehouse} / ${item.storageLocation.aisle}`,
              available: item.palletCount,
              receptionId: reception.id,
              itemIndex: index,
            };
          }
        });
      });
    return stockMap;
  }, [selectedClientId, allReceptions]);

  const onSubmit = (values: ExitFormValues) => {
    const itemsToProcess = values.items.filter(item => item.palletCount > 0);
    if (itemsToProcess.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe agregar al menos un artículo con cantidad mayor a cero.' });
      return;
    }
    setPickingPayload(values);
  };
  
  const handleConfirmExit = async (values: ExitFormValues) => {
    if (!firestore) return;
    setIsConfirming(true);

    const itemsToProcess = values.items.filter(item => item.palletCount > 0);
    
    try {
        const batch = writeBatch(firestore);
        
        const movementRef = doc(collection(firestore, 'packagingMovements'));
        batch.set(movementRef, {
            type: 'salida',
            clientId: values.clientId,
            document: values.document || '',
            items: itemsToProcess.map(item => ({
                packagingMasterId: item.packagingMasterId,
                packagingMasterCode: item.packagingMasterCode,
                packagingMasterName: item.packagingMasterName,
                palletCount: item.palletCount
            })),
            createdAt: serverTimestamp(),
        });

        for(const item of itemsToProcess) {
            for(const loc of item.locations) {
                if (loc.palletsToWithdraw > 0) {
                    const receptionDoc = allReceptions.find(r => r.id === loc.receptionId);
                    if (receptionDoc) {
                        const receptionRef = doc(firestore, 'packagingReceptions', loc.receptionId);
                        const newItems = [...receptionDoc.items];
                        const itemToUpdate = newItems[loc.itemIndex];

                        if (itemToUpdate && itemToUpdate.palletCount >= loc.palletsToWithdraw) {
                            itemToUpdate.palletCount -= loc.palletsToWithdraw;
                        }
                        batch.update(receptionRef, { items: newItems });
                    }
                }
            }
        }
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de embalaje registrada correctamente.' });
        form.reset({ clientId: '', document: '', items: [defaultItem] });
        setPickingPayload(null);

    } catch (error) {
        console.error("Error creating packaging exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingMovements or packagingReceptions',
            operation: 'write'
        }));
    } finally {
        setIsConfirming(false);
    }
  };
  
  const handleClientChange = (value: string) => {
    form.reset({ clientId: value, document: '', items: [defaultItem] });
  };
  
  const handleItemCodeChange = (index: number, newCode: string) => {
    const itemInfo = availableStock[newCode];
    if (itemInfo) {
      const master = (allPackagingMasters || []).find(m => m.code === newCode && m.clientId === selectedClientId);
      update(index, {
        ...form.getValues(`items.${index}`),
        packagingMasterCode: newCode,
        packagingMasterName: itemInfo.name,
        packagingMasterId: master?.id || '',
        palletCount: 0,
        locations: [],
      });
    }
  };

  const handleLocationChange = (itemIndex: number, locationKey: string, newPalletCount: number) => {
    const currentItem = form.getValues(`items.${itemIndex}`);
    const locationData = availableStock[currentItem.packagingMasterCode].locations[locationKey];
    
    let existingLocations = currentItem.locations || [];
    const existingLocIndex = existingLocations.findIndex(l => l.locationKey === locationKey);
    
    if (existingLocIndex !== -1) {
        if (newPalletCount > 0) {
            existingLocations[existingLocIndex].palletsToWithdraw = newPalletCount;
        } else {
            existingLocations.splice(existingLocIndex, 1);
        }
    } else if (newPalletCount > 0) {
        existingLocations.push({
            locationKey: locationKey,
            receptionId: locationData.receptionId,
            itemIndex: locationData.itemIndex,
            palletsToWithdraw: newPalletCount,
            locationString: locationData.location,
        });
    }

    const totalPallets = existingLocations.reduce((sum, loc) => sum + loc.palletsToWithdraw, 0);

    update(itemIndex, {
      ...currentItem,
      palletCount: totalPallets,
      locations: existingLocations,
    });
  };

  const isLoading = loadingClients || loadingMasters || loadingReceptions;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Registrar Salida de Pallets de Embalaje</CardTitle>
          <CardDescription>Seleccione un cliente y registre la salida de materiales de embalaje del stock.</CardDescription>
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
                <FormLabel>Ítems a Despachar</FormLabel>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-col gap-3 p-4 border rounded-md">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 grid sm:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name={`items.${index}.packagingMasterCode`}
                            render={({ field: itemField }) => (
                              <FormItem>
                                <FormLabel>Código de Artículo</FormLabel>
                                <Select onValueChange={(value) => handleItemCodeChange(index, value)} value={itemField.value} disabled={!selectedClientId || Object.keys(availableStock).length === 0}>
                                    <FormControl><SelectTrigger>
                                        <SelectValue placeholder={!selectedClientId ? "Seleccione cliente" : "Seleccione un código"} />
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
                                  Total a sacar: {form.watch(`items.${index}.palletCount`)} pallets
                              </p>
                          </div>
                      </div>
                      <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                          <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {form.watch(`items.${index}.packagingMasterCode`) && (
                      <div className="space-y-2 pl-2 border-l-2">
                          <FormLabel className="text-xs">Ubicaciones Disponibles</FormLabel>
                          {(availableStock[form.getValues(`items.${index}.packagingMasterCode`)]?.locations && Object.keys(availableStock[form.getValues(`items.${index}.packagingMasterCode`)]?.locations).length > 0) ? (
                              Object.entries(availableStock[form.getValues(`items.${index}.packagingMasterCode`)].locations).map(([key, loc]) => (
                                <div key={key} className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded">
                                    <span className="flex-1">{loc.location}</span>
                                    <span className="w-28">Disp: {loc.available}</span>
                                    <Input
                                        type="number"
                                        className="w-32 h-8"
                                        placeholder="Cantidad"
                                        max={loc.available}
                                        min={0}
                                        defaultValue={(form.getValues(`items.${index}.locations`) || []).find(l => l.locationKey === key)?.palletsToWithdraw || 0}
                                        onChange={(e) => handleLocationChange(index, key, parseInt(e.target.value) || 0)}
                                    />
                                </div>
                              ))
                          ) : <p className="text-sm text-muted-foreground">No hay ubicaciones con stock para este artículo.</p>
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
                  Agregar Artículo
                </Button>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting || isLoading}>
                  {form.formState.isSubmitting ? 'Procesando...' : 'Generar Picking para Salida'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <PackagingPickingDialog 
        payload={pickingPayload}
        open={!!pickingPayload}
        onOpenChange={(open) => !open && setPickingPayload(null)}
        onConfirmExit={handleConfirmExit}
        isConfirming={isConfirming}
        clientName={packagingClients.find(c => c.clientId === selectedClientId)?.name || ''}
      />
    </>
  );
}
