'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { HidrocoolerLot, ProcessingLot, ReceptionLot } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProcessLotDialog } from '@/components/hidrocooler/ProcessLotDialog';
import { collection, doc, runTransaction, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { EditProcessingLotDialog } from '@/components/hidrocooler/EditProcessingLotDialog';
import { Pencil } from 'lucide-react';

export default function HidrocoolerPage() {
  const { data: pendingLots, loading: loadingPending } = useFirestoreCollection<HidrocoolerLot>('hidrocoolerLots');
  const { data: processingLots, loading: loadingProcessing } = useFirestoreCollection<ProcessingLot>('processingLots');
  // Need to get reception lot to get variety
  const { data: receptionLots } = useFirestoreCollection<ReceptionLot>('receptionLots');

  const [lotToProcess, setLotToProcess] = React.useState<HidrocoolerLot | null>(null);
  const [lotToEdit, setLotToEdit] = React.useState<ProcessingLot | null>(null);
  const [isProcessDialogOpen, setProcessDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = React.useState(false);
  const [showOnlyOpen, setShowOnlyOpen] = React.useState(true);


  const firestore = useFirestore();
  const { toast } = useToast();

  const sortedPendingLots = React.useMemo(() => {
    if (!pendingLots) return [];
    return pendingLots.filter(l => l.status === 'Pendiente de Pre-Hidro').sort((a, b) => {
        if (!b.createdAt) return -1;
        if (!a.createdAt) return 1;
        return a.createdAt.toMillis() - b.createdAt.toMillis();
    });
  }, [pendingLots]);

  const filteredProcessingLots = React.useMemo(() => {
    if (!processingLots) return [];
    const sorted = [...processingLots].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    if (showOnlyOpen) {
      return sorted.filter(lot => lot.status === 'En Proceso');
    }
    return sorted;
  }, [processingLots, showOnlyOpen]);
  
  const handleProcessClick = (lot: HidrocoolerLot) => {
    setLotToProcess(lot);
    setProcessDialogOpen(true);
  };
  
  const handleEditClick = (lot: ProcessingLot) => {
    setLotToEdit(lot);
    setEditDialogOpen(true);
  };

  const handleStartProcessing = async ({ hidrocooler, binCount }: { hidrocooler: string, binCount: number }) => {
    if (!lotToProcess || !firestore) return;

    const originalLotRef = doc(firestore, 'hidrocoolerLots', lotToProcess.id);
    const processingLotsRef = collection(firestore, 'processingLots');

    try {
        await runTransaction(firestore, async (transaction) => {
            const lotDoc = await transaction.get(originalLotRef);
            if (!lotDoc.exists()) {
                throw "El lote original no existe.";
            }

            const currentBinCount = lotDoc.data().binCount;
            if (binCount > currentBinCount) {
                throw "La cantidad de bins a procesar excede la disponible.";
            }

            const remainingBins = currentBinCount - binCount;
            
            if (remainingBins > 0) {
                 transaction.update(originalLotRef, { binCount: remainingBins });
            } else {
                 transaction.delete(originalLotRef);
            }
           
            const newProcessingLot = {
                originalLotId: lotToProcess.id,
                displayLotId: lotToProcess.displayLotId,
                producerShortName: lotToProcess.producerShortName,
                binCount: binCount,
                hidrocooler,
                status: 'En Proceso' as const,
                createdAt: serverTimestamp(),
            };
            
            // We can't use addDoc in a transaction, so we create a ref and set it.
            const newProcessingLotRef = doc(processingLotsRef);
            transaction.set(newProcessingLotRef, newProcessingLot);
        });
        
        toast({ title: "Éxito", description: `${binCount} bins del lote ${lotToProcess.displayLotId} enviados a ${hidrocooler}.` });

    } catch (e: any) {
        console.error("Error al procesar el lote: ", e);
        const errPath = e.message.includes('permission-denied') ? `processingLots` : `hidrocoolerLots/${lotToProcess.id}`;
        toast({ variant: 'destructive', title: 'Error', description: e.toString() });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: errPath,
              operation: 'write',
              requestResourceData: { originalLotId: lotToProcess.id, hidrocooler },
            })
        );
    }
  };
  
  const handleFinishProcessingClick = async (processingLot: ProcessingLot) => {
    if (!firestore || !receptionLots) return;

    const originalReceptionLot = receptionLots.find(lot => lot.displayLotId === processingLot.displayLotId);
    if (!originalReceptionLot) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar el lote de recepción original para obtener la variedad.' });
        return;
    }

    const chamberLotData = {
        displayLotId: processingLot.displayLotId,
        producerShortName: processingLot.producerShortName,
        exporterId: originalReceptionLot.exporterId, // Propagate exporterId
        variety: originalReceptionLot.variety,
        binCount: processingLot.binCount,
        hidrocooler: processingLot.hidrocooler,
        status: 'Pendiente por Almacenar' as const,
        storedAt: serverTimestamp(),
    };
    
    const chamberLotsRef = collection(firestore, 'chamberLots');
    
    try {
        await addDoc(chamberLotsRef, chamberLotData);
        
        const processingLotRef = doc(firestore, 'processingLots', processingLot.id);
        await updateDoc(processingLotRef, { status: 'Finalizado' });

        toast({ title: "Proceso Finalizado", description: `Lote enviado a Cámaras para ser almacenado.` });
    } catch(error) {
        console.error("Error al finalizar proceso y enviar a cámara: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo mover el lote a cámaras.' });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: chamberLotsRef.path,
              operation: 'create',
              requestResourceData: chamberLotData,
            })
        );
    }
  };
  
  const handleUpdateProcessingBinCount = async ({ newBinCount }: { newBinCount: number }) => {
    if (!lotToEdit || !firestore) return;
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const processingLotRef = doc(firestore, 'processingLots', lotToEdit.id);
            const originalPendingLotRef = doc(firestore, 'hidrocoolerLots', lotToEdit.originalLotId);

            const processingLotDoc = await transaction.get(processingLotRef);
            if (!processingLotDoc.exists()) throw "El lote en proceso no existe.";
            
            const originalPendingLotDoc = await transaction.get(originalPendingLotRef);
            // It might not exist if it was fully consumed, which is fine.

            const currentProcessingBins = processingLotDoc.data().binCount;
            const currentPendingBins = originalPendingLotDoc.exists() ? originalPendingLotDoc.data().binCount : 0;
            
            const difference = newBinCount - currentProcessingBins;

            if (difference > currentPendingBins) {
                throw `No puede aumentar en ${difference} bins. Solo hay ${currentPendingBins} bins disponibles en el lote pendiente.`;
            }

            // Update processing lot
            transaction.update(processingLotRef, { binCount: newBinCount });

            // Update original pending lot
            const newPendingBinCount = currentPendingBins - difference;
            if (originalPendingLotDoc.exists()) {
                 if (newPendingBinCount > 0) {
                    transaction.update(originalPendingLotRef, { binCount: newPendingBinCount });
                } else {
                    transaction.delete(originalPendingLotRef);
                }
            } else if (newPendingBinCount > 0) {
                // The original lot was deleted because it was fully consumed. We need to recreate it.
                const originalReceptionLot = receptionLots.find(l => l.displayLotId === lotToEdit.displayLotId);
                if (!originalReceptionLot) throw "No se pudo encontrar el lote de recepción original para recrear el lote pendiente.";

                transaction.set(originalPendingLotRef, {
                    displayLotId: originalReceptionLot.displayLotId,
                    producerShortName: originalReceptionLot.producerId, // This might need adjustment if you store the short name elsewhere
                    binCount: newPendingBinCount,
                    status: 'Pendiente de Pre-Hidro',
                    createdAt: originalReceptionLot.createdAt, // Or a new timestamp
                });
            }
        });

        toast({ title: 'Éxito', description: `La cantidad de bins se ha actualizado a ${newBinCount}.` });

    } catch (e: any) {
        console.error("Error actualizando bins en lote en proceso: ", e);
        toast({ variant: 'destructive', title: 'Error al actualizar', description: e.toString() });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `processingLots/${lotToEdit.id} or hidrocoolerLots/${lotToEdit.originalLotId}`,
            operation: 'write',
        }));
    } finally {
        setEditDialogOpen(false);
    }
  };


  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Pendiente de Pre-Hidro': return 'secondary';
      case 'En Proceso': return 'outline';
      case 'Finalizado':
      case 'Almacenado':
        return 'default';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Módulo de Hidrocooler - Lotes Pendientes</CardTitle>
          <CardDescription>Lotes que han ingresado desde Recepción y están pendientes de procesar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Lote</TableHead>
                  <TableHead>Productor</TableHead>
                  <TableHead>Cantidad de Bins</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPending ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : sortedPendingLots.length > 0 ? (
                  sortedPendingLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                      <TableCell>{lot.producerShortName}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleProcessClick(lot)}>Procesar</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay lotes pendientes.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle>Lotes en Proceso</CardTitle>
                    <CardDescription>Fracciones de lotes que se están enfriando actualmente.</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="show-open-processing" checked={showOnlyOpen} onCheckedChange={(checked) => setShowOnlyOpen(!!checked)} />
                    <Label htmlFor="show-open-processing">Mostrar solo lotes abiertos</Label>
                </div>
            </div>
        </CardHeader>
        <CardContent>
           <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Lote</TableHead>
                  <TableHead>Hidrocooler</TableHead>
                  <TableHead>Cantidad de Bins</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                 {loadingProcessing ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : filteredProcessingLots.length > 0 ? (
                  filteredProcessingLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                      <TableCell>{lot.hidrocooler}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {lot.status === 'En Proceso' ? (
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleEditClick(lot)}>
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Editar</span>
                            </Button>
                            <Button size="sm" onClick={() => handleFinishProcessingClick(lot)}>Finalizar Proceso</Button>
                          </div>
                        ) : (
                           <span className="text-sm text-muted-foreground">Finalizado</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay lotes en proceso.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {lotToProcess && (
        <ProcessLotDialog
          lot={lotToProcess}
          open={isProcessDialogOpen}
          onOpenChange={setProcessDialogOpen}
          onProcess={handleStartProcessing}
        />
      )}

      {lotToEdit && (
        <EditProcessingLotDialog
          lot={lotToEdit}
          open={isEditDialogOpen}
          onOpenChange={setEditDialogOpen}
          onConfirm={handleUpdateProcessingBinCount}
          pendingLots={pendingLots}
        />
      )}
    </div>
  );
}
