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
import type { OtherClient, PackagingMaster, PackagingReceptionItem, OtherFruitReception, ChamberLot, ClientStorageConfig } from '@/lib/types';
import { packagingReceptionSchema } from '@/lib/schemas';
import { PlusCircle, Trash2, ScanLine } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { addDoc, collection, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { BarcodeScanner } from '../BarcodeScanner';
import { CreatePackagingProduct } from './CreatePackagingProduct';
import { VitafoodReceptionWorkflow } from '../other-fruit/VitafoodReceptionWorkflow';
import { StoreOtherFruitDialog } from '../other-fruit/StoreOtherFruitDialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { chambersConfig } from '@/lib/chambers-config';
import { getSortedCoordinates, getPairedCoordinates, getEffectiveChamberConfig } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cleanFirestoreObject } from '@/lib/vitafood-utils';

type ReceptionFormValues = z.infer<typeof packagingReceptionSchema>;

const defaultItem = {
  packagingMasterId: '',
  packagingMasterCode: '',
  packagingMasterName: '',
  palletCount: 1,
};

export function ReceptionTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: clientConfigs } = useFirestoreCollection<ClientStorageConfig>('clientStorageConfigs');
  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');

  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [scanningIndex, setScanningIndex] = React.useState<number | null>(null);
  const [isCreateProductOpen, setIsCreateProductOpen] = React.useState(false);

  // Vitafood & Storage State
  const [directStorageMode, setDirectStorageMode] = React.useState(true);
  const [usePhysicalScanner, setUsePhysicalScanner] = React.useState(false);
  const [itemToStore, setItemToStore] = React.useState<any | null>(null);
  const [isStoreDialogOpen, setIsStoreDialogOpen] = React.useState(false);
  const [selectedManifestId, setSelectedManifestId] = React.useState<string | null>(null);
  const [lastUsedChamberId, setLastUsedChamberId] = React.useState<string | null>(null);
  const [lastUsedCoordinate, setLastUsedCoordinate] = React.useState<string | null>(null);

  const packagingClients = React.useMemo(() => {
    return (allClients || []).filter(c => 
      c.status !== 'inactivo' && (
        c.type?.toLowerCase() === 'embalaje' || 
        c.name?.toUpperCase().includes('VITAFOOD')
      )
    );
  }, [allClients]);

  const form = useForm<ReceptionFormValues>({
    resolver: zodResolver(packagingReceptionSchema),
    defaultValues: {
      clientId: '',
      document: '',
      lote: '',
      items: [defaultItem],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const selectedClientId = form.watch('clientId');

  const selectedClient = React.useMemo(() => {
    return packagingClients.find(c => c.clientId === selectedClientId) || null;
  }, [packagingClients, selectedClientId]);

  // Default to Vitafood if available and not selected
  React.useEffect(() => {
    if (packagingClients.length > 0 && !selectedClientId) {
      const vita = packagingClients.find(c => c.name.toUpperCase().includes('VITAFOOD'));
      if (vita) {
        form.setValue('clientId', vita.clientId);
      } else {
        form.setValue('clientId', packagingClients[0].clientId);
      }
    }
  }, [packagingClients, selectedClientId, form]);

  const resolvedClientConfig = React.useMemo(() => {
    if (!itemToStore) return undefined;
    const explicit = clientConfigs?.find(c => c.id === itemToStore.clientId);
    const client = (packagingClients || []).find(c => c.clientId === itemToStore.clientId || c.name.toUpperCase() === itemToStore.clientName?.toUpperCase());
    const palletsPerCoord = explicit?.palletsPerCoordinate ?? 
      (client?.palletsPerCoordinate && client.palletsPerCoordinate > 0 ? client.palletsPerCoordinate : 4);

    return {
      id: itemToStore.clientId,
      clientName: itemToStore.clientName,
      strategy: (explicit?.strategy || client?.storageStrategy || 'secuencial') as any,
      binsPerCoordinate: explicit?.binsPerCoordinate ?? 6,
      palletsPerCoordinate: palletsPerCoord,
      preferredChamberId: explicit?.preferredChamberId,
      chamberOverrides: explicit?.chamberOverrides
    };
  }, [itemToStore, clientConfigs, packagingClients]);

  const onStoreConfirm = async (data: { 
    chamberId: string; 
    coordinate: string; 
    warehouse?: string;
    aisle?: string;
    destinationType?: 'chamber' | 'warehouse';
    totalQuantity: number; 
    quantityPerLocation: number; 
    strategy: any 
  }) => {
    if (!itemToStore || !firestore) return;

    const { chamberId, coordinate: startCoordinate, warehouse, aisle, destinationType, totalQuantity, quantityPerLocation, strategy } = data;
    const receptionRef = doc(firestore, 'otherFruitReceptions', itemToStore.receptionId);
    
    try {
      const receptionSnap = await getDoc(receptionRef);
      if (!receptionSnap.exists()) {
        toast({ title: 'Error', description: 'No se encontró la recepción.', variant: 'destructive' });
        return;
      }
      const originalReception = { id: receptionSnap.id, ...receptionSnap.data() } as OtherFruitReception;

      const itemsToProcess = itemToStore.itemIndices.map((idx: number) => originalReception.items[idx]);
      const newStoredItems: any[] = [];
      let remainingToStore = totalQuantity;

      const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Operador';
      const currentUserId = user?.uid || '';
      const now = new Date();

      if (destinationType === 'warehouse' || (warehouse && aisle)) {
        // Warehouse and Aisle storage (e.g., Almacén 7 / Pasillo 1)
        for (const itemToProcess of itemsToProcess) {
          if (remainingToStore <= 0) break;
          newStoredItems.push({
            ...itemToProcess,
            quantity: itemToProcess.quantity,
            status: 'Almacenado',
            storageLocation: {
              warehouse: warehouse,
              aisle: aisle,
              chamberId: warehouse,
              coordinate: aisle
            },
            storedAt: now,
            storedByUserName: currentUserName,
            storedByUserId: currentUserId,
          });
          remainingToStore -= itemToProcess.quantity;
        }

        const finalItemsArray = originalReception.items.filter((_, index) => !itemToStore.itemIndices.includes(index));
        finalItemsArray.push(...newStoredItems);

        const stillHasPending = finalItemsArray.some(item => (item.status === 'Pendiente de recibir' || item.status === 'Pendiente de almacenar') && item.quantity > 0);
        const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

        await updateDoc(receptionRef, cleanFirestoreObject({
          items: finalItemsArray,
          status: newStatus
        }));

        setIsStoreDialogOpen(false);
        setItemToStore(null);
        toast({ title: '✅ Éxito', description: `Pallet almacenado en ${warehouse} - ${aisle}.` });
      } else {
        // Cold Chamber storage with Coordinates
        const rawChamberConfig = chambersConfig[chamberId];
        if (!rawChamberConfig) {
          toast({ variant: 'destructive', title: 'Error', description: 'Cámara no válida.' });
          return;
        }

        const isChamberRow13Enabled = !!chamberSettings?.find(s => s.id === chamberId)?.row13Enabled;
        const chamberConfig = getEffectiveChamberConfig(rawChamberConfig, isChamberRow13Enabled);
        let allPossibleCoords = (strategy === 'pareado') ? getPairedCoordinates(chamberConfig) : getSortedCoordinates(chamberConfig, strategy || 'secuencial');

        const startIndex = allPossibleCoords.indexOf(startCoordinate);
        if (startIndex === -1) {
          toast({ variant: 'destructive', title: 'Error de ubicación', description: 'Coordenada no válida.' });
          return;
        }

        for (const itemToProcess of itemsToProcess) {
          if (remainingToStore <= 0) break;
          newStoredItems.push({
            ...itemToProcess,
            quantity: itemToProcess.quantity,
            status: 'Almacenado',
            storageLocation: {
              chamberId,
              coordinate: startCoordinate
            },
            storedAt: now,
            storedByUserName: currentUserName,
            storedByUserId: currentUserId,
          });
          remainingToStore -= itemToProcess.quantity;
        }

        const finalItemsArray = originalReception.items.filter((_, index) => !itemToStore.itemIndices.includes(index));
        finalItemsArray.push(...newStoredItems);

        const stillHasPending = finalItemsArray.some(item => (item.status === 'Pendiente de recibir' || item.status === 'Pendiente de almacenar') && item.quantity > 0);
        const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

        await updateDoc(receptionRef, cleanFirestoreObject({
          items: finalItemsArray,
          status: newStatus
        }));

        setLastUsedChamberId(chamberId);
        setLastUsedCoordinate(startCoordinate);
        setIsStoreDialogOpen(false);
        setItemToStore(null);
        toast({ title: '✅ Éxito', description: `Pallet almacenado en ${chamberConfig.name} - ${startCoordinate}.` });
      }
    } catch (err: any) {
      console.error('Error storing packaging in chamber/warehouse:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la ubicación.' });
    }
  };

  const onSubmit = async (values: ReceptionFormValues) => {
    if (!firestore) return;

    const currentClient = packagingClients.find(c => c.clientId === values.clientId);
    if (!currentClient) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cliente no válido.' });
        return;
    }
    
    // Add status and the top-level 'lote' to each item
    const itemsWithStatus = values.items.map(item => {
        const newItem: any = {
            ...item,
            status: 'Pendiente de almacenar'
        };
        if (values.lote && values.lote.trim() !== '') {
            newItem.lote = values.lote.trim();
        }
        return newItem as Omit<PackagingReceptionItem, 'storageLocation' | 'storedAt'>;
    });

    const receptionData = {
        clientId: values.clientId,
        document: values.document,
        items: itemsWithStatus,
        clientName: currentClient.name,
        status: 'Pendiente de almacenar' as const,
        createdAt: serverTimestamp(),
    };
    
    try {
        const collRef = collection(firestore, 'packagingReceptions');
        await addDoc(collRef, receptionData);
        toast({ title: 'Éxito', description: 'Recepción de embalaje registrada. Ahora puede asignar una ubicación.' });
        form.reset({
            clientId: values.clientId, // Keep client selected
            document: '',
            lote: '',
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
    form.reset({
        clientId: value,
        document: '',
        lote: '',
        items: [defaultItem]
    });
  };

  // IF VITAFOOD IS SELECTED -> RENDER VITAFOOD SPECIALIZED WORKFLOW
  if (selectedClient?.name?.toUpperCase().includes('VITAFOOD') || selectedClient?.name?.toUpperCase() === 'VITAFOODS') {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Cliente de Embalaje:</span>
            <Select value={selectedClient.clientId} onValueChange={(val) => form.setValue('clientId', val)}>
              <SelectTrigger className="w-[260px] font-bold bg-background">
                <SelectValue placeholder="Seleccione cliente..." />
              </SelectTrigger>
              <SelectContent>
                {packagingClients.map(c => (
                  <SelectItem key={c.clientId} value={c.clientId} className="font-medium">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border">
            <Switch
              id="direct-storage-vita"
              checked={directStorageMode}
              onCheckedChange={setDirectStorageMode}
            />
            <Label htmlFor="direct-storage-vita" className="text-xs cursor-pointer font-bold uppercase">
              Almacenamiento Directo
            </Label>
          </div>
        </div>

        <VitafoodReceptionWorkflow
          directStorageMode={directStorageMode}
          usePhysicalScanner={usePhysicalScanner}
          onTriggerStorage={(item) => {
            setItemToStore(item);
            setIsStoreDialogOpen(true);
          }}
          selectedManifestId={selectedManifestId}
          onSelectedManifestIdChange={setSelectedManifestId}
          selectedClient={selectedClient}
        />

        <StoreOtherFruitDialog
          open={isStoreDialogOpen}
          onOpenChange={setIsStoreDialogOpen}
          item={itemToStore}
          onConfirm={onStoreConfirm}
          allReceptions={allReceptions || []}
          allChamberLots={allChamberLots || []}
          clientConfig={resolvedClientConfig}
          lastUsedChamberId={lastUsedChamberId}
          lastUsedCoordinate={lastUsedCoordinate}
        />
      </div>
    );
  }

  // STANDARD PACKAGING FORM
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
              <div>
                  <CardTitle>Recepción de Embalajes</CardTitle>
                  <CardDescription>
                      Registre la entrada de nuevos materiales de embalaje en pallets.
                  </CardDescription>
              </div>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setIsCreateProductOpen(true)}
                disabled={!selectedClientId}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Nuevo Producto
              </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select onValueChange={handleClientChange} value={field.value} disabled={loadingClients}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un cliente" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {packagingClients.map((client) => (
                            <SelectItem key={client.clientId} value={client.clientId}>
                              {client.name}
                            </SelectItem>
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
                      <FormLabel>N° Guía / Factura</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ej: 12345" 
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
                 <FormField
                    control={form.control}
                    name="lote"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Lote (Opcional)</FormLabel>
                            <FormControl>
                                <Input {...field} autoComplete="off" placeholder="Lote para todos los artículos"/>
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
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-10 gap-4 items-start">
                       <FormField
                        control={form.control}
                        name={`items.${index}.packagingMasterCode`}
                        render={({ field: itemField }) => (
                          <FormItem className="sm:col-span-3">
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
                      <div className="space-y-2 sm:col-span-5">
                        <FormLabel>Descripción</FormLabel>
                        <p className="font-medium text-sm h-10 flex items-center">
                            {form.watch(`items.${index}.packagingMasterName`) || <span className="text-muted-foreground">--</span>}
                        </p>
                      </div>
                       <FormField
                          control={form.control}
                          name={`items.${index}.palletCount`}
                          render={({ field: itemField }) => (
                              <FormItem className="sm:col-span-2">
                                  <FormLabel>Cant. Pallets</FormLabel>
                                  <FormControl>
                                      <Input type="number" {...itemField} value={itemField.value ?? ''} autoComplete="off" min="1" inputMode="numeric" />
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
