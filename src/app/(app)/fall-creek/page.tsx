'use client';

import * as React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitReceptionItem, OtherFruitMovement, StoredItem, ChamberLot, OtherFruitMovementLocation, UserMaster, ChamberTemperature, BinMaterialMovement, Producer, BinMaterial } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser } from '@/firebase';
import { collection, writeBatch, doc, setDoc, serverTimestamp, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn, safeToMillis, safeToDate, safeFormatDate, safeFormatQuantity, formatLocaleDate, formatLocaleDateString, safeStringCompare } from '@/lib/utils';
import { chambersConfig } from '@/lib/chambers-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CheckCircle2, CircleDot, Eye, Pencil, Trash2, X, Move, ClipboardCheck, History, PackageCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { parseFallCreekManifest, decomposePalletsIntoBins, type FallCreekManifestRow, fileToBase64 } from '@/lib/fall-creek-utils';
import { parseManifestAIAction } from './actions';
import { FileUp, ClipboardList, Loader2, Search, Printer, Download, Truck, Warehouse, Info, Archive } from 'lucide-react';
import { notifyPalletLogStarted } from '@/lib/telegram';
import type { PendingItem } from '@/lib/types';
import { StoreOtherFruitDialog } from '@/components/other-fruit/StoreOtherFruitDialog';
import { ChamberTemperatureInput } from '@/components/camaras/ChamberTemperatureInput';
import { mockStoredItems } from '@/lib/mock-chamber5';



const FALL_CREEK_CLIENT_NAME = 'FALL CREEK';

