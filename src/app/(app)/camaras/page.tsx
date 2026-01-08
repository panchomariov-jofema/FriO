'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoreInChamberDialog } from '@/components/hidrocooler/StoreInChamberDialog';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { format } from 'date-fns';

export default function CamarasPage() {
  const { data: chamberLots, loading } = useFirestoreCollection<ChamberLot>('chamberLots');
  const [lotToStore, setLotToStore] = React.useState<ChamberLot | null>(null);
  const [isStoreDialogOpen, setStoreDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const { pendingLots, storedLots } = React.useMemo(() => {
    if (!chamberLots) return { pendingLots: [], storedLots: [] };
    const pending = chamberLots
      .filter((lot) => lot.status === 'Pendiente por Almacenar')
      .sort((a, b) => b.storedAt.toMillis() - a.storedAt.toMillis());
    const stored = chamberLots
      .filter((lot) => lot.status === 'Almacenado')
      .sort((a, b) => b.storedAt.toMillis() - a.storedAt.toMillis());
    return { pendingLots: pending, storedLots: stored };
  }, [chamberLots]);

  const handleStoreClick = (lot: ChamberLot) => {
    setLotToStore(lot);
    setStoreDialogOpen(true);
  };

  const handleStoreInChamber = async ({ chamberId }: { chamberId: string }) => {
    if (!lotToStore || !firestore) return;
    
    const lotRef = doc(firestore, 'chamberLots', lotToStore.id);
    const updateData = {
      chamberId,
      status: 'Almacenado' as const,
      storedAt: serverTimestamp(), // Update timestamp to when it was actually stored
    };

    try {
      await updateDoc(lotRef, updateData);
      toast({ title: 'Éxito', description: `Lote almacenado en ${chamberId}.` });
    } catch (error) {
      console.error("Error al almacenar en cámara: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el lote.' });
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: lotRef.path,
          operation: 'update',
          requestResourceData: updateData,
        })
      );
    }
  };
  
  const getStatusVariant = (status: ChamberLot['status']) => {
    switch (status) {
      case 'Pendiente por Almacenar': return 'secondary';
      case 'Almacenado': return 'default';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lotes Pendientes por Almacenar</CardTitle>
          <CardDescription>Lotes que finalizaron el proceso de hidrocooler y esperan ser asignados a una cámara.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Lote</TableHead>
                  <TableHead>Productor</TableHead>
                  <TableHead>N° Bins</TableHead>
                  <TableHead>Del Hidrocooler</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : pendingLots.length > 0 ? (
                  pendingLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                      <TableCell>{lot.producerShortName}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell>{lot.hidrocooler}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleStoreClick(lot)}>Almacenar</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay lotes pendientes de almacenar.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lotes Almacenados en Cámaras</CardTitle>
          <CardDescription>Lotes que ya se encuentran guardados en las cámaras de frío.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Lote</TableHead>
                  <TableHead>Productor</TableHead>
                  <TableHead>Cámara</TableHead>
                  <TableHead>N° Bins</TableHead>
                  <TableHead>Fecha Almacenamiento</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : storedLots.length > 0 ? (
                  storedLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                      <TableCell>{lot.producerShortName}</TableCell>
                      <TableCell>{lot.chamberId}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell>
                        {lot.storedAt ? format(lot.storedAt.toDate(), 'dd/MM/yyyy HH:mm') : '-'}
                      </TableCell>
                      <TableCell><Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay lotes almacenados.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {lotToStore && (
        <StoreInChamberDialog
            lot={lotToStore}
            open={isStoreDialogOpen}
            onOpenChange={setStoreDialogOpen}
            onStore={handleStoreInChamber}
        />
      )}
    </div>
  );
}
