'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem, ChamberLot, StoredItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { chambersConfig } from '@/lib/chambers-config';
import { cn, naturalSort } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { RelocateLotDialog } from '@/components/camaras/RelocateLotDialog';

const lotColorPalette = [
  'hsl(35, 92%, 52%)',   // Orange
  'hsl(135, 58%, 46%)',  // Green
  'hsl(205, 82%, 51%)',  // Blue
  'hsl(315, 65%, 53%)',  // Magenta
  'hsl(55, 95%, 50%)',   // Yellow
  'hsl(185, 75%, 45%)',  // Cyan
  'hsl(5, 80%, 55%)',    // Red
  'hsl(265, 85%, 60%)',  // Violet
];

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


interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

export function OtherFruitStorageTab() {
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  
  const [itemToStore, setItemToStore] = React.useState<PendingItem | null>(null);
  const [storageLocation, setStorageLocation] = React.useState<{chamberId: string, coordinate: string} | null>(null);

  const [coordToRelocate, setCoordToRelocate] = React.useState<{ chamberId: string, coordinate: string } | null>(null);
  const [isRelocateDialogOpen, setRelocateDialogOpen] = React.useState(false);
  
  const firestore = useFirestore();
  const { toast } = useToast();

  const loading = loadingReceptions || loadingChamberLots;

  const { pendingItems, storedItemsByChamber, chamberOccupancy } = React.useMemo(() => {
    const calculatedPendingItems: PendingItem[] = (allReceptions || [])
        .filter(lot => lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado')
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: lot.unit }))
                .filter(item => item.status === 'Pendiente de almacenar')
        )
        .sort((a,b) => {
            const lotA = allReceptions.find(l => l.id === a.receptionId);
            const lotB = allReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });

    const allStoredItems: StoredItem[] = [
      ...(allChamberLots || [])
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
            receptionId: null,
            itemIndex: -1,
            netWeightPerBin: lot.netWeightPerBin || 0,
        })),
      ...(allReceptions || [])
        .flatMap(reception => reception.items
            .filter(item => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
            .map((item, index) => ({
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
                itemIndex: index,
                netWeightPerBin: 0,
            }))
        )
    ];

    const calculatedStoredItemsByChamber = allStoredItems.reduce((acc, item) => {
        if (!acc[item.chamberId]) acc[item.chamberId] = {};
        if (!acc[item.chamberId][item.coordinate]) acc[item.chamberId][item.coordinate] = [];
        acc[item.chamberId][item.coordinate].push(item);
        return acc;
    }, {} as Record<string, Record<string, StoredItem[]>>);

    const calculatedChamberOccupancy = Object.keys(chambersConfig).reduce((acc, chamberId) => {
        const chamberConfig = chambersConfig[chamberId];
        const totalCapacity = chamberConfig.capacity;
        
        const itemsInChamber = allStoredItems.filter(item => item.chamberId === chamberId);
        
        const occupiedEquivalentBins = itemsInChamber.reduce((sum, item) => {
          if (item.unit === 'Bins') return sum + item.quantity;
          if (item.unit === 'Pallets') return sum + (item.quantity * 2);
          return sum;
        }, 0);

        acc[chamberId] = {
            occupied: occupiedEquivalentBins,
            total: totalCapacity,
            percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0,
        };
        return acc;
    }, {} as Record<string, {occupied: number; total: number; percentage: number}>);


    return { pendingItems: calculatedPendingItems, storedItemsByChamber: calculatedStoredItemsByChamber, chamberOccupancy: calculatedChamberOccupancy };
  }, [allReceptions, allChamberLots]);

  const handleStoreClick = (item: PendingItem) => {
    toast({ title: "Modo Almacenamiento Activado", description: `Seleccione una coordenada vacía en el mapa para almacenar "${item.productName}".`});
    setItemToStore(item);
  };
  
  const handleCoordinateClick = (chamberId: string, coordinate: string) => {
    if (itemToStore) {
        setStorageLocation({ chamberId, coordinate });
    } else {
        const itemsInCoord = storedItemsByChamber[chamberId]?.[coordinate];
        if (itemsInCoord && itemsInCoord.length > 0) {
            handleRelocateClick(chamberId, coordinate);
        }
    }
  };

  const handleStoreConfirm = async (data: { chamberId: string; coordinate: string; quantity: number }) => {
    if (!itemToStore || !firestore) return;

    const { chamberId, coordinate, quantity } = data;
    const receptionDocRef = doc(firestore, 'otherFruitReceptions', itemToStore.receptionId);
    
    const originalReception = allReceptions.find(r => r.id === itemToStore.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    const originalItem = updatedItems[itemToStore.itemIndex];

    if (quantity > originalItem.quantity) {
        toast({ title: 'Error', description: 'La cantidad a almacenar excede la pendiente.', variant: 'destructive'});
        return;
    }

    originalItem.quantity -= quantity;

    const newItem: OtherFruitReceptionItem = {
      ...originalItem,
      quantity: quantity,
      status: 'Almacenado',
      storageLocation: { chamberId, coordinate },
      storedAt: new Date(),
    };
    updatedItems.push(newItem);

    if (originalItem.quantity <= 0) {
        updatedItems.splice(itemToStore.itemIndex, 1);
    }
    
    const allItemsStoredOrEmpty = updatedItems.every((item: OtherFruitReceptionItem) => item.status === 'Almacenado' || item.quantity <= 0);
    const newStatus = allItemsStoredOrEmpty ? 'Almacenado' : 'Parcialmente Almacenado';

    const updateData = {
        items: updatedItems,
        status: newStatus,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `${quantity} ${itemToStore.unit} almacenados en ${chamberId}/${coordinate}.` });
        setItemToStore(null);
        setStorageLocation(null);
    } catch (error) {
        console.error("Error storing fruit item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: receptionDocRef.path,
            operation: 'update',
            requestResourceData: updateData,
        }));
    }
  };
  
  const handleRelocateClick = (chamberId: string, coordinate: string) => {
    setCoordToRelocate({ chamberId, coordinate });
    setRelocateDialogOpen(true);
  }

  const handleRelocate = async ({ targetChamberId, targetCoordinate }: { targetChamberId: string, targetCoordinate: string}) => {
    if (!coordToRelocate || !firestore) return;

    const { chamberId: sourceChamberId, coordinate: sourceCoordinate } = coordToRelocate;
    
    const itemsToMove = (storedItemsByChamber[sourceChamberId]?.[sourceCoordinate] || []).filter(i => i.type === 'otherFruit');

    if (itemsToMove.length === 0) {
      toast({ title: 'Error', description: 'No se encontró fruta de otros clientes que mover.', variant: 'destructive' });
      setRelocateDialogOpen(false);
      return;
    }
    
    try {
        const batch = writeBatch(firestore);

        const fruitUpdatesByReception: Record<string, any[]> = {};
        itemsToMove.forEach(({ receptionId, itemIndex }) => {
            if (receptionId === null) return;
            if (!fruitUpdatesByReception[receptionId]) {
                const originalReception = allReceptions.find(r => r.id === receptionId);
                if (originalReception) {
                    fruitUpdatesByReception[receptionId] = JSON.parse(JSON.stringify(originalReception.items));
                }
            }
            if(fruitUpdatesByReception[receptionId]) {
                const itemToUpdate = fruitUpdatesByReception[receptionId][itemIndex];
                if (itemToUpdate) {
                    itemToUpdate.storageLocation = {
                        chamberId: targetChamberId,
                        coordinate: targetCoordinate,
                    };
                }
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
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'otherFruitReceptions', operation: 'update' }));
    } finally {
        setRelocateDialogOpen(false);
    }
  };

  const lotsInCoordToRelocate = coordToRelocate ? storedItemsByChamber[coordToRelocate.chamberId]?.[coordToRelocate.coordinate] || [] : [];


  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Productos Pendientes de Almacenar</CardTitle>
          <CardDescription>Seleccione un producto para asignarle una ubicación en las cámaras.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad Pendiente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReceptions ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : pendingItems.length > 0 ? (
                  pendingItems.map((item, idx) => (
                    <TableRow key={`${item.receptionId}-${item.itemIndex}`} data-state={itemToStore?.receptionId === item.receptionId && itemToStore?.itemIndex === item.itemIndex ? 'selected' : ''}>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="font-semibold">{item.quantity} {item.unit}</TableCell>
                        <TableCell><Badge variant="secondary">{item.status}</Badge></TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleStoreClick(item)}>Almacenar</Button>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay productos pendientes de almacenar.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
       <Card>
        <CardHeader>
            <CardTitle>Stock y Ubicaciones</CardTitle>
            <CardDescription>Haga clic en una coordenada para ver su contenido, reubicar o almacenar.</CardDescription>
        </CardHeader>
        <CardContent>
             <Accordion type="single" collapsible className="w-full">
            {Object.entries(chambersConfig).map(([chamberId, config]) => (
                <AccordionItem value={chamberId} key={chamberId}>
                    <AccordionTrigger>
                        <div className="flex w-full items-center justify-between pr-4">
                            <span className="text-lg font-semibold">{config.name}</span>
                            <div className="text-right">
                                <p className="font-mono font-semibold">
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
                                  const occupancyPercentage = isOccupied ? (totalBins + totalPallets * 2) / 6 * 100 : 0;
                                  
                                  const firstItem = isOccupied ? itemsInCoord[0] : null;
                                  const lotColor = firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`) : 'transparent';
                                  
                                  const canStoreHere = itemToStore && !isOccupied && !isBlocked;

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
                                            isOccupied ? 'border-[var(--lot-color-border)] bg-[var(--lot-color-bg)]' : 'bg-background border-dashed',
                                            canStoreHere && 'border-primary ring-2 ring-primary ring-offset-2'
                                          )}
                                          style={cellStyle}
                                          onClick={() => !isOccupied && handleCoordinateClick(chamberId, coord)}
                                        >
                                          <div className="absolute bottom-0 left-0 top-0 bg-[var(--lot-color-progress)]" style={{ right: `${100 - occupancyPercentage}%` }} />
                                          <span className="relative z-10 font-semibold">{coord}</span>
                                        </div>
                                      </PopoverTrigger>
                                      {isOccupied && firstItem && (
                                        <PopoverContent className="p-4 w-64" side="bottom" align="center">
                                          <div className="space-y-2">
                                            <p>Tipo: <span className="font-semibold">{firstItem.type === 'producerLot' ? 'Fruta Productor' : 'Fruta Otro Cliente'}</span></p>
                                            <p>Lote/Producto: <span className="font-semibold">{firstItem.displayId}</span></p>
                                            <p>Dueño: <span className="font-semibold">{firstItem.ownerName}</span></p>
                                            <p>Variedad: <span className="font-semibold">{firstItem.varietyOrProduct}</span></p>
                                            <p>Bins: <span className="font-semibold">{totalBins}</span></p>
                                            <p>Pallets: <span className="font-semibold">{totalPallets}</span></p>
                                            <Button size="sm" className="w-full mt-2" onClick={() => handleCoordinateClick(chamberId, coord)}>Reubicar</Button>
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

      <StoreOtherFruitDialog
            item={itemToStore}
            open={!!(itemToStore && storageLocation)}
            onOpenChange={(open) => { if(!open) { setItemToStore(null); setStorageLocation(null); }}}
            onConfirm={handleStoreConfirm}
            allReceptions={allReceptions}
            allChamberLots={allChamberLots || []}
            preselectedLocation={storageLocation}
        />
        
        {coordToRelocate && (
            <RelocateLotDialog
                open={isRelocateDialogOpen}
                onOpenChange={setRelocateDialogOpen}
                onRelocate={handleRelocate}
                sourceChamberId={coordToRelocate.chamberId}
                sourceCoordinate={coordToRelocate.coordinate}
                lotsInCoordinate={lotsInCoordToRelocate}
                allChamberLots={allChamberLots || []}
                allOtherFruitReceptions={allReceptions || []}
            />
        )}
    </div>
  );
}
