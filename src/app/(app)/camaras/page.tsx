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
import { chambersConfig } from '@/lib/chambers-config';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export default function CamarasPage() {
  const { data: chamberLots, loading } = useFirestoreCollection<ChamberLot>('chamberLots');
  const [lotToStore, setLotToStore] = React.useState<ChamberLot | null>(null);
  const [isStoreDialogOpen, setStoreDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const { pendingLots, storedLotsByChamber, chamberOccupancy } = React.useMemo(() => {
    if (!chamberLots) return { pendingLots: [], storedLotsByChamber: {}, chamberOccupancy: {} };
    
    const pending = chamberLots
      .filter((lot) => lot.status === 'Pendiente por Almacenar')
      .sort((a, b) => b.storedAt && a.storedAt ? b.storedAt.toMillis() - a.storedAt.toMillis() : 0);
      
    const storedByChamber = chamberLots
      .filter((lot) => lot.status === 'Almacenado' && lot.chamberId && lot.coordinate)
      .reduce((acc, lot) => {
        if (!acc[lot.chamberId!]) {
          acc[lot.chamberId!] = {};
        }
        acc[lot.chamberId!][lot.coordinate!] = lot;
        return acc;
    }, {} as Record<string, Record<string, ChamberLot>>);

    const occupancy = Object.keys(chambersConfig).reduce((acc, chamberId) => {
        const lotsInChamber = chamberLots.filter(lot => lot.chamberId === chamberId && lot.status === 'Almacenado');
        const totalBins = lotsInChamber.reduce((sum, lot) => sum + lot.binCount, 0);
        acc[chamberId] = {
            occupied: totalBins,
            total: chambersConfig[chamberId].capacity,
            percentage: (totalBins / chambersConfig[chamberId].capacity) * 100,
        };
        return acc;
    }, {} as Record<string, {occupied: number; total: number; percentage: number}>);

    return { pendingLots: pending, storedLotsByChamber: storedByChamber, chamberOccupancy: occupancy };
  }, [chamberLots]);


  const handleStoreClick = (lot: ChamberLot) => {
    setLotToStore(lot);
    setStoreDialogOpen(true);
  };

  const handleStoreInChamber = async ({ chamberId, coordinate }: { chamberId: string; coordinate: string; }) => {
    if (!lotToStore || !firestore) return;
    
    const lotRef = doc(firestore, 'chamberLots', lotToStore.id);
    const updateData = {
      chamberId,
      coordinate,
      status: 'Almacenado' as const,
      storedAt: serverTimestamp(),
    };

    try {
      await updateDoc(lotRef, updateData);
      toast({ title: 'Éxito', description: `Lote almacenado en ${chamberId} - ${coordinate}.` });
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
                      <TableCell><Badge variant='secondary'>{lot.status}</Badge></TableCell>
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
          <CardTitle>Estado de Cámaras</CardTitle>
          <CardDescription>Ocupación y distribución de los lotes en las cámaras de frío.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {Object.entries(chambersConfig).map(([chamberId, config]) => (
                <AccordionItem value={chamberId} key={chamberId}>
                    <AccordionTrigger>
                        <div className="flex w-full items-center justify-between pr-4">
                            <span className="text-lg font-semibold">{config.name}</span>
                            <div className="text-right">
                                <p className={cn("font-mono font-semibold", (chamberOccupancy[chamberId]?.percentage ?? 0) > 50 ? 'text-destructive' : 'text-foreground')}>
                                    {chamberOccupancy[chamberId]?.occupied ?? 0} / {config.capacity} Bins
                                </p>
                                <Progress value={chamberOccupancy[chamberId]?.percentage ?? 0} className="w-32 h-2 mt-1" />
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <TooltipProvider>
                            <div className="p-4 bg-muted/50 rounded-lg border">
                                <div className="grid gap-1" style={{gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))`}}>
                                    {config.columns.map(col =>
                                        config.rows.map(row => {
                                            const coord = `${col}${row}`;
                                            const lot = storedLotsByChamber[chamberId]?.[coord];
                                            const isOccupied = !!lot;
                                            const occupancyPercentage = lot ? (lot.binCount / 6) * 100 : 0;
                                            return (
                                                <Tooltip key={coord}>
                                                    <TooltipTrigger asChild>
                                                        <div className={cn("h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden",
                                                            isOccupied ? 'bg-primary/20 border-primary/50' : 'bg-background border-dashed'
                                                        )}>
                                                          <div className="absolute bottom-0 left-0 top-0 bg-primary/30" style={{ right: `${100 - occupancyPercentage}%` }} />
                                                          <span className="relative z-10 font-semibold">{coord}</span>
                                                        </div>
                                                    </TooltipTrigger>
                                                     {isOccupied && (
                                                        <TooltipContent>
                                                            <p>Lote: {lot.displayLotId}</p>
                                                            <p>Productor: {lot.producerShortName}</p>
                                                            <p>Bins: {lot.binCount} / 6</p>
                                                        </TooltipContent>
                                                    )}
                                                </Tooltip>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        </TooltipProvider>
                    </AccordionContent>
                </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {lotToStore && (
        <StoreInChamberDialog
            lot={lotToStore}
            open={isStoreDialogOpen}
            onOpenChange={setStoreDialogOpen}
            onStore={handleStoreInChamber}
            storedLots={chamberLots.filter(l => l.status === 'Almacenado')}
        />
      )}
    </div>
  );
}
