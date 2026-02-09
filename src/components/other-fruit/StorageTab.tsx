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
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useChamberStrategy } from '@/contexts/ChamberStrategyContext';
import { StorePackagingDialog } from '../packaging/StorePackagingDialog';
import { chambersConfig } from '@/lib/chambers-config';
import { getPairedCoordinates, getSortedCoordinates } from '@/lib/utils';

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
  
  const [selectedItem, setSelectedItem] = React.useState<ConsolidatedPendingItem | null>(null);
  const firestore = useFirestore();
  const { toast } = useToast();
  const { chamberStrategies } = useChamberStrategy();
  
  const loading = loadingFruit || loadingPackaging || loadingChamberLots;

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
        .sort((a,b) => {
            const allReceptions = [...(otherFruitReceptions || []), ...(packagingReceptions || [])];
            const lotA = allReceptions.find(l => l.id === a.receptionId);
            const lotB = allReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });
  }, [otherFruitReceptions, packagingReceptions, fixedClientId]);

  const handleStoreClick = (item: ConsolidatedPendingItem) => {
    setSelectedItem(item);
  };

  const handleFruitStoreConfirm = async (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'pareado' }) => {
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: receptionRef.path,
            operation: 'update',
            requestResourceData: updateData
        }));
    }
  };
  
  const handlePackagingStoreConfirm = async (location: { warehouse: string; aisle: string; }) => {
    if (!selectedItem || selectedItem.type !== 'packaging' || !firestore) return;

    const receptionDocRef = doc(firestore, 'packagingReceptions', selectedItem.receptionId);
    
    const originalReception = packagingReceptions.find(r => r.id === selectedItem.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    updatedItems[selectedItem.itemIndex] = {
        ...updatedItems[selectedItem.itemIndex],
        status: 'Almacenado',
        storageLocation: location,
        storedAt: new Date(),
    };
    
    const allItemsStored = updatedItems.every((item: PackagingReceptionItem) => item.status === 'Almacenado');
    const newStatus = allItemsStored ? 'Almacenado' : 'Parcialmente Almacenado';

    const updateData = {
        items: updatedItems,
        status: newStatus,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `Embalaje almacenado en ${location.warehouse} - ${location.aisle}.` });
        setSelectedItem(null);
    } catch (error) {
        console.error("Error storing packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
    }
  };


  return (
    <>
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
                                      <Badge variant={item.type === 'fruit' ? 'outline' : 'default'}>
                                          {item.type === 'fruit' ? 'Fruta' : 'Embalaje'}
                                      </Badge>
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
                  <TableHead>Tipo</TableHead>
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
                        <TableCell>
                            <Badge variant={item.type === 'fruit' ? 'outline' : 'default'}>
                                {item.type === 'fruit' ? 'Fruta' : 'Embalaje'}
                            </Badge>
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
    </>
  );
}
