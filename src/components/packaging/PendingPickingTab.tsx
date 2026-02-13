'use client';

import * as React from 'react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingMovement, PackagingReception, OtherClient } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { PackagingPickingDialog } from './PackagingPickingDialog';

export function PendingPickingTab() {
  const { data: allMovements, loading: loadingMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [pickingMovement, setPickingMovement] = React.useState<PackagingMovement | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const pendingMovements = React.useMemo(() => {
    return (allMovements || [])
      .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking')
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [allMovements]);
  
  const clientMap = React.useMemo(() => {
    return (allClients || []).reduce((acc, client) => {
        acc[client.clientId] = client.name;
        return acc;
    }, {} as Record<string,string>)
  }, [allClients]);

  const handleStartPicking = (movement: PackagingMovement) => {
    setPickingMovement(movement);
  };
  
  const handleConfirmExit = async (confirmedMovement: PackagingMovement) => {
    if (!firestore || !confirmedMovement) return;
    setIsConfirming(true);
    
    try {
        const batch = writeBatch(firestore);
        const movementRef = doc(firestore, 'packagingMovements', confirmedMovement.id);
        batch.update(movementRef, { status: 'Completado' });
        
        for(const item of confirmedMovement.items) {
            if (item.locations) {
              for(const loc of item.locations) {
                if (loc.palletsToWithdraw > 0) {
                    const receptionDoc = allReceptions.find(r => r.id === loc.receptionId);
                    if (receptionDoc) {
                        const receptionRef = doc(firestore, 'packagingReceptions', loc.receptionId);
                        const newItems = JSON.parse(JSON.stringify(receptionDoc.items));
                        const itemToUpdate = newItems[loc.itemIndex];

                        if (itemToUpdate && itemToUpdate.palletCount >= loc.palletsToWithdraw) {
                            itemToUpdate.palletCount -= loc.palletsToWithdraw;
                        } else {
                            // This should ideally not happen if the creation logic is correct
                            throw new Error(`Stock insuficiente en la ubicación para ${item.packagingMasterCode}.`);
                        }
                        batch.update(receptionRef, { items: newItems, updatedAt: serverTimestamp() });
                    }
                }
              }
            }
        }
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de embalaje confirmada y stock actualizado.' });
        setPickingMovement(null);
    } catch (error: any) {
        console.error("Error confirming packaging exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo confirmar la salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingMovements or packagingReceptions',
            operation: 'write'
        }));
    } finally {
        setIsConfirming(false);
    }
  };


  const loading = loadingMovements || loadingReceptions || loadingClients;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Despachos Pendientes de Picking</CardTitle>
          <CardDescription>Lista de solicitudes de despacho que deben ser verificadas y confirmadas por el operador de bodega.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Solicitud</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Documento</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : pendingMovements.length > 0 ? (
                  pendingMovements.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell>{mov.createdAt?.toDate().toLocaleString() ?? 'N/A'}</TableCell>
                      <TableCell>{clientMap[mov.clientId] || mov.clientId}</TableCell>
                      <TableCell className="hidden sm:table-cell">{mov.document}</TableCell>
                      <TableCell>{mov.items.reduce((sum, item) => sum + item.palletCount, 0)} pallets</TableCell>
                      <TableCell><Badge variant="secondary">{mov.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleStartPicking(mov)}>Hacer Picking</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay salidas pendientes de picking.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {pickingMovement && (
        <PackagingPickingDialog 
          movement={pickingMovement}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmExit={handleConfirmExit}
          isConfirming={isConfirming}
          clientName={clientMap[pickingMovement.clientId] || ''}
          allReceptions={allReceptions}
          loadingReceptions={loadingReceptions}
        />
      )}
    </>
  );
}
