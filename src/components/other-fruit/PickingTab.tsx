'use client';

import * as React from 'react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception, OtherClient } from '@/lib/types';
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
import { OtherFruitPickingDialog } from './OtherFruitPickingDialog';

export function OtherFruitPickingTab() {
  const { data: allMovements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [pickingMovement, setPickingMovement] = React.useState<OtherFruitMovement | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const pendingMovements = React.useMemo(() => {
    return (allMovements || [])
      .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking')
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [allMovements]);
  
  const handleStartPicking = (movement: OtherFruitMovement) => {
    setPickingMovement(movement);
  };
  
  const handleConfirmExit = async (confirmedMovement: OtherFruitMovement) => {
    if (!firestore || !confirmedMovement) return;
    setIsConfirming(true);

    try {
        const batch = writeBatch(firestore);
        
        // 1. Update the status of the OtherFruitMovement document
        const movementRef = doc(firestore, 'otherFruitMovements', confirmedMovement.id);
        batch.update(movementRef, { 
            status: 'Completado',
            items: confirmedMovement.items, // Update items with actual picked quantities
        });

        // 2. Update the stock in the OtherFruitReception documents
        for(const location of confirmedMovement.locations || []) {
            const receptionDoc = allReceptions.find(r => r.id === location.receptionId);
            if (receptionDoc) {
                const receptionRef = doc(firestore, 'otherFruitReceptions', location.receptionId);
                const newItems = JSON.parse(JSON.stringify(receptionDoc.items));
                const itemToUpdate = newItems[location.itemIndex];

                if (itemToUpdate && itemToUpdate.quantity >= location.quantity) {
                    itemToUpdate.quantity -= location.quantity;
                    if (itemToUpdate.quantity === 0) {
                        // Instead of removing, we mark as dispatched to keep historical record if needed
                        itemToUpdate.status = 'Despachado';
                    }
                }
                batch.update(receptionRef, { items: newItems, updatedAt: serverTimestamp() });
            }
        }
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de fruta confirmada y stock actualizado.' });
        setPickingMovement(null);

    } catch (error) {
        console.error("Error confirming fruit exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'otherFruitMovements or otherFruitReceptions',
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
          <CardDescription>Lista de solicitudes de despacho de fruta que deben ser verificadas y confirmadas por el operador de bodega.</CardDescription>
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
                      <TableCell>{mov.createdAt.toDate().toLocaleString()}</TableCell>
                      <TableCell>{mov.clientName}</TableCell>
                      <TableCell className="hidden sm:table-cell">{mov.document}</TableCell>
                      <TableCell>{mov.items.reduce((sum, item) => sum + item.quantity, 0)} {mov.unit}</TableCell>
                      <TableCell><Badge variant="secondary">{mov.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleStartPicking(mov)}>Hacer Picking</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay despachos pendientes de picking.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {pickingMovement && (
        <OtherFruitPickingDialog
          movement={pickingMovement}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmExit={handleConfirmExit}
          isConfirming={isConfirming}
        />
      )}
    </>
  );
}

    