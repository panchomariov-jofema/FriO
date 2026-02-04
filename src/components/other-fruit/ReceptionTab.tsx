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
import { PlusCircle, ScanLine, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Label } from '@/components/ui/label';
import { usePackagingMastersByClient } from '@/hooks/usePackagingMastersByClient';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';

type ReceptionFormValues = z.infer<typeof otherFruitReceptionSchema>;

const defaultItem = {
  clientLotId: '',
  productCode: '',
  productName: '',
  quantity: 1,
  weight: undefined,
};

export function OtherFruitReceptionTab({ clientId: fixedClientId }: { clientId?: string }) {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = React.useState<OtherClient | null>(null);
  const [scanningIndex, setScanningIndex] = React.useState<number | null>(null);
  const [scannedValue, setScannedValue] = React.useState('');
  const [showClientLot, setShowClientLot] = React.useState(false);
  const [showTemperature, setShowTemperature] = React.useState(false);

  const form = useForm<ReceptionFormValues>({
    resolver: zodResolver(otherFruitReceptionSchema),
    defaultValues: {
      clientId: '',
      document: '',
      temperature: undefined,
      items: [defaultItem],
    },
  });
  
  const selectedClientId = form.watch('clientId');
  const { data: clientProducts, loading: loadingProducts } = usePackagingMastersByClient(selectedClientId);

  React.useEffect(() => {
    if (!showTemperature) {
      form.setValue('temperature', undefined);
    }
  }, [showTemperature, form]);


  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const fruitClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA');
  }, [allClients]);

  React.useEffect(() => {
    if (fixedClientId && fruitClients.length > 0) {
      const client = fruitClients.find(c => c.clientId === fixedClientId);
      setSelectedClient(client || null);
      if (client) {
          form.reset({
              clientId: client.clientId,
              document: '',
              temperature: undefined,
              items: [defaultItem],
          });
      }
    } else if (!fixedClientId) {
        setSelectedClient(null);
        form.reset({
            clientId: '',
            document: '',
            temperature: undefined,
            items: [defaultItem],
        });
    }
  }, [fixedClientId, fruitClients, form]);

  const handleClientChange = (clientId: string) => {
    const client = fruitClients.find(c => c.clientId === clientId);
    setSelectedClient(client || null);
    form.reset({
      clientId: clientId,
      document: '',
      temperature: undefined,
      items: [defaultItem]
    });
  };
  
  const handleScanConfirm = () => {
    if (scanningIndex !== null) {
        form.setValue(`items.${scanningIndex}.clientLotId`, scannedValue);
        setScanningIndex(null);
        setScannedValue('');
    }
  };

  const onSubmit = async (values: ReceptionFormValues) => {
    if (!firestore || !selectedClient) return;
    
    const itemsWithStatus = values.items.map(item => {
        const newItem: Partial<OtherFruitReceptionItem> = {
            ...item,
            status: 'Pendiente de almacenar'
        };

        if (typeof item.weight !== 'number' || isNaN(item.weight)) {
            delete newItem.weight;
        }
        if (!item.clientLotId) {
            delete newItem.clientLotId;
        }

        return newItem as OtherFruitReceptionItem;
    });

    const clientAbbreviation = selectedClient.name.substring(0, 4).toUpperCase();
    const displayLotId = `${clientAbbreviation}-${values.document}`;

    const receptionData: any = {
        clientId: values.clientId,
        clientName: selectedClient.name,
        unit: selectedClient.unit,
        document: values.document,
        displayLotId: displayLotId,
        items: itemsWithStatus,
        status: 'Pendiente de almacenar' as const,
        createdAt: serverTimestamp(),
    };

    if (showTemperature && typeof values.temperature === 'number' && !isNaN(values.temperature)) {
        receptionData.temperature = values.temperature;
    }
    
    try {
        const collRef = collection(firestore, 'otherFruitReceptions');
        await addDoc(collRef, receptionData);
        toast({ title: 'Éxito', description: `Recepción de fruta registrada con lote ${displayLotId}. Ahora puede asignar una ubicación.` });
        form.reset({
            clientId: values.clientId,
            document: '',
            temperature: undefined,
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

  const gridColsClass = showClientLot ? 'sm:grid-cols-5' : 'sm:grid-cols-4';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recepción de Productos</CardTitle>
        <CardDescription>Registre la entrada de productos de socios comerciales.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4 items-end">
              {!fixedClientId && (
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Socio Comercial</FormLabel>
                      <Select onValueChange={handleClientChange} value={field.value} disabled={loadingClients}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un socio..." />
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
              )}
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

            <div className="flex items-center space-x-6 pt-2">
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="show-client-lot"
                        checked={showClientLot}
                        onCheckedChange={(checked) => setShowClientLot(!!checked)}
                        disabled={!selectedClient}
                    />
                    <Label
                        htmlFor="show-client-lot"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Registrar Lote de Cliente
                    </Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="show-temperature"
                        checked={showTemperature}
                        onCheckedChange={(checked) => setShowTemperature(!!checked)}
                        disabled={!selectedClient}
                    />
                    <Label
                        htmlFor="show-temperature"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Registrar Temperatura
                    </Label>
                </div>
            </div>

            {showTemperature && (
                 <FormField
                    control={form.control}
                    name="temperature"
                    render={({ field }) => (
                    <FormItem className="max-w-xs">
                        <FormLabel>Temperatura (°C)</FormLabel>
                        <FormControl>
                            <Input 
                                type="number"
                                step="0.1"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
                                autoComplete="off"
                                inputMode="decimal"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            )}
            
            <div className="space-y-4">
              <FormLabel>Ítems Recibidos</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2 p-3 border rounded-md">
                  <div className={`flex-1 grid ${gridColsClass} gap-4 items-end`}>
                    {showClientLot && (
                    <FormField
                      control={form.control}
                      name={`items.${index}.clientLotId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lote Cliente</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input {...field} value={field.value ?? ''} autoComplete="off" />
                            </FormControl>
                             <AlertDialog open={scanningIndex === index} onOpenChange={(isOpen) => { if (!isOpen) setScanningIndex(null); }}>
                              <AlertDialogTrigger asChild>
                                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => setScanningIndex(index)}>
                                    <ScanLine className="h-4 w-4" />
                                    <span className="sr-only">Escanear código</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Simulación de Escáner</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    En la aplicación final, esto abriría la cámara para escanear un código de barras. Por ahora, puede ingresar el valor manualmente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <Input 
                                    value={scannedValue} 
                                    onChange={(e) => setScannedValue(e.target.value)} 
                                    placeholder="Ingrese el valor del código de barras..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleScanConfirm();
                                        }
                                    }}
                                />
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setScannedValue('')}>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleScanConfirm}>Aceptar</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    )}
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
                          <FormControl><Input type="number" {...field} value={field.value ?? ''} autoComplete="off" min="1" inputMode="numeric" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.weight`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Peso (kg)</FormLabel>
                          <FormControl>
                            <Input
                                type="number"
                                {...field}
                                autoComplete="off"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
                            />
                          </FormControl>
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
