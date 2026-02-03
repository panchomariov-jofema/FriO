'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem, ChamberLot, Chamber } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { chambersConfig } from '@/lib/chambers-config';
import { getSortedCoordinates } from '@/lib/utils';
import { useChamberStrategy } from '@/contexts/ChamberStrategyContext';

interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}


export function OtherFruitStorageTab({ clientId: fixedClientId }: { clientId?: string }) {
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const [selectedItem, setSelectedItem] = React.useState<PendingItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  const { chamberStrategies } = useChamberStrategy();
  
  const loading = loadingReceptions || loadingChamberLots;

  const pendingItems = React.useMemo(() => {
    return (allReceptions || [])
        .filter(lot => 
            (lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado') &&
            (!fixedClientId || lot.clientId === fixedClientId)
        )
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: lot.unit }))
                .filter(item => item.status === 'Pendiente de almacenar')
        )
        .sort((a,b) => {
            const lotA = allReceptions.find(l => l.id === a.receptionId);
            const lotB = allReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });
  }, [allReceptions, fixedClientId]);

  const handleStoreClick = (item: PendingItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleStoreConfirm = async (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'fifo' }) => {
    if (!selectedItem || !firestore) return;

    const { chamberId, coordinate: startCoordinate, totalQuantity, quantityPerLocation, strategy } = data;

    const chamberConfig = chambersConfig[chamberId];
    if (!chamberConfig) return;

    const BINS_PER_COORDINATE = 9;
    const PALLETS_PER_COORDINATE = 3;
    const capacityPerCoord = selectedItem.unit === 'Bins' ? BINS_PER_COORDINATE : PALLETS_PER_COORDINATE;

    if (quantityPerLocation > capacityPerCoord) {
      toast({ title: 'Error', description: `La cantidad por ubicación excede el máximo de ${capacityPerCoord}.`, variant: 'destructive' });
      return;
    }

    const allPossibleCoords = getSortedCoordinates(chamberConfig, strategy);

    const occupiedCoords = new Set<string>();
    (allChamberLots || []).forEach(lot => {
      if (lot.chamberId === chamberId && lot.coordinate) occupiedCoords.add(lot.coordinate);
    });
    (allReceptions || []).forEach(reception => {
      reception.items.forEach(item => {
        if (item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId && item.storageLocation.coordinate) {
          occupiedCoords.add(item.storageLocation.coordinate);
        }
      });
    });

    if (occupiedCoords.has(startCoordinate)) {
        toast({ title: 'Error', description: 'La coordenada de inicio ya está ocupada.', variant: 'destructive'});
        return;
    }

    const startIndex = allPossibleCoords.indexOf(startCoordinate);
    if (startIndex === -1) {
        toast({ title: 'Error', description: 'La coordenada de inicio no es válida para esta cámara.', variant: 'destructive'});
        return;
    }
    
    const coordinatesToSearch = allPossibleCoords.slice(startIndex);
    let remainingQuantityToStore = totalQuantity;
    const coordsToUse: string[] = [];
    const batch = writeBatch(firestore);

    const receptionDocRef = doc(firestore, 'otherFruitReceptions', selectedItem.receptionId);
    const originalReception = allReceptions.find(r => r.id === selectedItem.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    const originalItem = updatedItems[selectedItem.itemIndex];

    if (totalQuantity > originalItem.quantity) {
      toast({ title: 'Error', description: 'La cantidad a almacenar excede la pendiente.', variant: 'destructive' });
      return;
    }

    originalItem.quantity -= totalQuantity;

    for (const coord of coordinatesToSearch) {
        if (remainingQuantityToStore <= 0) break;
        
        if (!occupiedCoords.has(coord)) {
            coordsToUse.push(coord);
            const quantityForThisCoord = Math.min(remainingQuantityToStore, quantityPerLocation);

            const newItem: OtherFruitReceptionItem = {
                ...originalItem,
                quantity: quantityForThisCoord,
                status: 'Almacenado',
                storageLocation: { chamberId, coordinate: coord },
                storedAt: new Date(),
            };
            updatedItems.push(newItem);
    
            remainingQuantityToStore -= quantityForThisCoord;
        }
    }
    
    if (remainingQuantityToStore > 0) {
      toast({ title: 'Espacio Insuficiente', description: `No se encontraron suficientes coordenadas libres para almacenar todo. Quedaron ${remainingQuantityToStore} sin almacenar.`, variant: 'destructive', duration: 7000 });
      return;
    }

    if (originalItem.quantity <= 0) {
      updatedItems.splice(selectedItem.itemIndex, 1);
    }

    const allItemsStoredOrEmpty = updatedItems.every((item: OtherFruitReceptionItem) => item.status === 'Almacenado' || item.quantity <= 0);
    const newStatus = allItemsStoredOrEmpty ? 'Almacenado' : 'Parcialmente Almacenado';

    const updateData = {
      items: updatedItems,
      status: newStatus,
      updatedAt: serverTimestamp(),
    };

    batch.update(receptionDocRef, updateData);

    try {
      await batch.commit();
      toast({ title: 'Éxito', description: `${totalQuantity} ${selectedItem.unit} almacenados en ${coordsToUse.length} ubicaciones.` });
      setDialogOpen(false);
    } catch (error) {
      console.error("Error storing fruit item:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: receptionDocRef.path,
        operation: 'update',
        requestResourceData: updateData,
      }));
    }
  };


  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Productos Pendientes de Almacenar</CardTitle>
          <CardDescription>Artículos de fruta que han sido recepcionados y esperan una ubicación en cámara.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad Pendiente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : pendingItems.length > 0 ? (
                  pendingItems.map((item) => (
                    <TableRow key={`${item.receptionId}-${item.itemIndex}`}>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="font-semibold">{item.quantity} {item.unit}</TableCell>
                        <TableCell><Badge variant="secondary">{item.status}</Badge></TableCell>
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

      <StoreOtherFruitDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleStoreConfirm}
        allReceptions={allReceptions || []}
        allChamberLots={allChamberLots || []}
        chamberStrategies={chamberStrategies}
      />
    </>
  );
}
