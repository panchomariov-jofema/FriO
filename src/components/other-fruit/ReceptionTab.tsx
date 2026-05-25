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
import type { OtherClient, OtherFruitReceptionItem, OtherFruitReception } from '@/lib/types';
import { otherFruitReceptionSchema } from '@/lib/schemas';
import { PlusCircle, ScanLine, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Label } from '@/components/ui/label';
import { usePackagingMastersByClient } from '@/hooks/usePackagingMastersByClient';
import { Checkbox } from '../ui/checkbox';
import { BarcodeScanner } from '../BarcodeScanner';
import { FallCreekReceptionWorkflow } from './FallCreekReceptionWorkflow';
import { chambersConfig } from '@/lib/chambers-config';
import { getSortedCoordinates, getPairedCoordinates } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';

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
  
  const { data: exporters } = useFirestoreCollection<any>('exporters');
  const { data: otherClients } = useFirestoreCollection<any>('otherClients');
  const { data: clientConfigs } = useFirestoreCollection<any>('clientStorageConfigs');
  const { data: allChamberLots } = useFirestoreCollection<any>('chamberLots');
  const { data: allReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');

  const [selectedClient, setSelectedClient] = React.useState<OtherClient | null>(null);
  const [scanningIndex, setScanningIndex] = React.useState<number | null>(null);
  const [showClientLot, setShowClientLot] = React.useState(false);
  const [showTemperature, setShowTemperature] = React.useState(false);
  const [directStorageMode, setDirectStorageMode] = React.useState(true);
  const [usePhysicalScanner, setUsePhysicalScanner] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('frio_use_physical_scanner') === 'true';
    }
    return false;
  });

  const handleTogglePhysical = (checked: boolean) => {
    setUsePhysicalScanner(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('frio_use_physical_scanner', String(checked));
    }
  };

  const [itemToStore, setItemToStore] = React.useState<any | null>(null);
  const [isStoreDialogOpen, setIsStoreDialogOpen] = React.useState(false);

  const [lastUsedChamberId, setLastUsedChamberId] = React.useState<string | null>(null);
  const [lastUsedCoordinate, setLastUsedCoordinate] = React.useState<string | null>(null);

  const resolvedClientConfig = React.useMemo(() => {
    if (!itemToStore) return undefined;
    
    const clientId = itemToStore.clientId;
    
    // 1. Get explicit override if exists
    const explicitOverride = clientConfigs?.find((c: any) => c.id === clientId);
    
    // 2. Get master data defaults
    const otherClient = otherClients?.find((c: any) => c.clientId === clientId);
    const exporter = exporters?.find((e: any) => e.exporterId === clientId);
    const masterData = otherClient || exporter;
    
    if (!masterData && !explicitOverride) return undefined;
    
    let strategy = explicitOverride?.strategy || masterData?.storageStrategy || 'secuencial';
    let binsPerCoordinate = explicitOverride?.binsPerCoordinate ?? masterData?.binsPerCoordinate ?? 6;
    let palletsPerCoordinate = explicitOverride?.palletsPerCoordinate ?? masterData?.palletsPerCoordinate ?? 3;
    let preferredChamberId = explicitOverride?.preferredChamberId ?? (masterData as any)?.preferredChamberId;

    // Hardcoded defaults for Fall Creek
    if (masterData?.name === 'FALL CREEK' || masterData?.id === 'fallcreek' || itemToStore.clientName === 'FALL CREEK') {
        strategy = 'aisle-access';
        binsPerCoordinate = 9;
        palletsPerCoordinate = 3;
    }

    return {
      id: clientId,
      clientName: masterData?.name || explicitOverride?.clientName || itemToStore.clientName,
      strategy: strategy as any,
      binsPerCoordinate,
      palletsPerCoordinate,
      preferredChamberId,
      chamberOverrides: explicitOverride?.chamberOverrides
    };
  }, [itemToStore, clientConfigs, otherClients, exporters]);

  const onStoreConfirm = async (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: any }) => {
    if (!itemToStore || !firestore) return;

    const { chamberId, coordinate: startCoordinate, totalQuantity, quantityPerLocation, strategy } = data;

    const receptionRef = doc(firestore, 'otherFruitReceptions', itemToStore.receptionId);
    let originalReception: OtherFruitReception | null = null;
    try {
      const receptionSnap = await getDoc(receptionRef);
      if (receptionSnap.exists()) {
        originalReception = { id: receptionSnap.id, ...receptionSnap.data() } as OtherFruitReception;
      }
    } catch (err) {
      console.error("Error fetching original reception:", err);
    }

    if (!originalReception) {
        toast({ title: "Error", description: "No se encontró la recepción original.", variant: "destructive" });
        return;
    }

    const chamberConfig = chambersConfig[chamberId];
    if (!chamberConfig) return;

    const occupancyMap = new Map<string, number>();
    (allChamberLots || []).forEach(l => {
        if (l.status === 'Almacenado' && l.chamberId === chamberId && l.coordinate) {
            occupancyMap.set(l.coordinate, (occupancyMap.get(l.coordinate) || 0) + l.binCount);
        }
    });
    (allReceptions || []).forEach(r => {
        r.items.forEach((item) => {
            if (item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId && item.storageLocation.coordinate) {
                const multiplier = (r.clientName === 'FALL CREEK' && r.unit === 'Pallets') ? 3 : (r.unit === 'Bins' ? 1 : 2);
                const equivalentUnits = item.quantity * multiplier;
                occupancyMap.set(item.storageLocation.coordinate, (occupancyMap.get(item.storageLocation.coordinate) || 0) + equivalentUnits);
            }
        });
    });

    let allPossibleCoords;
    if (strategy === 'pareado') {
        allPossibleCoords = getPairedCoordinates(chamberConfig);
    } else {
        allPossibleCoords = getSortedCoordinates(chamberConfig, strategy || 'secuencial');
    }

    const itemsToProcess = itemToStore.itemIndices.map((idx: number) => originalReception.items[idx]);
    
    const newStoredItems: OtherFruitReceptionItem[] = [];
    let remainingToStore = totalQuantity;
    const startIndex = allPossibleCoords.indexOf(startCoordinate);
    const coordsToFill = allPossibleCoords.slice(startIndex);
    
    const occupancyThreshold = quantityPerLocation;
    let currentCoordIdx = 0;
    let currentCoord = coordsToFill[currentCoordIdx];
    let newLastCoord: string | null = null;

    const isFallCreek = originalReception.clientName === 'FALL CREEK';
    const unitsPerItem = (isFallCreek && originalReception.unit === 'Pallets') ? 3 : (originalReception.unit === 'Bins' ? 1 : 2);

    for (const itemToProcess of itemsToProcess) {
        if (remainingToStore <= 0) break;
        if (currentCoordIdx >= coordsToFill.length) break;

        let itemQuantityRemaining = itemToProcess.quantity;

        while (itemQuantityRemaining > 0 && currentCoordIdx < coordsToFill.length) {
            currentCoord = coordsToFill[currentCoordIdx];
            const currentOccupancy = occupancyMap.get(currentCoord) || 0;
            const availableSpaceInBins = Math.max(0, occupancyThreshold - currentOccupancy);
            const availableSpaceInItemUnits = Math.floor(availableSpaceInBins / unitsPerItem);

            if (availableSpaceInItemUnits <= 0 || chamberConfig.blocked?.includes(currentCoord)) {
                currentCoordIdx++;
                continue;
            }

            // Compatibility check (only same client)
            const existingClientsInCoord = new Set<string>();
            (allChamberLots || []).forEach(l => {
                if (l.chamberId === chamberId && l.coordinate === currentCoord) existingClientsInCoord.add(l.exporterId);
            });
            (allReceptions || []).forEach(r => {
                r.items.forEach(it => {
                    if (it.status === 'Almacenado' && it.storageLocation?.chamberId === chamberId && it.storageLocation.coordinate === currentCoord) {
                        existingClientsInCoord.add(r.clientId);
                    }
                });
            });

            if (existingClientsInCoord.size > 0 && !existingClientsInCoord.has(itemToStore.clientId)) {
                currentCoordIdx++;
                continue;
            }

            const amountToStore = Math.min(itemQuantityRemaining, availableSpaceInItemUnits, remainingToStore);
            if (amountToStore <= 0) {
                currentCoordIdx++;
                continue;
            }
            
            newStoredItems.push({
                ...itemToProcess,
                quantity: amountToStore,
                status: 'Almacenado',
                storageLocation: {
                    chamberId,
                    coordinate: currentCoord
                },
                storedAt: new Date()
            });

            const unitsStored = amountToStore * unitsPerItem;
            occupancyMap.set(currentCoord, currentOccupancy + unitsStored);
            newLastCoord = currentCoord;

            itemQuantityRemaining -= amountToStore;
            remainingToStore -= amountToStore;
            
            const remainingInCoord = availableSpaceInBins - unitsStored;
            if (remainingInCoord < unitsPerItem) {
                currentCoordIdx++;
            }
        }
    }

    if (newStoredItems.length === 0) {
        toast({ variant: 'destructive', title: 'Error de espacio', description: 'No se encontraron coordenadas compatibles con espacio suficiente.' });
        return;
    }

    // Filter out the original processed items and insert the new stored items (possibly split)
    const finalItemsArray = originalReception.items.filter((_, index) => !itemToStore.itemIndices.includes(index));
    finalItemsArray.push(...newStoredItems);

    try {
        const stillHasPending = finalItemsArray.some(item => item.status === 'Pendiente de almacenar' && item.quantity > 0);
        const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

        await updateDoc(doc(firestore, 'otherFruitReceptions', originalReception.id!), {
            items: finalItemsArray,
            status: newStatus
        });

        if (newLastCoord) {
            setLastUsedChamberId(chamberId);
            setLastUsedCoordinate(newLastCoord);
            if (typeof window !== 'undefined') {
                localStorage.setItem('frio_last_chamber_id', chamberId);
                localStorage.setItem('frio_last_coordinate', newLastCoord);
            }
        }

        setIsStoreDialogOpen(false);
        setItemToStore(null);
        toast({ title: 'Éxito', description: `Ubicación asignada correctamente en ${chamberConfig.name}.` });
    } catch (error) {
        console.error("Error storing fruit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo asignar la ubicación.' });
    }
  };

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
    return (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA' && c.status !== 'inactivo');
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
    } else if (!fixedClientId && fruitClients.length > 0 && !selectedClient) {
        // Default to FALL CREEK if available
        const fallCreek = fruitClients.find(c => c.name.toUpperCase() === 'FALL CREEK');
        if (fallCreek) {
            setSelectedClient(fallCreek);
            form.reset({
                clientId: fallCreek.clientId,
                document: '',
                temperature: undefined,
                items: [defaultItem],
            });
        } else {
            setSelectedClient(null);
            form.reset({
                clientId: '',
                document: '',
                temperature: undefined,
                items: [defaultItem],
            });
        }
    }
  }, [fixedClientId, fruitClients, form, selectedClient]);

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
  
  const handleScanConfirm = (scannedValue: string) => {
    if (scanningIndex !== null) {
        form.setValue(`items.${scanningIndex}.clientLotId`, scannedValue);
        setScanningIndex(null);
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
        const docRef = await addDoc(collRef, receptionData);
        toast({ title: 'Éxito', description: `Recepción de fruta registrada con lote ${displayLotId}.` });
        
        if (directStorageMode) {
            // For general reception, we usually have one or multiple items.
            // If there's only one item, it's easy. If there are many, we might want to store them one by one.
            // For now, let's trigger it for the first item or consolidate if possible.
            // Usually, these are Bins or Pallets.
            
            const firstItem = itemsWithStatus[0];
            const itemToStore = {
                ...firstItem,
                receptionId: docRef.id,
                clientId: values.clientId,
                clientName: selectedClient.name,
                document: values.document,
                itemIndices: [0], // First item
                unit: selectedClient.unit,
                quantity: firstItem.quantity
            };
            
            setItemToStore(itemToStore);
            setIsStoreDialogOpen(true);
        }

        form.reset({
            clientId: values.clientId,
            document: '',
            temperature: undefined,
            items: [defaultItem],
        });
    } catch (error) {
        console.error("Error creating fruit reception:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la recepción.' });
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

  if (selectedClient?.name === 'FALL CREEK') {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Card className="border-none sm:border shadow-none sm:shadow-md">
          <CardHeader className="px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl">Recepción de Productos</CardTitle>
                <CardDescription>Socio: <span className="font-bold text-[#004b8d]">{selectedClient.name}</span></CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-2 bg-[#7aba28]/10 px-4 py-2 rounded-full border border-[#7aba28]/20">
                      <Label htmlFor="physical-scanner-fc" className="text-xs font-bold uppercase text-[#004b8d] cursor-pointer">Lector / Cámara</Label>
                      <Switch 
                          id="physical-scanner-fc" 
                          checked={usePhysicalScanner} 
                          onCheckedChange={handleTogglePhysical}
                          className="data-[state=checked]:bg-[#7aba28]"
                      />
                  </div>
                  <div className="flex items-center space-x-2 bg-[#7aba28]/10 px-4 py-2 rounded-full border border-[#7aba28]/20">
                      <Label htmlFor="direct-storage-fc" className="text-xs font-bold uppercase text-[#004b8d] cursor-pointer">Almacenamiento Directo</Label>
                      <Switch 
                          id="direct-storage-fc" 
                          checked={directStorageMode} 
                          onCheckedChange={setDirectStorageMode}
                          className="data-[state=checked]:bg-[#7aba28]"
                      />
                  </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6 pb-6">
             {!fixedClientId && (
                <div className="max-w-md mb-4 sm:mb-6 px-2 sm:px-0">
                  <Label className="mb-2 block text-xs sm:text-sm uppercase font-bold text-muted-foreground">Socio Comercial</Label>
                  <Select onValueChange={handleClientChange} value={selectedClientId} disabled={loadingClients}>
                    <SelectTrigger className="h-12 border-2">
                      <SelectValue placeholder="Seleccione un socio..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fruitClients.map(c => (
                        <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <FallCreekReceptionWorkflow 
                directStorageMode={directStorageMode}
                usePhysicalScanner={usePhysicalScanner}
                onTriggerStorage={(item) => {
                  setItemToStore(item);
                  setIsStoreDialogOpen(true);
                }}
              />
          </CardContent>
        </Card>

        <StoreOtherFruitDialog
            item={itemToStore}
            open={isStoreDialogOpen}
            onOpenChange={setIsStoreDialogOpen}
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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recepción de Productos</CardTitle>
            <CardDescription>Registre la entrada de productos de socios comerciales.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-2 bg-[#7aba28]/10 px-4 py-2 rounded-full border border-[#7aba28]/20">
                  <Label htmlFor="direct-storage-gen" className="text-xs font-bold uppercase text-[#004b8d] cursor-pointer">Almacenamiento Directo</Label>
                  <Switch 
                      id="direct-storage-gen" 
                      checked={directStorageMode} 
                      onCheckedChange={setDirectStorageMode}
                      className="data-[state=checked]:bg-[#7aba28]"
                  />
              </div>
          </div>
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
                  <div key={field.id} className="flex items-start gap-2 p-3 border rounded-md">
                    <div className={`flex-1 grid ${gridColsClass} gap-4 items-start`}>
                      {showClientLot && (
                      <FormField
                        control={form.control}
                        name={`items.${index}.clientLotId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lote Cliente</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ''} autoComplete="off" />
                            </FormControl>
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
      <BarcodeScanner
        open={scanningIndex !== null}
        onOpenChange={(isOpen) => !isOpen && setScanningIndex(null)}
        onScan={handleScanConfirm}
        usePhysicalScanner={usePhysicalScanner}
      />

      <StoreOtherFruitDialog
          item={itemToStore}
          open={isStoreDialogOpen}
          onOpenChange={setIsStoreDialogOpen}
          onConfirm={onStoreConfirm}
          allReceptions={allReceptions || []}
          allChamberLots={allChamberLots || []}
          clientConfig={resolvedClientConfig}
          lastUsedChamberId={lastUsedChamberId}
          lastUsedCoordinate={lastUsedCoordinate}
      />
    </>
  );
}
