'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, Exporter, OtherFruitReception, StoredItem, ChamberTemperature } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoreInChamberDialog } from '@/components/hidrocooler/StoreInChamberDialog';
import { collection, doc, writeBatch, getDocs, updateDoc, getDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { chambersConfig } from '@/lib/chambers-config';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, getSortedCoordinates } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { RelocateLotDialog } from '@/components/camaras/RelocateLotDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Upload } from 'lucide-react';
import { ExternalReceptionUploader } from '@/components/hidrocooler/ExternalReceptionUploader';
import { ChamberTemperatureInput } from '@/components/camaras/ChamberTemperatureInput';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useChamberStrategy } from '@/contexts/ChamberStrategyContext';


// --- Color Palette Logic (Moved outside component to persist state) ---

const lotColorPalette = [
  'hsl(221, 83%, 53%)', // Blue
  'hsl(0, 72%, 51%)',   // Red
  'hsl(48, 96%, 53%)',  // Yellow
  'hsl(262, 83%, 60%)', // Violet
  'hsl(170, 75%, 41%)', // Cyan
  'hsl(350, 75%, 55%)', // Pink
  'hsl(25, 85%, 50%)',  // Orange
  'hsl(120, 50%, 50%)', // Green
  'hsl(310, 80%, 50%)', // Magenta
  'hsl(195, 100%, 45%)',// Sky Blue
  'hsl(60, 100%, 45%)', // Lemon
  'hsl(290, 60%, 50%)', // Purple
];

// Map to store assigned colors for each lot ID
const lotColorMap = new Map<string, string>();
let nextColorIndex = 0;

const getColorForLot = (lotId: string) => {
    if (!lotColorMap.has(lotId)) {
        const color = lotColorPalette[nextColorIndex];
        lotColorMap.set(lotId, color);
        nextColorIndex = (nextColorIndex + 1) % lotColorPalette.length;
    }
    return lotColorMap.get(lotId)!;
};


