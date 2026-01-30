'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, ChamberLot, OtherFruitMovement, StoredItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { chambersConfig } from '@/lib/chambers-config';
import { Progress } from '@/components/ui/progress';
import { cn, naturalSort } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

const FALL_CREEK_CLIENT_NAME = 'FALL CREEK';

// Color Palette Logic
const lotColorPalette = [
  'hsl(221, 83%, 53%)', 'hsl(0, 72%, 51%)',   'hsl(48, 96%, 53%)',
  'hsl(262, 83%, 60%)', 'hsl(170, 75%, 41%)', 'hsl(350, 75%, 55%)',
  'hsl(25, 85%, 50%)',  'hsl(120, 50%, 50%)', 'hsl(310, 80%, 50%)',
  'hsl(195, 100%, 45%)','hsl(60, 100%, 45%)', 'hsl(290, 60%, 50%)',
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

export default function FallCreekPage() {
    const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
    const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: allMovements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    const { toast } = useToast();
    const firestore = useFirestore();

    const [selectedItems, setSelectedItems] = React.useState<Record<string, StoredItem>>({});
    const [documentoDespacho, setDocumentoDespacho] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const fallCreekClient = React.useMemo(() => {
        if (!allClients) return null;
        return allClients.find(c => c.name.toUpperCase() === FALL_CREEK_CLIENT_NAME) || null;
    }, [allClients]);

    const { storedFallCreekItems, storedItemsByChamber } = React.useMemo(() => {
        if (!fallCreekClient || !allReceptions) return { storedFallCreekItems: [], storedItemsByChamber: {} };

        const items: StoredItem[] = allReceptions
            .filter(r => r.clientId === fallCreekClient.clientId)
            .flatMap(reception => 
                reception.items.map((item, index) => ({
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
                    clientLotId: item.clientLotId,
                }))
            )
            .filter(item => item.chamberId && item.coordinate && item.quantity > 0 && !selectedItems[item.id]);

        const byChamber = items.reduce((acc, item) => {
            if (!acc[item.chamberId]) acc[item.chamberId] = {};
            if (!acc[item.chamberId][item.coordinate]) acc[item.chamberId][item.coordinate] = [];
            acc[item.chamberId][item.coordinate].push(item);
            return acc;
        }, {} as Record<string, Record<string, StoredItem[]>>);

        return { storedFallCreekItems: items, storedItemsByChamber: byChamber };

    }, [fallCreekClient, allReceptions, selectedItems]);
    
    const chamberOccupancy = React.useMemo(() => {
       return Object.keys(chambersConfig).reduce((acc, chamberId) => {
            const chamberConfig = chambersConfig[chamberId];
            const totalCapacity = chamberConfig.capacity;

            const fallCreekItemsInChamber = storedFallCreekItems.filter(item => item.chamberId === chamberId);
            const occupiedEquivalentBins = fallCreekItemsInChamber.reduce((sum, item) => {
                const equivalent = item.unit === 'Pallets' ? item.quantity * 2 : item.quantity;
                return sum + equivalent;
            }, 0);

            acc[chamberId] = {
                occupied: occupiedEquivalentBins,
                total: totalCapacity,
                percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0,
            };
            return acc;
        }, {} as Record<string, {occupied: number; total: number; percentage: number}>);
    }, [storedFallCreekItems]);

    const chambersWithStock = Object.entries(chambersConfig).filter(
        ([chamberId]) => (chamberOccupancy[chamberId]?.occupied ?? 0) > 0
    );

    const fallCreekMovements = React.useMemo(() => {
        if (!fallCreekClient || !allMovements) return [];
        return allMovements
            .filter(m => m.clientId === fallCreekClient.clientId && m.type === 'salida')
            .sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    }, [fallCreekClient, allMovements]);

    const handleSelectItem = (item: StoredItem, checked: boolean) => {
        setSelectedItems(prev => {
            const newSelection = { ...prev };
            if (checked) {
                newSelection[item.id] = item;
            } else {
                delete newSelection[item.id];
            }
            return newSelection;
        });
    };

    const handleCreatePreDispatch = async () => {
        if (Object.keys(selectedItems).length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos un ítem para despachar.' });
            return;
        }
        if (!documentoDespacho.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar un documento de despacho.' });
            return;
        }
        if (!firestore || !fallCreekClient) return;

        setIsSubmitting(true);
        try {
            const batch = writeBatch(firestore);
            const movementItems: OtherFruitMovement['items'] = [];
            const receptionUpdates: Record<string, {items: OtherFruitReception['items']}> = {};

            for (const item of Object.values(selectedItems)) {
                movementItems.push({
                    productCode: item.displayId,
                    productName: item.varietyOrProduct,
                    quantity: item.quantity,
                    clientLotId: item.clientLotId,
                });
                
                if (!receptionUpdates[item.receptionId!]) {
                    const originalReception = allReceptions.find(r => r.id === item.receptionId);
                    if (originalReception) {
                       receptionUpdates[item.receptionId!] = { items: JSON.parse(JSON.stringify(originalReception.items)) };
                    }
                }
                const itemToUpdate = receptionUpdates[item.receptionId!].items[item.itemIndex];
                itemToUpdate.status = 'Despachado' as any; // Temporary status
            }

            Object.entries(receptionUpdates).forEach(([receptionId, {items}]) => {
                const updatedItems = items.filter(i => i.status !== 'Despachado');
                const allItemsProcessed = updatedItems.every(i => i.status === 'Almacenado' && i.quantity === 0);
                const newStatus = allItemsProcessed ? 'Almacenado' : 'Parcialmente Almacenado';
                
                batch.update(doc(firestore, 'otherFruitReceptions', receptionId), { 
                    items: updatedItems.length > 0 ? updatedItems : [], // Remove item if it's the last one
                    status: updatedItems.length === 0 ? 'Almacenado' : newStatus
                });
            });


            const movementData: Partial<OtherFruitMovement> = {
                type: 'salida',
                clientId: fallCreekClient.clientId,
                clientName: fallCreekClient.name,
                unit: fallCreekClient.unit,
                document: documentoDespacho,
                items: movementItems,
                createdAt: serverTimestamp(),
            };
            
            const newMovementRef = doc(collection(firestore, 'otherFruitMovements'));
            batch.set(newMovementRef, movementData);

            await batch.commit();

            toast({ title: 'Éxito', description: 'Solicitud de Pre-Despacho creada correctamente.' });
            setSelectedItems({});
            setDocumentoDespacho('');

        } catch(e) {
            console.error("Error creating pre-dispatch", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al crear la solicitud.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'otherFruitMovements', operation: 'create' }));
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const loading = loadingClients || loadingReceptions || loadingChamberLots || loadingMovements;

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }
    
    if (!fallCreekClient) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Error</CardTitle>
                    <CardDescription>No se pudo encontrar el cliente "{FALL_CREEK_CLIENT_NAME}" en los datos maestros.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Portal Cliente: {fallCreekClient.name}</CardTitle>
                    <CardDescription>Visualice su stock y genere solicitudes de pre-despacho.</CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Stock en Cámaras</CardTitle>
                    <CardDescription>Haga clic en una ubicación para ver el detalle y seleccionar para despacho.</CardDescription>
                </CardHeader>
                <CardContent>
                    {chambersWithStock.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full">
                            {chambersWithStock.map(([chamberId, config]) => (
                                <AccordionItem value={chamberId} key={chamberId}>
                                    <AccordionTrigger>
                                        <div className="flex w-full items-center justify-between pr-4">
                                            <span className="text-lg font-semibold">{config.name}</span>
                                            <div className="text-right">
                                                <p className="font-mono font-semibold">
                                                    {chamberOccupancy[chamberId]?.occupied ?? 0} {fallCreekClient.unit}
                                                </p>
                                                <Progress value={chamberOccupancy[chamberId]?.percentage ?? 0} className="w-48 h-2 mt-1" />
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="p-4 bg-muted/50 rounded-lg border overflow-x-auto">
                                            <div className="grid gap-1 min-w-[800px]" style={{ gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))` }}>
                                              {config.rows.map(row =>
                                                config.columns.map(col => {
                                                  const coord = `${col}${row}`;
                                                  const isBlocked = config.blocked?.includes(coord);
                                                  const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                                  const isOccupied = itemsInCoord.length > 0;
                                                  const firstItem = isOccupied ? itemsInCoord[0] : null;

                                                  if (isBlocked) {
                                                    return <div key={coord} className="h-12 w-full rounded border-2 bg-gray-200 dark:bg-gray-700" />;
                                                  }
                                                  
                                                  const lotColor = firstItem ? getColorForLot(`${firstItem.type}-${firstItem.lotIdForColor}`) : 'transparent';
                                                  const cellStyle = { '--lot-color': lotColor, '--lot-color-bg': lotColor.replace(')', ', 0.2)') } as React.CSSProperties;

                                                  return (
                                                    <Popover key={coord}>
                                                      <PopoverTrigger asChild disabled={!isOccupied}>
                                                        <div 
                                                          className={cn("h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden",
                                                            isOccupied ? 'border-[var(--lot-color)] bg-[var(--lot-color-bg)] cursor-pointer' : 'bg-background border-dashed'
                                                          )}
                                                          style={cellStyle}
                                                        >
                                                          <span className="relative z-10 font-semibold">{coord}</span>
                                                        </div>
                                                      </PopoverTrigger>
                                                      {isOccupied && firstItem && (
                                                        <PopoverContent className="p-4 w-64 space-y-3">
                                                          {itemsInCoord.map(item => (
                                                              <div key={item.id} className="text-sm">
                                                                  <p><span className="font-semibold">Producto:</span> {item.varietyOrProduct}</p>
                                                                  {item.clientLotId && <p><span className="font-semibold">Lote Cliente:</span> {item.clientLotId}</p>}
                                                                  <p><span className="font-semibold">Cantidad:</span> {item.quantity} {item.unit}</p>
                                                                  <div className="flex items-center space-x-2 mt-2">
                                                                    <Checkbox 
                                                                        id={`select-${item.id}`}
                                                                        checked={!!selectedItems[item.id]}
                                                                        onCheckedChange={(checked) => handleSelectItem(item, !!checked)}
                                                                    />
                                                                    <Label htmlFor={`select-${item.id}`} className="font-normal">Seleccionar para despacho</Label>
                                                                  </div>
                                                              </div>
                                                          ))}
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
                    ) : (
                        <div className="text-center p-8 border-dashed border rounded-md text-sm text-muted-foreground">
                            No se encontró stock en ninguna cámara para Fall Creek.
                        </div>
                    )}
                </CardContent>
            </Card>
            
            {Object.keys(selectedItems).length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Resumen de Pre-Despacho</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="rounded-md border mb-4">
                            <Table>
                                <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Lote Cliente</TableHead><TableHead>Cantidad</TableHead><TableHead>Ubicación</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {Object.values(selectedItems).map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.varietyOrProduct}</TableCell>
                                            <TableCell>{item.clientLotId || '-'}</TableCell>
                                            <TableCell>{item.quantity} {item.unit}</TableCell>
                                            <TableCell>{item.chamberId} / {item.coordinate}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1">
                                <Label htmlFor="dispatch-doc">Documento de Despacho (Ej: Orden de Compra)</Label>
                                <Input id="dispatch-doc" value={documentoDespacho} onChange={e => setDocumentoDespacho(e.target.value)} placeholder="Ingrese un documento..." />
                            </div>
                            <Button onClick={handleCreatePreDispatch} disabled={isSubmitting}>
                                {isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Pre-Despacho'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle>Historial de Solicitudes</CardTitle></CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Documento</TableHead><TableHead>Items</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {fallCreekMovements.length > 0 ? fallCreekMovements.map(mov => (
                                <TableRow key={mov.id}>
                                    <TableCell>{mov.createdAt.toDate().toLocaleString()}</TableCell>
                                    <TableCell>{mov.document}</TableCell>
                                    <TableCell>{mov.items.map(i => `${i.quantity} ${mov.unit} de ${i.productName}`).join(', ')}</TableCell>
                                    <TableCell><Badge>Enviado</Badge></TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay solicitudes de despacho.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
