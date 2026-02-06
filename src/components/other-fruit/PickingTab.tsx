
'use client';

import * as React from 'react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception, OtherClient, OtherFruitMovementLocation, PackagingMovement, PackagingReception } from '@/lib/types';
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
import { PackagingPickingDialog } from '../packaging/PackagingPickingDialog';
import { packagingExitSchema } from '@/lib/schemas';
import { z } from 'zod';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

type ConsolidatedMovement = (OtherFruitMovement & { taskType: 'fruit' }) | (PackagingMovement & { taskType: 'packaging' });

export function OtherFruitPickingTab() {
  const { data: otherFruitMovements, loading: loadingFruitMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
  const { data: packagingMovements, loading: loadingPackagingMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [pickingMovement, setPickingMovement] = React.useState<ConsolidatedMovement | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const pendingMovements = React.useMemo((): ConsolidatedMovement[] => {
    const fruitTasks: ConsolidatedMovement[] = (otherFruitMovements || [])
      .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking')
      .map(m => ({ ...m, taskType: 'fruit' }));

    const packagingTasks: ConsolidatedMovement[] = (packagingMovements || [])
      .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking')
      .map(m => ({ ...m, taskType: 'packaging' }));

    return [...fruitTasks, ...packagingTasks]
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [otherFruitMovements, packagingMovements]);

  const clientMap = React.useMemo(() => {
    return (allClients || []).reduce((acc, client) => {
        acc[client.clientId] = client.name;
        return acc;
    }, {} as Record<string,string>)
  }, [allClients]);
  
  const handleStartPicking = (movement: ConsolidatedMovement) => {
    setPickingMovement(movement);
  };
  
  const handleConfirmFruitExit = async (confirmedMovement: OtherFruitMovement) => {
    if (!firestore || !confirmedMovement) return;
    setIsConfirming(true);

    try {
        const batch = writeBatch(firestore);
        
        const movementRef = doc(firestore, 'otherFruitMovements', confirmedMovement.id);
        batch.update(movementRef, { 
            status: 'Completado',
            items: confirmedMovement.items,
        });

        const receptionUpdates = new Map<string, { ref: any, items: any[] }>();
        (confirmedMovement.locations || []).forEach(loc => {
            if (!receptionUpdates.has(loc.receptionId)) {
                const receptionDoc = allReceptions.find(r => r.id === loc.receptionId);
                if (receptionDoc) {
                    receptionUpdates.set(loc.receptionId, {
                        ref: doc(firestore, 'otherFruitReceptions', loc.receptionId),
                        items: JSON.parse(JSON.stringify(receptionDoc.items))
                    });
                }
            }
            
            const update = receptionUpdates.get(loc.receptionId);
            if (update) {
                const itemToUpdate = update.items[loc.itemIndex];
                if (itemToUpdate && itemToUpdate.quantity >= loc.quantity) {
                    itemToUpdate.quantity -= loc.quantity;
                    if (itemToUpdate.quantity === 0) itemToUpdate.status = 'Despachado';
                }
            }
        });

        receptionUpdates.forEach(update => {
            batch.update(update.ref, { items: update.items, updatedAt: serverTimestamp() });
        });
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de fruta confirmada y stock actualizado.' });
        setPickingMovement(null);

    } catch (error) {
        console.error("Error confirming fruit exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la salida.' });
    } finally {
        setIsConfirming(false);
    }
  };

  const handleConfirmPackagingExit = async (confirmedPayload: ExitFormValues) => {
    if (!firestore || !pickingMovement) return;
    setIsConfirming(true);
    
    try {
        const batch = writeBatch(firestore);
        const movementRef = doc(firestore, 'packagingMovements', pickingMovement.id);
        batch.update(movementRef, { status: 'Completado' });
        
        for(const item of confirmedPayload.items) {
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
    } catch (error) {
        console.error("Error confirming packaging exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la salida.' });
    } finally {
        setIsConfirming(false);
    }
  };


  const loading = loadingFruitMovements || loadingPackagingMovements || loadingReceptions || loadingClients;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tareas de Picking Pendientes</CardTitle>
          <CardDescription>Lista de solicitudes de despacho (Fruta y Embalajes) que deben ser verificadas por el operador de bodega.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Solicitud</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
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
                      <TableCell>
                        <Badge variant={mov.taskType === 'fruit' ? 'outline' : 'default'}>
                            {mov.taskType === 'fruit' ? 'Fruta' : 'Embalaje'}
                        </Badge>
                      </TableCell>
                      <TableCell>{(mov as any).clientName || clientMap[mov.clientId]}</TableCell>
                      <TableCell>{mov.items.reduce((sum, item) => sum + (item as any).quantity || (item as any).palletCount, 0)} {(mov as any).unit || 'pallets'}</TableCell>
                      <TableCell><Badge variant="secondary">{mov.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleStartPicking(mov)}>Hacer Picking</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay tareas de picking pendientes.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {pickingMovement?.taskType === 'fruit' && (
        <OtherFruitPickingDialog
          movement={pickingMovement as OtherFruitMovement}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmExit={handleConfirmFruitExit}
          isConfirming={isConfirming}
        />
      )}
       {pickingMovement?.taskType === 'packaging' && (
        <PackagingPickingDialog 
          movement={pickingMovement as PackagingMovement}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmExit={handleConfirmPackagingExit}
          isConfirming={isConfirming}
          clientName={clientMap[pickingMovement.clientId] || ''}
          allReceptions={allReceptions || []}
          loadingReceptions={loadingReceptions}
        />
      )}
    </>
  );
}
