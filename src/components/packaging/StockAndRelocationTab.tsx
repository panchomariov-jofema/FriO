'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RelocatePackagingDialog } from './RelocatePackagingDialog';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface StoredPackagingItem {
    id: string; // receptionId + itemIndex
    receptionId: string;
    itemIndex: number;
    clientName: string;
    document: string;
    code: string;
    name: string;
    palletCount: number;
    location: {
        warehouse: string;
        aisle: string;
    }
}

export function StockAndRelocationTab() {
  const { data: allReceptions, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const [itemToRelocate, setItemToRelocate] = React.useState<StoredPackagingItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const storedItems = React.useMemo(() => {
    return (allReceptions || [])
        .flatMap((reception) => 
            reception.items
                .map((item, index) => ({ item, index, reception }))
                .filter(({ item }) => item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation)
                .map(({ item, index, reception }) => ({
                    id: `${reception.id}-${index}`,
                    receptionId: reception.id,
                    itemIndex: index,
                    clientName: reception.clientName,
                    document: reception.document,
                    code: item.packagingMasterCode,
                    name: item.packagingMasterName,
                    palletCount: item.palletCount,
                    location: item.storageLocation!,
                }))
        )
        .sort((a,b) => a.code.localeCompare(b.code) || a.clientName.localeCompare(b.clientName));
  }, [allReceptions]);

  const handleRelocateClick = (item: StoredPackagingItem) => {
    setItemToRelocate(item);
    setDialogOpen(true);
  };
  
  const handleRelocateConfirm = async (newLocation: { warehouse: string; aisle: string; }) => {
    if (!itemToRelocate || !firestore) return;

    const receptionDocRef = doc(firestore, 'packagingReceptions', itemToRelocate.receptionId);
    
    const originalReception = allReceptions.find(r => r.id === itemToRelocate.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    updatedItems[itemToRelocate.itemIndex] = {
        ...updatedItems[itemToRelocate.itemIndex],
        storageLocation: newLocation,
        storedAt: new Date(), 
    };

    const updateData = {
        items: updatedItems,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `Pallet reubicado a ${newLocation.warehouse} - ${newLocation.aisle}.` });
        setDialogOpen(false);
    } catch (error) {
        console.error("Error relocating packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reubicar el pallet.' });
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
          <CardDescription>Consulte el stock almacenado y reubique pallets según sea necesario.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Cant. Pallets</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : storedItems.length > 0 ? (
                  storedItems.map((item) => (
                    <TableRow key={item.id}>
                        <TableCell className="font-mono">{item.code}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell>{item.location.warehouse} / {item.location.aisle}</TableCell>
                        <TableCell className="font-semibold">{item.palletCount}</TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleRelocateClick(item)}>Reubicar</Button>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay stock almacenado.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <RelocatePackagingDialog
        item={itemToRelocate}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleRelocateConfirm}
       />
    </>
  );
}
