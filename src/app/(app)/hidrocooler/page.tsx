'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { HidrocoolerLot, ProcessingLot } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProcessLotDialog } from '@/components/hidrocooler/ProcessLotDialog';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function HidrocoolerPage() {
  const { data: pendingLots, loading: loadingPending } = useFirestoreCollection<HidrocoolerLot>('hidrocoolerLots');
  const [processingLots, setProcessingLots] = React.useState<ProcessingLot[]>([]);
  const [selectedLot, setSelectedLot] = React.useState<HidrocoolerLot | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
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
  
  const handleProcessClick = (lot: HidrocoolerLot) => {
    setSelectedLot(lot);
    setDialogOpen(true);
  };

  const handleStartProcessing = async ({ hidrocooler, binCount }: { hidrocooler: string, binCount: number }) => {
    if (!selectedLot || !firestore) return;

    const originalLotRef = doc(firestore, 'hidrocoolerLots', selectedLot.id);

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
           
            const newProcessingLot: ProcessingLot = {
                id: `${selectedLot.id}-${Date.now()}`,
                originalLotId: selectedLot.id,
                displayLotId: selectedLot.displayLotId,
                producerShortName: selectedLot.producerShortName,
                binCount: binCount,
                hidrocooler,
                status: 'En Proceso',
                createdAt: serverTimestamp(),
            };
            setProcessingLots(prev => [...prev, newProcessingLot]);
        });
        
        toast({ title: "Éxito", description: `${binCount} bins del lote ${selectedLot.displayLotId} enviados a ${hidrocooler}.` });

    } catch (e: any) {
        console.error("Error al procesar el lote: ", e);
        toast({ variant: 'destructive', title: 'Error', description: e.toString() });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: `hidrocoolerLots/${selectedLot.id}`,
              operation: 'update',
              requestResourceData: { binCount: selectedLot.binCount - binCount },
            })
        );
    }
  };
  
  const handleFinishProcessing = (processingLotId: string) => {
    setProcessingLots(prev => prev.map(lot => 
        lot.id === processingLotId ? { ...lot, status: 'Finalizado' } : lot
    ));
    // Aquí iría la lógica para pasar al módulo "Cámaras"
    toast({ title: "Proceso Finalizado", description: "El lote está listo para ser movido a Cámaras." });
  };


  const getStatusVariant = (status: HidrocoolerLot['status'] | ProcessingLot['status']) => {
    switch (status) {
      case 'Pendiente de Pre-Hidro': return 'secondary';
      case 'En Proceso': return 'outline';
      case 'Finalizado': return 'default';
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
          <CardTitle>Lotes en Proceso</CardTitle>
          <CardDescription>Fracciones de lotes que se están enfriando actualmente.</CardDescription>
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
                {processingLots.length > 0 ? (
                  processingLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                      <TableCell>{lot.hidrocooler}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {lot.status === 'En Proceso' ? (
                          <Button size="sm" onClick={() => handleFinishProcessing(lot.id)}>Finalizar Proceso</Button>
                        ) : (
                          <Button size="sm" disabled>Finalizado</Button>
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

      {selectedLot && (
        <ProcessLotDialog
          lot={selectedLot}
          open={isDialogOpen}
          onOpenChange={setDialogOpen}
          onProcess={handleStartProcessing}
        />
      )}
    </div>
  );
}