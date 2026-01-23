'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, ChamberLot } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { RelocateOtherFruitDialog } from './RelocateOtherFruitDialog';
import { chambersConfig } from '@/lib/chambers-config';

interface StoredOtherFruitItem {
    id: string; // receptionId + itemIndex
    receptionId: string;
    itemIndex: number;
    clientName: string;
    productName: string;
    quantity: number;
    unit: 'Bins' | 'Pallets';
    location: {
        chamberId: string;
        coordinate: string;
    }
}

export function StockAndRelocationTab() {
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const [itemToRelocate, setItemToRelocate] = React.useState<StoredOtherFruitItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const loading = loadingReceptions || loadingChamberLots;

  const storedItems = React.useMemo(() => {
    return (allReceptions || [])
        .flatMap((reception) => 
            reception.items
                .map((item, index) => ({ item, index, reception }))
                .filter(({ item }) => item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate)
                .map(({ item, index, reception }) => ({
                    id: `${reception.id}-${index}`,
                    receptionId: reception.id,
                    itemIndex: index,
                    clientName: reception.clientName,
                    productName: item.productName,
                    quantity: item.quantity,
                    unit: reception.unit,
                    location: item.storageLocation!,
                } as StoredOtherFruitItem))
        )
        .sort((a,b) => a.location.chamberId.localeCompare(b.location.chamberId) || a.location.coordinate.localeCompare(b.location.coordinate));
  }, [allReceptions]);

  const handleRelocateClick = (item: StoredOtherFruitItem) => {
    setItemToRelocate(item);
    setDialogOpen(true);
  };
  
  const handleRelocateConfirm = async (newLocation: { targetChamberId: string; targetCoordinate: string; }) => {
    if (!itemToRelocate || !firestore) return;

    const receptionDocRef = doc(firestore, 'otherFruitReceptions', itemToRelocate.receptionId);
    
    const originalReception = allReceptions.find(r => r.id === itemToRelocate.receptionId);
    if (!originalReception) return;

    // Create a deep copy to avoid read-only issues.
    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    const itemToUpdate = updatedItems[itemToRelocate.itemIndex];
    
    if (itemToUpdate) {
        itemToUpdate.storageLocation = {
            chamberId: newLocation.targetChamberId,
            coordinate: newLocation.targetCoordinate,
        };
    } else {
        toast({ title: 'Error', description: 'No se pudo encontrar el ítem original para actualizar.', variant: 'destructive'});
        return;
    }

    const updateData = {
        items: updatedItems,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `Producto reubicado a ${chambersConfig[newLocation.targetChamberId].name} - ${newLocation.targetCoordinate}.` });
        setDialogOpen(false);
    } catch (error) {
        console.error("Error relocating fruit item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reubicar el producto.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: receptionDocRef.path,
            operation: 'update',
            requestResourceData: updateData,
        }));
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Stock Actual y Reubicación</CardTitle>
          <CardDescription>Consulte el stock de fruta de otros clientes y reubique según sea necesario.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : storedItems.length > 0 ? (
                  storedItems.map((item) => (
                    <TableRow key={item.id}>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="font-mono">{chambersConfig[item.location.chamberId]?.name} / {item.location.coordinate}</TableCell>
                        <TableCell className="font-semibold">{item.quantity} {item.unit}</TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleRelocateClick(item)}>Reubicar</Button>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">No hay stock almacenado.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <RelocateOtherFruitDialog
        item={itemToRelocate}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onRelocate={handleRelocateConfirm}
        allChamberLots={allChamberLots || []}
        allOtherFruitReceptions={allReceptions || []}
       />
    </>
  );
}
