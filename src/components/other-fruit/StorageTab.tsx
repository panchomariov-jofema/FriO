'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem, ChamberLot, PackagingReception, PackagingReceptionItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StoreOtherFruitDialog } from './StoreOtherFruitDialog';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { StorePackagingDialog } from '../packaging/StorePackagingDialog';
import { chambersConfig } from '@/lib/chambers-config';
import { getPairedCoordinates, getSortedCoordinates } from '@/lib/utils';
import { useUser } from '@/firebase';
import { ArrowLeft, Users, Zap, Search, CheckCircle2, AlertCircle, Camera, Package } from 'lucide-react';
import type { ClientStorageConfig, Exporter, OtherClient } from '@/lib/types';
import { ClientSelector } from './ClientSelector';
import { BarcodeScanner } from '../BarcodeScanner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';

type PendingFruitItem = OtherFruitReceptionItem & {
    type: 'fruit';
    receptionId: string;
    clientName: string;
    document: string;
    itemIndices: number[]; // Indices of the items in the original reception.items array
    unit: 'Bins' | 'Pallets';
};

type PendingPackagingItem = PackagingReceptionItem & {
    type: 'packaging';
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Pallets'; // Packaging is always in pallets
};

type ConsolidatedPendingItem = PendingFruitItem | PendingPackagingItem;


