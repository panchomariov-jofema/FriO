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
import { PlusCircle, Trash2, ScanLine } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { BarcodeScanner } from '../BarcodeScanner';
import { Label } from '../ui/label';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

const defaultItem = {
    packagingMasterId: '',
    packagingMasterCode: '',
    packagingMasterName: '',
    palletCount: 1,
};

export function ExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [loteFilter, setLoteFilter] = React.useState('');

  const form = useForm<ExitFormValues>({
    resolver: zodResolver(packagingExitSchema),
    defaultValues: {
      clientId: '',
      document: '',
      items: [defaultItem],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const selectedClientId = form.watch('clientId');
  
  // Scanner state
  const [scanningIndex, setScanningIndex] = React.useState<number | null>(null);

  const packagingClients = React.useMemo(() => {
    return [...new Map((allClients || []).filter(c => c.type.toLowerCase() === 'embalaje' && c.status !== 'inactivo').map(item => [item.clientId, item])).values()];
  }, [allClients]);

  const { inStockMasterCodes, stockByCodeAndLote } = React.useMemo(() => {
    const codes = new Set<string>();
    const stockMap = new Map<string, Map<string, number>>();

    if (selectedClientId && allReceptions) {
        allReceptions.forEach(reception => {
            if (reception.clientId === selectedClientId) {
                reception.items.forEach(item => {
                    if (item.status === 'Almacenado' && item.palletCount > 0) {
                        const lotMatch = !loteFilter || (item.lote && item.lote.toLowerCase().includes(loteFilter.toLowerCase()));
                        if (lotMatch) {
                            codes.add(item.packagingMasterCode);
                            const lote = item.lote || '';
                            if (!stockMap.has(item.packagingMasterCode)) {
                                stockMap.set(item.packagingMasterCode, new Map<string, number>());
                            }
                            const loteMap = stockMap.get(item.packagingMasterCode)!;
                            const currentStock = loteMap.get(lote) || 0;
                            loteMap.set(lote, currentStock + item.palletCount);
                        }
                    }
                });
            }
        });
    }
    return { inStockMasterCodes: codes, stockByCodeAndLote: stockMap };
  }, [selectedClientId, allReceptions, loteFilter]);
  
  const clientPackagingMasters = React.useMemo(() => {
      if (!selectedClientId) return [];
      const mastersForClient = (allPackagingMasters || []).filter(m => m.clientId === selectedClientId);
      const inStockMasters = mastersForClient.filter(m => inStockMasterCodes.has(m.code));
      return [...new Map(inStockMasters.map(item => [item.code, item])).values()];
  }, [selectedClientId, allPackagingMasters, inStockMasterCodes]);


  const onSubmit = async (values: ExitFormValues) => {
    if (!firestore) return;
    
    // Validate stock before submitting
    for (const item of values.items) {
        const stockForCode = stockByCodeAndLote.get(item.packagingMasterCode);
        if (!stockForCode) {
             toast({ variant: 'destructive', title: 'Stock Insuficiente', description: `No hay stock para "${item.packagingMasterName}".` });
             return;
        }

        const availableStock = loteFilter 
            ? stockForCode.get(loteFilter) || 0
            : Array.from(stockForCode.values()).reduce((sum, current) => sum + current, 0);

        if (item.palletCount > availableStock) {
            toast({
                variant: 'destructive',
                title: 'Stock Insuficiente',
                description: `No hay suficiente stock para "${item.packagingMasterName}" ${loteFilter ? `en el lote "${loteFilter}"` : ''}. Disponible: ${availableStock}, Solicitado: ${item.palletCount}.`,
            });
            return; // Stop submission
        }
    }

    try {
        const movementItems = values.items.map(item => {
            const newItem: any = {
                packagingMasterId: item.packagingMasterId,
                packagingMasterCode: item.packagingMasterCode,
                packagingMasterName: item.packagingMasterName,
                palletCount: item.palletCount,
            };
            if (loteFilter) { // Only add 'lote' if loteFilter is not empty
                newItem.lote = loteFilter;
            }
            return newItem;
        });

        const movementData = {
            type: 'salida' as const,
            clientId: values.clientId,
            document: values.document || '',
            items: movementItems,
            status: 'Pendiente de Picking' as const,
            createdAt: serverTimestamp(),
        };

        await addDoc(collection(firestore, 'packagingMovements'), movementData);
        
        toast({ title: 'Solicitud Creada', description: 'La solicitud de salida ha sido creada y está pendiente de picking.' });
        form.reset({ clientId: values.clientId, document: '', items: [defaultItem] });
        setLoteFilter('');

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
    setLoteFilter('');
  };
  
  const handleCodeBlur = (index: number) => {
    const code = form.getValues(`items.${index}.packagingMasterCode`);
    if (!code) {
      form.setValue(`items.${index}.packagingMasterId`, '');
      form.setValue(`items.${index}.packagingMasterName`, '');
      return;
    }
    
    const foundMaster = allPackagingMasters.find(m => m.clientId === selectedClientId && m.code === code);
    
    if (foundMaster) {
      form.setValue(`items.${index}.packagingMasterId`, foundMaster.id || '', { shouldValidate: true });
      form.setValue(`items.${index}.packagingMasterName`, foundMaster.name);
      form.clearErrors(`items.${index}.packagingMasterCode`);
    } else {
      form.setValue(`items.${index}.packagingMasterId`, '');
      form.setValue(`items.${index}.packagingMasterName`, '');
      form.setError(`items.${index}.packagingMasterCode`, { message: 'Código no encontrado.' });
    }
  };

  const handleScanConfirm = (scannedValue: string) => {
    if (scanningIndex !== null) {
        form.setValue(`items.${scanningIndex}.packagingMasterCode`, scannedValue);
        handleCodeBlur(scanningIndex); // Trigger blur logic to find product
        setScanningIndex(null);
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
              <div className="grid md:grid-cols-3 gap-4 items-end">
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
                 <div className="space-y-2">
                    <Label>Filtrar por Lote (Opcional)</Label>
                    <Input
                        value={loteFilter}
                        onChange={(e) => setLoteFilter(e.target.value)}
                        placeholder="Ingrese un lote..."
                        disabled={!selectedClientId}
                    />
                </div>
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
                {fields.map((field, index) => {
                    const currentCode = form.watch(`items.${index}.packagingMasterCode`);
                    const stockForCode = stockByCodeAndLote.get(currentCode);
                    const totalStock = stockForCode ? Array.from(stockForCode.values()).reduce((a, b) => a + b, 0) : 0;
                    
                    return (
                      <div key={field.id} className="flex items-end gap-2 p-3 border rounded-md">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-10 gap-4 items-start">
                           <FormField
                                control={form.control}
                                name={`items.${index}.packagingMasterCode`}
                                render={({ field: itemField }) => (
                                  <FormItem className="sm:col-span-3">
                                    <FormLabel>Código de Artículo</FormLabel>
                                    <div className="flex items-center gap-2">
                                      <FormControl>
                                         <Input 
                                            {...itemField} 
                                            onBlur={() => handleCodeBlur(index)} 
                                            autoComplete="off" 
                                            disabled={!selectedClientId || loadingMasters}
                                            placeholder={!selectedClientId ? "Seleccione cliente" : "Ingrese código..."}
                                        />
                                      </FormControl>
                                      <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setScanningIndex(index)}>
                                        <ScanLine className="h-4 w-4" />
                                        <span className="sr-only">Escanear código</span>
                                      </Button>
                                    </div>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            <div className="space-y-2 sm:col-span-5">
                                <FormLabel>Descripción</FormLabel>
                                <div className="font-medium text-sm h-10 flex items-center p-2 border border-input bg-background rounded-md">
                                    {form.watch(`items.${index}.packagingMasterName`) || <span className="text-muted-foreground">--</span>}
                                </div>
                            </div>
                            <FormField
                                control={form.control}
                                name={`items.${index}.palletCount`}
                                render={({ field: itemField }) => (
                                    <FormItem className="sm:col-span-2">
                                        <FormLabel>Cant. Pallets</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...itemField} value={itemField.value ?? ''} autoComplete="off" min="1" className="w-full sm:w-auto"/>
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground pt-1">
                                            Stock Disponible: {totalStock}
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
      <BarcodeScanner
        open={scanningIndex !== null}
        onOpenChange={(isOpen) => !isOpen && setScanningIndex(null)}
        onScan={handleScanConfirm}
      />
    </>
  );
}
