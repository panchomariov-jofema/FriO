'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitMovement, StoredItem, ChamberLot, OtherFruitMovementLocation } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, writeBatch, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { chambersConfig } from '@/lib/chambers-config';
import { CheckCircle2, CircleDot, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

const FALL_CREEK_CLIENT_NAME = 'FALL CREEK';

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
    const { data: allMovements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    // Need chamberlots to know which coordinates are occupied by other clients
    const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');

    const { toast } = useToast();
    const firestore = useFirestore();

    const [selectionMode, setSelectionMode] = React.useState(false);
    const [selectedCoords, setSelectedCoords] = React.useState<Record<string, StoredItem[]>>({});
    const [documentoDespacho, setDocumentoDespacho] = React.useState('');
    const [clienteDestino, setClienteDestino] = React.useState('');
    const [rutDestino, setRutDestino] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    
    // State for drag-to-select functionality
    const [isMouseDown, setIsMouseDown] = React.useState(false);
    const [selectionAction, setSelectionAction] = React.useState<'select' | 'deselect' | null>(null);
    

    const fallCreekClient = React.useMemo(() => {
        if (!allClients) return null;
        return allClients.find(c => c.name.toUpperCase() === FALL_CREEK_CLIENT_NAME) || null;
    }, [allClients]);

    const { storedItemsByChamber, chamberOccupancy, chambersWithFallCreekStock } = React.useMemo(() => {
        if (!fallCreekClient) return { storedItemsByChamber: {}, chamberOccupancy: {}, chambersWithFallCreekStock: [] };

        const fallCreekStoredItems: StoredItem[] = (allReceptions || [])
            .filter(r => r.clientId === fallCreekClient.clientId)
            .flatMap(reception => reception.items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
                .map(({ item, index }) => ({
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
                    netWeightPerBin: 0, // This is not applicable for other fruits
                }))
            );
        
        const calculatedStoredItemsByChamber = fallCreekStoredItems.reduce((acc, item) => {
            if (!acc[item.chamberId]) acc[item.chamberId] = {};
            if (!acc[item.chamberId][item.coordinate]) acc[item.chamberId][item.coordinate] = [];
            acc[item.chamberId][item.coordinate].push(item);
            return acc;
        }, {} as Record<string, Record<string, StoredItem[]>>);

        const calculatedChamberOccupancy = Object.keys(chambersConfig).reduce((acc, chamberId) => {
            const itemsInChamber = fallCreekStoredItems.filter(item => item.chamberId === chamberId);
            const occupiedEquivalentBins = itemsInChamber.reduce((sum, item) => {
                const equivalent = item.unit === 'Pallets' ? item.quantity * 2 : item.quantity;
                return sum + equivalent;
            }, 0);
            
            acc[chamberId] = {
                occupied: occupiedEquivalentBins,
                total: chambersConfig[chamberId].capacity,
                percentage: chambersConfig[chamberId].capacity > 0 ? (occupiedEquivalentBins / chambersConfig[chamberId].capacity) * 100 : 0,
            };
            return acc;
        }, {} as Record<string, { occupied: number; total: number; percentage: number }>);
        
        const calculatedChambersWithStock = Object.keys(calculatedStoredItemsByChamber).filter(chamberId =>
            Object.values(calculatedStoredItemsByChamber[chamberId] || {}).some(items => items.length > 0)
        );

        return {
            storedItemsByChamber: calculatedStoredItemsByChamber,
            chamberOccupancy: calculatedChamberOccupancy,
            chambersWithFallCreekStock: calculatedChambersWithStock
        };

    }, [fallCreekClient, allReceptions]);

    // --- Drag-to-select handlers ---
    React.useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsMouseDown(false);
            setSelectionAction(null);
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, []);

    const handleMouseDown = (chamberId: string, coord: string) => {
        if (!selectionMode) return;
        
        const key = `${chamberId}_${coord}`;
        const isCurrentlySelected = !!selectedCoords[key];
        const action = isCurrentlySelected ? 'deselect' : 'select';
        
        setSelectionAction(action);
        setIsMouseDown(true);
        
        // Perform the action on the first cell
        const newSelectedCoords = { ...selectedCoords };
        if (action === 'deselect') {
            delete newSelectedCoords[key];
        } else {
            const itemsInCoord = storedItemsByChamber[chamberId]?.[coord];
            if (itemsInCoord) {
                newSelectedCoords[key] = itemsInCoord;
            }
        }
        setSelectedCoords(newSelectedCoords);
    };

    const handleMouseEnter = (chamberId: string, coord: string) => {
        if (!isMouseDown || !selectionMode || !selectionAction) return;
        
        const key = `${chamberId}_${coord}`;
        const newSelectedCoords = { ...selectedCoords };

        if (selectionAction === 'select' && !newSelectedCoords[key]) {
             const itemsInCoord = storedItemsByChamber[chamberId]?.[coord];
            if (itemsInCoord) {
                newSelectedCoords[key] = itemsInCoord;
                setSelectedCoords(newSelectedCoords);
            }
        } else if (selectionAction === 'deselect' && newSelectedCoords[key]) {
            delete newSelectedCoords[key];
            setSelectedCoords(newSelectedCoords);
        }
    };
    // --- End drag-to-select handlers ---
    
    const handleToggleSelectionMode = () => {
        const newMode = !selectionMode;
        setSelectionMode(newMode);
        if (!newMode) { // If turning off, clear selection
            setSelectedCoords({});
            setDocumentoDespacho('');
            setClienteDestino('');
            setRutDestino('');
        }
    };
    
    const handleCreatePreDispatch = async () => {
        const selectedItems = Object.values(selectedCoords).flat();
        if (selectedItems.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos una coordenada.' });
            return;
        }
    
        if (!firestore || !fallCreekClient) return;
    
        setIsSubmitting(true);
        try {
            // This is the detailed list for the picker
            const locationsToPick: OtherFruitMovementLocation[] = selectedItems.map(item => ({
                receptionId: item.receptionId!,
                itemIndex: item.itemIndex,
                quantity: item.quantity,
                unit: item.unit,
                productCode: item.displayId, // Pass productCode from StoredItem.displayId
                productName: item.varietyOrProduct,
                clientLotId: item.clientLotId,
                location: {
                    chamberId: item.chamberId,
                    coordinate: item.coordinate
                }
            }));
    
            // This is the summarized list for the movement record
            const summaryItems = selectedItems.reduce((acc, item) => {
                const key = item.displayId; // Group by product code
                if (!acc[key]) {
                    acc[key] = {
                        productCode: item.displayId,
                        productName: item.varietyOrProduct,
                        quantity: 0,
                        clientLotIds: new Set<string>()
                    };
                }
                acc[key].quantity += item.quantity;
                if(item.clientLotId) {
                    acc[key].clientLotIds.add(item.clientLotId);
                }
                return acc;
            }, {} as Record<string, { productCode: string; productName: string; quantity: number, clientLotIds: Set<string> }>);
            
            const movementItems = Object.values(summaryItems).map(summary => {
                const item: any = {
                    productCode: summary.productCode,
                    productName: summary.productName,
                    quantity: summary.quantity,
                };
                const clientLotId = Array.from(summary.clientLotIds).join(', ');
                if (clientLotId) {
                    item.clientLotId = clientLotId;
                }
                return item;
            });
    
            const movementData: Omit<OtherFruitMovement, 'id' | 'createdAt'> = {
                type: 'salida',
                clientId: fallCreekClient.clientId,
                clientName: fallCreekClient.name,
                unit: fallCreekClient.unit,
                document: documentoDespacho || undefined,
                destinationClientName: clienteDestino || undefined,
                destinationClientRUT: rutDestino || undefined,
                items: movementItems,
                locations: locationsToPick,
                status: 'Pendiente de Picking',
            };
    
            // Add server timestamp just before sending
            const finalMovementData = {
                ...movementData,
                createdAt: serverTimestamp(),
            };
    
            await addDoc(collection(firestore, 'otherFruitMovements'), finalMovementData);
    
            toast({ title: 'Éxito', description: 'Solicitud de Pre-Despacho creada y enviada a la bodega para picking.' });
            handleToggleSelectionMode();
    
        } catch (e) {
            console.error("Error creating pre-dispatch", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al crear la solicitud.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'otherFruitMovements', operation: 'create' }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedSummary = React.useMemo(() => {
        const items = Object.values(selectedCoords).flat();
        if (items.length === 0) return { totalQuantity: 0, unit: 'Pallets', products: [] };

        const unit = items[0].unit;
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        
        const productMap = items.reduce((acc, item) => {
            if(!acc[item.varietyOrProduct]) {
                acc[item.varietyOrProduct] = 0;
            }
            acc[item.varietyOrProduct] += item.quantity;
            return acc;
        }, {} as Record<string, number>);

        return { totalQuantity, unit, products: Object.entries(productMap) };
    }, [selectedCoords]);
    

    const fallCreekMovements = React.useMemo(() => {
        if (!fallCreekClient || !allMovements) return [];
        const sortedMovements = (allMovements || [])
            .filter(m => m.clientId === fallCreekClient.clientId && m.type === 'salida')
            .sort((a, b) => {
                const timeA = a.createdAt?.toMillis() ?? 0;
                const timeB = b.createdAt?.toMillis() ?? 0;
                return timeB - timeA;
            });

        return sortedMovements.map(mov => {
            const totalQuantity = mov.items.reduce((sum, item) => sum + item.quantity, 0);
            const lotes = [...new Set(mov.items.map(item => item.clientLotId || item.productName))].join(', ');
            return {
                ...mov,
                totalQuantity,
                lotes,
            };
        });
    }, [fallCreekClient, allMovements]);
    
    const loading = loadingClients || loadingReceptions || loadingMovements || loadingChamberLots;

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
        <div className="relative min-h-[calc(100vh-10rem)]" onMouseUp={isMouseDown ? () => { setIsMouseDown(false); setSelectionAction(null); } : undefined}>
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between">
                        <div>
                            <CardTitle>Portal Cliente: {fallCreekClient.name}</CardTitle>
                            <CardDescription>Visualice su stock y genere solicitudes de pre-despacho.</CardDescription>
                        </div>
                        <Button onClick={handleToggleSelectionMode} variant={selectionMode ? "destructive" : "default"}>
                            {selectionMode ? <X className="mr-2 h-4 w-4"/> : <CircleDot className="mr-2 h-4 w-4"/>}
                            {selectionMode ? 'Cancelar Selección' : 'Iniciar Selección de Despacho'}
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="multiple" className="w-full">
                            {chambersWithFallCreekStock.map(chamberId => {
                                const config = chambersConfig[chamberId];
                                const occupancy = chamberOccupancy[chamberId];
                                return (
                                    <AccordionItem value={chamberId} key={chamberId}>
                                        <AccordionTrigger>
                                            <div className="flex w-full items-center justify-between pr-4">
                                                <span className="text-lg font-semibold">{config.name}</span>
                                                <div className="text-right">
                                                    <p className="font-mono font-semibold">{occupancy?.occupied ?? 0} {fallCreekClient.unit}</p>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="p-4 bg-muted/50 rounded-lg border overflow-x-auto" onMouseDown={(e) => e.preventDefault()}>
                                                <div className="grid gap-1 min-w-[800px]" style={{ gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))` }}>
                                                    {config.rows.map(row =>
                                                        config.columns.map(col => {
                                                            const coord = `${col}${row}`;
                                                            if (config.blocked?.includes(coord)) {
                                                                return <div key={coord} className="h-12 w-full rounded border-2 bg-gray-200 dark:bg-gray-700 relative"><div className="absolute inset-0 bg-repeat bg-[length:10px_10px]" style={{backgroundImage: "repeating-linear-gradient(-45deg, #a0aec0, #a0aec0 1px, transparent 1px, transparent 5px)"}} /></div>;
                                                            }
                                                            
                                                            const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                                            const isOccupied = itemsInCoord.length > 0;
                                                            const isSelected = !!selectedCoords[`${chamberId}_${coord}`];
                                                            
                                                            const lotColor = isOccupied ? getColorForLot(itemsInCoord[0].lotIdForColor) : 'transparent';
                                                            const cellStyle = { 
                                                                '--lot-color': lotColor,
                                                                '--lot-color-bg': lotColor.replace(')', ', 0.2)'),
                                                            } as React.CSSProperties;

                                                            return (
                                                                <div key={coord}
                                                                    onMouseDown={() => handleMouseDown(chamberId, coord)}
                                                                    onMouseEnter={() => handleMouseEnter(chamberId, coord)}
                                                                    className={cn(
                                                                        "h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden",
                                                                        isOccupied && "bg-[var(--lot-color-bg)]",
                                                                        !isOccupied && "bg-background border-dashed",
                                                                        selectionMode && isOccupied && "cursor-pointer hover:border-primary",
                                                                        isSelected && "ring-2 ring-primary ring-offset-2"
                                                                    )}
                                                                    style={cellStyle}
                                                                >
                                                                    <span className="relative z-10 font-semibold">{coord}</span>
                                                                    {isSelected && <div className="absolute inset-0 bg-primary/30 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-primary" /></div>}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Historial de Solicitudes</CardTitle></CardHeader>
                    <CardContent>
                        <div className="rounded-md border max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Documento</TableHead>
                                        <TableHead>Lotes Involucrados</TableHead>
                                        <TableHead>Cantidad Total</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {fallCreekMovements.length > 0 ? fallCreekMovements.map(mov => {
                                    return (
                                        <TableRow key={mov.id}>
                                            <TableCell>{mov.createdAt?.toDate().toLocaleString()}</TableCell>
                                            <TableCell className="font-mono">{mov.document}</TableCell>
                                            <TableCell className="font-mono text-xs">{mov.lotes}</TableCell>
                                            <TableCell>{mov.totalQuantity} {mov.unit}</TableCell>
                                            <TableCell>
                                                <Badge variant={mov.status === 'Completado' ? 'default' : 'secondary'}>
                                                    {mov.status === 'Pendiente de Picking' ? 'En Proceso' : mov.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay solicitudes de despacho.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {Object.keys(selectedCoords).length > 0 && (
                 <div className="sticky bottom-4 z-20">
                    <Card className="max-w-5xl mx-auto shadow-2xl bg-card/95 backdrop-blur-sm">
                         <CardHeader>
                            <CardTitle>Resumen de Pre-Despacho</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="rounded-md border p-4 space-y-2">
                                <h4 className="font-semibold">Productos Seleccionados</h4>
                                <ul>
                                    {selectedSummary.products.map(([name, qty]) => <li key={name}>{qty} {selectedSummary.unit} de {name}</li>)}
                                </ul>
                                </div>
                                <div className="rounded-md border p-4 space-y-2 flex flex-col justify-center">
                                    <p className="text-sm text-muted-foreground">Total a Despachar</p>
                                    <p className="text-3xl font-bold">{selectedSummary.totalQuantity} <span className="text-xl font-normal text-muted-foreground">{selectedSummary.unit}</span></p>
                                </div>
                            </div>
                            <div className="grid sm:grid-cols-3 gap-4 items-end pt-4">
                                <div className="space-y-1">
                                    <label htmlFor="dispatch-doc" className="text-sm font-medium">Documento Despacho (Opcional)</label>
                                    <Input id="dispatch-doc" value={documentoDespacho} onChange={e => setDocumentoDespacho(e.target.value)} placeholder="Ej: Orden de Compra" />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="dispatch-client" className="text-sm font-medium">Nombre Cliente Destino</label>
                                    <Input id="dispatch-client" value={clienteDestino} onChange={e => setClienteDestino(e.target.value)} placeholder="Ingrese nombre" />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="dispatch-rut" className="text-sm font-medium">RUT Cliente Destino</label>
                                    <Input id="dispatch-rut" value={rutDestino} onChange={e => setRutDestino(e.target.value)} placeholder="Ingrese RUT" />
                                </div>
                            </div>
                            <div className="flex justify-end pt-4">
                                <Button onClick={handleCreatePreDispatch} disabled={isSubmitting} size="lg" className="w-full sm:w-auto">
                                    {isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Pre-Despacho'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
