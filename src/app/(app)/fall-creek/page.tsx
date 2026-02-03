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
import { collection, writeBatch, doc, serverTimestamp, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { chambersConfig } from '@/lib/chambers-config';
import { CheckCircle2, CircleDot, Eye, Pencil, Trash2, X, Move } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';


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
    const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');

    const { toast } = useToast();
    const firestore = useFirestore();

    const [selectionMode, setSelectionMode] = React.useState(false);
    const [selectedCoords, setSelectedCoords] = React.useState<Record<string, StoredItem[]>>({});
    const [documentoDespacho, setDocumentoDespacho] = React.useState('');
    const [clienteDestino, setClienteDestino] = React.useState('');
    const [rutDestino, setRutDestino] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isMouseDown, setIsMouseDown] = React.useState(false);
    const [selectionAction, setSelectionAction] = React.useState<'select' | 'deselect' | null>(null);
    const [openAccordions, setOpenAccordions] = React.useState<string[]>([]);

    const [movementToView, setMovementToView] = React.useState<OtherFruitMovement | null>(null);
    const [editingMovement, setEditingMovement] = React.useState<OtherFruitMovement | null>(null);
    const isEditing = editingMovement !== null;
    const [showOnlyPending, setShowOnlyPending] = React.useState(true);
    
    // State for dragging the summary card
    const [isDragging, setIsDragging] = React.useState(false);
    const [cardPosition, setCardPosition] = React.useState({ x: 0, y: 0 });
    const dragStartPos = React.useRef({ x: 0, y: 0 });
    const initialCardPos = React.useRef({ x: 0, y: 0 });


    const fallCreekClient = React.useMemo(() => {
        if (!allClients) return null;
        return allClients.find(c => c.name.toUpperCase() === FALL_CREEK_CLIENT_NAME) || null;
    }, [allClients]);

    const { storedItemsByChamber, chamberOccupancy, chambersWithFallCreekStock, reservedCoords } = React.useMemo(() => {
        if (!fallCreekClient) return { storedItemsByChamber: {}, chamberOccupancy: {}, chambersWithFallCreekStock: [], reservedCoords: new Set<string>() };

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
                    netWeightPerBin: 0,
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

        const calculatedReservedCoords = new Set<string>();
        if (allMovements) {
            allMovements
                .filter(mov => mov.status === 'Pendiente de Picking' && mov.id !== editingMovement?.id)
                .forEach(mov => {
                    mov.locations?.forEach(loc => {
                        const key = `${loc.location.chamberId}_${loc.location.coordinate}`;
                        calculatedReservedCoords.add(key);
                    });
                });
        }

        return {
            storedItemsByChamber: calculatedStoredItemsByChamber,
            chamberOccupancy: calculatedChamberOccupancy,
            chambersWithFallCreekStock: calculatedChambersWithStock,
            reservedCoords: calculatedReservedCoords
        };

    }, [fallCreekClient, allReceptions, allMovements, editingMovement]);

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

    const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        initialCardPos.current = { ...cardPosition };
    };

    React.useEffect(() => {
        const handleDragMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartPos.current.x;
            const dy = e.clientY - dragStartPos.current.y;
            setCardPosition({
                x: initialCardPos.current.x + dx,
                y: initialCardPos.current.y + dy,
            });
        };

        const handleDragEnd = () => {
            setIsDragging(false);
        };
        
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isDragging]);

    const handleMouseDown = (chamberId: string, coord: string) => {
        if (!selectionMode) return;
        
        const key = `${chamberId}_${coord}`;
        const isCurrentlySelected = !!selectedCoords[key];
        const action = isCurrentlySelected ? 'deselect' : 'select';
        
        setSelectionAction(action);
        setIsMouseDown(true);
        
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
    
    const clearSelectionState = () => {
        setSelectedCoords({});
        setDocumentoDespacho('');
        setClienteDestino('');
        setRutDestino('');
        setEditingMovement(null);
        setCardPosition({ x: 0, y: 0 });
    }
    
    const handleToggleSelectionMode = () => {
        const newMode = !selectionMode;
        setSelectionMode(newMode);
        if (!newMode) {
            clearSelectionState();
        } else {
            setCardPosition({ x: 0, y: 0 });
        }
    };
    
    const handleSubmitPreDispatch = async () => {
        const selectedItems = Object.values(selectedCoords).flat();
        if (selectedItems.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos una coordenada.' });
            return;
        }
    
        if (!firestore || !fallCreekClient) return;
    
        setIsSubmitting(true);
        try {
            const locationsToPick: OtherFruitMovementLocation[] = selectedItems.map(item => {
                const location: OtherFruitMovementLocation = {
                    receptionId: item.receptionId!,
                    itemIndex: item.itemIndex,
                    quantity: item.quantity,
                    unit: item.unit,
                    productCode: item.displayId,
                    productName: item.varietyOrProduct,
                    location: {
                        chamberId: item.chamberId,
                        coordinate: item.coordinate,
                    },
                };
        
                if (item.clientLotId) {
                    location.clientLotId = item.clientLotId;
                }
        
                return location;
            });
    
            const summaryItems = selectedItems.reduce((acc, item) => {
                const key = item.displayId;
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
    
            const movementData: Partial<OtherFruitMovement> = {
                type: 'salida' as const,
                clientId: fallCreekClient.clientId,
                clientName: fallCreekClient.name,
                unit: fallCreekClient.unit,
                items: movementItems,
                locations: locationsToPick,
                status: 'Pendiente de Picking' as const,
            };

            if (documentoDespacho) movementData.document = documentoDespacho;
            if (clienteDestino) movementData.destinationClientName = clienteDestino;
            if (rutDestino) movementData.destinationClientRUT = rutDestino;

            if (isEditing) {
                const movementRef = doc(firestore, 'otherFruitMovements', editingMovement.id);
                await updateDoc(movementRef, {...movementData, updatedAt: serverTimestamp()});
                toast({ title: 'Éxito', description: 'Solicitud de Pre-Despacho actualizada.' });
            } else {
                 await addDoc(collection(firestore, 'otherFruitMovements'), {...movementData, createdAt: serverTimestamp()});
                 toast({ title: 'Éxito', description: 'Solicitud de Pre-Despacho creada y enviada a la bodega para picking.' });
            }

            setSelectionMode(false);
            clearSelectionState();
    
        } catch (e) {
            console.error("Error creating/updating pre-dispatch", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al guardar la solicitud.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'otherFruitMovements', operation: 'write' }));
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleEditMovement = (movementToEdit: OtherFruitMovement) => {
        setEditingMovement(movementToEdit);
        setSelectionMode(true);
        setDocumentoDespacho(movementToEdit.document || '');
        setClienteDestino(movementToEdit.destinationClientName || '');
        setRutDestino(movementToEdit.destinationClientRUT || '');
        setCardPosition({ x: 0, y: 0 });

        const initialSelectedCoords: Record<string, StoredItem[]> = {};
        if (movementToEdit.locations) {
            for (const location of movementToEdit.locations) {
                const chamberItems = storedItemsByChamber[location.location.chamberId];
                if (chamberItems) {
                    const coordItems = chamberItems[location.location.coordinate];
                    if (coordItems) {
                        const key = `${location.location.chamberId}_${location.location.coordinate}`;
                        initialSelectedCoords[key] = coordItems;
                    }
                }
            }
        }
        setSelectedCoords(initialSelectedCoords);
    };

    const handleDeleteMovement = async (movementToDelete: OtherFruitMovement) => {
        if (!firestore) return;
        try {
            await deleteDoc(doc(firestore, 'otherFruitMovements', movementToDelete.id));
            toast({ title: 'Éxito', description: 'La solicitud de pre-despacho ha sido eliminada.' });
        } catch (e) {
            console.error("Error deleting movement", e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la solicitud.' });
        }
    };
    
    const selectedSummary = React.useMemo(() => {
        const items = Object.values(selectedCoords).flat();
        if (items.length === 0) return { totalQuantity: 0, unit: fallCreekClient?.unit || 'Pallets', products: [] };

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
    }, [selectedCoords, fallCreekClient]);
    

    const fallCreekMovements = React.useMemo(() => {
        if (!fallCreekClient || !allMovements) return [];
        const sortedMovements = (allMovements || [])
            .filter(m => m.clientId === fallCreekClient.clientId && m.type === 'salida')
            .sort((a,b) => {
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

    const filteredMovements = React.useMemo(() => {
        if (showOnlyPending) {
            return fallCreekMovements.filter(mov => mov.status === 'Pendiente de Picking');
        }
        return fallCreekMovements;
    }, [fallCreekMovements, showOnlyPending]);
    
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
        <div className="min-h-[calc(100vh-10rem)] pb-52">
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between">
                        <div>
                            <CardTitle>Portal Cliente: {fallCreekClient.name}</CardTitle>
                            <CardDescription>Visualice su stock y genere solicitudes de pre-despacho.</CardDescription>
                        </div>
                        <Button onClick={handleToggleSelectionMode} variant={selectionMode ? "destructive" : "default"}>
                            {selectionMode ? <X className="mr-2 h-4 w-4"/> : <CircleDot className="mr-2 h-4 w-4"/>}
                            {selectionMode ? (isEditing ? 'Cancelar Edición' : 'Cancelar Selección') : 'Iniciar Selección de Despacho'}
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="multiple" onValueChange={setOpenAccordions}>
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
                                                            const coord = `${col.name}${row}`;
                                                            if (config.blocked?.includes(coord)) {
                                                                return <div key={coord} className="h-12 w-full rounded border-2 bg-gray-200 dark:bg-gray-700 relative"><div className="absolute inset-0 bg-repeat bg-[length:10px_10px]" style={{backgroundImage: "repeating-linear-gradient(-45deg, #a0aec0, #a0aec0 1px, transparent 1px, transparent 5px)"}} /></div>;
                                                            }
                                                            
                                                            const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                                            const isOccupied = itemsInCoord.length > 0;
                                                            const key = `${chamberId}_${coord}`;
                                                            const isSelected = !!selectedCoords[key];
                                                            const isReserved = reservedCoords.has(key);
                                                            
                                                            const lotColor = isOccupied ? getColorForLot(itemsInCoord[0].lotIdForColor) : 'transparent';
                                                            const cellStyle = { 
                                                                '--lot-color': lotColor,
                                                                '--lot-color-bg': lotColor.replace(')', ', 0.2)'),
                                                            } as React.CSSProperties;

                                                            return (
                                                                <div key={coord}
                                                                    onMouseDown={() => {
                                                                        if (isReserved || !isOccupied) return;
                                                                        handleMouseDown(chamberId, coord);
                                                                    }}
                                                                    onMouseEnter={() => {
                                                                        if (isReserved || !isOccupied) return;
                                                                        handleMouseEnter(chamberId, coord);
                                                                    }}
                                                                    className={cn(
                                                                        "h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden",
                                                                        isOccupied && "bg-[var(--lot-color-bg)]",
                                                                        !isOccupied && "bg-background border-dashed",
                                                                        selectionMode && isOccupied && !isReserved && "cursor-pointer hover:border-primary",
                                                                        isReserved && "cursor-not-allowed",
                                                                        isSelected && "ring-2 ring-primary ring-offset-2"
                                                                    )}
                                                                    style={cellStyle}
                                                                >
                                                                    <span className={cn("relative z-10 font-semibold", isReserved && "opacity-50")}>{coord}</span>
                                                                    {isSelected && <div className="absolute inset-0 bg-primary/30 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-primary" /></div>}
                                                                    {isReserved && (
                                                                        <div className="absolute inset-0 bg-destructive/10">
                                                                           <div className="absolute inset-0 bg-repeat bg-[length:10px_10px]" style={{backgroundImage: "repeating-linear-gradient(-45deg, hsl(var(--destructive)/0.3), hsl(var(--destructive)/0.3) 1px, transparent 1px, transparent 5px)"}} />
                                                                        </div>
                                                                    )}
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
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Historial de Solicitudes</CardTitle>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="show-pending" checked={showOnlyPending} onCheckedChange={(checked) => setShowOnlyPending(!!checked)} />
                                <Label htmlFor="show-pending">Solo Solicitudes Pendientes</Label>
                            </div>
                        </div>
                    </CardHeader>
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
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {filteredMovements.length > 0 ? filteredMovements.map(mov => {
                                    const status = mov.status === 'Completado' ? 'Completado' : 'En Proceso';
                                    return (
                                        <TableRow key={mov.id}>
                                            <TableCell>{mov.createdAt?.toDate().toLocaleString()}</TableCell>
                                            <TableCell className="font-mono">{mov.document}</TableCell>
                                            <TableCell className="font-mono text-xs">{mov.lotes}</TableCell>
                                            <TableCell>{mov.totalQuantity} {mov.unit}</TableCell>
                                            <TableCell>
                                                <Badge variant={status === 'Completado' ? 'default' : 'secondary'}>
                                                    {status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMovementToView(mov)}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    {status !== 'Completado' && (
                                                        <>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditMovement(mov)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                             <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>¿Eliminar Solicitud?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Esta acción eliminará la solicitud de pre-despacho. No se puede deshacer.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDeleteMovement(mov)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay solicitudes que coincidan con el filtro.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {selectionMode && (
                <div
                    className="fixed z-20"
                    style={{
                        left: '50%',
                        bottom: '1rem',
                        transform: `translateX(-50%) translate(${cardPosition.x}px, ${cardPosition.y}px)`,
                        width: 'calc(100% - 2rem)',
                        maxWidth: '64rem',
                    }}
                >
                    <Card className="shadow-2xl bg-card/95 backdrop-blur-sm max-w-5xl mx-auto">
                         <CardHeader 
                            onMouseDown={handleDragStart}
                            className="cursor-move flex flex-row justify-between items-center"
                         >
                            <CardTitle>{isEditing ? 'Editar Solicitud de Pre-Despacho' : 'Resumen de Pre-Despacho'}</CardTitle>
                            <Move className="h-5 w-5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="rounded-md border p-4 space-y-2">
                                <h4 className="font-semibold">Productos Seleccionados</h4>
                                {selectedSummary.products.length > 0 ? (
                                    <ul>{selectedSummary.products.map(([name, qty]) => <li key={name}>{qty} {selectedSummary.unit} de {name}</li>)}</ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Ningún producto seleccionado.</p>
                                )}
                                </div>
                                <div className="rounded-md border p-4 space-y-2 flex flex-col justify-center">
                                    <p className="text-sm text-muted-foreground">Total a Despachar</p>
                                    <p className="text-3xl font-bold">{selectedSummary.totalQuantity} <span className="text-xl font-normal text-muted-foreground">{selectedSummary.unit}</span></p>
                                </div>
                            </div>
                             <div className="grid sm:grid-cols-3 gap-4 pt-4">
                                <div className="space-y-1">
                                    <Label htmlFor="dispatch-doc">Documento Despacho</Label>
                                    <Input id="dispatch-doc" value={documentoDespacho} onChange={e => setDocumentoDespacho(e.target.value)} placeholder="Opcional. Ej: OC-123" />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="dispatch-client">Nombre Cliente Destino</Label>
                                    <Input id="dispatch-client" value={clienteDestino} onChange={e => setClienteDestino(e.target.value)} placeholder="Ingrese nombre" />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="dispatch-rut">RUT Cliente Destino</Label>
                                    <Input id="dispatch-rut" value={rutDestino} onChange={e => setRutDestino(e.target.value)} placeholder="Ingrese RUT" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button onClick={handleToggleSelectionMode} variant="outline" size="lg" className="w-full sm:w-auto">
                                    {isEditing ? 'Cancelar Edición' : 'Cancelar Selección'}
                                </Button>
                                <Button onClick={handleSubmitPreDispatch} disabled={isSubmitting || selectedSummary.totalQuantity === 0} size="lg" className="w-full sm:w-auto">
                                    {isSubmitting ? (isEditing ? 'Guardando...' : 'Creando Solicitud...') : (isEditing ? 'Guardar Cambios' : 'Crear Solicitud de Pre-Despacho')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
             {movementToView && (
                <Dialog open={!!movementToView} onOpenChange={(isOpen) => !isOpen && setMovementToView(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Detalle de Solicitud</DialogTitle>
                            <DialogDescription>
                                Cliente: {movementToView.clientName} - Documento: {movementToView.document || 'N/A'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Lote Cliente</TableHead>
                                        <TableHead>Ubicación</TableHead>
                                        <TableHead className="text-right">Cantidad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {movementToView.locations?.map((loc, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{loc.productName}</TableCell>
                                            <TableCell className="font-mono">{loc.clientLotId || 'N/A'}</TableCell>
                                            <TableCell className="font-mono">{chambersConfig[loc.location.chamberId]?.name} / {loc.location.coordinate}</TableCell>
                                            <TableCell className="text-right">{loc.quantity} {loc.unit}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="secondary">Cerrar</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

    