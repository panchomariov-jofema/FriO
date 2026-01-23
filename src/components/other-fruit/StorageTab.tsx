'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, OtherFruitReception, OtherFruitReceptionItem, StoredItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn, naturalSort } from '@/lib/utils';
import { chambersConfig } from '@/lib/chambers-config';
import { RelocateLotDialog } from '@/components/camaras/RelocateLotDialog';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';


interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

// --- Color Palette Logic ---
const lotColorPalette = [
    'hsl(221, 83%, 53%)', 'hsl(0, 72%, 51%)', 'hsl(48, 96%, 53%)', 'hsl(262, 83%, 60%)',
    'hsl(170, 75%, 41%)', 'hsl(350, 75%, 55%)', 'hsl(25, 85%, 50%)', 'hsl(120, 50%, 50%)',
    'hsl(310, 80%, 50%)', 'hsl(195, 100%, 45%)', 'hsl(60, 100%, 45%)', 'hsl(290, 60%, 50%)',
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


export function OtherFruitStorageTab() {
  const { data: otherFruitReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [itemToStore, setItemToStore] = React.useState<PendingItem | null>(null);
  const [dialogTarget, setDialogTarget] = React.useState<{ chamberId: string; coordinate: string } | null>(null);
  const [isStoreDialogOpen, setStoreDialogOpen] = React.useState(false);
  
  const [coordToRelocate, setCoordToRelocate] = React.useState<{ chamberId: string, coordinate: string } | null>(null);
  const [isRelocateDialogOpen, setRelocateDialogOpen] = React.useState(false);

  const loading = loadingReceptions || loadingChamberLots;

  const { pendingItems, storedItemsByChamber, chamberOccupancy } = React.useMemo(() => {
    const allChamberLots = chamberLots || [];
    const allOtherFruitReceptions = otherFruitReceptions || [];

    const calculatedPendingItems: PendingItem[] = allOtherFruitReceptions
        .filter(lot => lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado')
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: lot.unit }))
                .filter(item => item.status === 'Pendiente de almacenar')
        )
        .sort((a,b) => {
            const lotA = allOtherFruitReceptions.find(l => l.id === a.receptionId);
            const lotB = allOtherFruitReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });

    const allStoredItems: StoredItem[] = [
      ...allChamberLots
        .filter(lot => lot.status === 'Almacenado' && lot.chamberId && lot.coordinate && lot.binCount > 0)
        .map(lot => ({
            id: lot.id, type: 'producerLot' as const, displayId: lot.displayLotId, lotIdForColor: lot.displayLotId,
            ownerName: lot.producerShortName, varietyOrProduct: lot.variety, quantity: lot.binCount, unit: 'Bins' as const,
            chamberId: lot.chamberId!, coordinate: lot.coordinate!, receptionId: null, itemIndex: -1, netWeightPerBin: lot.netWeightPerBin || 0,
        })),
      ...allOtherFruitReceptions
        .flatMap(reception => reception.items
            .filter(item => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
            .map((item, index) => ({
                id: `${reception.id}-${index}`, type: 'otherFruit' as const, displayId: item.productCode,
                lotIdForColor: reception.displayLotId || reception.id, ownerName: reception.clientName, varietyOrProduct: item.productName,
                quantity: item.quantity, unit: reception.unit, chamberId: item.storageLocation!.chamberId, coordinate: item.storageLocation!.coordinate,
                receptionId: reception.id, itemIndex: index,
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
        const itemsInChamber = allStoredItems.filter(item => item.chamberId === chamberId);
        const occupiedEquivalentBins = itemsInChamber.reduce((sum, item) => {
            return sum + (item.unit === 'Pallets' ? item.quantity * 2 : item.quantity);
        }, 0);
        acc[chamberId] = {
            occupied: occupiedEquivalentBins, total: chamberConfig.capacity,
            percentage: chamberConfig.capacity > 0 ? (occupiedEquivalentBins / chamberConfig.capacity) * 100 : 0,
        };
        return acc;
    }, {} as Record<string, {occupied: number; total: number; percentage: number}>);

    return { pendingItems: calculatedPendingItems, storedItemsByChamber: calculatedStoredItemsByChamber, chamberOccupancy: calculatedChamberOccupancy };
  }, [otherFruitReceptions, chamberLots]);

  const handleStoreClick = (item: PendingItem) => {
    setItemToStore(item);
  };
  
  const handleGridClick = (chamberId: string, coordinate: string) => {
    if (itemToStore) {
        setDialogTarget({ chamberId, coordinate });
        setStoreDialogOpen(true);
    } else {
        const itemsInCoord = storedItemsByChamber[chamberId]?.[coordinate];
        if (itemsInCoord && itemsInCoord.length > 0) {
            setCoordToRelocate({ chamberId, coordinate });
            setRelocateDialogOpen(true);
        }
    }
  };

  const handleStoreConfirm = async ({ quantity }: { quantity: number }) => {
    if (!itemToStore || !dialogTarget || !firestore) return;

    const { receptionId, itemIndex } = itemToStore;
    const { chamberId, coordinate } = dialogTarget;

    const receptionDocRef = doc(firestore, 'otherFruitReceptions', receptionId);
    const originalReception = otherFruitReceptions.find(r => r.id === receptionId);
    if (!originalReception) return;

    const batch = writeBatch(firestore);
    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    const originalItem = updatedItems[itemIndex];

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
      updatedItems.splice(itemIndex, 1);
    }
    
    const allItemsStored = updatedItems.every((item: OtherFruitReceptionItem) => item.status === 'Almacenado');
    const newStatus = allItemsStored ? 'Almacenado' : 'Parcialmente Almacenado';

    batch.update(receptionDocRef, { items: updatedItems, status: newStatus, updatedAt: serverTimestamp() });
    
    try {
        await batch.commit();
        toast({ title: 'Éxito', description: `${quantity} ${itemToStore.unit} almacenados en ${chamberId}/${coordinate}.` });
        setStoreDialogOpen(false);
        setItemToStore(null);
    } catch (error) {
        console.error("Error storing fruit item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: receptionDocRef.path, operation: 'update' }));
    }
  };

  const handleRelocate = async ({ targetChamberId, targetCoordinate }: { targetChamberId: string, targetCoordinate: string}) => {
    if (!coordToRelocate || !firestore) return;
    const { chamberId: sourceChamberId, coordinate: sourceCoordinate } = coordToRelocate;

    const fruitItemsToMove = (otherFruitReceptions || []).flatMap(reception =>
        reception.items
            .filter(item => item.status === 'Almacenado' && item.storageLocation?.chamberId === sourceChamberId && item.storageLocation?.coordinate === sourceCoordinate)
            .map((item, index) => ({ reception, item, index }))
    );

    if (fruitItemsToMove.length === 0) {
      toast({ title: 'Error', description: 'No se encontró nada que mover en la coordenada de origen.', variant: 'destructive' });
      setRelocateDialogOpen(false);
      return;
    }
    
    try {
        const batch = writeBatch(firestore);
        const fruitUpdatesByReception: Record<string, any[]> = {};
        fruitItemsToMove.forEach(({ reception, index }) => {
            if (!fruitUpdatesByReception[reception.id]) {
                fruitUpdatesByReception[reception.id] = JSON.parse(JSON.stringify(reception.items));
            }
            const itemToUpdate = fruitUpdatesByReception[reception.id][index];
            if (itemToUpdate) {
                itemToUpdate.storageLocation = { chamberId: targetChamberId, coordinate: targetCoordinate };
            }
        });

        Object.entries(fruitUpdatesByReception).forEach(([receptionId, updatedItems]) => {
            const receptionRef = doc(firestore, 'otherFruitReceptions', receptionId);
            batch.update(receptionRef, { items: updatedItems });
        });

        await batch.commit();
        toast({ title: 'Éxito', description: `Coordenada reubicada a ${chambersConfig[targetChamberId].name} - ${targetCoordinate}.` });
    } catch (e: any) {
        console.error("Error al reubicar:", e);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al reubicar.' });
    } finally {
        setRelocateDialogOpen(false);
    }
  };
  
  const lotsInCoordToRelocate = coordToRelocate ? storedItemsByChamber[coordToRelocate.chamberId]?.[coordToRelocate.coordinate] || [] : [];


  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Productos Pendientes de Almacenar</CardTitle>
                <CardDescription>Seleccione un producto para asignarle una ubicación en las cámaras de abajo.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                <Table>
                    <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Producto</TableHead><TableHead>Cantidad Pendiente</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
                    <TableBody>
                    {loading ? (
                        Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                    ) : pendingItems.length > 0 ? (
                        pendingItems.map((item) => (
                            <TableRow key={`${item.receptionId}-${item.itemIndex}`} data-state={itemToStore?.receptionId === item.receptionId && itemToStore?.itemIndex === item.itemIndex ? 'selected' : ''}>
                                <TableCell>{item.clientName}</TableCell>
                                <TableCell className="font-medium">{item.productName}</TableCell>
                                <TableCell className="font-semibold">{item.quantity} {item.unit}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={() => handleStoreClick(item)} variant={itemToStore?.receptionId === item.receptionId && itemToStore?.itemIndex === item.itemIndex ? 'secondary' : 'default'}>
                                        {itemToStore?.receptionId === item.receptionId && itemToStore?.itemIndex === item.itemIndex ? 'Seleccionado' : 'Almacenar'}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay productos pendientes.</TableCell></TableRow>
                    )}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>Estado de Cámaras</CardTitle><CardDescription>Haga click en una coordenada para almacenar el producto seleccionado o ver su contenido.</CardDescription></CardHeader>
            <CardContent>
                <Accordion type="single" collapsible className="w-full">
                    {Object.entries(chambersConfig).map(([chamberId, config]) => (
                        <AccordionItem value={chamberId} key={chamberId}>
                            <AccordionTrigger>
                                <div className="flex w-full items-center justify-between pr-4">
                                    <span className="text-lg font-semibold">{config.name}</span>
                                    <div className="text-right">
                                        <p>{chamberOccupancy[chamberId]?.occupied ?? 0} / {chamberOccupancy[chamberId]?.total ?? 0} Bins Equiv. ({(chamberOccupancy[chamberId]?.percentage ?? 0).toFixed(1)}%)</p>
                                        <Progress value={chamberOccupancy[chamberId]?.percentage ?? 0} className="w-48 h-2 mt-1" />
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="p-4 bg-muted/50 rounded-lg border">
                                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))` }}>
                                    {config.rows.map(row => config.columns.map(col => {
                                        const coord = `${col}${row}`;
                                        if (config.blocked?.includes(coord)) {
                                            return <div key={coord} className="h-12 w-full rounded border-2 bg-gray-200 dark:bg-gray-700" />;
                                        }
                                        const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                        const isOccupied = itemsInCoord.length > 0;
                                        const firstItem = isOccupied ? itemsInCoord[0] : null;
                                        const lotColor = firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`) : 'transparent';
                                        
                                        return (
                                            <Popover key={coord}>
                                            <PopoverTrigger asChild>
                                                <button onClick={() => handleGridClick(chamberId, coord)} style={{'--lot-color': lotColor, '--lot-color-bg': lotColor.replace(')', ', 0.2)')} as React.CSSProperties}
                                                className={cn("h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden", isOccupied ? 'border-[var(--lot-color)] bg-[var(--lot-color-bg)]' : 'bg-background border-dashed hover:border-primary', itemToStore && 'cursor-copy')}>
                                                    {coord}
                                                </button>
                                            </PopoverTrigger>
                                            {isOccupied && firstItem && (
                                                <PopoverContent className="p-4 w-64">
                                                <div className="space-y-2">
                                                    <p><b>{firstItem.type === 'producerLot' ? `Lote: ${firstItem.displayId}` : `Producto: ${firstItem.displayId}`}</b></p>
                                                    <p>{firstItem.type === 'producerLot' ? `Productor: ${firstItem.ownerName}` : `Cliente: ${firstItem.ownerName}`}</p>
                                                    <p>Variedad/Producto: {firstItem.varietyOrProduct}</p>
                                                    <p>Cantidad: {itemsInCoord.reduce((s,i)=> s + i.quantity, 0)} {firstItem.unit}</p>
                                                    <Button size="sm" className="w-full mt-2" onClick={() => handleGridClick(chamberId, coord)}>Reubicar</Button>
                                                </div>
                                                </PopoverContent>
                                            )}
                                            </Popover>
                                        );
                                    }))}
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
            target={dialogTarget}
            open={isStoreDialogOpen}
            onOpenChange={setStoreDialogOpen}
            onConfirm={handleStoreConfirm}
        />
        
        {coordToRelocate && (
            <RelocateLotDialog
                open={isRelocateDialogOpen}
                onOpenChange={setRelocateDialogOpen}
                onRelocate={handleRelocate}
                sourceChamberId={coordToRelocate.chamberId}
                sourceCoordinate={coordToRelocate.coordinate}
                lotsInCoordinate={lotsInCoordToRelocate}
                allChamberLots={chamberLots}
                allOtherFruitReceptions={otherFruitReceptions}
            />
        )}
    </div>
  );
}