const lotColorPalette = [
  'hsl(208, 100%, 28%)', // Corporate Blue (#004b8d)
  'hsl(86, 65%, 44%)',  // Corporate Green (#7aba28)
  'hsl(36, 100%, 47%)', // Accent Orange (#f29100)
  'hsl(195, 100%, 44%)', // Sky Blue (#00a9e0)
  'hsl(279, 92%, 29%)',  // Deep Purple (#5c068c)
  'hsl(332, 79%, 50%)',  // Pink (#e31c79)
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
    const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');
    const { data: usersMaster } = useFirestoreCollection<UserMaster>('usersMaster');
    const { data: allTemperatures } = useFirestoreCollection<ChamberTemperature>('chamberTemperatures');
    const { data: allProducers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    const { data: allBinMaterials, loading: loadingBinMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');
    const { data: allBinMovements, loading: loadingBinMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');

    const { toast } = useToast();
    const firestore = useFirestore();
    const { user } = useUser();

    const [selectedChamber, setSelectedChamber] = React.useState('CAMARA-5');
    const [selectionMode, setSelectionMode] = React.useState(false);
    const [selectedCoords, setSelectedCoords] = React.useState<Record<string, StoredItem[]>>({});
    const [documentoDespacho, setDocumentoDespacho] = React.useState('');
    const [receptionToView, setReceptionToView] = React.useState<OtherFruitReception | null>(null);
    const [clienteDestino, setClienteDestino] = React.useState('');
    const [rutDestino, setRutDestino] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isMouseDown, setIsMouseDown] = React.useState(false);
    const [selectionAction, setSelectionAction] = React.useState<'select' | 'deselect' | null>(null);
    const [openAccordions, setOpenAccordions] = React.useState<string[]>([]);

    const [activeTab, setActiveTab] = React.useState('storage');
    const [searchQuery, setSearchQuery] = React.useState('');
    const [highlightedCoordinate, setHighlightedCoordinate] = React.useState<{ chamberId: string; coordinate: string } | null>(null);

    React.useEffect(() => {
        if (highlightedCoordinate) {
            const timer = setTimeout(() => setHighlightedCoordinate(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [highlightedCoordinate]);

    const handleNavigateToCell = (chamberId: string, coordinate: string) => {
        setActiveTab('storage');
        setOpenAccordions(prev => Array.from(new Set([...prev, chamberId])));
        setHighlightedCoordinate({ chamberId, coordinate });
    };

    const [movementToView, setMovementToView] = React.useState<OtherFruitMovement | null>(null);
    const [editingMovement, setEditingMovement] = React.useState<OtherFruitMovement | null>(null);
    const isEditing = editingMovement !== null;
    const [showOnlyPending, setShowOnlyPending] = React.useState(true);
    
    const [isDragging, setIsDragging] = React.useState(false);
    const [cardPosition, setCardPosition] = React.useState({ x: 0, y: 0 });
    const dragStartPos = React.useRef({ x: 0, y: 0 });
    const initialCardPos = React.useRef({ x: 0, y: 0 });
    
    const [importing, setImporting] = React.useState(false);
    const [previewItems, setPreviewItems] = React.useState<FallCreekManifestRow[]>([]);
    const [showPreview, setShowPreview] = React.useState(false);
    const [manifestDocument, setManifestDocument] = React.useState('');
    const [activeReception, setActiveReception] = React.useState<OtherFruitReception | null>(null);

    const duplicatePalletIds = React.useMemo(() => {
        const counts = new Map<string, number>();
        previewItems.forEach(item => {
            const pid = item['Pallet ID'] || '';
            if (pid) {
                counts.set(pid, (counts.get(pid) || 0) + 1);
            }
        });
        const duplicates = new Set<string>();
        counts.forEach((count, pid) => {
            if (count > 1) {
                duplicates.add(pid);
            }
        });
        return duplicates;
    }, [previewItems]);
    const [scannedBinId, setScannedBinId] = React.useState('');
    const [showReceptionDialog, setShowReceptionDialog] = React.useState(false);
    const [storingItem, setStoringItem] = React.useState<PendingItem | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);



    const handleConfirmStorage = async (data: { chamberId: string; coordinate: string; totalQuantity: number }) => {
        // Logic removed as client doesn't manage physical storage
    };

    const fallCreekLogo = PlaceHolderImages.find(img => img.id === 'fall-creek-logo');

    const fallCreekClient = React.useMemo(() => {
        if (!allClients) return null;
        return allClients.find(c => c.name.toUpperCase() === FALL_CREEK_CLIENT_NAME) || null;
    }, [allClients]);

    const currentUserMaster = React.useMemo(() => {
        if (!user?.email || !usersMaster) return null;
        const emailUsername = user.email.split('@')[0].toLowerCase();
        return usersMaster.find(u => typeof u.userName === 'string' && u.userName.toLowerCase() === emailUsername) || null;
    }, [user, usersMaster]);

    const isMaestro = currentUserMaster?.profileId === 'MAESTRO' || user?.email === 'francisco.villarreal@outlook.es' || user?.email?.split('@')[0].toLowerCase() === 'francisco';
    const showCargarManifiesto = isMaestro;

    const formattedData = React.useMemo(() => {
        if (!allTemperatures) return [];
        return allTemperatures
            .filter(t => t.chamberId === selectedChamber && t.timestamp && t.temperature !== undefined && t.humidity !== undefined)
            .map(t => {
                const ts = t.timestamp as any;
                const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
                return {
                    ...t,
                    dateStr: date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }),
                    timeStr: date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
                    dateTimeStr: `${date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`,
                    temperature: Number(t.temperature),
                    humidity: Number(t.humidity),
                };
            })
            .sort((a, b) => safeToMillis(a.timestamp) - safeToMillis(b.timestamp));
    }, [allTemperatures, selectedChamber]);

    const last7DaysData = React.useMemo(() => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return formattedData
            .filter(item => {
                const ts = item.timestamp as any;
                const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
                return date >= sevenDaysAgo;
            })
            .sort((a, b) => safeToMillis(b.timestamp) - safeToMillis(a.timestamp));
    }, [formattedData]);

    const loadingBinsData = loadingBinMovements || loadingBinMaterials || loadingProducers;

    const leasedBinsCount = React.useMemo(() => {
        if (loadingBinsData || !allBinMovements || !allBinMaterials || !allProducers) return 0;
        
        const fcProducers = allProducers.filter(p => {
            const shortName = String(p.shortName || '').toUpperCase();
            const name = String(p.name || '').toUpperCase();
            return shortName.includes("FALL") || name.includes("FALL");
        });
        const fcIds = new Set(fcProducers.map(p => p.producerId?.trim() || p.id?.trim()).filter(Boolean));
        fcIds.add("rKHAGeIpt5rigsAmHYza");
        fcIds.add("76361536-7");
        fcIds.add(" 76361536-7");

        const fnoBinCodes = new Set(
            (allBinMaterials || [])
                .filter(m => m.exporterId === 'EXP005' && m.type === 'BINS')
                .map(m => m.code)
        );

        let balance = 0;
        (allBinMovements || []).forEach(mov => {
            if (mov.exporterId !== 'EXP005') return;
            if (mov.observation === 'Despacho Directo') return;
            if (!mov.producerId) return;

            const cleanProdId = mov.producerId.trim();
            if (fcIds.has(cleanProdId)) {
                (mov.items || []).forEach(item => {
                    if (fnoBinCodes.has(item.binMaterialCode)) {
                        const qty = mov.type === 'salida' ? item.quantity : -item.quantity;
                        balance += qty;
                    }
                });
            }
        });
        return balance;
    }, [allBinMovements, allBinMaterials, allProducers, loadingBinsData]);

    const storedBinsCount = React.useMemo(() => {
        if (loadingReceptions || !allReceptions) return 0;
        
        let count = 0;
        (allReceptions || []).forEach(rec => {
            const isFallCreek = rec.clientName?.toUpperCase() === 'FALL CREEK' || 
                                (fallCreekClient && rec.clientId === fallCreekClient.id);
            if (isFallCreek) {
                const items = rec.items || [];
                items.forEach(item => {
                    if (item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate) {
                        count += item.quantity;
                    }
                });
            }
        });
        return count;
    }, [allReceptions, fallCreekClient, loadingReceptions]);

    const { storedItemsByChamber, chamberOccupancy, chambersWithFallCreekStock, reservedCoords, pendingItems, fallCreekStoredItems } = React.useMemo(() => {
        if (!fallCreekClient) return { storedItemsByChamber: {}, chamberOccupancy: {}, chambersWithFallCreekStock: [], reservedCoords: new Set<string>(), pendingItems: [], fallCreekStoredItems: [] };

        const fallCreekStoredItems: StoredItem[] = (allReceptions || [])
            .filter(r => r.clientId === fallCreekClient.clientId)
            .flatMap(reception => (reception.items || [])
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item && item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
                .map(({ item, index }) => ({
                    id: `${reception.id}-${index}`,
                    type: 'otherFruit' as const,
                    displayId: item.productCode,
                    lotIdForColor: item.clientLotId 
                        ? `${reception.displayLotId || reception.id}-${item.clientLotId}-${item.productName}` 
                        : `${reception.displayLotId || reception.id}-${item.productName}`,
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
                    isMixedVariety: item.isMixedVariety,
                    observation: item.observation,
                    document: reception.document,
                    documentNumber: reception.documentNumber,
                    palletId: item.palletId,
                    storedAt: item.storedAt || reception.createdAt,
                }))
            );

        // Comentado para salir en vivo sin mock data local
        // if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        //     fallCreekStoredItems.push(...mockStoredItems);
        // }
        
        const pendingItems: PendingItem[] = (allReceptions || [])
            .filter(r => r.clientId === fallCreekClient.clientId && (r.status === 'Recibido' || r.status === 'Parcialmente Almacenado'))
            .flatMap(reception => (reception.items || [])
                .map((item, index) => ({ 
                    ...item, 
                    receptionId: reception.id, 
                    itemIndex: index,
                    clientName: reception.clientName,
                    document: reception.document || '',
                    unit: reception.unit as 'Bins' | 'Pallets'
                }))
                .filter(item => item && !item.storageLocation)
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
            reservedCoords: calculatedReservedCoords,
            pendingItems,
            fallCreekStoredItems
        };

    }, [fallCreekClient, allReceptions, allMovements, editingMovement]);

    const getCoordVariety = (cId: string, coordinate: string) => {
        const items = storedItemsByChamber[cId]?.[coordinate] || [];
        if (items.length === 0) return null;
        return items[0].varietyOrProduct || null;
    };

    const renderVarietyBorders = (cId: string, colIdx: number, rowIdx: number, config: any) => {
        const currentVariety = getCoordVariety(cId, `${config.columns[colIdx].name}${config.rows[rowIdx]}`);
        if (!currentVariety) return null;

        let showRight = false;
        let showLeft = false;
        let showBottom = false;
        let showTop = false;

        // Right neighbor
        if (colIdx < config.columns.length - 1) {
            const rightCoord = `${config.columns[colIdx + 1].name}${config.rows[rowIdx]}`;
            const rightVariety = getCoordVariety(cId, rightCoord);
            if (rightVariety && rightVariety !== currentVariety) {
                showRight = true;
            }
        }

        // Left neighbor
        if (colIdx > 0) {
            const leftCoord = `${config.columns[colIdx - 1].name}${config.rows[rowIdx]}`;
            const leftVariety = getCoordVariety(cId, leftCoord);
            if (leftVariety && leftVariety !== currentVariety) {
                showLeft = true;
            }
        }

        // Bottom neighbor
        if (rowIdx < config.rows.length - 1) {
            const bottomCoord = `${config.columns[colIdx].name}${config.rows[rowIdx + 1]}`;
            const bottomVariety = getCoordVariety(cId, bottomCoord);
            if (bottomVariety && bottomVariety !== currentVariety) {
                showBottom = true;
            }
        }

        // Top neighbor
        if (rowIdx > 0) {
            const topCoord = `${config.columns[colIdx].name}${config.rows[rowIdx - 1]}`;
            const topVariety = getCoordVariety(cId, topCoord);
            if (topVariety && topVariety !== currentVariety) {
                showTop = true;
            }
        }

        return (
            <>
                {showRight && <div className="absolute right-0 top-0 bottom-0 w-[4px] bg-[#ef4444] z-30 pointer-events-none" />}
                {showLeft && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#ef4444] z-30 pointer-events-none" />}
                {showBottom && <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#ef4444] z-30 pointer-events-none" />}
                {showTop && <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#ef4444] z-30 pointer-events-none" />}
            </>
        );
    };

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
                userId: user?.uid || undefined,
                userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        try {
            let items: FallCreekManifestRow[] = [];
            
            const fileName = file.name.toLowerCase();
            const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
            const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(fileName);

            if (isPdf || isImage) {
                // Handle via AI Vision
                toast({ title: 'Procesando con IA', description: 'Leyendo el documento visualmente...' });
                const base64 = await fileToBase64(file);
                const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');
                const response = await parseManifestAIAction(base64, mimeType);
                
                if (response.success && response.data) {
                    items = response.data;
                } else {
                    let friendlyError = response.error || 'No se pudo extraer la información del documento.';
                    if (
                        friendlyError.includes('API_KEY_SERVICE_BLOCKED') || 
                        friendlyError.includes('API key') || 
                        friendlyError.includes('leaked') || 
                        friendlyError.includes('blocked') || 
                        friendlyError.includes('NOT_FOUND') ||
                        friendlyError.includes('403') ||
                        friendlyError.includes('404')
                    ) {
                        friendlyError = 'Error de API Key de Gemini: La clave configurada en el servidor no es válida, está bloqueada o fue reportada como filtrada. Por favor, genere y configure una clave válida (GOOGLE_GENAI_API_KEY) en las variables de entorno de App Hosting o local.';
                    }
                    throw new Error(friendlyError);
                }
            } else {
                // Handle via standard Excel parser
                items = await parseFallCreekManifest(file);
            }

            if (items.length === 0) {
                toast({ variant: 'destructive', title: 'Sin Datos', description: 'No se encontraron registros en el archivo.' });
                return;
            }

            setPreviewItems(items);
            setManifestDocument(file.name.replace(/\.[^/.]+$/, ""));
            setShowPreview(true);
        } catch (error: any) {
            console.error("Error parsing manifest:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Error de Importación', 
                description: error.message || 'No se pudo procesar el archivo.' 
            });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleConfirmImport = async () => {
        if (!firestore || !fallCreekClient || previewItems.length === 0) return;

        setIsSubmitting(true);
        try {
            // Decompose pallet rows into individual bins for our internal tracking
            const decomposedItems = decomposePalletsIntoBins(previewItems);

            const receptionData: Partial<OtherFruitReception> = {
                clientId: fallCreekClient.clientId,
                clientName: fallCreekClient.name,
                unit: fallCreekClient.unit,
                document: manifestDocument,
                items: decomposedItems,
                status: 'Pendiente de recibir',
                createdAt: serverTimestamp() as any,
                userId: user?.uid || undefined,
                userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
            };

            const docRef = await addDoc(collection(firestore, 'otherFruitReceptions'), receptionData);
            
            notifyPalletLogStarted(firestore, {
                ...receptionData,
                id: docRef.id
            } as any).catch(err => {
                console.error("Error al enviar la notificación de Telegram de inicio:", err);
            });

            toast({ title: 'Éxito', description: 'Manifiesto cargado correctamente. Se han generado los bins correspondientes para su recepción.' });
            setShowPreview(false);
            setPreviewItems([]);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Physical reception logic removed
    
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

    const handleDeleteManifest = async (receptionToDelete: OtherFruitReception) => {
        if (!firestore) return;
        
        const confirmDelete = window.confirm(
            `¿Está seguro de que desea eliminar el manifiesto (Pallet Log) "${receptionToDelete.document}"?`
        );
        if (!confirmDelete) return;

        try {
            await deleteDoc(doc(firestore, 'otherFruitReceptions', receptionToDelete.id!));
            toast({ title: 'Éxito', description: 'El manifiesto (Pallet Log) ha sido eliminado.' });
        } catch (e) {
            console.error("Error deleting manifest", e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el manifiesto.' });
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
            .sort((a,b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));

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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <TabsList className="bg-[#004b8d]/10 p-1 flex overflow-x-auto w-full md:w-auto md:inline-flex scrollbar-none whitespace-nowrap h-auto md:h-10">
                        <TabsTrigger value="storage" className="data-[state=active]:bg-[#004b8d] data-[state=active]:text-white shrink-0">
                            <PackageCheck className="mr-2 h-4 w-4" />
                            Stock en Cámaras
                        </TabsTrigger>
                        <TabsTrigger value="stock-query" className="data-[state=active]:bg-[#004b8d] data-[state=active]:text-white shrink-0">
                            <Search className="mr-2 h-4 w-4" />
                            Consulta Stock
                        </TabsTrigger>
                        <TabsTrigger value="history" className="data-[state=active]:bg-[#004b8d] data-[state=active]:text-white shrink-0">
                            <History className="mr-2 h-4 w-4" />
                            Historial
                        </TabsTrigger>
                        <TabsTrigger value="bins" className="data-[state=active]:bg-[#004b8d] data-[state=active]:text-white shrink-0">
                            <Archive className="mr-2 h-4 w-4" />
                            Bins
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="storage" className="space-y-6">
                    <Card className="border-t-4 border-t-[#004b8d]">
                    <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full lg:w-auto">
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
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                            {showCargarManifiesto && (
                                <>
                                    <Input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept=".xlsx,.xls,.csv,.pdf,image/*"
                                        onChange={handleFileUpload}
                                    />
                                    <Button 
                                        onClick={() => fileInputRef.current?.click()}
                                        variant="outline"
                                        className="border-[#004b8d] text-[#004b8d] hover:bg-[#004b8d]/10 w-full sm:w-auto"
                                        disabled={importing}
                                    >
                                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileUp className="mr-2 h-4 w-4"/>}
                                        Cargar Manifiesto
                                    </Button>
                                </>
                            )}
                            <Button 
                                onClick={handleToggleSelectionMode} 
                                variant={selectionMode ? "destructive" : "default"}
                                className={cn(!selectionMode && "bg-[#7aba28] hover:bg-[#6aa423] text-white", "w-full sm:w-auto")}
                            >
                                {selectionMode ? <X className="mr-2 h-4 w-4"/> : <CircleDot className="mr-2 h-4 w-4"/>}
                                {selectionMode ? (isEditing ? 'Cancelar Edición' : 'Cancelar Selección') : 'Iniciar Selección de Despacho'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Accordion type="multiple" value={openAccordions} onValueChange={setOpenAccordions}>
                            {Object.keys(chambersConfig)
                                .filter(id => id !== 'CAMARA-1' && id !== 'CAMARA-6')
                                .map(chamberId => {
                                    const config = chambersConfig[chamberId];
                                    const occupancy = chamberOccupancy[chamberId];
                                    const isRow13Enabled = !!chamberSettings?.find(s => s.id === chamberId)?.row13Enabled;
                                    const activeRows = isRow13Enabled ? config.rows : config.rows.filter(r => r !== 13 && r !== 14);
                                    return (
                                        <AccordionItem value={chamberId} key={chamberId} className="border rounded-lg mb-2 px-4">
                                            <div className="flex flex-col sm:flex-row w-full sm:items-center justify-between gap-2 pr-4 pb-2 sm:pb-0">
                                                <AccordionTrigger className="hover:no-underline py-4 flex-1">
                                                    <span className="text-lg font-bold text-[#004b8d]">{config.name}</span>
                                                </AccordionTrigger>
                                                <div className="flex flex-wrap items-center gap-2 sm:gap-4 py-2 sm:py-0 z-10 w-full sm:w-auto justify-start sm:justify-end">
                                                    <ChamberTemperatureInput chamberId={chamberId} readOnly={true} />
                                                    <div className="text-right">
                                                        <Badge variant="secondary" className="font-mono text-sm px-3 py-1 bg-muted">
                                                            {occupancy?.occupied ?? 0} {fallCreekClient.unit} Almacenados
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                            <AccordionContent>
                                            <div className="p-4 bg-muted/30 rounded-lg border overflow-x-auto" onMouseDown={(e) => e.preventDefault()}>
                                                <div className="grid gap-1 min-w-[800px]" style={{ 
                                                    gridTemplateRows: `repeat(${activeRows.length}, minmax(0, 1fr))`,
                                                    gridAutoFlow: 'column'
                                                }}>
                                                    {config.columns.map((col, colIdx) =>
                                                        activeRows.map((row, rowIdx) => {
                                                            const coord = `${col.name}${row}`;
                                                            const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                                            const isOccupied = itemsInCoord.length > 0;
                                                            const key = `${chamberId}_${coord}`;
                                                            const isSelected = !!selectedCoords[key];
                                                            const isReserved = reservedCoords.has(key);
                                                            const uniqueLotIds = isOccupied ? Array.from(new Set(itemsInCoord.map(item => item.lotIdForColor))) : [];
                                                            const isMixed = uniqueLotIds.length > 1;
                                                             
                                                            let cellStyle: React.CSSProperties = {};
                                                            if (isOccupied) {
                                                                if (!isMixed) {
                                                                    const lotColor = getColorForLot(itemsInCoord[0].lotIdForColor);
                                                                    cellStyle = { 
                                                                        '--lot-color': lotColor,
                                                                        '--lot-color-bg': lotColor.replace(')', ', 0.15)'),
                                                                    } as React.CSSProperties;
                                                                } else {
                                                                    const lotQuantities = uniqueLotIds.map(lotId => {
                                                                        const itemsForLot = itemsInCoord.filter(item => item.lotIdForColor === lotId);
                                                                        const totalQty = itemsForLot.reduce((sum, item) => sum + item.quantity, 0);
                                                                        return { lotId, quantity: totalQty, color: getColorForLot(lotId) };
                                                                    });
                                                                    lotQuantities.sort((a, b) => safeStringCompare(a.lotId, b.lotId));
                                                                    const totalCoordQuantity = lotQuantities.reduce((sum, l) => sum + l.quantity, 0);

                                                                    let accumulatedPct = 0;
                                                                    const bgGradients: string[] = [];

                                                                    lotQuantities.forEach((l) => {
                                                                        const share = totalCoordQuantity > 0 ? (l.quantity / totalCoordQuantity) * 100 : 0;
                                                                        const start = Math.round(accumulatedPct);
                                                                        accumulatedPct += share;
                                                                        const end = Math.round(accumulatedPct);

                                                                        const colorBg = l.color.replace(')', ', 0.15)');
                                                                        bgGradients.push(`${colorBg} ${start}%, ${colorBg} ${end}%`);
                                                                    });

                                                                    const firstLotColor = lotQuantities[0].color;
                                                                    cellStyle = {
                                                                        backgroundImage: `linear-gradient(135deg, ${bgGradients.join(', ')})`,
                                                                        '--lot-color': firstLotColor,
                                                                    } as React.CSSProperties;
                                                                }
                                                            }
                                                             const isLargeChamber = ['CAMARA-4', 'CAMARA-5', 'CAMARA-6'].includes(chamberId);
                                                             const allowedComodinCols = isLargeChamber ? ['A', 'B', 'C', 'M', 'N', 'O'] : ['A', 'B', 'C', 'H', 'I', 'J'];
                                                             const isPermanentlyBlocked = (row === 13 || row === 14) && !allowedComodinCols.includes(col.name);
                                                            const isComodinRow = row === 13 || row === 14;

                                                            const cellElement = (
                                                                <div key={coord}
                                                                    onMouseDown={() => {
                                                                        if (isPermanentlyBlocked || isReserved || !isOccupied) return;
                                                                        handleMouseDown(chamberId, coord);
                                                                    }}
                                                                    onMouseEnter={() => {
                                                                        if (isPermanentlyBlocked || isReserved || !isOccupied) return;
                                                                        handleMouseEnter(chamberId, coord);
                                                                    }}
                                                                    className={cn(
                                                                        "h-12 w-full min-w-[60px] rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden transition-all",
                                                                        isPermanentlyBlocked 
                                                                          ? 'bg-muted/10 border-muted-foreground/10 text-muted-foreground/30 pointer-events-none select-none'
                                                                          : (isOccupied && !isMixed && "bg-[var(--lot-color-bg)] border-[var(--lot-color)] cursor-pointer"),
                                                                        isOccupied && isMixed && !isPermanentlyBlocked && "border-[var(--lot-color)] cursor-pointer",
                                                                        !isOccupied && !isPermanentlyBlocked && "bg-background border-dashed cursor-pointer",
                                                                        !isPermanentlyBlocked && isComodinRow && "border-amber-500/40",
                                                                        selectionMode && isOccupied && !isReserved && !isPermanentlyBlocked && "hover:ring-2 hover:ring-primary",
                                                                        isReserved && "cursor-not-allowed",
                                                                        isSelected && "ring-4 ring-[#7aba28] ring-offset-2 z-10",
                                                                        highlightedCoordinate?.chamberId === chamberId && highlightedCoordinate?.coordinate === coord && "ring-4 ring-amber-500 border-amber-600 animate-pulse scale-105 z-20"
                                                                    )}
                                                                    style={isPermanentlyBlocked ? {} : cellStyle}
                                                                >
                                                                    <span className={cn("relative z-10 font-bold", (isReserved || isPermanentlyBlocked) && "opacity-40")}>{coord}</span>
                                                                    {!isPermanentlyBlocked && isComodinRow && (
                                                                        <div className="absolute inset-0 bg-repeat bg-[length:12px_12px] opacity-25 z-0 pointer-events-none" style={{backgroundImage: "repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 1px, transparent 1px, transparent 6px)"}} />
                                                                    )}
                                                                    {isOccupied && !isPermanentlyBlocked && itemsInCoord.some(i => i.isMixedVariety) && (
                                                                        <div className="absolute top-0 right-0 p-0.5">
                                                                            <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                                                                        </div>
                                                                    )}
                                                                    {isMixed && !isPermanentlyBlocked && (
                                                                        <div className="absolute top-0.5 left-1 z-20 bg-black/60 rounded px-0.5 text-[8px] font-black text-amber-500 leading-none shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                                                                            ⚠
                                                                        </div>
                                                                    )}
                                                                    {!isPermanentlyBlocked && isComodinRow && (
                                                                        <div className="absolute bottom-0.5 right-1 z-20 bg-amber-500 text-white rounded px-0.5 text-[8px] font-black leading-none shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                                                                            SOS
                                                                        </div>
                                                                    )}
                                                                    {isSelected && <div className="absolute inset-0 bg-[#7aba28]/40 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-white" /></div>}
                                                                    {renderVarietyBorders(chamberId, colIdx, rowIdx, config)}
                                                                    {isReserved && (
                                                                        <div className="absolute inset-0 bg-destructive/10">
                                                                           <div className="absolute inset-0 bg-repeat bg-[length:10px_10px]" style={{backgroundImage: "repeating-linear-gradient(-45deg, hsl(var(--destructive)/0.2), hsl(var(--destructive)/0.2) 1px, transparent 1px, transparent 5px)"}} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );

                                                            if (selectionMode || isPermanentlyBlocked || !isOccupied) {
                                                                return cellElement;
                                                            }

                                                            const firstItem = itemsInCoord[0];
                                                            const uniquePalletIds = Array.from(new Set(itemsInCoord.map(i => i.palletId).filter(Boolean)));

                                                            return (
                                                                <Popover key={coord}>
                                                                    <PopoverTrigger asChild>
                                                                        {cellElement}
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="p-4 w-60 sm:w-64" side="bottom" align="center">
                                                                        <div className="space-y-2">
                                                                            <div className="border-b pb-1">
                                                                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ubicación {coord}</p>
                                                                                <p className="text-sm font-semibold">
                                                                                    {uniqueLotIds.length > 1 ? 'Lotes Mezclados' : `Documento: ${firstItem?.document || '-'}`}
                                                                                </p>
                                                                            </div>
                                                                            
                                                                            {uniqueLotIds.length > 1 ? (
                                                                                <div className="space-y-3">
                                                                                    <p className="text-xs font-bold text-amber-500 flex items-center gap-1">
                                                                                        <span>⚠ Contiene {uniqueLotIds.length} lotes</span>
                                                                                    </p>
                                                                                    <div className="space-y-2 max-h-36 overflow-y-auto">
                                                                                        {itemsInCoord.map((item, idx) => (
                                                                                            <div key={idx} className="text-xs border-b border-dashed pb-1.5 last:border-0 last:pb-0">
                                                                                                <div className="flex justify-between items-center">
                                                                                                    <span className="font-bold">Doc: {item.document || '-'}</span>
                                                                                                    <Badge variant="outline" className="h-4 text-[9px] px-1 bg-primary/5 text-primary border-primary/20">
                                                                                                        {item.quantity} {item.unit}
                                                                                                    </Badge>
                                                                                                </div>
                                                                                                <p className="text-muted-foreground mt-0.5">{item.varietyOrProduct}</p>
                                                                                                {item.clientLotId && <p className="text-muted-foreground font-mono text-[9px]">Lote: {item.clientLotId}</p>}
                                                                                                {item.palletId && <p className="text-muted-foreground font-mono text-[9px]">Pallet ID: {item.palletId}</p>}
                                                                                                {item.observation && <p className="text-muted-foreground italic text-[10px] mt-0.5">Obs: {item.observation}</p>}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-xs space-y-1">
                                                                                    {firstItem && (
                                                                                        <>
                                                                                            <p><span className="font-semibold">Cliente:</span> {firstItem.ownerName}</p>
                                                                                            <p><span className="font-semibold">Pallet Log:</span> {firstItem.document || '-'}</p>
                                                                                            <p><span className="font-semibold">Pallet ID:</span> <span className="font-mono">{uniquePalletIds.join(', ') || '-'}</span></p>
                                                                                            <p><span className="font-semibold">Variedad:</span> {firstItem.varietyOrProduct}</p>
                                                                                            <p><span className="font-semibold">Documento:</span> {firstItem.documentNumber || '-'}</p>
                                                                                            {firstItem.observation && (
                                                                                                <p className="text-muted-foreground italic text-xs mt-0.5"><span className="font-semibold">Obs:</span> {firstItem.observation}</p>
                                                                                            )}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            
                                                                            <div className="grid grid-cols-2 gap-x-4 pt-1 text-xs font-semibold border-t">
                                                                                <p>Bins: {itemsInCoord.filter(i => i.unit === 'Bins').reduce((s, i) => s + i.quantity, 0)}</p>
                                                                                <p>Pallets: {itemsInCoord.filter(i => i.unit === 'Pallets').reduce((s, i) => s + i.quantity, 0)}</p>
                                                                            </div>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
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
                           {/* Redundant history card removed from Stock tab */}
            </Card>

                    <Card className="border-t-4 border-t-[#7aba28] mt-6">
                        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-xl text-[#004b8d] flex items-center gap-2">
                                    <History className="h-5 w-5 text-[#7aba28]" />
                                    Historial de Climatización de Cámaras
                                </CardTitle>
                                <CardDescription>
                                    Evolución de temperatura y humedad en las cámaras de almacenamiento.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Select value={selectedChamber} onValueChange={setSelectedChamber}>
                                    <SelectTrigger className="w-[180px] border-[#004b8d]/20">
                                        <SelectValue placeholder="Seleccione Cámara" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CAMARA-2">Cámara 2</SelectItem>
                                        <SelectItem value="CAMARA-3">Cámara 3</SelectItem>
                                        <SelectItem value="CAMARA-4">Cámara 4</SelectItem>
                                        <SelectItem value="CAMARA-5">Cámara 5</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {formattedData.length > 0 ? (
                                <div className="space-y-6">
                                    <div className="h-[350px] w-full mt-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart
                                                data={formattedData}
                                                margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                                            >
                                                <defs>
                                                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#004b8d" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#004b8d" stopOpacity={0}/>
                                                    </linearGradient>
                                                    <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#00a9e0" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#00a9e0" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                                <XAxis 
                                                    dataKey="dateTimeStr" 
                                                    className="text-[10px] fill-muted-foreground"
                                                    tickLine={false}
                                                />
                                                <YAxis 
                                                    yAxisId="left"
                                                    className="text-[10px] fill-muted-foreground"
                                                    tickLine={false}
                                                    label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft', offset: -5, style: { textAnchor: 'middle', fill: '#004b8d', fontWeight: 'bold' } }}
                                                />
                                                <YAxis 
                                                    yAxisId="right"
                                                    orientation="right"
                                                    className="text-[10px] fill-muted-foreground"
                                                    tickLine={false}
                                                    label={{ value: 'Humedad (% HR)', angle: 90, position: 'insideRight', offset: 5, style: { textAnchor: 'middle', fill: '#00a9e0', fontWeight: 'bold' } }}
                                                />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                    labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--foreground))' }}
                                                />
                                                <Legend verticalAlign="top" height={36} />
                                                <Area 
                                                    yAxisId="left"
                                                    type="monotone" 
                                                    dataKey="temperature" 
                                                    name="Temperatura (°C)" 
                                                    stroke="#004b8d" 
                                                    fillOpacity={1} 
                                                    fill="url(#colorTemp)" 
                                                />
                                                <Area 
                                                    yAxisId="right"
                                                    type="monotone" 
                                                    dataKey="humidity" 
                                                    name="Humedad (% HR)" 
                                                    stroke="#00a9e0" 
                                                    fillOpacity={1} 
                                                    fill="url(#colorHum)" 
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Tabla de registros históricos de los últimos 7 días */}
                                    <div className="rounded-md border overflow-x-auto mt-6">
                                        <Table>
                                            <TableHeader className="bg-muted/40">
                                                <TableRow>
                                                    <TableHead className="font-bold text-xs uppercase">Fecha / Hora</TableHead>
                                                    <TableHead className="font-bold text-xs uppercase">Cámara</TableHead>
                                                    <TableHead className="font-bold text-xs uppercase">Temperatura</TableHead>
                                                    <TableHead className="font-bold text-xs uppercase">Humedad</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {last7DaysData.length > 0 ? (
                                                    last7DaysData.map((item) => (
                                                        <TableRow key={item.id} className="hover:bg-muted/30">
                                                            <TableCell className="text-xs">{item.dateTimeStr}</TableCell>
                                                            <TableCell className="text-xs font-semibold">{chambersConfig[item.chamberId]?.name || item.chamberId}</TableCell>
                                                            <TableCell className="font-mono text-xs font-bold text-[#004b8d]">
                                                                {item.temperature !== undefined ? `${item.temperature.toFixed(1)}°C` : '-'}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs font-bold text-[#00a9e0]">
                                                                {item.humidity !== undefined && item.humidity !== null ? `${item.humidity.toFixed(1)}% HR` : '-'}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                                                            No hay registros de climatización para los últimos 7 días.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[200px] border-2 border-dashed rounded-lg bg-muted/20">
                                    <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">No hay registros de climatización para esta cámara en los últimos días.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="stock-query" className="space-y-6">
                    <Card className="border-t-4 border-t-[#004b8d]">
                        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-xl text-[#004b8d] flex items-center gap-2">
                                    <Search className="h-5 w-5 text-[#7aba28]" />
                                    Consulta de Stock de Fall Creek
                                </CardTitle>
                                <CardDescription>
                                    Consulte la ubicación, Pallet ID y estado de los pallets almacenados en las cámaras.
                                </CardDescription>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar Pallet ID, Documento, Lote..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 border-[#004b8d]/20"
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(() => {
                                const q = searchQuery.toLowerCase().trim();
                                const filtered = (fallCreekStoredItems || []).filter(item => {
                                    if (!q) return true;
                                    const palletIdStr = String(item.palletId || '').toLowerCase();
                                    const docStr = String(item.document || '').toLowerCase();
                                    const lotStr = String(item.clientLotId || '').toLowerCase();
                                    const prodStr = String(item.varietyOrProduct || '').toLowerCase();
                                    const chamberStr = String(chambersConfig[item.chamberId]?.name || item.chamberId).toLowerCase();
                                    const coordStr = String(item.coordinate || '').toLowerCase();

                                    return palletIdStr.includes(q) ||
                                           docStr.includes(q) ||
                                           lotStr.includes(q) ||
                                           prodStr.includes(q) ||
                                           chamberStr.includes(q) ||
                                           coordStr.includes(q);
                                });

                                return (
                                    <div className="rounded-md border overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Fecha Almacenamiento</TableHead>
                                                    <TableHead>Pallet Log (Documento)</TableHead>
                                                    <TableHead>Pallet ID</TableHead>
                                                    <TableHead>Lote Cliente</TableHead>
                                                    <TableHead>Variedad</TableHead>
                                                    <TableHead>Cámara</TableHead>
                                                    <TableHead>Ubicación</TableHead>
                                                    <TableHead>Cantidad (Bins)</TableHead>
                                                    <TableHead className="text-right">Acciones</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filtered.length > 0 ? (
                                                    filtered.map((item) => {
                                                        const storedDate = item.storedAt?.toDate 
                                                            ? item.storedAt.toDate().toLocaleDateString() 
                                                            : (item.storedAt ? new Date(item.storedAt).toLocaleDateString() : 'Sin fecha');
                                                        return (
                                                            <TableRow key={item.id}>
                                                                <TableCell>{storedDate}</TableCell>
                                                                <TableCell className="font-mono text-xs">{item.document || '-'}</TableCell>
                                                                <TableCell className="font-mono text-xs font-bold">{item.palletId || '-'}</TableCell>
                                                                <TableCell className="font-mono text-xs">{item.clientLotId || '-'}</TableCell>
                                                                <TableCell>{item.varietyOrProduct}</TableCell>
                                                                <TableCell>{chambersConfig[item.chamberId]?.name || item.chamberId}</TableCell>
                                                                <TableCell className="font-mono font-bold text-[#004b8d]">{item.coordinate}</TableCell>
                                                                <TableCell className="font-semibold">{item.quantity}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button 
                                                                        variant="outline" 
                                                                        size="sm" 
                                                                        className="h-7 text-xs border-[#004b8d]/20 hover:bg-[#004b8d]/10"
                                                                        onClick={() => handleNavigateToCell(item.chamberId, item.coordinate)}
                                                                    >
                                                                        <Eye className="mr-1 h-3.5 w-3.5 text-[#004b8d]" />
                                                                        Ver en Cámara
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                                            No se encontraron pallets o bins con los criterios ingresados.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                );
                            })()}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="space-y-6">
                    <Tabs defaultValue="manifests" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="manifests">Manifiestos (Pallet Logs)</TabsTrigger>
                            <TabsTrigger value="dispatches">Solicitudes de Despacho</TabsTrigger>
                        </TabsList>

                        <TabsContent value="manifests">
                            <Card className="border-t-4 border-t-orange-500">
                                <CardHeader>
                                    <CardTitle>Historial de Manifiestos</CardTitle>
                                    <CardDescription>Consulte el estado de los Pallet Logs cargados y recibidos.</CardDescription>
                                </CardHeader>
                                <CardContent className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Documento</TableHead>
                                                <TableHead>Bins</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(allReceptions || [])
                                                .filter(r => r.clientId === fallCreekClient.clientId)
                                                .sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt))
                                                .map(reception => (
                                                    <TableRow key={reception.id}>
                                                        <TableCell>{formatLocaleDateString(reception.createdAt)}</TableCell>
                                                        <TableCell className="font-mono font-bold">
                                                            <div>{reception.document}</div>
                                                            {reception.documentNumber && (
                                                                <span className="text-[11px] text-muted-foreground font-normal block mt-0.5">Doc: {reception.documentNumber}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{reception.items.length}</TableCell>
                                                        <TableCell>
                                                            <Badge 
                                                                variant={reception.status === 'Almacenado' ? 'default' : 'secondary'}
                                                                className={cn(
                                                                    reception.status === 'Pendiente de recibir' && "bg-orange-100 text-orange-800",
                                                                    reception.status === 'Recibido' && "bg-blue-100 text-blue-800",
                                                                    reception.status === 'Almacenado' && "bg-green-100 text-green-800"
                                                                )}
                                                            >
                                                                {reception.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right flex items-center justify-end gap-1">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReceptionToView(reception)}>
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            {showCargarManifiesto && (
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" 
                                                                    onClick={() => handleDeleteManifest(reception)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            {(allReceptions || []).filter(r => r.clientId === fallCreekClient.clientId).length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center">No se encontraron manifiestos.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="dispatches">
                            <Card className="border-t-4 border-t-[#004b8d]">
                                <CardHeader>
                                    <CardTitle>Solicitudes de Pre-Despacho</CardTitle>
                                    <CardDescription>Consulte el estado de todas las solicitudes de picking y despacho sugeridas.</CardDescription>
                                </CardHeader>
                                <CardContent className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Fecha / Hora</TableHead>
                                                <TableHead>Documento</TableHead>
                                                <TableHead>Lotes / Productos</TableHead>
                                                <TableHead>Cantidad</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {fallCreekMovements.map(mov => {
                                                const status = mov.status === 'Completado' ? 'Completado' : 'En Proceso';
                                                return (
                                                    <TableRow key={mov.id}>
                                                        <TableCell className="text-xs">{mov.createdAt?.toDate()?.toLocaleString('es-CL') ?? 'Sin fecha'}</TableCell>
                                                        <TableCell className="font-mono font-bold">{mov.document || '-'}</TableCell>
                                                        <TableCell className="font-mono text-[10px] max-w-[250px] truncate">{mov.lotes}</TableCell>
                                                        <TableCell className="font-semibold">{mov.totalQuantity} {mov.unit}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={status === 'Completado' ? 'default' : 'secondary'} className={cn(status !== 'Completado' && "bg-orange-100 text-orange-800")}>
                                                                {status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMovementToView(mov)}>
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {fallCreekMovements.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">No se encontraron solicitudes.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>

                <TabsContent value="bins" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Tarjeta 1: Bins en Arriendo */}
                        <Card className="border-t-4 border-t-[#004b8d] backdrop-blur bg-white/60 dark:bg-zinc-900/60 shadow-lg hover:shadow-xl transition-all duration-300">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg text-[#004b8d] font-bold">
                                        Bins en Arriendo
                                    </CardTitle>
                                    <div className="p-2 bg-[#004b8d]/10 rounded-full text-[#004b8d]">
                                        <Truck className="h-6 w-6" />
                                    </div>
                                </div>
                                <CardDescription>
                                    Total de Bins de arriendo (FÑO) en posesión física del productor.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 flex flex-col justify-center min-h-[140px]">
                                {loadingBinsData ? (
                                    <Skeleton className="h-16 w-32 mx-auto" />
                                ) : (
                                    <div className="text-center">
                                        <span className="text-6xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
                                            {leasedBinsCount.toLocaleString()}
                                        </span>
                                        <span className="text-sm font-semibold text-muted-foreground block mt-2">
                                            Bins entregados en arriendo
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Tarjeta 2: Bins Almacenados */}
                        <Card className="border-t-4 border-t-[#7aba28] backdrop-blur bg-white/60 dark:bg-zinc-900/60 shadow-lg hover:shadow-xl transition-all duration-300">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg text-[#7aba28] font-bold">
                                        Bins Almacenados
                                    </CardTitle>
                                    <div className="p-2 bg-[#7aba28]/10 rounded-full text-[#7aba28]">
                                        <Warehouse className="h-6 w-6" />
                                    </div>
                                </div>
                                <CardDescription>
                                    Total de Bins con plantas de Fall Creek almacenados en las cámaras.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 flex flex-col justify-center min-h-[140px]">
                                {loadingReceptions ? (
                                    <Skeleton className="h-16 w-32 mx-auto" />
                                ) : (
                                    <div className="text-center">
                                        <span className="text-6xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
                                            {storedBinsCount.toLocaleString()}
                                        </span>
                                        <span className="text-sm font-semibold text-muted-foreground block mt-2">
                                            Bins almacenados en cámaras
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Nota explicativa de control físico */}
                    <Card className="bg-zinc-50 dark:bg-zinc-900/40 border border-muted-foreground/10">
                        <CardContent className="p-4 flex gap-3 items-center text-sm text-muted-foreground">
                            <Info className="h-5 w-5 text-[#004b8d] shrink-0" />
                            <span>
                                Este panel de Bins es una herramienta de <strong>control físico</strong>. Muestra la cantidad actual de envases de arriendo en circulación contra la cantidad de envases ingresados y custodiados con plantas de Fall Creek.
                            </span>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>

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
                        <CardContent className="space-y-4 pt-6 max-h-[70vh] overflow-y-auto">
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
                         <div className="max-h-96 overflow-y-auto overflow-x-auto">
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

             {receptionToView && (
                 <Dialog open={!!receptionToView} onOpenChange={(isOpen) => !isOpen && setReceptionToView(null)}>
                     <DialogContent className="max-w-3xl">
                         <DialogHeader>
                             <DialogTitle className="text-[#004b8d]">Detalle de Manifiesto (Pallet Log)</DialogTitle>
                             <DialogDescription>
                                 Pallet Log: {receptionToView.document} {receptionToView.documentNumber ? ` - N° Documento: ${receptionToView.documentNumber}` : ''} - Fecha: {receptionToView.createdAt?.toDate()?.toLocaleDateString() ?? 'Sin fecha'}
                             </DialogDescription>
                         </DialogHeader>
                         <div className="max-h-96 overflow-y-auto overflow-x-auto">
                             <Table>
                                 <TableHeader>
                                     <TableRow>
                                         <TableHead>Pallet ID</TableHead>
                                         <TableHead>Producto / Variedad</TableHead>
                                         <TableHead className="text-right">Bultos</TableHead>
                                         <TableHead>Estado</TableHead>
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {receptionToView.items.map((item, index) => (
                                         <TableRow key={index}>
                                             <TableCell className="font-mono text-xs font-bold">{item.palletId}</TableCell>
                                             <TableCell>
                                                 <div className="flex items-center gap-2">
                                                     <span className="text-sm">{item.productName}</span>
                                                     {item.isMixedVariety && (
                                                         <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600 bg-blue-50">MIXTO</Badge>
                                                     )}
                                                 </div>
                                             </TableCell>
                                             <TableCell className="text-right font-bold">{item.quantity || 1}</TableCell>
                                             <TableCell>
                                                 <Badge variant="secondary" className="text-[10px]">
                                                     {item.status || 'Recibido'}
                                                 </Badge>
                                             </TableCell>
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
            {/* Reception Dialog removed */}

            {showPreview && (
                <Dialog open={showPreview} onOpenChange={setShowPreview}>
                    <DialogContent className="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle className="text-[#004b8d]">Previsualización de Manifiesto</DialogTitle>
                            <DialogDescription>
                                Se han detectado {previewItems.length} registros en el archivo. Revise la información antes de confirmar.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                            <div className="flex items-center gap-4 px-1">
                                <div className="flex-1 space-y-1">
                                    <Label>Referencia del Manifiesto / Guía</Label>
                                    <Input 
                                        value={manifestDocument} 
                                        onChange={e => setManifestDocument(e.target.value)}
                                        placeholder="Ej: Guía Fall Creek 1234"
                                    />
                                </div>
                            </div>

                            <div className="rounded-md border max-h-[40vh] overflow-y-auto overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Pallet ID</TableHead>
                                            <TableHead>Variedad / Producto</TableHead>
                                            <TableHead>Lote (Batch)</TableHead>
                                            <TableHead className="text-right">Bins</TableHead>
                                            <TableHead className="text-right">Plantas Totales</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewItems.map((item, index) => {
                                            const isDuplicate = duplicatePalletIds.has(item['Pallet ID'] || '');
                                            return (
                                                <TableRow key={index} className={isDuplicate ? "bg-amber-50/50 hover:bg-amber-100/50 border-l-4 border-l-amber-500" : ""}>
                                                    <TableCell className={`font-mono font-bold ${isDuplicate ? "text-amber-700" : ""}`}>{item['Pallet ID']}</TableCell>
                                                    <TableCell>{item['Item Description']}</TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">{item['Lot Number (Batch)']}</TableCell>
                                                    <TableCell className="text-right font-bold w-24">
                                                        <Input
                                                            type="number"
                                                            value={item['# of Packages']}
                                                            onChange={(e) => {
                                                                const newBins = Number(e.target.value) || 0;
                                                                const updated = [...previewItems];
                                                                updated[index] = {
                                                                    ...item,
                                                                    '# of Packages': newBins
                                                                };
                                                                setPreviewItems(updated);
                                                            }}
                                                            className="h-8 text-right font-bold w-20 ml-auto border-muted focus:border-primary"
                                                            min={1}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-[#7aba28]">{item['Qty of Plants']}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <DialogFooter className="flex items-center justify-between sm:justify-between">
                            <div className="flex gap-6 text-sm">
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Pallets ID</span>
                                    <span className="text-xl font-bold text-[#004b8d]">{previewItems.length}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Bins</span>
                                    <span className="text-xl font-bold text-amber-600">
                                        {previewItems.reduce((sum, item) => sum + (Number(item['# of Packages']) || 0), 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Plantas</span>
                                    <span className="text-xl font-bold text-[#7aba28]">
                                        {previewItems.reduce((sum, item) => sum + (Number(item['Qty of Plants']) || 0), 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setShowPreview(false)}>Cancelar</Button>
                                <Button 
                                    onClick={handleConfirmImport} 
                                    className="bg-[#7aba28] hover:bg-[#6aa423] text-white font-bold"
                                    disabled={isSubmitting || !manifestDocument}
                                >
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ClipboardList className="mr-2 h-4 w-4"/>}
                                    Confirmar e Importar Manifiesto
                                </Button>
                            </div>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Store dialog removed */}
        </div>
    );
}