export default function CamarasPage() {
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const [lotToStore, setLotToStore] = React.useState<ChamberLot | null>(null);
  const [coordToRelocate, setCoordToRelocate] = React.useState<{ chamberId: string, coordinate: string } | null>(null);
  const [isStoreDialogOpen, setStoreDialogOpen] = React.useState(false);
  const [isRelocateDialogOpen, setRelocateDialogOpen] = React.useState(false);
  const [latestTemperatures, setLatestTemperatures] = React.useState<Record<string, ChamberTemperature | null>>({});
  const firestore = useFirestore();
  const { toast } = useToast();
  const [showChamberStatus, setShowChamberStatus] = React.useState(false);
  const { chamberStrategies, setChamberStrategies } = useChamberStrategy();

  const loading = loadingChamberLots || loadingOtherFruit || loadingExporters;
  
  React.useEffect(() => {
    if (!firestore) return;

    const unsubscribers = Object.keys(chambersConfig).map(chamberId => {
      const q = query(
        collection(firestore, 'chamberTemperatures'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const latestTemp = snapshot.docs[0].data() as ChamberTemperature;
          setLatestTemperatures(prev => ({
            ...prev,
            [chamberId]: latestTemp
          }));
        }
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [firestore]);


  const { pendingLots, storedItemsByChamber, chamberOccupancy, totalNetWeightInStock, exporterMap, allLotsInChambers } = React.useMemo(() => {
    const allChamberLots = chamberLots || [];
    const allOtherFruitReceptions = otherFruitReceptions || [];

    const calculatedExporterMap = (exporters || []).reduce((acc, exp) => {
      acc[exp.exporterId] = exp.name;
      return acc;
    }, {} as Record<string, string>);

    const calculatedPendingLots = allChamberLots
      .filter((lot) => lot.status === 'Pendiente por Almacenar')
      .sort((a, b) => b.receptionDate && a.receptionDate ? a.receptionDate.toMillis() - b.receptionDate.toMillis() : 0);
      
    const allStoredItems: StoredItem[] = [
      ...allChamberLots
        .filter(lot => lot.status === 'Almacenado' && lot.chamberId && lot.coordinate && lot.binCount > 0)
        .map(lot => ({
            id: lot.id,
            type: 'producerLot' as const,
            displayId: lot.displayLotId,
            lotIdForColor: lot.displayLotId,
            ownerName: lot.producerShortName,
            varietyOrProduct: lot.variety,
            quantity: lot.binCount,
            unit: 'Bins' as const,
            chamberId: lot.chamberId!,
            coordinate: lot.coordinate!,
            receptionId: null, // Not applicable for producer lots
            itemIndex: -1, // Not applicable
            netWeightPerBin: lot.netWeightPerBin || 0,
            clientLotId: undefined,
        })),
      ...allOtherFruitReceptions
        .flatMap(reception => reception.items
            .map((item, index) => ({ item, index })) // Map to include original index
            .filter(({ item }) => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
            .map(({ item, index }) => ({ // Use original index
                id: `${reception.id}-${index}`,
                type: 'otherFruit' as const,
                displayId: item.productCode,
                lotIdForColor: reception.displayLotId || reception.id,
                ownerName: reception.clientName,
                varietyOrProduct: item.productName,
                quantity: item.quantity,
                unit: reception.unit,
                chamberId: item.storageLocation!.chamberId,
                coordinate: item.storageLocation!.coordinate,
                receptionId: reception.id,
                itemIndex: index, // This is now the correct original index
                netWeightPerBin: 0,
                clientLotId: item.clientLotId,
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
        allLotsInChambers: allChamberLots,
    };
  }, [chamberLots, otherFruitReceptions, exporters]);


  const handleStoreClick = (lot: ChamberLot) => {
    setLotToStore(lot);
    setStoreDialogOpen(true);
  };
  
  const handleRelocateClick = (chamberId: string, coordinate: string) => {
    setCoordToRelocate({ chamberId, coordinate });
    setRelocateDialogOpen(true);
  }

  const handleStoreInChamber = async ({ chamberId, coordinate: startCoordinate }: { chamberId: string; coordinate: string; }) => {
    if (!lotToStore || !firestore) return;
  
    const BINS_PER_COORDINATE = 6;
    const chamberConfig = chambersConfig[chamberId];
    const strategy = chamberStrategies[chamberId] || 'secuencial';
  
    const occupiedCoordinates = new Map<string, { displayLotId: string; binCount: number }[]>();

    (allLotsInChambers || [])
      .filter(l => l.status === 'Almacenado' && l.chamberId === chamberId && l.coordinate)
      .forEach(l => {
          if (!occupiedCoordinates.has(l.coordinate!)) {
              occupiedCoordinates.set(l.coordinate!, []);
          }
          occupiedCoordinates.get(l.coordinate!)!.push({ displayLotId: l.displayLotId, binCount: l.binCount });
      });
    
    (otherFruitReceptions || []).forEach(reception => {
        reception.items.forEach(item => {
            if (item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId && item.storageLocation.coordinate) {
                 if (!occupiedCoordinates.has(item.storageLocation.coordinate)) {
                    occupiedCoordinates.set(item.storageLocation.coordinate, []);
                }
                occupiedCoordinates.get(item.storageLocation.coordinate)!.push({ displayLotId: `other_${reception.id}`, binCount: BINS_PER_COORDINATE });
            }
        });
    });
    
    const allPossibleCoordinates = getSortedCoordinates(chamberConfig, strategy);

    let binsToStore = lotToStore.binCount;
    const batch = writeBatch(firestore);
    
    // --- PASS 1: Fill partially filled coordinates of the same lot ANYWHERE in the chamber ---
    for (const coord of allPossibleCoordinates) {
        if (binsToStore === 0) break;

        const lotsInCoord = occupiedCoordinates.get(coord);
        if (lotsInCoord && lotsInCoord.length > 0) {
            const isSameLot = lotsInCoord.every(l => l.displayLotId === lotToStore.displayLotId);
            if (isSameLot) {
                const binsInCoord = lotsInCoord.reduce((sum, l) => sum + l.binCount, 0);
                const spaceAvailable = BINS_PER_COORDINATE - binsInCoord;
                
                if (spaceAvailable > 0) {
                    const binsToAdd = Math.min(binsToStore, spaceAvailable);
                    
                    const newLotFractionRef = doc(collection(firestore, 'chamberLots'));
                    batch.set(newLotFractionRef, {
                        ...lotToStore,
                        id: newLotFractionRef.id,
                        binCount: binsToAdd,
                        chamberId: chamberId,
                        coordinate: coord,
                        status: 'Almacenado',
                        storedAt: serverTimestamp()
                    });
                    binsToStore -= binsToAdd;
                    
                    lotsInCoord.push({displayLotId: lotToStore.displayLotId, binCount: binsToAdd});
                }
            }
        }
    }
    
    // --- PASS 2: Store sequentially starting from the user's selected coordinate ---
    if (binsToStore > 0) {
        if (!allPossibleCoordinates.includes(startCoordinate) || occupiedCoordinates.has(startCoordinate)) {
            toast({ variant: 'destructive', title: 'Error de ubicación', description: `La coordenada de inicio (${startCoordinate}) no es válida o ya está ocupada.` });
            return;
        }

        const startIndex = allPossibleCoordinates.indexOf(startCoordinate);
        const coordinatesToSearch = allPossibleCoordinates.slice(startIndex);

        for (const coord of coordinatesToSearch) {
            if (binsToStore === 0) break;

            if (!occupiedCoordinates.has(coord)) { // Check if the coordinate is truly empty
                const binsToAdd = Math.min(binsToStore, BINS_PER_COORDINATE);
                
                const newLotFractionRef = doc(collection(firestore, 'chamberLots'));
                batch.set(newLotFractionRef, {
                    ...lotToStore,
                    id: newLotFractionRef.id,
                    binCount: binsToAdd,
                    chamberId: chamberId,
                    coordinate: coord,
                    status: 'Almacenado',
                    storedAt: serverTimestamp()
                });
                binsToStore -= binsToAdd;
                
                occupiedCoordinates.set(coord, [{displayLotId: lotToStore.displayLotId, binCount: binsToAdd}]);
            }
        }
    }

    if (binsToStore > 0) {
        toast({ variant: 'destructive', title: 'Error de espacio', description: `No se encontraron coordenadas suficientes. Quedaron ${binsToStore} sin almacenar.` });
        return;
    }

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
    if (!coordToRelocate || !firestore) return;

    const { chamberId: sourceChamberId, coordinate: sourceCoordinate } = coordToRelocate;

    // Find all lot documents that are in the source coordinate
    const lotsToMove = (chamberLots || []).filter(
      (lot) =>
        lot.chamberId === sourceChamberId &&
        lot.coordinate === sourceCoordinate &&
        lot.status === 'Almacenado'
    );
     // Find all other fruit items that are in the source coordinate
    const fruitItemsToMove = (otherFruitReceptions || []).flatMap(reception =>
        reception.items
            .map((item, index) => ({ item, index })) // Get original index
            .filter(({ item }) => item.status === 'Almacenado' && item.storageLocation?.chamberId === sourceChamberId && item.storageLocation?.coordinate === sourceCoordinate)
            .map(({item, index}) => ({ reception, item, index })) // Pass original index
    );

    if (lotsToMove.length === 0 && fruitItemsToMove.length === 0) {
      toast({ title: 'Error', description: 'No se encontró nada que mover en la coordenada de origen.', variant: 'destructive' });
      setRelocateDialogOpen(false);
      return;
    }
    
    try {
        const batch = writeBatch(firestore);

        // Update producer lots
        lotsToMove.forEach(lot => {
            const lotRef = doc(firestore, 'chamberLots', lot.id);
            batch.update(lotRef, {
                chamberId: targetChamberId,
                coordinate: targetCoordinate,
            });
        });

        // Update other fruit items
        const fruitUpdatesByReception: Record<string, any[]> = {};
        fruitItemsToMove.forEach(({ reception, item, index }) => {
            if (!fruitUpdatesByReception[reception.id]) {
                fruitUpdatesByReception[reception.id] = JSON.parse(JSON.stringify(reception.items));
            }
            const itemToUpdate = fruitUpdatesByReception[reception.id][index];
            if (itemToUpdate) {
                itemToUpdate.storageLocation = {
                    chamberId: targetChamberId,
                    coordinate: targetCoordinate,
                };
            }
        });

        Object.entries(fruitUpdatesByReception).forEach(([receptionId, updatedItems]) => {
            const receptionRef = doc(firestore, 'otherFruitReceptions', receptionId);
            batch.update(receptionRef, { items: updatedItems });
        });

        await batch.commit();
        
        toast({ title: 'Éxito', description: `Coordenada ${sourceCoordinate} reubicada a ${chambersConfig[targetChamberId].name} - ${targetCoordinate}.` });

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

  const lotsInCoordToRelocate = coordToRelocate ? storedItemsByChamber[coordToRelocate.chamberId]?.[coordToRelocate.coordinate] || [] : [];


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Lotes de Productor Pendientes</CardTitle>
              <CardDescription>Lotes que esperan ser asignados a una cámara.</CardDescription>
            </div>
            <div className="hidden md:block">
              <ExternalReceptionUploader />
            </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">Fecha Recepción</TableHead>
                  <TableHead>ID Lote</TableHead>
                  <TableHead className="hidden md:table-cell">Productor</TableHead>
                  <TableHead>N° Bins</TableHead>
                  <TableHead className="hidden lg:table-cell">Exportador</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : pendingLots.length > 0 ? (
                  pendingLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="hidden sm:table-cell">{lot.receptionDate?.toDate().toLocaleString('es-CL', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit' })}</TableCell>
                      <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                      <TableCell className="hidden md:table-cell">{lot.producerShortName}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell className="hidden lg:table-cell">{exporterMap[lot.exporterId] || lot.exporterId}</TableCell>
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
          <div className="mt-4 md:hidden">
            <ExternalReceptionUploader />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold">Visualizar Estado de Cámaras</h3>
            <p className="text-sm text-muted-foreground">Muestra u oculta la sección de ocupación de cámaras.</p>
          </div>
          <Switch
            id="show-chamber-status"
            checked={showChamberStatus}
            onCheckedChange={setShowChamberStatus}
          />
        </CardContent>
      </Card>

      {showChamberStatus && (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <CardTitle>Estado de Cámaras</CardTitle>
                    <CardDescription>Ocupación y distribución de los lotes en las cámaras de frío.</CardDescription>
                </div>
                <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Peso Neto Total</p>
                        <div className="text-xl sm:text-2xl font-bold">
                            {loading ? <Skeleton className="h-8 w-32" /> : `${totalNetWeightInStock.toLocaleString('es-CL', {maximumFractionDigits: 0})} kg`}
                        </div>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="shrink-0">
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Limpiar Stock</span>
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Está seguro de limpiar todo el stock?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Se eliminarán permanentemente TODAS las lotes
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
                </div>
            </CardHeader>
            <CardContent>
            <Accordion type="single" collapsible className="w-full">
                {Object.entries(chambersConfig).map(([chamberId, config]) => (
                    <AccordionItem value={chamberId} key={chamberId}>
                        <AccordionTrigger>
                            <div className="flex flex-col sm:flex-row w-full items-start sm:items-center justify-between gap-2 sm:gap-4 pr-4 text-left">
                                <div className="flex items-center gap-2 sm:gap-4">
                                    <span className="text-md sm:text-lg font-semibold">{config.name}</span>
                                    <ChamberTemperatureInput chamberId={chamberId} />
                                </div>
                                <div className="text-left sm:text-right w-full sm:w-auto">
                                    <p className={cn("font-mono font-semibold text-sm", (chamberOccupancy[chamberId]?.percentage ?? 0) > 50 ? 'text-destructive' : 'text-foreground')}>
                                        {chamberOccupancy[chamberId]?.occupied ?? 0} / {chamberOccupancy[chamberId]?.total ?? 0} Bins Equiv.
                                        ({(chamberOccupancy[chamberId]?.percentage ?? 0).toFixed(1)}%)
                                    </p>
                                    <Progress value={chamberOccupancy[chamberId]?.percentage ?? 0} className="w-full sm:w-48 h-2 mt-1" />
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="flex items-center space-x-2 px-4 pb-4 border-b">
                                <Switch
                                    id={`fifo-switch-${chamberId}`}
                                    checked={chamberStrategies[chamberId] === 'fifo'}
                                    onCheckedChange={(checked) => {
                                        setChamberStrategies(prev => ({
                                            ...prev,
                                            [chamberId]: checked ? 'fifo' : 'secuencial'
                                        }));
                                    }}
                                />
                                <Label htmlFor={`fifo-switch-${chamberId}`}>Activar Layout FIFO (Serpiente)</Label>
                            </div>
                            <div className="p-2 sm:p-4 bg-muted/50 rounded-b-lg border border-t-0 overflow-x-auto">
                                <div className="grid gap-1 min-w-[600px] sm:min-w-[800px]" style={{ gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))` }}>
                                {config.rows.map((row, rowIndex) =>
                                    config.columns.map((col, colIndex) => {
                                      const strategy = chamberStrategies[chamberId] || 'secuencial';
                                      const isEvenColumn = colIndex % 2 !== 0;
                                      
                                      let coord;
                                      const unblockedRowCount = 12; // Assuming rows 1-12 are usable
                                      
                                      if (strategy === 'fifo' && isEvenColumn) {
                                          if (rowIndex < unblockedRowCount) {
                                              // This is an unblocked visual row. Map it to the reversed logical unblocked row.
                                              const logicalRowValue = unblockedRowCount - rowIndex; // rowIndex 0 -> 12, rowIndex 1 -> 11, ..., rowIndex 11 -> 1
                                              coord = `${col.name}${logicalRowValue}`;
                                          } else {
                                              // This is a blocked visual row. Map it to the corresponding logical blocked row.
                                              coord = `${col.name}${row}`;
                                          }
                                      } else {
                                          coord = `${col.name}${row}`;
                                      }

                                      const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                      const isOccupied = itemsInCoord.length > 0;
                                    
                                      const totalBins = itemsInCoord.filter(i => i.unit === 'Bins').reduce((s, i) => s + i.quantity, 0);
                                      const totalPallets = itemsInCoord.filter(i => i.unit === 'Pallets').reduce((s, i) => s + i.quantity, 0);
                                      const totalNetWeight = itemsInCoord.reduce((sum, i) => sum + (i.quantity * (i.netWeightPerBin || 0)), 0);
                                      const clientLotIds = Array.from(new Set(itemsInCoord.map(i => i.clientLotId).filter(Boolean)));
                                    
                                      const occupancyPercentage = isOccupied ? (totalBins + totalPallets * 2) / 6 * 100 : 0; // Approx. 1 pallet = 2 bins
                                      const firstItem = isOccupied ? itemsInCoord[0] : null;

                                      return (
                                          <Popover key={coord}>
                                          <PopoverTrigger asChild>
                                              <div 
                                              className={cn("h-10 sm:h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden cursor-pointer",
                                                  isOccupied ? 'border-[var(--lot-color-border)] bg-[var(--lot-color-bg)]' : 'bg-background border-dashed'
                                              )}
                                              style={{
                                                '--lot-color': firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`) : 'transparent',
                                                '--lot-color-border': firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`).replace(')', ', 0.5)') : 'transparent',
                                                '--lot-color-bg': firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`).replace(')', ', 0.2)') : 'transparent',
                                                '--lot-color-progress': firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`).replace(')', ', 0.3)') : 'transparent',
                                              } as React.CSSProperties}
                                              >
                                              <div className="absolute bottom-0 left-0 top-0 bg-[var(--lot-color-progress)]" style={{ right: `${100 - occupancyPercentage}%` }} />
                                              <span className="relative z-10 font-semibold">{coord}</span>
                                              </div>
                                          </PopoverTrigger>
                                          {isOccupied && firstItem && (
                                              <PopoverContent className="p-4 w-60 sm:w-64" side="bottom" align="center">
                                              <div className="space-y-2">
                                                  <p className="font-bold">
                                                  {firstItem.type === 'producerLot' ? `Lote: ${firstItem.displayId}` : `Producto: ${firstItem.displayId}`}
                                                  </p>
                                                  {clientLotIds.length > 0 && (
                                                  <p>Lote Cliente: <span className="font-mono">{clientLotIds.join(', ')}</span></p>
                                                  )}
                                                  <p>
                                                  {firstItem.type === 'producerLot' ? `Productor: ${firstItem.ownerName}` : `Cliente: ${firstItem.ownerName}`}
                                                  </p>
                                                  <p>Variedad/Producto: {firstItem.varietyOrProduct}</p>
                                                  <div className="grid grid-cols-2 gap-x-4">
                                                      <p>Bins: {totalBins}</p>
                                                      <p>Pallets: {totalPallets}</p>
                                                      {totalNetWeight > 0 && <p className="col-span-2">Peso Neto: {totalNetWeight.toFixed(1)} kg</p>}
                                                  </div>
                                                  <Button size="sm" className="w-full mt-2" onClick={() => handleRelocateClick(chamberId, coord)}>Reubicar</Button>
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
      )}

      {lotToStore && (
        <StoreInChamberDialog
            lot={lotToStore}
            open={isStoreDialogOpen}
            onOpenChange={setStoreDialogOpen}
            onStore={handleStoreInChamber}
            allChamberLots={allLotsInChambers.filter(l => l.status === 'Almacenado')}
            allOtherFruitReceptions={otherFruitReceptions || []}
            chamberStrategies={chamberStrategies}
        />
      )}

      {coordToRelocate && (
        <RelocateLotDialog
            open={isRelocateDialogOpen}
            onOpenChange={setRelocateDialogOpen}
            onRelocate={handleRelocate}
            sourceChamberId={coordToRelocate.chamberId}
            sourceCoordinate={coordToRelocate.coordinate}
            lotsInCoordinate={lotsInCoordToRelocate}
            allChamberLots={allLotsInChambers.filter(l => l.status === 'Almacenado')}
            allOtherFruitReceptions={otherFruitReceptions || []}
        />
      )}
    </div>
  );
}
