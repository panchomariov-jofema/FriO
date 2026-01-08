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
import { doc, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { chambersConfig } from '@/lib/chambers-config';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

// Helper for natural sorting (e.g., A1, A2, ... A10)
const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1], 10);
  const bNum = parseInt(b.split(re)[1], 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];

  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;

  return aNum - bNum;
};


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
        if (!acc[lot.chamberId!][lot.coordinate!]) {
          acc[lot.chamberId!][lot.coordinate!] = [];
        }
        acc[lot.chamberId!][lot.coordinate!].push(lot);
        return acc;
    }, {} as Record<string, Record<string, ChamberLot[]>>);

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
  
  const findNextAvailableCoordinate = (chamberId: string, lotToPlace: ChamberLot, allStoredLots: ChamberLot[]): string | null => {
      const chamberConfig = chambersConfig[chamberId];
      if (!chamberConfig) return null;

      const storedInChamber = allStoredLots.filter(l => l.chamberId === chamberId && l.coordinate);
      const occupiedCoordinates = storedInChamber.reduce((acc, lot) => {
          if (!acc[lot.coordinate!]) acc[lot.coordinate!] = [];
          acc[lot.coordinate!].push(lot);
          return acc;
      }, {} as Record<string, ChamberLot[]>);
      
      const allPossibleCoordinates = chamberConfig.columns
          .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
          .sort(naturalSort);

      // 1. Try to find a partially filled coordinate with the SAME lot
      for (const coord of allPossibleCoordinates) {
          const lotsInCoord = occupiedCoordinates[coord];
          if (lotsInCoord && lotsInCoord.length > 0) {
              const isSameLot = lotsInCoord.every(l => l.displayLotId === lotToPlace.displayLotId);
              if (isSameLot) {
                  const binsInCoord = lotsInCoord.reduce((sum, l) => sum + l.binCount, 0);
                  if (binsInCoord + lotToPlace.binCount <= 6) {
                      return coord;
                  }
              }
          }
      }

      // 2. If not found, find the first completely empty coordinate
      for (const coord of allPossibleCoordinates) {
          if (!occupiedCoordinates[coord]) {
              if (lotToPlace.binCount <= 6) {
                return coord;
              }
          }
      }

      return null; // No space found
  }

  const handleStoreInChamber = async ({ chamberId }: { chamberId: string; }) => {
    if (!lotToStore || !firestore || !chamberLots) return;
    
    const coordinate = findNextAvailableCoordinate(chamberId, lotToStore, chamberLots);

    if (!coordinate) {
        toast({ variant: 'destructive', title: 'Error', description: `No hay espacio disponible en ${chambersConfig[chamberId].name}.` });
        return;
    }

    const originalLotRef = doc(firestore, 'chamberLots', lotToStore.id);
    const binsToStore = lotToStore.binCount;
    let remainingBins = binsToStore;

    try {
        const batch = writeBatch(firestore);

        const existingLotsInCoord = (storedLotsByChamber[chamberId]?.[coordinate] || []).filter(l => l.displayLotId === lotToStore.displayLotId);
        const binsInCoord = existingLotsInCoord.reduce((sum, l) => sum + l.binCount, 0);
        const availableSpace = 6 - binsInCoord;

        if (binsToStore <= availableSpace) {
            // Fits completely in the coordinate
            const updateData = {
              chamberId,
              coordinate,
              status: 'Almacenado' as const,
            };
            batch.update(originalLotRef, updateData);
        } else {
            // Does not fit, split the lot
            const binsForThisCoord = availableSpace;
            const binsForNewLot = binsToStore - availableSpace;

            if (binsForThisCoord > 0) {
              // Create a new lot for the part that fits
               const newLotForCoordData = {
                    ...lotToStore,
                    id: undefined, // Let firestore generate id
                    binCount: binsForThisCoord,
                    chamberId,
                    coordinate,
                    status: 'Almacenado' as const,
                };
                const newLotRef = doc(collection(firestore, 'chamberLots'));
                batch.set(newLotRef, newLotForCoordData);
            }
            
            // Update the original lot with the remaining bins
            batch.update(originalLotRef, { binCount: binsForNewLot });
        }
       
        await batch.commit();
        toast({ title: 'Éxito', description: `Lote asignado a ${chambersConfig[chamberId].name} - ${coordinate}.` });
    } catch(e: any) {
        console.error("Error al almacenar en cámara: ", e);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al guardar.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'chamberLots',
            operation: 'write'
        }));
    } finally {
      setStoreDialogOpen(false);
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
                                    {config.rows.map(row =>
                                        config.columns.map(col => {
                                            const coord = `${col}${row}`;
                                            const lotsInCoord = storedLotsByChamber[chamberId]?.[coord] || [];
                                            const isOccupied = lotsInCoord.length > 0;
                                            const totalBinsInCoord = isOccupied ? lotsInCoord.reduce((sum, lot) => sum + lot.binCount, 0) : 0;
                                            const occupancyPercentage = isOccupied ? (totalBinsInCoord / 6) * 100 : 0;
                                            const firstLot = isOccupied ? lotsInCoord[0] : null;

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
                                                     {isOccupied && firstLot && (
                                                        <TooltipContent>
                                                            <p>Lote: {firstLot.displayLotId}</p>
                                                            <p>Productor: {firstLot.producerShortName}</p>
                                                            <p>Bins: {totalBinsInCoord} / 6</p>
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
        />
      )}
    </div>
  );
}
