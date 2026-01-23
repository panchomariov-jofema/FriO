'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem, ChamberLot } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

export function OtherFruitStorageTab() {
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const [selectedItem, setSelectedItem] = React.useState<PendingItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const loading = loadingReceptions || loadingChamberLots;

  const pendingItems = React.useMemo(() => {
    return (allReceptions || [])
        .filter(lot => lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado')
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
  }, [allReceptions]);

  const handleStoreClick = (item: PendingItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleStoreConfirm = async (location: { chamberId: string; coordinate: string; quantity: number; }) => {
    if (!selectedItem || !firestore) return;
    
    const { chamberId, coordinate, quantity } = location;

    const receptionDocRef = doc(firestore, 'otherFruitReceptions', selectedItem.receptionId);
    const originalReception = allReceptions.find(r => r.id === selectedItem.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    const originalItem = updatedItems[selectedItem.itemIndex];

    if (quantity > originalItem.quantity) {
        toast({ title: 'Error', description: 'La cantidad a almacenar excede la pendiente.', variant: 'destructive'});
        return;
    }
    
    originalItem.quantity -= quantity;

    const newItem: OtherFruitReceptionItem = {
      ...originalItem,
      quantity: quantity,
      status: 'Almacenado',
      storageLocation: { chamberId, coordinate },
      storedAt: new Date(),
    };
    updatedItems.push(newItem);

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
    
    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `${quantity} ${selectedItem.unit} almacenados en ${chamberId}/${coordinate}.` });
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
      />
    </>
  );
}
