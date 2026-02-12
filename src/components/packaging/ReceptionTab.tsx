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
import type { OtherClient, PackagingMaster, PackagingReceptionItem } from '@/lib/types';
import { packagingReceptionSchema } from '@/lib/schemas';
import { PlusCircle, Trash2, ScanLine } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { BarcodeScanner } from '../BarcodeScanner';
import { CreatePackagingProduct } from './CreatePackagingProduct';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type ReceptionFormValues = z.infer<typeof packagingReceptionSchema>;

const defaultItem = {
  lote: '',
  packagingMasterId: '',
  packagingMasterCode: '',
  packagingMasterName: '',
  palletCount: 1,
};

export function ReceptionTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const firestore = useFirestore();
  const { toast } = useToast();
  const [scanningIndex, setScanningIndex] = React.useState<number | null>(null);
  const [isCreateProductOpen, setIsCreateProductOpen] = React.useState(false);

  const form = useForm<ReceptionFormValues>({
    resolver: zodResolver(packagingReceptionSchema),
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

  const packagingClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toLowerCase() === 'embalaje' && c.status !== 'inactivo');
  }, [allClients]);

  const onSubmit = async (values: ReceptionFormValues) => {
    if (!firestore) return;

    const selectedClient = packagingClients.find(c => c.clientId === values.clientId);
    if (!selectedClient) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cliente no válido.' });
        return;
    }
    
    // Add status to each item and handle optional lote field
    const itemsWithStatus = values.items.map(item => {
        const { lote, ...rest } = item;
        const newItem: any = {
            ...rest,
            status: 'Pendiente de almacenar'
        };
        if (lote) {
            newItem.lote = lote;
        }
        return newItem as Omit<PackagingReceptionItem, 'storageLocation' | 'storedAt'>;
    });


    const receptionData = {
        clientId: values.clientId,
        document: values.document,
        items: itemsWithStatus,
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
            items: [defaultItem],
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
  
  const handleCodeBlur = (index: number) => {
    const code = form.getValues(`items.${index}.packagingMasterCode`);
    if (!code || !selectedClientId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un cliente e ingrese un código.' });
      return;
    }
    
    const foundMaster = allPackagingMasters.find(m => m.clientId === selectedClientId && m.code === code);
    
    if (foundMaster) {
      form.setValue(`items.${index}.packagingMasterId`, foundMaster.id, { shouldValidate: true });
      form.setValue(`items.${index}.packagingMasterName`, foundMaster.name);
    } else {
      form.setValue(`items.${index}.packagingMasterId`, '');
      form.setValue(`items.${index}.packagingMasterName`, '');
      form.setError(`items.${index}.packagingMasterCode`, { message: 'Código no encontrado para este cliente.' });
    }
  };

  const handleScanConfirm = (scannedValue: string) => {
    if (scanningIndex !== null) {
        form.setValue(`items.${scanningIndex}.packagingMasterCode`, scannedValue);
        handleCodeBlur(scanningIndex); // Trigger blur logic to find product
        setScanningIndex(null);
    }
  };

  const handleClientChange = (value: string) => {
    form.setValue('clientId', value);
    form.reset({
        ...form.getValues(),
        clientId: value,
        items: [defaultItem]
    });
  }


  return (
    <>
      <Card>
        <CardHeader>
            <div className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>Recepción de Pallets de Embalaje</CardTitle>
                    <CardDescription>Registre la entrada de materiales de embalaje de un cliente.</CardDescription>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setIsCreateProductOpen(true)} disabled={!selectedClientId}>
                    Nuevo Producto
                </Button>
            </div>
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
                      <Select onValueChange={handleClientChange} value={field.value} disabled={loadingClients}>
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
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete="off"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="space-y-4">
                <FormLabel>Ítems Recibidos</FormLabel>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2 p-3 border rounded-md">
                    <div className="flex-1 grid sm:grid-cols-4 gap-4 items-start">
                      <FormField
                        control={form.control}
                        name={`items.${index}.lote`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lote (Opcional)</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ''} autoComplete="off" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.packagingMasterCode`}
                        render={({ field: itemField }) => (
                          <FormItem>
                            <FormLabel>Cod. Artículo</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  {...itemField} 
                                  onBlur={() => handleCodeBlur(index)} 
                                  autoComplete="off" 
                                  disabled={!selectedClientId || loadingMasters}
                                  placeholder={!selectedClientId ? "Seleccione cliente" : "Ingrese código..."}
                                  inputMode="numeric" 
                                  pattern="[0-9]*"
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
                      <div className="space-y-2">
                        <FormLabel>Descripción</FormLabel>
                        <p className="font-medium text-sm h-10 flex items-center">
                            {form.watch(`items.${index}.packagingMasterName`) || <span className="text-muted-foreground">--</span>}
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name={`items.${index}.palletCount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cant. Pallets</FormLabel>
                            <FormControl><Input type="number" {...field} value={field.value ?? ''} autoComplete="off" min="1" inputMode="numeric" /></FormControl>
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
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Registrando...' : 'Confirmar Recepción'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {/* Dialog for Creating a new product */}
      <Dialog open={isCreateProductOpen} onOpenChange={setIsCreateProductOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Crear Nuevo Producto</DialogTitle>
                <DialogDescription>
                    Añada un nuevo artículo al maestro de embalajes para este cliente.
                </DialogDescription>
            </DialogHeader>
            {selectedClientId && (
                <CreatePackagingProduct
                    clientId={selectedClientId}
                    onProductCreated={() => setIsCreateProductOpen(false)}
                />
            )}
        </DialogContent>
      </Dialog>
      
      <BarcodeScanner
        open={scanningIndex !== null}
        onOpenChange={(isOpen) => !isOpen && setScanningIndex(null)}
        onScan={handleScanConfirm}
      />
    </>
  );
}
