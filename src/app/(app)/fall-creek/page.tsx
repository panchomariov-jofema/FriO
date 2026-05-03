'use client';

import * as React from 'react';
import Image from 'next/image';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { PlaceHolderImages } from '@/lib/placeholder-images';


const FALL_CREEK_CLIENT_NAME = 'FALL CREEK';

const lotColorPalette = [
  '#004b8d', // Corporate Blue
  '#7aba28', // Corporate Green
  '#f29100', // Accent Orange
  '#00a9e0', // Sky Blue
  '#5c068c', // Deep Purple
  '#e31c79', // Pink
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
    
    const [isDragging, setIsDragging] = React.useState(false);
    const [cardPosition, setCardPosition] = React.useState({ x: 0, y: 0 });
    const dragStartPos = React.useRef({ x: 0, y: 0 });
    const initialCardPos = React.useRef({ x: 0, y: 0 });

    const fallCreekLogo = PlaceHolderImages.find(img => img.id === 'fall-creek-logo');

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
                <Card className="border-t-4 border-t-[#004b8d]">
                    <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                            {fallCreekLogo && (
                                <div className="relative w-40 h-16 shrink-0 bg-white p-2 rounded-md shadow-sm border">
                                    <Image
                                        src={fallCreekLogo.imageUrl}
                                        alt={fallCreekLogo.description}
                                        fill
                                        className="object-contain"
                                        data-ai-hint={fallCreekLogo.imageHint}
                                    />
                                </div>
                            )}
                            <div>
                                <CardTitle className="text-2xl text-[#004b8d]">Portal de Autoservicio: {fallCreekClient.name}</CardTitle>
                                <CardDescription>Gestión de stock y generación de pre-despachos para plantas.</CardDescription>
                            </div>
                        </div>
                        <Button 
                            onClick={handleToggleSelectionMode} 
                            variant={selectionMode ? "destructive" : "default"}
                            className={cn(!selectionMode && "bg-[#7aba28] hover:bg-[#6aa423] text-white")}
                        >
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
                                    <AccordionItem value={chamberId} key={chamberId} className="border rounded-lg mb-2 px-4">
                                        <AccordionTrigger className="hover:no-underline py-4">
                                            <div className="flex w-full items-center justify-between pr-4">
                                                <span className="text-lg font-bold text-[#004b8d]">{config.name}</span>
                                                <div className="text-right">
                                                    <Badge variant="secondary" className="font-mono text-sm px-3 py-1 bg-muted">
                                                        {occupancy?.occupied ?? 0} {fallCreekClient.unit} Almacenados
                                                    </Badge>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="p-4 bg-muted/30 rounded-lg border overflow-x-auto" onMouseDown={(e) => e.preventDefault()}>
                                                <div className="grid gap-1 min-w-[800px]" style={{ gridTemplateColumns: `repeat(${config.columns.length}, minmax(0, 1fr))` }}>
                                                    {config.rows.map(row =>
                                                        config.columns.map(col => {
                                                            const coord = `${col.name}${row}`;
                                                            const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                                            const isOccupied = itemsInCoord.length > 0;
                                                            const key = `${chamberId}_${coord}`;
                                                            const isSelected = !!selectedCoords[key];
                                                            const isReserved = reservedCoords.has(key);
                                                            
                                                            const lotColor = isOccupied ? getColorForLot(itemsInCoord[0].lotIdForColor) : 'transparent';
                                                            const cellStyle = { 
                                                                '--lot-color': lotColor,
                                                                '--lot-color-bg': lotColor.replace(')', ', 0.15)'),
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
                                                                        "h-12 w-full rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden transition-all",
                                                                        isOccupied && "bg-[var(--lot-color-bg)] border-[var(--lot-color)]",
                                                                        !isOccupied && "bg-background border-dashed",
                                                                        selectionMode && isOccupied && !isReserved && "cursor-pointer hover:ring-2 hover:ring-primary",
                                                                        isReserved && "cursor-not-allowed",
                                                                        isSelected && "ring-4 ring-[#7aba28] ring-offset-2 z-10"
                                                                    )}
                                                                    style={cellStyle}
                                                                >
                                                                    <span className={cn("relative z-10 font-bold", isReserved && "opacity-40")}>{coord}</span>
                                                                    {isSelected && <div className="absolute inset-0 bg-[#7aba28]/40 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-white" /></div>}
                                                                    {isReserved && (
                                                                        <div className="absolute inset-0 bg-destructive/10">
                                                                           <div className="absolute inset-0 bg-repeat bg-[length:10px_10px]" style={{backgroundImage: "repeating-linear-gradient(-45deg, hsl(var(--destructive)/0.2), hsl(var(--destructive)/0.2) 1px, transparent 1px, transparent 5px)"}} />
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
                            <div>
                                <CardTitle className="text-xl">Historial de Solicitudes</CardTitle>
                                <CardDescription>Consulte el estado de sus pedidos de despacho.</CardDescription>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="show-pending" checked={showOnlyPending} onCheckedChange={(checked) => setShowOnlyPending(!!checked)} />
                                <Label htmlFor="show-pending">Ver solo pendientes</Label>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>Fecha Solicitud</TableHead>
                                        <TableHead>Referencia Doc.</TableHead>
                                        <TableHead>Lotes Cliente</TableHead>
                                        <TableHead>Cant. Total</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {filteredMovements.length > 0 ? filteredMovements.map(mov => {
                                    const status = mov.status === 'Completado' ? 'Completado' : 'En Proceso';
                                    return (
                                        <TableRow key={mov.id}>
                                            <TableCell>{mov.createdAt?.toDate().toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="font-mono font-bold">{mov.document || '-'}</TableCell>
                                            <TableCell className="font-mono text-xs max-w-[200px] truncate">{mov.lotes}</TableCell>
                                            <TableCell className="font-semibold">{mov.totalQuantity} {mov.unit}</TableCell>
                                            <TableCell>
                                                <Badge variant={status === 'Completado' ? 'default' : 'secondary'} className={cn(status !== 'Completado' && "bg-orange-100 text-orange-800")}>
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
                                                                        <AlertDialogTitle>¿Desea eliminar esta solicitud?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Esta acción cancelará la solicitud de pre-despacho y liberará los productos reservados.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Volver</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDeleteMovement(mov)} className="bg-destructive hover:bg-destructive/90">Confirmar Eliminación</AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : <TableRow><TableCell colSpan={6} className="h-24 text-center">No se encontraron solicitudes.</TableCell></TableRow>}
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
                        bottom: '1.5rem',
                        transform: `translateX(-50%) translate(${cardPosition.x}px, ${cardPosition.y}px)`,
                        width: 'calc(100% - 2rem)',
                        maxWidth: '60rem',
                    }}
                >
                    <Card className="shadow-2xl bg-card/98 border-2 border-[#004b8d] max-w-5xl mx-auto">
                         <CardHeader 
                            onMouseDown={handleDragStart}
                            className="cursor-move flex flex-row justify-between items-center bg-[#004b8d] text-white rounded-t-sm"
                         >
                            <div className="flex flex-col">
                                <CardTitle className="text-lg">{isEditing ? 'Edición de Solicitud' : 'Resumen de Pre-Despacho'}</CardTitle>
                                <span className="text-xs opacity-80">Arrastre para mover esta ventana</span>
                            </div>
                            <Move className="h-5 w-5 opacity-50" />
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="rounded-md border p-4 bg-muted/10">
                                    <h4 className="font-bold text-[#004b8d] mb-2 uppercase text-xs tracking-wider">Productos en Selección</h4>
                                    {selectedSummary.products.length > 0 ? (
                                        <ul className="space-y-1">{selectedSummary.products.map(([name, qty]) => (
                                            <li key={name} className="flex justify-between border-b border-dashed py-1">
                                                <span className="text-sm">{name}</span>
                                                <span className="font-bold">{qty} {selectedSummary.unit}</span>
                                            </li>
                                        ))}</ul>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">No hay productos seleccionados en el mapa.</p>
                                    )}
                                </div>
                                <div className="rounded-md border p-4 flex flex-col justify-center items-center bg-[#fdfdfd]">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Total a Despachar</p>
                                    <p className="text-4xl font-black text-[#7aba28]">{selectedSummary.totalQuantity} <span className="text-lg font-normal text-muted-foreground">{selectedSummary.unit}</span></p>
                                </div>
                            </div>
                             <div className="grid sm:grid-cols-3 gap-4 pt-2">
                                <div className="space-y-1">
                                    <Label htmlFor="dispatch-doc" className="text-[#004b8d]">N° Documento Interno</Label>
                                    <Input id="dispatch-doc" value={documentoDespacho} onChange={e => setDocumentoDespacho(e.target.value)} placeholder="Ej: OC-9982" className="border-[#004b8d]/20" />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="dispatch-client" className="text-[#004b8d]">Nombre del Destinatario</Label>
                                    <Input id="dispatch-client" value={clienteDestino} onChange={e => setClienteDestino(e.target.value)} placeholder="¿A quién se envía?" className="border-[#004b8d]/20" />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="dispatch-rut" className="text-[#004b8d]">RUT del Destinatario</Label>
                                    <Input id="dispatch-rut" value={rutDestino} onChange={e => setRutDestino(e.target.value)} placeholder="XX.XXX.XXX-X" className="border-[#004b8d]/20" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button onClick={handleToggleSelectionMode} variant="outline" size="lg" className="w-full sm:w-auto border-[#004b8d] text-[#004b8d]">
                                    {isEditing ? 'Cancelar' : 'Cerrar Ventana'}
                                </Button>
                                <Button 
                                    onClick={handleSubmitPreDispatch} 
                                    disabled={isSubmitting || selectedSummary.totalQuantity === 0} 
                                    size="lg" 
                                    className="w-full sm:w-auto bg-[#7aba28] hover:bg-[#6aa423] text-white font-bold"
                                >
                                    {isSubmitting ? 'Procesando...' : (isEditing ? 'Guardar Cambios' : 'Enviar Solicitud de Picking')}
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
                            <DialogTitle className="text-[#004b8d]">Detalle de Solicitud de Picking</DialogTitle>
                            <DialogDescription>
                                Cliente: {movementToView.clientName} - Referencia: {movementToView.document || 'N/A'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Lote Cliente</TableHead>
                                        <TableHead>Cámara / Coord.</TableHead>
                                        <TableHead className="text-right">Cantidad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {movementToView.locations?.map((loc, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{loc.productName}</TableCell>
                                            <TableCell className="font-mono">{loc.clientLotId || 'N/A'}</TableCell>
                                            <TableCell className="font-mono text-xs">{chambersConfig[loc.location.chamberId]?.name} / {loc.location.coordinate}</TableCell>
                                            <TableCell className="text-right font-bold">{loc.quantity} {loc.unit}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="secondary">Cerrar Detalle</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