export function OtherFruitStorageTab({ clientId: fixedClientId }: { clientId?: string }) {
  const { data: otherFruitReceptions, loading: loadingFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: packagingReceptions, loading: loadingPackaging } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: clientConfigs } = useFirestoreCollection<ClientStorageConfig>('clientStorageConfigs');
  const { data: exporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherClients } = useFirestoreCollection<OtherClient>('otherClients');
  
  const [selectedItem, setSelectedItem] = React.useState<ConsolidatedPendingItem | null>(null);
  const [quickStoreItem, setQuickStoreItem] = React.useState<{
    item: PendingFruitItem;
    chamberId: string;
    coordinate: string;
    totalQuantity: number;
    quantityPerLocation: number;
    strategy: 'secuencial' | 'pareado' | 'aisle-access' | 'serpentina-vertical' | 'modelo-sof' | 'fifo-vertical';
  } | null>(null);
  const [selectedClientId, setSelectedClientId] = React.useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const [scanValue, setScanValue] = React.useState('');
  const [lastUsedChamberId, setLastUsedChamberId] = React.useState<string | null>(null);
  const [lastUsedCoordinate, setLastUsedCoordinate] = React.useState<string | null>(null);
  const [isDirectMode, setIsDirectMode] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('frio_storage_direct_mode') === 'true';
    }
    return false;
  });
  const handleToggleDirectMode = (checked: boolean) => {
    setIsDirectMode(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('frio_storage_direct_mode', String(checked));
    }
  };
  const scanInputRef = React.useRef<HTMLInputElement>(null);
  
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  // Focus input when scanner closes
  React.useEffect(() => {
    if (!isScannerOpen && selectedClientId && scanInputRef.current) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [isScannerOpen, selectedClientId]);

  const loading = loadingFruit || loadingPackaging || loadingChamberLots;
  
  const resolvedClientConfig = React.useMemo(() => {
    if (!selectedItem) return undefined;
    
    const reception = [...(otherFruitReceptions || []), ...(packagingReceptions || [])].find(r => r.id === selectedItem.receptionId);
    if (!reception) return undefined;
    
    const clientId = reception.clientId;
    
    // 1. Get explicit override if exists
    const explicitOverride = clientConfigs?.find(c => c.id === clientId);
    
    // 2. Get master data defaults
    const otherClient = otherClients?.find(c => c.clientId === clientId);
    const exporter = exporters?.find(e => e.exporterId === clientId);
    const masterData = otherClient || exporter;
    
    if (!masterData && !explicitOverride) return undefined;
    
    let strategy = explicitOverride?.strategy || masterData?.storageStrategy || 'secuencial';
    let binsPerCoordinate = explicitOverride?.binsPerCoordinate ?? masterData?.binsPerCoordinate ?? 9;
    let palletsPerCoordinate = explicitOverride?.palletsPerCoordinate ?? masterData?.palletsPerCoordinate ?? 3;
    let preferredChamberId = explicitOverride?.preferredChamberId ?? (masterData as any)?.preferredChamberId;

    // Hardcoded defaults for Fall Creek
    if (masterData?.name?.toUpperCase() === 'FALL CREEK' || masterData?.id === 'fallcreek') {
        if (!explicitOverride?.strategy && !masterData?.storageStrategy) strategy = 'aisle-access';
        if (explicitOverride?.binsPerCoordinate === undefined && masterData?.binsPerCoordinate === undefined) binsPerCoordinate = 9;
        if (explicitOverride?.palletsPerCoordinate === undefined && masterData?.palletsPerCoordinate === undefined) palletsPerCoordinate = 3;
    }

    return {
      id: clientId,
      clientName: masterData?.name || explicitOverride?.clientName || 'Cliente',
      strategy: strategy as any,
      binsPerCoordinate,
      palletsPerCoordinate,
      preferredChamberId,
      chamberOverrides: explicitOverride?.chamberOverrides
    } as ClientStorageConfig;
  }, [selectedItem, otherFruitReceptions, packagingReceptions, clientConfigs, otherClients, exporters]);


    const allConsolidatedItems = React.useMemo(() => {
        // Fruit items
        const fruitItemsRaw: PendingFruitItem[] = (otherFruitReceptions || [])
            .filter(lot => 
                ['Pendiente de almacenar', 'Parcialmente Almacenado', 'Recibido', 'Parcialmente Recibido'].includes(lot.status)
            )
            .flatMap((lot) => 
                lot.items
                    .map((item, itemIndex) => ({ ...item, type: 'fruit' as const, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndices: [itemIndex], unit: lot.unit }))
                    .filter(item => item.status === 'Pendiente de almacenar')
            );

        // Group Fall Creek items by palletId
        const fruitItems: PendingFruitItem[] = [];
        const fallCreekGroups = new Map<string, PendingFruitItem>();

        fruitItemsRaw.forEach(item => {
            const isFallCreek = item.clientName?.toUpperCase() === 'FALL CREEK';
            if (isFallCreek && item.palletId) {
                const key = `${item.receptionId}-${item.palletId}`;
                if (fallCreekGroups.has(key)) {
                    const group = fallCreekGroups.get(key)!;
                    group.itemIndices.push(item.itemIndices[0]);
                    group.quantity += item.quantity;
                    if (group.productName !== item.productName) {
                        group.productName = "Pallet Mixto";
                    }
                } else {
                    fallCreekGroups.set(key, { ...item, itemIndices: [...item.itemIndices] });
                }
            } else {
                fruitItems.push(item);
            }
        });

        fruitItems.push(...Array.from(fallCreekGroups.values()));

        // Packaging items
        const packagingItems: PendingPackagingItem[] = (packagingReceptions || [])
            .filter(lot => 
                ['Pendiente de almacenar', 'Parcialmente Almacenado', 'Recibido', 'Parcialmente Recibido'].includes(lot.status)
            )
            .flatMap((lot) => 
                lot.items
                    .map((item, itemIndex) => ({ ...item, type: 'packaging' as const, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: 'Pallets' as const }))
                    .filter(item => item.status === 'Pendiente de almacenar')
            );

        return [...fruitItems, ...packagingItems];
    }, [otherFruitReceptions, packagingReceptions]);

    const pendingItems = React.useMemo(() => {
        return allConsolidatedItems.filter(item => {
            if (!selectedClientId) return true;
            
            const reception = item.type === 'fruit' ? 
                otherFruitReceptions?.find(r => r.id === item.receptionId) : 
                packagingReceptions?.find(r => r.id === item.receptionId);
            
            return reception?.clientId === selectedClientId;
        })
        .sort((a,b) => {
            const allReceptions = [...(otherFruitReceptions || []), ...(packagingReceptions || [])];
            const lotA = allReceptions.find(l => l.id === a.receptionId);
            const lotB = allReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });
  }, [otherFruitReceptions, packagingReceptions, fixedClientId, selectedClientId]);

  const clientsWithPending = React.useMemo(() => {
    const clientsMap = new Map<string, { id: string; name: string; count: number }>();
    
    (otherFruitReceptions || []).forEach(reception => {
        const pendingCount = reception.items.filter(i => i.status === 'Pendiente de almacenar').length;
        if (pendingCount > 0) {
            const existing = clientsMap.get(reception.clientId);
            if (existing) {
                existing.count += pendingCount;
            } else {
                clientsMap.set(reception.clientId, { id: reception.clientId, name: reception.clientName, count: pendingCount });
            }
        }
    });

    (packagingReceptions || []).forEach(reception => {
        const pendingCount = reception.items.filter(i => i.status === 'Pendiente de almacenar').length;
        if (pendingCount > 0) {
            const existing = clientsMap.get(reception.clientId);
            if (existing) {
                existing.count += pendingCount;
            } else {
                clientsMap.set(reception.clientId, { id: reception.clientId, name: reception.clientName, count: pendingCount });
            }
        }
    });

    return Array.from(clientsMap.values()).sort((a, b) => b.count - a.count);
  }, [otherFruitReceptions, packagingReceptions]);

  const activeClientName = React.useMemo(() => {
    if (!selectedClientId) return null;
    const client = clientsWithPending.find(c => c.id === selectedClientId);
    return client?.name || selectedClientId;
  }, [selectedClientId, clientsWithPending]);

  const calculateFruitSuggestion = (item: PendingFruitItem) => {
    const clientId = item.type === 'fruit' ? (otherFruitReceptions?.find(r => r.id === item.receptionId)?.clientId) : null;
    if (!clientId) return null;

    const explicitOverride = clientConfigs?.find(c => c.id === clientId);
    const otherClient = otherClients?.find(c => c.clientId === clientId);
    const exporter = exporters?.find(e => e.exporterId === clientId);
    const masterData = otherClient || exporter;

    let strategy = explicitOverride?.strategy || masterData?.storageStrategy || 'secuencial';
    let binsPerCoordinate = explicitOverride?.binsPerCoordinate ?? masterData?.binsPerCoordinate ?? 9;
    let palletsPerCoordinate = explicitOverride?.palletsPerCoordinate ?? masterData?.palletsPerCoordinate ?? 3;
    let preferredChamberId = lastUsedChamberId || (typeof window !== 'undefined' ? localStorage.getItem('frio_last_chamber_id') : null) || explicitOverride?.preferredChamberId || (masterData as any)?.preferredChamberId;

    if (item.clientName?.toUpperCase() === 'FALL CREEK') {
        if (!explicitOverride?.strategy && !masterData?.storageStrategy) strategy = 'aisle-access';
        if (explicitOverride?.binsPerCoordinate === undefined && masterData?.binsPerCoordinate === undefined) binsPerCoordinate = 9;
        if (explicitOverride?.palletsPerCoordinate === undefined && masterData?.palletsPerCoordinate === undefined) palletsPerCoordinate = 3;
    }

    if (!preferredChamberId || !chambersConfig[preferredChamberId]) return null;

    const chamberId = preferredChamberId;
    const chamberConfig = chambersConfig[chamberId];

    // Calculate occupancy and find the last used coordinate
    const occupancyMap = new Map<string, number>();
    let lastCoordInChamber: string | null = null;
    
    // We also cross-reference with stored items to find the truly most recent storage
    let latestTimestamp = 0;

    (allChamberLots || []).forEach(l => {
        if (l.status === 'Almacenado' && l.chamberId === chamberId && l.coordinate) {
            occupancyMap.set(l.coordinate, (occupancyMap.get(l.coordinate) || 0) + l.binCount);
            const time = (l as any).storedAt?.toMillis ? (l as any).storedAt.toMillis() : 0;
            if (time > latestTimestamp) {
                latestTimestamp = time;
                lastCoordInChamber = l.coordinate;
            }
        }
    });

    (otherFruitReceptions || []).forEach(r => {
        (r.items || []).forEach((it) => {
            if (it.status === 'Almacenado' && it.storageLocation && it.storageLocation.chamberId === chamberId && it.storageLocation.coordinate) {
                const multiplier = (r.clientName?.toUpperCase() === 'FALL CREEK' && r.unit === 'Pallets') ? 3 : (r.unit === 'Bins' ? 1 : 2);
                const equivalentUnits = it.quantity * multiplier;
                
                const coord = it.storageLocation.coordinate;
                occupancyMap.set(coord, (occupancyMap.get(coord) || 0) + equivalentUnits);
                
                const time = (it as any).storedAt?.toMillis ? (it as any).storedAt.toMillis() : (it as any).storedAt instanceof Date ? (it as any).storedAt.getTime() : 0;
                if (time > latestTimestamp) {
                    latestTimestamp = time;
                    lastCoordInChamber = coord;
                }
            }
        });
    });

    let allPossibleCoords;
    const finalStrategy = strategy || 'secuencial';
    if (finalStrategy === 'pareado') {
        allPossibleCoords = getPairedCoordinates(chamberConfig);
    } else {
        allPossibleCoords = getSortedCoordinates(chamberConfig, finalStrategy as any);
    }

    const isFC = item.clientName?.toUpperCase() === 'FALL CREEK';
    const occupancyThreshold = (isFC || item.unit === 'Bins') ? binsPerCoordinate : palletsPerCoordinate * 2;
    const unitsPerItem = (isFC && item.unit === 'Pallets') ? 3 : (item.unit === 'Bins' ? 1 : 2);

    // Determine the starting point for suggestion search
    let startIndex = 0;
    const effectiveLastChamber = lastUsedChamberId || (typeof window !== 'undefined' ? localStorage.getItem('frio_last_chamber_id') : null);
    const effectiveSessionCoord = lastUsedCoordinate || (typeof window !== 'undefined' ? localStorage.getItem('frio_last_coordinate') : null);
    const isContinuingChamber = effectiveLastChamber === chamberId;
    
    // We prioritize real DB state (lastCoordInChamber) over localStorage if there's any occupancy.
    // If the chamber is completely empty in the DB, we ignore all session/localStorage history and start from A1.
    const hasAnyOccupancy = occupancyMap.size > 0;
    const effectiveLastCoord = hasAnyOccupancy
      ? (lastUsedCoordinate 
          ? lastUsedCoordinate 
          : (lastCoordInChamber || (isContinuingChamber && effectiveSessionCoord ? effectiveSessionCoord : null)))
      : null;
    
    if (effectiveLastCoord && finalStrategy !== 'modelo-sof' && finalStrategy !== 'serpentina-vertical' && finalStrategy !== 'fifo-vertical') {
        const foundIdx = allPossibleCoords.indexOf(effectiveLastCoord);
        if (foundIdx !== -1) {
            const currentOccupancy = occupancyMap.get(effectiveLastCoord) || 0;
            if (currentOccupancy + unitsPerItem > occupancyThreshold) {
                startIndex = foundIdx + 1;
            } else {
                startIndex = foundIdx;
            }
        }
    }

    // Create a prioritized search list: From last used position forward, then wrap around
    const prioritizedCoords = [
        ...allPossibleCoords.slice(startIndex),
        ...allPossibleCoords.slice(0, startIndex)
    ];

    const suggestedCoord = prioritizedCoords.find(coord => {
        if (chamberConfig.blocked?.includes(coord)) return false;
        const currentOccupancy = occupancyMap.get(coord) || 0;
        return currentOccupancy + unitsPerItem <= occupancyThreshold;
    });
    
    if (!suggestedCoord) return null;

    return {
        chamberId,
        coordinate: suggestedCoord,
        totalQuantity: item.quantity,
        quantityPerLocation: occupancyThreshold,
        strategy: strategy as any
    };
  };

  const handleFruitStoreConfirm = async (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'pareado' | 'aisle-access' | 'inverted-secuencial' | 'horizontal-secuencial' | 'fifo' | 'serpentina-vertical' | 'modelo-sof' | 'fifo-vertical' }, overrideItem?: PendingFruitItem) => {
    const itemToProcessScope = overrideItem || (selectedItem?.type === 'fruit' ? selectedItem : null);
    if (!itemToProcessScope || !firestore) return;

    const { chamberId, coordinate: startCoordinate, totalQuantity, quantityPerLocation, strategy } = data;

    const originalReception = otherFruitReceptions.find(r => r.id === itemToProcessScope.receptionId);
    if (!originalReception) {
        toast({ title: "Error", description: "No se encontró la recepción original.", variant: "destructive" });
        return;
    }

    const chamberConfig = chambersConfig[chamberId];
    if (!chamberConfig) {
        toast({ title: "Error", description: "Configuración de cámara no encontrada.", variant: "destructive" });
        return;
    }

    // --- 1. Get available coordinates ---
    const occupancyMap = new Map<string, number>();
    (allChamberLots || []).forEach(l => {
        if (l.status === 'Almacenado' && l.chamberId === chamberId && l.coordinate) {
            occupancyMap.set(l.coordinate, (occupancyMap.get(l.coordinate) || 0) + l.binCount);
        }
    });
    (otherFruitReceptions || []).forEach(r => {
        (r.items || []).forEach((item) => {
            if (item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId && item.storageLocation.coordinate) {
                const multiplier = (r.clientName?.toUpperCase() === 'FALL CREEK' && r.unit === 'Pallets') ? 3 : (r.unit === 'Bins' ? 1 : 2);
                const equivalentUnits = item.quantity * multiplier;
                occupancyMap.set(item.storageLocation.coordinate, (occupancyMap.get(item.storageLocation.coordinate) || 0) + equivalentUnits);
            }
        });
    });

    let allPossibleCoords;
    const finalStrategy = strategy || 'secuencial';
    if (finalStrategy === 'pareado') {
        allPossibleCoords = getPairedCoordinates(chamberConfig);
    } else {
        allPossibleCoords = getSortedCoordinates(chamberConfig, finalStrategy as any);
    }

    const occupancyThreshold = quantityPerLocation;
    const availableCoords = allPossibleCoords.filter(coord => {
        if (chamberConfig.blocked?.includes(coord)) return false;
        const currentOccupancy = occupancyMap.get(coord) || 0;
        return currentOccupancy < occupancyThreshold;
    });

    if (!availableCoords.includes(startCoordinate)) {
        // Double check if it's because it's full or just not in the sorted list
        const currentOccupancy = occupancyMap.get(startCoordinate) || 0;
        if (currentOccupancy >= occupancyThreshold) {
            toast({ variant: 'destructive', title: 'Capacidad Agotada', description: `La coordenada ${startCoordinate} ya está llena (${currentOccupancy}/${occupancyThreshold}).` });
            return;
        }
    }
    
    // --- 2. Prepare updates ---
    const itemsToProcess = itemToProcessScope.itemIndices.map(idx => originalReception.items[idx]);
    
    const newStoredItems: OtherFruitReceptionItem[] = [];
    let remainingToStore = totalQuantity;
    const startIndex = allPossibleCoords.indexOf(startCoordinate);
    if (startIndex === -1) {
        toast({ variant: 'destructive', title: 'Error de ubicación', description: `La coordenada de inicio (${startCoordinate || 'vacía'}) no es válida para esta cámara.` });
        return;
    }
    const coordsToFill = allPossibleCoords.slice(startIndex); // We can fill from startCoordinate onwards in the FULL list
    
    let currentCoordIdx = 0;
    let currentCoord = coordsToFill[currentCoordIdx];

    const isFC = originalReception.clientName?.toUpperCase() === 'FALL CREEK';
    const unitsPerItem = (isFC && originalReception.unit === 'Pallets') ? 3 : (originalReception.unit === 'Bins' ? 1 : 2);

    for (const itemToStore of itemsToProcess) {
        if (remainingToStore <= 0) break;
        if (currentCoordIdx >= coordsToFill.length) break;

        let itemQuantityRemaining = itemToStore.quantity;

        while (itemQuantityRemaining > 0 && currentCoordIdx < coordsToFill.length) {
            currentCoord = coordsToFill[currentCoordIdx];
            const currentOccupancy = occupancyMap.get(currentCoord) || 0;
            const availableSpaceInBins = Math.max(0, occupancyThreshold - currentOccupancy);
            const availableSpaceInItemUnits = Math.floor(availableSpaceInBins / unitsPerItem);

            if (availableSpaceInItemUnits <= 0 || chamberConfig.blocked?.includes(currentCoord)) {
                currentCoordIdx++;
                continue;
            }

            const amountToStore = Math.min(itemQuantityRemaining, availableSpaceInItemUnits, remainingToStore);
            if (amountToStore <= 0) {
                currentCoordIdx++;
                continue;
            }
            
            newStoredItems.push({
                ...itemToStore,
                quantity: amountToStore,
                status: 'Almacenado',
                storageLocation: {
                    chamberId,
                    coordinate: currentCoord
                },
                storedAt: new Date(),
            });

            const binsStored = amountToStore * unitsPerItem;
            occupancyMap.set(currentCoord, currentOccupancy + binsStored);

            itemQuantityRemaining -= amountToStore;
            remainingToStore -= amountToStore;
            
            const remainingInCoord = availableSpaceInBins - binsStored;
            if (remainingInCoord < unitsPerItem) {
                currentCoordIdx++;
            }
        }
    }

    // Save continuity state
    const lastCoord = newStoredItems.length > 0 ? newStoredItems[newStoredItems.length - 1].storageLocation?.coordinate : null;
    if (lastCoord) {
        setLastUsedChamberId(chamberId);
        setLastUsedCoordinate(lastCoord);
        if (typeof window !== 'undefined') {
            localStorage.setItem('frio_last_chamber_id', chamberId);
            localStorage.setItem('frio_last_coordinate', lastCoord);
        }
    }

    const finalItemsArray = originalReception.items.filter((_, index) => !itemToProcessScope.itemIndices.includes(index));
    finalItemsArray.push(...newStoredItems);
    
    const stillHasPending = finalItemsArray.some(item => item.status === 'Pendiente de almacenar' && item.quantity > 0);
    const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

    const receptionRef = doc(firestore, 'otherFruitReceptions', itemToProcessScope.receptionId);

    try {
        await updateDoc(receptionRef, {
            items: finalItemsArray,
            status: newStatus,
            updatedAt: serverTimestamp(),
        });
        toast({ title: 'Éxito', description: `Almacenado en ${chamberConfig.name}, Coord: ${startCoordinate}.` });
        const finalSessionCoord = lastCoord || startCoordinate;
        setLastUsedChamberId(chamberId);
        setLastUsedCoordinate(finalSessionCoord);
        if (typeof window !== 'undefined') {
            localStorage.setItem('frio_last_chamber_id', chamberId);
            localStorage.setItem('frio_last_coordinate', finalSessionCoord);
        }
        setSelectedItem(null);
        setQuickStoreItem(null);
    } catch (error) {
        console.error("Error storing fruit item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
    }
  };


  const processScanValue = (val: string) => {
    const cleanVal = val.trim().toUpperCase();
    if (!cleanVal) return;

    // Search across ALL pending items (ignoring selectedClientId for the search)
    const fruitPending: (PendingFruitItem | PendingPackagingItem)[] = (otherFruitReceptions || []).flatMap(lot => {
        const fruitItemsRaw = lot.items
            .map((item, itemIndex) => ({ ...item, type: 'fruit' as const, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndices: [itemIndex], unit: lot.unit }))
            .filter(item => item.status === 'Pendiente de almacenar');

        return fruitItemsRaw;
    });

    const packagingPending: (PendingFruitItem | PendingPackagingItem)[] = (packagingReceptions || []).flatMap(lot => 
        lot.items.map((item, itemIndex) => ({ ...item, type: 'packaging' as const, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: 'Pallets' as const }))
            .filter(item => item.status === 'Pendiente de almacenar')
    );

    const allPendingItems = fruitPending.concat(packagingPending);

    const found = allPendingItems.find(item => {
        if (item.type === 'fruit') {
            const fruitItem = item as PendingFruitItem;
            if (fruitItem.palletId?.toUpperCase() === cleanVal) return true;
            if (fruitItem.productCode?.toUpperCase() === cleanVal) return true;
            if (fruitItem.containerId?.toUpperCase() === cleanVal) return true;
            return false;
        } else {
            const pkgItem = item as PendingPackagingItem;
            return pkgItem.packagingMasterCode?.toUpperCase() === cleanVal;
        }
    });

    if (found) {
        // If it's a Fall Creek item, we need to find the consolidated version in the UNFILTERED list
        // to ensure we process the whole pallet/bin group even if the current view is filtered.
        const consolidatedItem = allConsolidatedItems.find(pi => {
            if (pi.type !== found.type) return false;
            if (pi.receptionId !== found.receptionId) return false;
            if (pi.type === 'fruit') {
                return (pi as PendingFruitItem).itemIndices.includes((found as any).itemIndices[0]);
            }
            return (pi as PendingPackagingItem).itemIndex === (found as any).itemIndex;
        });

        const itemToProcess = consolidatedItem || found;
        
        // Auto-select client to focus the view
        const reception = [...(otherFruitReceptions || []), ...(packagingReceptions || [])].find(r => r.id === itemToProcess.receptionId);
        if (reception) {
            setSelectedClientId(reception.clientId);
        }

        if (itemToProcess.type === 'fruit') {
            const suggestion = calculateFruitSuggestion(itemToProcess as PendingFruitItem);
            if (suggestion) {
                setQuickStoreItem({ item: itemToProcess as PendingFruitItem, ...suggestion });
                setScanValue('');
                return;
            }
        }
        
        // If no auto-suggestion or if it's packaging, open the manual store dialog immediately
        setSelectedItem(itemToProcess);
        setScanValue('');
    } else {
        // Check if it was already stored
        const storedItem = otherFruitReceptions?.flatMap(r => r.items)
            .find(item => 
                item.status === 'Almacenado' && 
                (item.palletId?.toUpperCase() === cleanVal || item.containerId?.toUpperCase() === cleanVal || item.productCode?.toUpperCase() === cleanVal)
            );
            
        if (storedItem) {
            toast({ 
                title: "Ya Almacenado", 
                description: `ID ${cleanVal} ya se encuentra en ${chambersConfig[storedItem.storageLocation?.chamberId!]?.name} - ${storedItem.storageLocation?.coordinate}.`,
                variant: "default" 
            });
        } else {
            toast({ title: "No encontrado", description: "No hay productos pendientes con ese ID.", variant: "destructive" });
        }
    }
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScanValue(scanValue);
  };

  const handleStoreClick = (item: ConsolidatedPendingItem) => {
    if (item.type === 'fruit') {
        const suggestion = calculateFruitSuggestion(item);
        if (suggestion) {
            setQuickStoreItem({ item: item, ...suggestion });
            return;
        }
    }
    setSelectedItem(item);
  };

  const handlePackagingStoreConfirm = async (data: { locations: { warehouse: string; aisle: string; quantity: number }[] }) => {
    if (!selectedItem || selectedItem.type !== 'packaging' || !firestore) return;

    const itemToStore = selectedItem as PendingPackagingItem;
    const totalToStore = data.locations.reduce((sum, loc) => sum + loc.quantity, 0);

    if (totalToStore !== itemToStore.palletCount) {
        toast({ title: "Error de Cantidad", description: `Debe asignar exactamente los ${itemToStore.palletCount} pallets pendientes.`, variant: "destructive" });
        return;
    }

    try {
        await runTransaction(firestore, async (transaction) => {
            const receptionRef = doc(firestore, 'packagingReceptions', itemToStore.receptionId);
            const receptionSnap = await transaction.get(receptionRef);
            if (!receptionSnap.exists()) throw new Error("La recepción de origen ya no existe.");

            const originalReception = receptionSnap.data() as PackagingReception;
            const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
            
            const consumedItem = updatedItems.splice(itemToStore.itemIndex, 1)[0];
            if (!consumedItem) throw new Error("El ítem a almacenar no fue encontrado.");

            for (const newLocation of data.locations) {
                if (newLocation.quantity > 0) {
                    updatedItems.push({
                        ...consumedItem,
                        palletCount: newLocation.quantity,
                        status: 'Almacenado',
                        storageLocation: { warehouse: newLocation.warehouse, aisle: newLocation.aisle },
                        storedAt: new Date(),
                    });
                }
            }

            const stillHasPending = updatedItems.some((item: PackagingReceptionItem) => item.status === 'Pendiente de almacenar' && item.palletCount > 0);
            const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

            transaction.update(receptionRef, {
                items: updatedItems,
                status: newStatus,
                updatedAt: serverTimestamp(),
            });
        });

        toast({ title: 'Éxito', description: 'Embalaje almacenado.' });
        setSelectedItem(null);

    } catch (error: any) {
        console.error("Error storing packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo actualizar la ubicación.' });
    }
  };

  const showClientSelector = !selectedClientId && !fixedClientId;

  return (
    <div className="space-y-6">
      {/* Global Control Bar */}
      <div className="flex items-center justify-between bg-card/30 backdrop-blur-md p-3 rounded-2xl border border-primary/5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-500",
            isDirectMode 
                ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 shadow-lg shadow-yellow-500/5" 
                : "bg-muted/30 border-transparent text-muted-foreground"
          )}>
            <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-500",
                isDirectMode ? "bg-yellow-500 text-white shadow-lg" : "bg-muted text-muted-foreground"
            )}>
                <Zap className={cn("h-4 w-4", isDirectMode ? "fill-white animate-pulse" : "")} />
            </div>
            <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-widest leading-none mb-0.5">Modo Directo</span>
                <span className="text-[9px] opacity-70 font-bold leading-none">{isDirectMode ? 'SIN ESCÁNER ACTIVO' : 'ESCÁNER REQUERIDO'}</span>
            </div>
            <Switch 
                checked={isDirectMode} 
                onCheckedChange={handleToggleDirectMode}
                className="data-[state=checked]:bg-yellow-500"
            />
          </div>
        </div>

        {selectedClientId && !fixedClientId && (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 font-bold">
                Cliente: {activeClientName}
            </Badge>
        )}
      </div>

      {showClientSelector ? (
        <ClientSelector 
            clients={clientsWithPending}
            onSelect={(id) => {
                setSelectedClientId(id);
            }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Scanner and Settings */}
        <div className="lg:col-span-5 space-y-4">
            <Card className="shadow-lg border-primary/20 bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        {!fixedClientId && (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setSelectedClientId(null)}
                                className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary transition-all"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <div>
                            <CardTitle className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                                Almacenamiento
                            </CardTitle>
                            <CardDescription>Gestión de ubicaciones en cámaras</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                        <div className="flex flex-col gap-4">
                            <div className="bg-primary/5 rounded-2xl p-4 border-2 border-primary/10 mb-2">
                                <p className="text-xs font-black text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Zap className="h-3 w-3 fill-primary" />
                                    Entrada de Datos Inteligente
                                </p>
                                <div className="flex gap-2">
                                    <div className="relative flex-1 group/search">
                                        <Popover open={isDirectMode && (isInputFocused || scanValue.length >= 1)}>
                                            <PopoverTrigger asChild>
                                                <form onSubmit={handleScanSubmit} className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within/search:text-primary" />
                                                    <input 
                                                        ref={scanInputRef}
                                                        type="text" 
                                                        placeholder={`Pallet ID, Bin o Código...`}
                                                        className="flex h-14 w-full rounded-xl border-2 border-input bg-background pl-10 pr-10 py-2 text-lg font-bold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                                                        value={scanValue}
                                                        onChange={(e) => setScanValue(e.target.value)}
                                                        onFocus={() => setIsInputFocused(true)}
                                                        onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
                                                        autoFocus
                                                    />
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all group-focus-within/search:text-primary group-focus-within/search:rotate-180" />
                                                </form>
                                            </PopoverTrigger>
                                            
                                            <PopoverContent 
                                                className="p-0 w-[var(--radix-popover-trigger-width)] border-2 border-primary shadow-2xl rounded-xl overflow-hidden" 
                                                align="start"
                                                onOpenAutoFocus={(e) => e.preventDefault()}
                                            >
                                                <div className="p-2 bg-primary/5 border-b border-primary/10">
                                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest">Sugerencias Inteligentes</p>
                                                </div>
                                                <div className="max-h-60 overflow-auto divide-y divide-primary/5">
                                                    {pendingItems
                                                        .filter(pi => {
                                                            const id = String(pi.type === 'fruit' ? (pi.palletId || pi.containerId || pi.productCode || '') : pi.packagingMasterCode);
                                                            return id.toUpperCase().includes(scanValue.toUpperCase());
                                                        })
                                                        .slice(0, 15)
                                                        .map(pi => {
                                                            const id = String(pi.type === 'fruit' ? (pi.palletId || pi.containerId || '') : pi.packagingMasterCode);
                                                            return (
                                                                <div 
                                                                    key={`${pi.receptionId}-${id}-${pi.type}`}
                                                                    className="p-3 hover:bg-primary/5 cursor-pointer flex items-center justify-between group/item transition-colors"
                                                                    onClick={() => {
                                                                        processScanValue(id);
                                                                        setScanValue('');
                                                                        setIsInputFocused(false);
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover/item:bg-primary group-hover/item:text-white transition-all">
                                                                            {pi.type === 'fruit' ? <Users className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-bold text-foreground leading-none mb-1">{id}</p>
                                                                            <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[200px]">
                                                                                {pi.type === 'fruit' ? pi.productName : pi.packagingMasterName}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-xs font-black text-primary">{(pi as any).quantity || (pi as any).palletCount}</p>
                                                                        <p className="text-[8px] uppercase font-bold text-muted-foreground">{pi.unit}</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    {pendingItems.filter(pi => {
                                                        const id = String(pi.type === 'fruit' ? (pi.palletId || pi.containerId || pi.productCode || '') : pi.packagingMasterCode);
                                                        return id.toUpperCase().includes(scanValue.toUpperCase());
                                                    }).length === 0 && (
                                                        <div className="p-4 text-center">
                                                            <p className="text-xs text-muted-foreground font-medium">No se encontraron coincidencias para este cliente</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <Button 
                                        type="button"
                                        onClick={() => setIsScannerOpen(true)}
                                        className={cn(
                                            "h-14 w-20 rounded-xl shadow-lg flex flex-col items-center justify-center p-0 gap-1 transition-all duration-300",
                                            isDirectMode 
                                                ? "bg-muted text-muted-foreground hover:bg-muted/80 opacity-50" 
                                                : "bg-primary hover:bg-primary/90 text-white"
                                        )}
                                    >
                                        <Camera className="h-6 w-6" />
                                        <span className="text-[10px] font-black">SCAN</span>
                                    </Button>
                                </div>
                            </div>
                            
                            {!fixedClientId && selectedClientId && (
                                <Button 
                                    variant="outline" 
                                    onClick={() => setSelectedClientId(null)}
                                    className="w-full justify-start gap-2 h-10 border-dashed border-primary/20 hover:bg-primary/5 text-primary font-bold"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Ver Todos los Clientes
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

            {/* Quick Store Display */}
            {quickStoreItem && (
                <Card className="border-primary bg-gradient-to-br from-primary/10 via-background to-primary/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 border-2 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-3 flex gap-2">
                        <Badge variant="default" className="bg-primary text-white shadow-lg flex items-center gap-1.5 px-3 py-1">
                            <Zap className="h-3 w-3 fill-white animate-pulse" />
                            IA SUGIERE
                        </Badge>
                    </div>
                    
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-5">
                            <div className="relative">
                                <div className="absolute -inset-2 bg-primary/20 rounded-2xl blur-xl group-hover:bg-primary/30 transition-all duration-500" />
                                <div className="relative w-24 h-24 bg-primary text-primary-foreground rounded-2xl flex flex-col items-center justify-center font-bold shadow-[0_10px_30px_-5px_rgba(var(--primary),0.5)] transform -rotate-2 group-hover:rotate-0 transition-transform duration-500 border-2 border-white/20">
                                    <span className="text-[10px] opacity-80 uppercase font-black tracking-widest mb-1">Posición</span>
                                    <span className="text-4xl tracking-tight leading-none">{quickStoreItem.coordinate}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <CardTitle className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                                    {chambersConfig[quickStoreItem.chamberId]?.name}
                                    <Badge variant="secondary" className="text-[10px] font-black h-5">UBICACIÓN LIBRE</Badge>
                                </CardTitle>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 text-primary font-bold text-sm">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Optimizado para {quickStoreItem.item.clientName}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-black bg-muted/80 px-2.5 py-1 rounded-full w-fit flex items-center gap-1.5 uppercase tracking-wider">
                                        <Package className="h-3 w-3" />
                                        Estrategia: {quickStoreItem.strategy.replace('-', ' ')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="pb-6 pt-4">
                        <div className="grid grid-cols-2 gap-4 mb-6 bg-white/40 backdrop-blur-md p-5 rounded-3xl border border-primary/10 shadow-inner group-hover:bg-white/60 transition-colors duration-500">
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    Producto
                                </div>
                                <p className="text-sm font-black truncate text-foreground/90">{quickStoreItem.item.productName}</p>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    {quickStoreItem.item.unit === 'Bins' ? 'ID BIN' : 'ID PALLET'}
                                </div>
                                <p className="text-sm font-mono font-black text-primary bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10 w-fit">
                                    {quickStoreItem.item.palletId || quickStoreItem.item.containerId || quickStoreItem.item.productCode}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    Carga Total
                                </div>
                                <p className="text-base font-black text-foreground">{quickStoreItem.totalQuantity} {quickStoreItem.item.unit}</p>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    Densidad
                                </div>
                                <p className="text-sm font-bold text-foreground/70">
                                    {quickStoreItem.quantityPerLocation} {quickStoreItem.item.unit} / COORD
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex gap-3">
                            <Button 
                                className="flex-[3] bg-primary hover:bg-primary/90 text-white font-black text-lg h-20 rounded-3xl shadow-[0_15px_40px_-10px_rgba(var(--primary),0.6)] active:scale-[0.97] transition-all relative overflow-hidden group/btn" 
                                onClick={() => handleFruitStoreConfirm(quickStoreItem, quickStoreItem.item)}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                                <span className="relative z-10 flex flex-col items-center">
                                    <span>ALMACENAR AHORA</span>
                                    <span className="text-[10px] opacity-80 font-medium tracking-[0.2em] mt-1">PRESIONE PARA CONFIRMAR</span>
                                </span>
                            </Button>
                            <Button 
                                variant="outline" 
                                className="flex-1 h-20 rounded-3xl border-primary/20 hover:bg-primary/5 hover:border-primary/40 font-black text-xs transition-all flex flex-col gap-1"
                                onClick={() => {
                                    setSelectedItem(quickStoreItem.item);
                                    setQuickStoreItem(null);
                                }}
                            >
                                <Users className="h-4 w-4 mb-1" />
                                EDITAR
                            </Button>
                            <Button 
                                variant="ghost" 
                                className="h-20 w-16 rounded-3xl hover:bg-destructive/10 hover:text-destructive transition-all flex flex-col gap-1 font-black text-[10px]"
                                onClick={() => setQuickStoreItem(null)}
                            >
                                <AlertCircle className="h-6 w-6" />
                                CANCELAR
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>

        {/* Right Panel: Pending List */}
        <div className="lg:col-span-7">
            <Card className="h-full shadow-lg border-primary/10 overflow-hidden flex flex-col">
                <CardHeader className="bg-muted/30 pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-bold">Pendientes de Almacenar</CardTitle>
                            <CardDescription>Seleccione o escanee para procesar</CardDescription>
                        </div>
                        <Badge variant="secondary" className="px-3 py-1 text-sm font-black rounded-full">
                            {pendingItems.length} ÍTEMS
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                        </div>
                    ) : pendingItems.length > 0 ? (
                        <div className="divide-y divide-primary/5">
                            {pendingItems.map((item) => (
                                <div 
                                    key={`${item.receptionId}-${item.type === 'fruit' ? (item as PendingFruitItem).itemIndices.join('-') : (item as PendingPackagingItem).itemIndex}`} 
                                    className={cn(
                                        "group flex items-center justify-between p-4 transition-all duration-300 border-l-4",
                                        isDirectMode 
                                            ? "border-l-yellow-500 bg-yellow-500/5 hover:bg-yellow-500/10 cursor-pointer" 
                                            : "border-l-transparent hover:bg-primary/5 cursor-default"
                                    )}
                                    onClick={() => isDirectMode && handleStoreClick(item)}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="h-12 w-12 rounded-xl bg-background border-2 border-primary/10 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-sm">
                                            {item.type === 'fruit' ? <Users className="h-6 w-6" /> : <Package className="h-6 w-6" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-foreground truncate">
                                                {item.type === 'fruit' ? item.productName : item.packagingMasterName}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                                <span className="font-mono text-primary/70">{item.type === 'fruit' ? item.palletId || item.containerId : item.packagingMasterCode}</span>
                                                <span>•</span>
                                                <span>Doc: {item.document}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden sm:block">
                                            <p className="font-black text-lg text-foreground">{(item as any).quantity || (item as any).palletCount}</p>
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground">{item.unit}</p>
                                        </div>
                                        <div className="flex items-center">
                                            {isDirectMode ? (
                                                <Button 
                                                    size="sm" 
                                                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-black text-[10px] h-8 rounded-lg shadow-lg shadow-yellow-500/20 px-3"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStoreClick(item);
                                                    }}
                                                >
                                                    ALMACENAR
                                                </Button>
                                            ) : (
                                                <div 
                                                    className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary cursor-pointer hover:bg-primary/20 transition-all"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStoreClick(item);
                                                    }}
                                                >
                                                    <ArrowLeft className="h-5 w-5 rotate-180" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                                <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <p className="font-bold text-lg">Todo Almacenado</p>
                            <p className="text-sm text-muted-foreground max-w-[200px]">No hay productos pendientes para este cliente.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>
    )}

      {selectedItem?.type === 'fruit' && (
          <StoreOtherFruitDialog
            item={selectedItem as PendingFruitItem}
            open={!!selectedItem}
            onOpenChange={() => setSelectedItem(null)}
            onConfirm={handleFruitStoreConfirm}
            allReceptions={otherFruitReceptions || []}
            allChamberLots={allChamberLots || []}
            clientConfig={resolvedClientConfig}
            lastUsedChamberId={lastUsedChamberId}
            lastUsedCoordinate={lastUsedCoordinate}
          />
      )}
       {selectedItem?.type === 'packaging' && (
          <StorePackagingDialog
            item={selectedItem as PendingPackagingItem}
            open={!!selectedItem}
            onOpenChange={() => setSelectedItem(null)}
            onConfirm={handlePackagingStoreConfirm}
          />
       )}

       <BarcodeScanner 
         open={isScannerOpen}
         onOpenChange={setIsScannerOpen}
         onScan={processScanValue}
       />
    </div>
  );
}
