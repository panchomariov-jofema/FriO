'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, Exporter, OtherFruitReception, StoredItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoreInChamberDialog } from '@/components/hidrocooler/StoreInChamberDialog';
import { collection, doc, writeBatch, getDocs, updateDoc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { chambersConfig } from '@/lib/chambers-config';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { RelocateDialog } from '@/components/hidrocooler/RelocateDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { ExternalReceptionUploader } from '@/components/hidrocooler/ExternalReceptionUploader';

// Helper for natural sorting (e.g., A1, A2, ... A10)
const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1] || '0', 10);
  const bNum = parseInt(b.split(re)[1] || '0', 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];

  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;

  return aNum - bNum;
};

// Colors for lots
const lotColorPalette = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const lotColorMap = new Map<string, string>();
let nextColorIndex = 0;

const getColorForLot = (lotId: string) => {    
    if (!lotColorMap.has(lotId)) {
        lotColorMap.set(lotId, lotColorPalette[nextColorIndex]);
        nextColorIndex = (nextColorIndex + 1) % lotColorPalette.length;
    }
    return lotColorMap.get(lotId)!;
};


export default function CamarasPage() {
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const [lotToStore, setLotToStore] = React.useState<ChamberLot | null>(null);
  const [itemToRelocate, setItemToRelocate] = React.useState<StoredItem | null>(null);
  const [isStoreDialogOpen, setStoreDialogOpen] = React.useState(false);
  const [isRelocateDialogOpen, setRelocateDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const loading = loadingChamberLots || loadingOtherFruit || loadingExporters;

  const { pendingLots, storedItemsByChamber, chamberOccupancy, totalNetWeightInStock, exporterMap } = React.useMemo(() => {
    const allChamberLots = chamberLots || [];
    const allOtherFruitReceptions = otherFruitReceptions || [];

    const calculatedExporterMap = (exporters || []).reduce((acc, exp) => {
      acc[exp.exporterId] = exp.name;
      return acc;
    }, {} as Record<string, string>);

    const calculatedPendingLots = allChamberLots
      .filter((lot) => lot.status === 'Pendiente por Almacenar')
      .sort((a, b) => b.storedAt && a.storedAt ? b.storedAt.toMillis() - a.storedAt.toMillis() : 0);
      
    const allStoredItems: StoredItem[] = [
      ...allChamberLots
        .filter(lot => lot.status === 'Almacenado' && lot.chamberId && lot.coordinate && lot.binCount > 0)
        .map(lot => ({
            id: lot.id,
            type: 'producerLot' as const,
            displayId: lot.displayLotId,
            ownerName: lot.producerShortName,
            varietyOrProduct: lot.variety,
            quantity: lot.binCount,
            unit: 'Bins' as const,
            chamberId: lot.chamberId!,
            coordinate: lot.coordinate!,
            receptionId: null, // Not applicable for producer lots
            itemIndex: -1, // Not applicable
            netWeightPerBin: lot.netWeightPerBin || 0,
        })),
      ...allOtherFruitReceptions
        .flatMap(reception => reception.items
            .filter(item => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
            .map((item, index) => ({
                id: `${reception.id}-${index}`,
                type: 'otherFruit' as const,
                displayId: item.productCode,
                ownerName: reception.clientName,
                varietyOrProduct: item.productName,
                quantity: item.quantity,
                unit: reception.unit,
                chamberId: item.storageLocation!.chamberId,
                coordinate: item.storageLocation!.coordinate,
                receptionId: reception.id,
                itemIndex: index,
                netWeightPerBin: 0, // Other fruit don't have this concept for now
            }))
        )
    ];
    
    const calculatedTotalNetWeight = allStoredItems
        .filter(item => item.type === 'producerLot')
        .reduce((sum, item) => sum + (item.quantity * (item.netWeightPerBin || 0)), 0);


    const calculatedStoredItemsByChamber = allStoredItems.reduce((acc, item) => {
        if (!acc[item.chamberId]) {
          acc[item.chamberId] = {};
        }
        if (!acc[item.chamberId][item.coordinate]) {
          acc[item.chamberId][item.coordinate] = [];
        }
        acc[item.chamberId][item.coordinate].push(item);
        return acc;
    }, {} as Record<string, Record<string, StoredItem[]>>);


    const calculatedChamberOccupancy = Object.keys(chambersConfig).reduce((acc, chamberId) => {
        const chamberConfig = chambersConfig[chamberId];
        const totalCapacity = chamberConfig.capacity;

        const binsInChamber = allChamberLots
            .filter(lot => lot.status === 'Almacenado' && lot.chamberId === chamberId && lot.binCount > 0)
            .reduce((sum, lot) => sum + lot.binCount, 0);

        const otherFruitInChamber = allOtherFruitReceptions
            .flatMap(r => r.items.map(item => ({ ...item, unit: r.unit, chamberId: item.storageLocation?.chamberId })))
            .filter(item => item.status === 'Almacenado' && item.chamberId === chamberId && item.quantity > 0);

        const otherBins = otherFruitInChamber
            .filter(item => item.unit === 'Bins')
            .reduce((sum, item) => sum + item.quantity, 0);

        const otherPallets = otherFruitInChamber
            .filter(item => item.unit === 'Pallets')
            .reduce((sum, item) => sum + item.quantity, 0);
        
        const occupiedEquivalentBins = binsInChamber + otherBins + (otherPallets * 2);

        acc[chamberId] = {
            occupied: occupiedEquivalentBins,
            total: totalCapacity,
            percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0,
        };
        return acc;
    }, {} as Record<string, {occupied: number; total: number; percentage: number}>);


    return { 
        pendingLots: calculatedPendingLots, 
        storedItemsByChamber: calculatedStoredItemsByChamber, 
        chamberOccupancy: calculatedChamberOccupancy,
        totalNetWeightInStock: calculatedTotalNetWeight,
        exporterMap: calculatedExporterMap,
    };
  }, [chamberLots, otherFruitReceptions, exporters]);


  const handleStoreClick = (lot: ChamberLot) => {
    setLotToStore(lot);
    setStoreDialogOpen(true);
  };
  
  const handleRelocateClick = (item: StoredItem) => {
    setItemToRelocate(item);
    setRelocateDialogOpen(true);
  }

  const handleStoreInChamber = async ({ chamberId }: { chamberId: string; }) => {
    if (!lotToStore || !firestore) return;

    const chamberConfig = chambersConfig[chamberId];
    const totalCapacity = chamberOccupancy[chamberId]?.total ?? 0;

    const allStoredLots = chamberLots || [];
    const storedInChamber = allStoredLots.filter(l => l.chamberId === chamberId && l.coordinate);
    const occupiedCoordinates = storedInChamber.reduce((acc, lot) => {
        if (lot.coordinate) {
          if (!acc[lot.coordinate]) acc[lot.coordinate] = [];
           acc[lot.coordinate].push(lot);
        }
        return acc;
    }, {} as Record<string, ChamberLot[]>);

    const allPossibleCoordinates = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);

    let binsToStore = lotToStore.binCount;
    const batch = writeBatch(firestore);
    
    // First, try to fill partially filled coordinates of the same lot
    for (const coord of allPossibleCoordinates) {
        if (binsToStore === 0) break;
        
        const lotsInCoord = occupiedCoordinates[coord];
        if (lotsInCoord && lotsInCoord.length > 0) {
            const isSameLot = lotsInCoord.every(l => l.displayLotId === lotToStore.displayLotId);
            if (isSameLot) {
                const binsInCoord = lotsInCoord.reduce((sum, l) => sum + l.binCount, 0);
                const spaceAvailable = 6 - binsInCoord;
                if (spaceAvailable > 0) {
                    const binsToAdd = Math.min(binsToStore, spaceAvailable);
                    
                    const newLotFractionRef = doc(collection(firestore, 'chamberLots'));
                    batch.set(newLotFractionRef, {
                        ...lotToStore,
                        id: newLotFractionRef.id,
                        binCount: binsToAdd,
                        chamberId: chamberId,
                        coordinate: coord,
                        status: 'Almacenado'
                    });
                    binsToStore -= binsToAdd;
                }
            }
        }
    }
    
    // Then, fill empty coordinates
    for (const coord of allPossibleCoordinates) {
        if (binsToStore === 0) break;

        if (!occupiedCoordinates[coord]) {
            const binsToAdd = Math.min(binsToStore, 6);
            
            const newLotFractionRef = doc(collection(firestore, 'chamberLots'));
            batch.set(newLotFractionRef, {
                ...lotToStore,
                id: newLotFractionRef.id,
                binCount: binsToAdd,
                chamberId: chamberId,
                coordinate: coord,
                status: 'Almacenado'
            });
            binsToStore -= binsToAdd;
        }
    }

    if (binsToStore > 0) {
        toast({ variant: 'destructive', title: 'Error de espacio', description: 'No se encontraron coordenadas suficientes para almacenar todos los bins.' });
        return;
    }

    // Mark the original pending lot as processed by deleting it
    const originalLotRef = doc(firestore, 'chamberLots', lotToStore.id);
    batch.delete(originalLotRef);

    try {
        await batch.commit();
        toast({ title: 'Éxito', description: `Lote ${lotToStore.displayLotId} almacenado en ${chamberConfig.name}.` });
    } catch (e: any) {
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

  const handleRelocate = async ({ targetChamberId, targetCoordinate }: { targetChamberId: string, targetCoordinate: string}) => {
    if (!itemToRelocate || !firestore) return;
    
    try {
        if (itemToRelocate.type === 'producerLot') {
            const lotRef = doc(firestore, 'chamberLots', itemToRelocate.id);
            await updateDoc(lotRef, {
                chamberId: targetChamberId,
                coordinate: targetCoordinate,
            });
        } else if (itemToRelocate.type === 'otherFruit') {
            const receptionRef = doc(firestore, 'otherFruitReceptions', itemToRelocate.receptionId!);
            const receptionDoc = await getDoc(receptionRef);
            if (!receptionDoc.exists()) throw new Error("Recepción no encontrada");
            
            const updatedItems = [...receptionDoc.data().items];
            const itemToUpdate = updatedItems[itemToRelocate.itemIndex!];
            
            if (itemToUpdate) {
                itemToUpdate.storageLocation = {
                    chamberId: targetChamberId,
                    coordinate: targetCoordinate,
                };
                await updateDoc(receptionRef, { items: updatedItems });
            } else {
                 throw new Error("Ítem no encontrado en la recepción");
            }
        }
        
        toast({ title: 'Éxito', description: `Coordenada ${itemToRelocate.coordinate} reubicada a ${chambersConfig[targetChamberId].name} - ${targetCoordinate}.` });

    } catch (e: any) {
        console.error("Error al reubicar: ", e);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al reubicar.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'chamberLots or otherFruitReceptions',
            operation: 'update'
        }));
    } finally {
        setRelocateDialogOpen(false);
    }
  };
  
  const handleClearStock = async () => {
    if (!firestore) return;
    const hasChamberLots = chamberLots && chamberLots.length > 0;
    const hasOtherFruit = otherFruitReceptions && otherFruitReceptions.length > 0;
    
    if (!hasChamberLots && !hasOtherFruit) {
      toast({ title: 'Sin Stock', description: 'No hay lotes en las cámaras para limpiar.' });
      return;
    }

    try {
      const batch = writeBatch(firestore);
      
      if (hasChamberLots) {
        const chamberLotsRef = collection(firestore, 'chamberLots');
        const querySnapshot = await getDocs(chamberLotsRef);
        querySnapshot.forEach((doc) => batch.delete(doc.ref));
      }

      if (hasOtherFruit) {
        const otherFruitRef = collection(firestore, 'otherFruitReceptions');
        const querySnapshot = await getDocs(otherFruitRef);
        querySnapshot.forEach((doc) => batch.delete(doc.ref));
      }

      await batch.commit();
      toast({ title: 'Éxito', description: 'Todo el stock de las cámaras ha sido eliminado.' });
    } catch (e: any) {
      console.error("Error al limpiar el stock de cámaras: ", e);
      toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al limpiar el stock.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'chamberLots or otherFruitReceptions',
          operation: 'delete'
      }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Lotes de Productor Pendientes</CardTitle>
              <CardDescription>Lotes que esperan ser asignados a una cámara.</CardDescription>
            </div>
            <ExternalReceptionUploader />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Lote</TableHead>
                  <TableHead className="hidden md:table-cell">Productor</TableHead>
                  <TableHead>N° Bins</TableHead>
                  <TableHead>Exportador</TableHead>
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
                      <TableCell className="hidden md:table-cell">{lot.producerShortName}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell>{exporterMap[lot.exporterId] || lot.exporterId}</TableCell>
                      <TableCell><Badge variant='secondary'>{lot.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleStoreClick(lot)}>Almacenar</Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay lotes de productor pendientes.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Estado de Cámaras</CardTitle>
            <CardDescription>Ocupación y distribución de los lotes en las cámaras de frío.</CardDescription>
          </div>
          <div className="text-right">
              <p className="text-sm text-muted-foreground">Peso Neto Total en Cámaras</p>
              <div className="text-2xl font-bold">
                  {loading ? <Skeleton className="h-8 w-32" /> : `${totalNetWeightInStock.toLocaleString('es-CL', {maximumFractionDigits: 0})} kg`}
              </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Limpiar Stock</span>
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Está seguro de limpiar todo el stock?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminarán permanentemente TODOS los lotes
                        almacenados en las cámaras. Esta herramienta es solo para fines de desarrollo y pruebas.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearStock} className="bg-destructive hover:bg-destructive/90">
                        Sí, Limpiar Stock
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

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
                                    {chamberOccupancy[chamberId]?.occupied ?? 0} / {chamberOccupancy[chamberId]?.total ?? 0} Bins Equiv.
                                    ({(chamberOccupancy[chamberId]?.percentage ?? 0).toFixed(1)}%)
                                </p>
                                <Progress value={chamberOccupancy[chamberId]?.percentage ?? 0} className="w-48 h-2 mt-1" />
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="p-4 bg-muted/50 rounded-lg border">
                            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))` }}>
                              {config.rows.map(row =>
                                config.columns.map(col => {
                                  const coord = `${col}${row}`;
                                  const isBlocked = config.blocked?.includes(coord);
                                  const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                  const isOccupied = itemsInCoord.length > 0;
                                  
                                  const totalBins = itemsInCoord.filter(i => i.unit === 'Bins').reduce((s, i) => s + i.quantity, 0);
                                  const totalPallets = itemsInCoord.filter(i => i.unit === 'Pallets').reduce((s, i) => s + i.quantity, 0);
                                  const totalNetWeight = itemsInCoord.reduce((sum, i) => sum + (i.quantity * (i.netWeightPerBin || 0)), 0);

                                  
                                  const occupancyPercentage = isOccupied ? (totalBins + totalPallets * 2) / 6 * 100 : 0; // Approx. 1 pallet = 2 bins
                                  const firstItem = isOccupied ? itemsInCoord[0] : null;

                                  if (isBlocked) {
                                    return (
                                      <div key={coord} className="h-12 w-full rounded border-2 bg-gray-200 dark:bg-gray-700 relative">
                                        <div className="absolute inset-0 bg-repeat bg-[length:10px_10px]" style={{backgroundImage: "repeating-linear-gradient(-45deg, #a0aec0, #a0aec0 1px, transparent 1px, transparent 5px)"}} />
                                      </div>
                                    )
                                  }
                                  
                                  const lotColor = firstItem ? getColorForLot(firstItem.displayId) : 'transparent';
                                  const cellStyle = { 
                                      '--lot-color': lotColor,
                                      '--lot-color-border': lotColor.replace(')', ', 0.5)'),
                                      '--lot-color-bg': lotColor.replace(')', ', 0.2)'),
                                      '--lot-color-progress': lotColor.replace(')', ', 0.3)'),
                                  } as React.CSSProperties;


                                  return (
                                    <Popover key={coord}>
                                      <PopoverTrigger asChild>
                                        <div 
                                          className={cn("h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden cursor-pointer",
                                            isOccupied ? 'border-[var(--lot-color-border)] bg-[var(--lot-color-bg)]' : 'bg-background border-dashed'
                                          )}
                                          style={cellStyle}
                                        >
                                          <div className="absolute bottom-0 left-0 top-0 bg-[var(--lot-color-progress)]" style={{ right: `${100 - occupancyPercentage}%` }} />
                                          <span className="relative z-10 font-semibold">{coord}</span>
                                        </div>
                                      </PopoverTrigger>
                                      {isOccupied && firstItem && (
                                        <PopoverContent className="p-4 w-64" side="bottom" align="center">
                                          <div className="space-y-2">
                                            <p className="font-bold">
                                              {firstItem.type === 'producerLot' ? `Lote: ${firstItem.displayId}` : `Producto: ${firstItem.displayId}`}
                                            </p>
                                            <p>
                                              {firstItem.type === 'producerLot' ? `Productor: ${firstItem.ownerName}` : `Cliente: ${firstItem.ownerName}`}
                                            </p>
                                            <p>Variedad/Producto: {firstItem.varietyOrProduct}</p>
                                            <div className="grid grid-cols-2 gap-x-4">
                                                <p>Bins: {totalBins}</p>
                                                <p>Pallets: {totalPallets}</p>
                                                {totalNetWeight > 0 && <p className="col-span-2">Peso Neto: {totalNetWeight.toFixed(1)} kg</p>}
                                            </div>
                                            <Button size="sm" className="w-full mt-2" onClick={() => handleRelocateClick(firstItem)}>Reubicar</Button>
                                          </div>
                                        </PopoverContent>
                                      )}
                                    </Popover>
                                  );
                                })
                              )}
                            </div>
                        </div>
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

      {itemToRelocate && (
        <RelocateDialog
            item={itemToRelocate}
            open={isRelocateDialogOpen}
            onOpenChange={setRelocateDialogOpen}
            onRelocate={handleRelocate}
            storedItems={{
                chamberLots: chamberLots || [],
                otherFruitReceptions: otherFruitReceptions || [],
            }}
        />
      )}
    </div>
  );
}
