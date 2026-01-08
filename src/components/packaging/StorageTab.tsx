'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StorePackagingDialog } from './StorePackagingDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function StorageTab() {
  const { data, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const [selectedLot, setSelectedLot] = React.useState<PackagingReception | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const pendingLots = React.useMemo(() => {
    return data.filter(lot => lot.status === 'Pendiente de almacenar')
               .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  }, [data]);

  const handleStoreClick = (lot: PackagingReception) => {
    setSelectedLot(lot);
    setDialogOpen(true);
  };

  const handleStoreConfirm = async (location: { warehouse: string; aisle: string; }) => {
    if (!selectedLot || !firestore) return;

    const lotRef = doc(firestore, 'packagingReceptions', selectedLot.id);
    const updateData = {
        status: 'Almacenado' as const,
        storageLocation: location,
        storedAt: serverTimestamp(),
    };

    try {
        await updateDoc(lotRef, updateData);
        toast({ title: 'Éxito', description: `Lote almacenado en ${location.warehouse} - ${location.aisle}.` });
        setDialogOpen(false);
    } catch (error) {
        console.error("Error storing packaging lot:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: lotRef.path,
            operation: 'update',
            requestResourceData: updateData,
        }));
    }
  };


  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pallets Pendientes de Almacenar</CardTitle>
          <CardDescription>Lotes de embalaje que han sido recepcionados y esperan una ubicación en bodega.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Materiales</TableHead>
                  <TableHead>Total Pallets</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : pendingLots.length > 0 ? (
                  pendingLots.map(lot => {
                    const totalPallets = lot.items.reduce((sum, item) => sum + item.palletCount, 0);
                    return (
                        <TableRow key={lot.id}>
                            <TableCell>{lot.clientName}</TableCell>
                            <TableCell className="font-mono">{lot.document}</TableCell>
                            <TableCell>
                                <ul className="list-disc list-inside">
                                    {lot.items.map((item, idx) => <li key={idx}>{item.packagingMasterName}</li>)}
                                </ul>
                            </TableCell>
                            <TableCell className="font-semibold">{totalPallets}</TableCell>
                            <TableCell><Badge variant="secondary">{lot.status}</Badge></TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" onClick={() => handleStoreClick(lot)}>Almacenar</Button>
                            </TableCell>
                        </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay pallets pendientes de almacenar.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <StorePackagingDialog
        lot={selectedLot}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleStoreConfirm}
      />
    </>
  );
}
