'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, PackagingReceptionItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StorePackagingDialog } from './StorePackagingDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface PendingItem extends PackagingReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
}

export function StorageTab() {
  const { data, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const [selectedItem, setSelectedItem] = React.useState<PendingItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const pendingItems = React.useMemo(() => {
    return data
        .filter(lot => lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado')
        .flatMap((lot, lotIndex) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex }))
                .filter(item => item.status === 'Pendiente de almacenar')
        )
        .sort((a,b) => data.find(l => l.id === a.receptionId)!.createdAt.toMillis() - data.find(l => l.id === b.receptionId)!.createdAt.toMillis());
  }, [data]);

  const handleStoreClick = (item: PendingItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleStoreConfirm = async (location: { warehouse: string; aisle: string; }) => {
    if (!selectedItem || !firestore) return;

    const receptionDocRef = doc(firestore, 'packagingReceptions', selectedItem.receptionId);
    
    // Create a deep copy to avoid mutation issues
    const originalReception = data.find(r => r.id === selectedItem.receptionId);
    if (!originalReception) return;

    const updatedItems = [...originalReception.items];
    updatedItems[selectedItem.itemIndex] = {
        ...updatedItems[selectedItem.itemIndex],
        status: 'Almacenado',
        storageLocation: location,
        storedAt: serverTimestamp(),
    };
    
    const allItemsStored = updatedItems.every(item => item.status === 'Almacenado');
    const newStatus = allItemsStored ? 'Almacenado' : 'Parcialmente Almacenado';

    const updateData = {
        items: updatedItems,
        status: newStatus,
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `Item almacenado en ${location.warehouse} - ${location.aisle}.` });
        setDialogOpen(false);
    } catch (error) {
        console.error("Error storing packaging item:", error);
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
      <Card>
        <CardHeader>
          <CardTitle>Artículos Pendientes de Almacenar</CardTitle>
          <CardDescription>Artículos de embalaje que han sido recepcionados y esperan una ubicación en bodega.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Cant. Pallets</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : pendingItems.length > 0 ? (
                  pendingItems.map((item) => (
                    <TableRow key={`${item.receptionId}-${item.itemIndex}`}>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-mono">{item.document}</TableCell>
                        <TableCell className="font-medium">{item.packagingMasterName}</TableCell>
                        <TableCell className="font-semibold">{item.palletCount}</TableCell>
                        <TableCell><Badge variant="secondary">{item.status}</Badge></TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleStoreClick(item)}>Almacenar</Button>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay artículos pendientes de almacenar.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <StorePackagingDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleStoreConfirm}
      />
    </>
  );
}
