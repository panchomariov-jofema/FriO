'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem, ChamberLot, PackagingReception, PackagingReceptionItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useChamberStrategy } from '@/contexts/ChamberStrategyContext';
import { StorePackagingDialog } from '../packaging/StorePackagingDialog';
import { chambersConfig } from '@/lib/chambers-config';
import { getPairedCoordinates, getSortedCoordinates } from '@/lib/utils';
import { ClientStorageConfigDialog } from './ClientStorageConfigDialog';
import { useUser } from '@/firebase';
import { Settings2, ArrowLeft, Users } from 'lucide-react';
import type { ClientStorageConfig, Exporter, OtherClient } from '@/lib/types';
import { ClientSelector } from './ClientSelector';

type PendingFruitItem = OtherFruitReceptionItem & {
    type: 'fruit';
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
};

type PendingPackagingItem = PackagingReceptionItem & {
    type: 'packaging';
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Pallets'; // Packaging is always in pallets
};

type ConsolidatedPendingItem = PendingFruitItem | PendingPackagingItem;


export function OtherFruitStorageTab({ clientId: fixedClientId }: { clientId?: string }) {
  const { data: otherFruitReceptions, loading: loadingFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: packagingReceptions, loading: loadingPackaging } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: clientConfigs } = useFirestoreCollection<ClientStorageConfig>('clientStorageConfigs');
  const { data: exporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherClients } = useFirestoreCollection<OtherClient>('otherClients');
  
  const [selectedItem, setSelectedItem] = React.useState<ConsolidatedPendingItem | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = React.useState(false);
  const [scanValue, setScanValue] = React.useState('');
  const [selectedClientId, setSelectedClientId] = React.useState<string | null>(null);
  
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { chamberStrategies } = useChamberStrategy();

  const isLogisticsManager = user?.email === 'francisco.villarreal@outlook.es' || user?.email === 'jlog@frio.cl';
  
  const loading = loadingFruit || loadingPackaging || loadingChamberLots;
  
  const resolvedClientConfig = React.useMemo(() => {
    if (!selectedItem) return undefined;
    
    const reception = [...(otherFruitReceptions || []), ...(packagingReceptions || [])].find(r => r.id === selectedItem.receptionId);
    if (!reception) return undefined;
    
    const clientId = reception.clientId;
    
    // 1. Get explicit override if exists
    const explicitOverride = clientConfigs?.find(c => c.id === clientId);
    
    // 2. Get master data defaults
    const otherClient = otherClients?.find(c => c.clientId === clientId);
    const exporter = exporters?.find(e => e.exporterId === clientId);
    const masterData = otherClient || exporter;
    
    if (!masterData && !explicitOverride) return undefined;
    
    return {
      id: clientId,
      clientName: masterData?.name || explicitOverride?.clientName || 'Cliente',
      strategy: (explicitOverride?.strategy || masterData?.storageStrategy || 'secuencial') as any,
      binsPerCoordinate: explicitOverride?.binsPerCoordinate ?? masterData?.binsPerCoordinate ?? 6,
      palletsPerCoordinate: explicitOverride?.palletsPerCoordinate ?? masterData?.palletsPerCoordinate ?? 3,
      chamberOverrides: explicitOverride?.chamberOverrides
    } as ClientStorageConfig;
  }, [selectedItem, otherFruitReceptions, packagingReceptions, clientConfigs, otherClients, exporters]);


  // ... (rest of the logic for pendingItems remains same)
  const pendingItems = React.useMemo((): ConsolidatedPendingItem[] => {
    const fruitItems: PendingFruitItem[] = (otherFruitReceptions || [])
        .filter(lot => 
            (lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado') &&
            (!fixedClientId || lot.clientId === fixedClientId)
        )
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, type: 'fruit', receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: lot.unit }))
                .filter(item => item.status === 'Pendiente de almacenar')
        );

    const packagingItems: PendingPackagingItem[] = (packagingReceptions || [])
         .filter(lot => 
            (lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado') &&
            (!fixedClientId || lot.clientId === fixedClientId)
        )
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, type: 'packaging', receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: 'Pallets' as const }))
                .filter(item => item.status === 'Pendiente de almacenar')
        );

    return [...fruitItems, ...packagingItems]
        .filter(item => !selectedClientId || (item.type === 'fruit' ? 
            (otherFruitReceptions?.find(r => r.id === item.receptionId)?.clientId === selectedClientId) : 
            (packagingReceptions?.find(r => r.id === item.receptionId)?.clientId === selectedClientId)))
        .sort((a,b) => {
            const allReceptions = [...(otherFruitReceptions || []), ...(packagingReceptions || [])];
            const lotA = allReceptions.find(l => l.id === a.receptionId);
            const lotB = allReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });
  }, [otherFruitReceptions, packagingReceptions, fixedClientId, selectedClientId]);

  const clientsWithPending = React.useMemo(() => {
    const clientsMap = new Map<string, { id: string; name: string; count: number }>();
    
    // Process fruit receptions
    (otherFruitReceptions || []).forEach(reception => {
        const pendingCount = reception.items.filter(i => i.status === 'Pendiente de almacenar').length;
        if (pendingCount > 0) {
            const existing = clientsMap.get(reception.clientId);
            if (existing) {
                existing.count += pendingCount;
            } else {
                clientsMap.set(reception.clientId, { id: reception.clientId, name: reception.clientName, count: pendingCount });
            }
        }
    });

    // Process packaging receptions
    (packagingReceptions || []).forEach(reception => {
        const pendingCount = reception.items.filter(i => i.status === 'Pendiente de almacenar').length;
        if (pendingCount > 0) {
            const existing = clientsMap.get(reception.clientId);
            if (existing) {
                existing.count += pendingCount;
            } else {
                clientsMap.set(reception.clientId, { id: reception.clientId, name: reception.clientName, count: pendingCount });
            }
        }
    });

    return Array.from(clientsMap.values()).sort((a, b) => b.count - a.count);
  }, [otherFruitReceptions, packagingReceptions]);

  const activeClientName = React.useMemo(() => {
    if (!selectedClientId) return null;
    const client = clientsWithPending.find(c => c.id === selectedClientId);
    return client?.name || selectedClientId;
  }, [selectedClientId, clientsWithPending]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanValue.trim()) return;

    const val = scanValue.trim().toUpperCase();
    const found = pendingItems.find(item => {
        if (item.type === 'fruit') {
            return item.palletId?.toUpperCase() === val || item.productCode?.toUpperCase() === val;
        } else {
            return item.packagingMasterCode?.toUpperCase() === val;
        }
    });

    if (found) {
        setSelectedItem(found);
        setScanValue('');
    } else {
        toast({ title: "No encontrado", description: "No hay productos pendientes con ese ID.", variant: "destructive" });
    }
  };

  const handleStoreClick = (item: ConsolidatedPendingItem) => {
    setSelectedItem(item);
  };

  const handleFruitStoreConfirm = async (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'pareado' | 'aisle-access' }) => {
    if (!selectedItem || selectedItem.type !== 'fruit' || !firestore) return;

    const { chamberId, coordinate: startCoordinate, totalQuantity, quantityPerLocation, strategy } = data;

    const originalReception = otherFruitReceptions.find(r => r.id === selectedItem.receptionId);
    if (!originalReception) {
        toast({ title: "Error", description: "No se encontró la recepción original.", variant: "destructive" });
        return;
    }

    const chamberConfig = chambersConfig[chamberId];
    if (!chamberConfig) {
        toast({ title: "Error", description: "Configuración de cámara no encontrada.", variant: "destructive" });
        return;
    }

    // --- 1. Get available coordinates ---
    const occupancyMap = new Map<string, number>();
    (allChamberLots || []).forEach(l => {
        if (l.status === 'Almacenado' && l.chamberId === chamberId && l.coordinate) {
            occupancyMap.set(l.coordinate, (occupancyMap.get(l.coordinate) || 0) + l.binCount);
        }
    });
    (otherFruitReceptions || []).forEach(r => {
        r.items.forEach((item, index) => {
            const isCurrentItem = r.id === selectedItem.receptionId && index === selectedItem.itemIndex;
            if (isCurrentItem) return;

            if (item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId && item.storageLocation.coordinate) {
                const equivalentUnits = r.unit === 'Bins' ? item.quantity : item.quantity * 2;
                occupancyMap.set(item.storageLocation.coordinate, (occupancyMap.get(item.storageLocation.coordinate) || 0) + equivalentUnits);
            }
        });
    });

    let allPossibleCoords;
    if (strategy === 'pareado') {
        allPossibleCoords = getPairedCoordinates(chamberConfig);
    } else if (strategy === 'aisle-access') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'aisle-access');
    } else {
        const globalStrategy = chamberStrategies[chamberId] || 'secuencial';
        allPossibleCoords = getSortedCoordinates(chamberConfig, globalStrategy);
    }
    const availableCoords = allPossibleCoords.filter(coord => !occupancyMap.has(coord) && !chamberConfig.blocked?.includes(coord));

    if (!availableCoords.includes(startCoordinate)) {
        toast({ variant: 'destructive', title: 'Error de ubicación', description: `La coordenada de inicio (${startCoordinate}) no es válida o ya está ocupada.` });
        return;
    }
    
    // --- 2. Prepare updates ---
    const receptionRef = doc(firestore, 'otherFruitReceptions', selectedItem.receptionId);
    const originalPendingItem = originalReception.items[selectedItem.itemIndex];
    
    if (originalPendingItem.quantity < totalQuantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${originalPendingItem.quantity}).`});
        return;
    }

    const newStoredItems: OtherFruitReceptionItem[] = [];
    let remainingToStore = totalQuantity;
    const startIndex = availableCoords.indexOf(startCoordinate);
    const coordsToFill = availableCoords.slice(startIndex);

    for (const coord of coordsToFill) {
        if (remainingToStore <= 0) break;
        
        const quantityForThisCoord = Math.min(remainingToStore, quantityPerLocation);

        newStoredItems.push({
            ...originalPendingItem,
            quantity: quantityForThisCoord,
            status: 'Almacenado',
            storageLocation: {
                chamberId,
                coordinate: coord
            },
            storedAt: new Date(),
        });
        
        remainingToStore -= quantityForThisCoord;
    }

    if (remainingToStore > 0) {
        toast({ variant: 'destructive', title: 'Error de espacio', description: `No hay suficientes coordenadas disponibles para almacenar ${totalQuantity} ${selectedItem.unit}. Faltaron ${remainingToStore}.` });
        return;
    }

    const remainingPendingQuantity = originalPendingItem.quantity - totalQuantity;
    
    const finalItemsArray = originalReception.items.filter((_, index) => index !== selectedItem.itemIndex);
    if (remainingPendingQuantity > 0) {
        finalItemsArray.push({
            ...originalPendingItem,
            quantity: remainingPendingQuantity,
        });
    }
    finalItemsArray.push(...newStoredItems);
    
    const stillHasPending = finalItemsArray.some(item => item.status === 'Pendiente de almacenar' && item.quantity > 0);
    const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

    const updateData = {
        items: finalItemsArray,
        status: newStatus,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionRef, updateData);
        toast({ title: 'Éxito', description: `${totalQuantity} ${selectedItem.unit} almacenados en ${chamberConfig.name}.` });
        setSelectedItem(null);
    } catch (error) {
        console.error("Error storing fruit item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
    }
  };
  
  const handlePackagingStoreConfirm = async (data: { locations: { warehouse: string; aisle: string; quantity: number }[] }) => {
    if (!selectedItem || selectedItem.type !== 'packaging' || !firestore) return;

    const itemToStore = selectedItem as PendingPackagingItem;
    const totalToStore = data.locations.reduce((sum, loc) => sum + loc.quantity, 0);

    if (totalToStore !== itemToStore.palletCount) {
        toast({ title: "Error de Cantidad", description: `Debe asignar exactamente los ${itemToStore.palletCount} pallets pendientes.`, variant: "destructive" });
        return;
    }

    try {
        await runTransaction(firestore, async (transaction) => {
            const receptionRef = doc(firestore, 'packagingReceptions', itemToStore.receptionId);
            const receptionSnap = await transaction.get(receptionRef);
            if (!receptionSnap.exists()) {
                throw new Error("La recepción de origen ya no existe.");
            }

            const originalReception = receptionSnap.data() as PackagingReception;
            const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
            
            const consumedItem = updatedItems.splice(itemToStore.itemIndex, 1)[0];
            if (!consumedItem) {
                 throw new Error("El ítem a almacenar no fue encontrado.");
            }

            for (const newLocation of data.locations) {
                if (newLocation.quantity > 0) {
                    updatedItems.push({
                        ...consumedItem,
                        palletCount: newLocation.quantity,
                        status: 'Almacenado',
                        storageLocation: { warehouse: newLocation.warehouse, aisle: newLocation.aisle },
                        storedAt: new Date(),
                    });
                }
            }

            const stillHasPending = updatedItems.some((item: PackagingReceptionItem) => item.status === 'Pendiente de almacenar' && item.palletCount > 0);
            const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

            transaction.update(receptionRef, {
                items: updatedItems,
                status: newStatus,
                updatedAt: serverTimestamp(),
            });
        });

        toast({ title: 'Éxito', description: 'Embalaje almacenado en las ubicaciones especificadas.' });
        setSelectedItem(null);

    } catch (error: any) {
        console.error("Error storing packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo actualizar la ubicación.' });
    }
  };


  if (!selectedClientId && !fixedClientId) {
    return (
        <>
            <div className="flex justify-end mb-4">
                {isLogisticsManager && (
                  <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)} className="flex gap-2">
                    <Settings2 className="h-4 w-4" />
                    Configuración Logística
                  </Button>
                )}
            </div>
            <ClientSelector 
                clients={clientsWithPending}
                onSelect={setSelectedClientId}
            />
            <ClientStorageConfigDialog 
                open={configDialogOpen}
                onOpenChange={setConfigDialogOpen}
            />
        </>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <Card className="flex-1">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-4">
                    {!fixedClientId && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setSelectedClientId(null)}
                            className="h-8 w-8"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    )}
                    <div>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            Almacenamiento: <span className="text-primary font-bold">{activeClientName}</span>
                        </CardTitle>
                        <CardDescription>Escanee Pallet ID o seleccione un ítem de la lista.</CardDescription>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isLogisticsManager && (
                    <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)} className="flex gap-2">
                        <Settings2 className="h-4 w-4" />
                        Configuración Logística
                    </Button>
                    )}
                    {!fixedClientId && (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedClientId(null)}>
                            Cerrar Cliente
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleScanSubmit} className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder={`Escanee Pallet ID de ${activeClientName}...`}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={scanValue}
                        onChange={(e) => setScanValue(e.target.value)}
                        autoFocus
                    />
                    <Button type="submit">Buscar</Button>
                </form>
            </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Productos Pendientes de Almacenar</CardTitle>
          <CardDescription>Artículos de fruta y embalajes que esperan una ubicación en bodega o cámara.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile View */}
          <div className="md:hidden space-y-3">
              {loading ? (
                   Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
              ) : pendingItems.length > 0 ? (
                  pendingItems.map((item) => (
                      <Card key={`${item.receptionId}-${item.itemIndex}`} className="p-4">
                          <div className="flex justify-between items-start gap-4">
                              <div>
                                  <CardTitle className="text-lg">{item.type === 'fruit' ? item.productName : item.packagingMasterName}</CardTitle>
                                  <CardDescription>{item.clientName} / Doc: {item.document}</CardDescription>
                                  <div className="mt-2">
                                    <p className="font-mono text-sm text-muted-foreground">
                                        {item.type === 'fruit' ? item.productCode : item.packagingMasterCode}
                                    </p>
                                    <p className="font-semibold text-lg mt-1">{(item as any).quantity || (item as any).palletCount} {item.unit}</p>
                                  </div>
                              </div>
                              <Button size="lg" onClick={() => handleStoreClick(item)}>Almacenar</Button>
                          </div>
                      </Card>
                  ))
              ) : (
                   <div className="h-24 text-center flex items-center justify-center">
                      <p>No hay productos pendientes de almacenar.</p>
                   </div>
              )}
          </div>
          {/* Desktop View */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto/Artículo</TableHead>
                  <TableHead>Cantidad Pendiente</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : pendingItems.length > 0 ? (
                  pendingItems.map((item) => (
                    <TableRow key={`${item.receptionId}-${item.itemIndex}`}>
                        <TableCell className="font-mono">
                            {item.type === 'fruit' ? item.productCode : item.packagingMasterCode}
                        </TableCell>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-medium">{item.type === 'fruit' ? item.productName : item.packagingMasterName}</TableCell>
                        <TableCell className="font-semibold">{(item as any).quantity || (item as any).palletCount} {item.unit}</TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleStoreClick(item)}>Almacenar</Button>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">No hay productos pendientes de almacenar.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedItem?.type === 'fruit' && (
          <StoreOtherFruitDialog
            item={selectedItem as PendingFruitItem}
            open={!!selectedItem}
            onOpenChange={() => setSelectedItem(null)}
            onConfirm={handleFruitStoreConfirm}
            allReceptions={otherFruitReceptions || []}
            allChamberLots={allChamberLots || []}
            chamberStrategies={chamberStrategies}
            clientConfig={resolvedClientConfig}
          />
      )}
       {selectedItem?.type === 'packaging' && (
          <StorePackagingDialog
            item={selectedItem as PendingPackagingItem}
            open={!!selectedItem}
            onOpenChange={() => setSelectedItem(null)}
            onConfirm={handlePackagingStoreConfirm}
          />
       )}

       <ClientStorageConfigDialog 
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
       />
    </>
  );
}
