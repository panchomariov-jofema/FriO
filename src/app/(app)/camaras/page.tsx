// REGLA DE ORO ESTRUCTURAL: El layout visual (grid) es ESTÁTICO y la lógica de búsqueda (serpiente) está en una función de cálculo separada. NO MEZCLAR. NO ALTERAR EL LAYOUT VISUAL.

'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, Exporter, OtherFruitReception, StoredItem, ChamberTemperature, ClientStorageConfig } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoreInChamberDialog } from '@/components/hidrocooler/StoreInChamberDialog';
import { collection, doc, setDoc, writeBatch, getDocs, updateDoc, getDoc, serverTimestamp, query, orderBy, limit, onSnapshot, where, getCountFromServer, Timestamp } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
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
import { Trash2, Upload, Loader2 } from 'lucide-react';
import { ExternalReceptionUploader } from '@/components/hidrocooler/ExternalReceptionUploader';
import { ChamberTemperatureInput } from '@/components/camaras/ChamberTemperatureInput';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { mockStoredItems } from '@/lib/mock-chamber5';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';
import { parseTemperatureExcel } from '@/lib/fall-creek-utils';



// --- Color Palette Logic (Moved outside component to persist state) ---

const lotColorPalette = [
  'hsl(210, 80%, 55%)',  // Vivid Blue
  'hsl(0, 90%, 60%)',    // Bright Red
  'hsl(145, 70%, 45%)',  // Strong Green
  'hsl(50, 100%, 50%)',  // Bright Yellow
  'hsl(280, 70%, 60%)',  // Deep Purple
  'hsl(30, 100%, 55%)',  // Bold Orange
  'hsl(180, 70%, 45%)',  // Sharp Cyan
  'hsl(330, 85%, 60%)',  // Hot Pink
  'hsl(160, 100%, 35%)', // Teal
  'hsl(30, 40%, 40%)',   // Brown
  'hsl(80, 60%, 50%)',   // Lime Green
  'hsl(240, 60%, 60%)',  // Indigo
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

const isFallCreekItem = (item: StoredItem) => {
  if (item.type === 'otherFruit') {
    return item.ownerName?.toUpperCase() === 'FALL CREEK';
  }
  if (item.type === 'producerLot') {
    return item.exporterId === 'EXP004';
  }
  return false;
};

const getItemColorKey = (item: StoredItem) => {
  if (isFallCreekItem(item)) {
    return `${item.type}-${item.lotIdForColor}`;
  } else {
    if (item.type === 'otherFruit') {
      return `client-${item.ownerName}`;
    } else {
      return `exporter-${item.exporterId || 'default'}`;
    }
  }
};


export default function CamarasPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: clientConfigs, loading: loadingConfigs } = useFirestoreCollection<ClientStorageConfig>('clientStorageConfigs');
  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');
  const { data: usersMaster } = useFirestoreCollection<any>('usersMaster');

  const pendingLotsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'chamberLots'), where('status', '==', 'Pendiente por Almacenar'));
  }, [firestore]);
  const { data: pendingLots, isLoading: loadingPendingLots } = useCollection<ChamberLot>(pendingLotsQuery);

  const storedLotsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'chamberLots'), where('status', '==', 'Almacenado'));
  }, [firestore]);
  const { data: storedLots, isLoading: loadingStoredLots } = useCollection<ChamberLot>(storedLotsQuery);


  const [lotToStore, setLotToStore] = React.useState<ChamberLot | null>(null);
  const [coordToRelocate, setCoordToRelocate] = React.useState<{ chamberId: string, coordinate: string } | null>(null);
  const [isStoreDialogOpen, setStoreDialogOpen] = React.useState(false);
  const [isRelocateDialogOpen, setRelocateDialogOpen] = React.useState(false);
  const [latestTemperatures, setLatestTemperatures] = React.useState<Record<string, ChamberTemperature | null>>({});
  const { toast } = useToast();
  const [showChamberStatus, setShowChamberStatus] = React.useState(false);
  const [importingTemps, setImportingTemps] = React.useState(false);
  const tempFileInputRef = React.useRef<HTMLInputElement>(null);

  const currentUserMaster = React.useMemo(() => {
    if (!user?.email || !usersMaster) return null;
    const emailUsername = user.email.split('@')[0].toLowerCase();
    return usersMaster.find(u => typeof u.userName === 'string' && u.userName.toLowerCase() === emailUsername) || null;
  }, [user, usersMaster]);

  const isMaestro = currentUserMaster?.profileId === 'MAESTRO' || user?.email === 'francisco.villarreal@outlook.es' || user?.email?.split('@')[0].toLowerCase() === 'francisco';
  const loading = loadingPendingLots || loadingStoredLots || loadingOtherFruit || loadingExporters || loadingConfigs;
  
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


  const { sortedPendingLots, storedItemsByChamber, chamberOccupancy, totalNetWeightInStock, exporterMap, allLotsInChambers } = React.useMemo(() => {
    const allStoredLots = storedLots || [];
    const allOtherFruitReceptions = otherFruitReceptions || [];

    const calculatedExporterMap = (exporters || []).reduce((acc, exp) => {
      acc[exp.exporterId] = exp.name;
      return acc;
    }, {} as Record<string, string>);

    const calculatedPendingLots = (pendingLots || [])
      .sort((a, b) => b.receptionDate && a.receptionDate ? a.receptionDate.toMillis() - b.receptionDate.toMillis() : 0);

    const configs = clientConfigs || [];
      
    const allStoredItems: StoredItem[] = [
      ...allStoredLots
        .filter(lot => lot.chamberId && lot.coordinate && lot.binCount > 0)
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
            exporterId: lot.exporterId,
        })),
      ...allOtherFruitReceptions
        .flatMap(reception => reception.items
            .map((item, index) => ({ item, index })) // Map to include original index
            .filter(({ item }) => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0)
            .map(({ item, index }) => ({ // Use original index
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
                itemIndex: index, // This is now the correct original index
                netWeightPerBin: 0,
                clientLotId: item.clientLotId,
                observation: item.observation,
                exporterId: reception.clientId,
            }))
        )
    ];

    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        allStoredItems.push(...mockStoredItems);
    }
    
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
        const itemsInThisChamber = allStoredItems.filter(item => item.chamberId === chamberId);
        
        // Find if any client has an override for this chamber
        const clientWithOverride = configs.find(c => c.chamberOverrides?.[chamberId]);
        const totalCapacity = clientWithOverride?.chamberOverrides?.[chamberId] || chamberConfig.capacity;

        const occupiedEquivalentBins = itemsInThisChamber.reduce((sum, item) => {
            if (item.unit === 'Bins') {
                return sum + item.quantity;
            } else if (item.unit === 'Pallets') {
                return sum + item.quantity; // Pallets now count as 1 unit for occupancy
            }
            return sum;
        }, 0);

        acc[chamberId] = {
            occupied: occupiedEquivalentBins,
            total: totalCapacity,
            percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0,
        };
        return acc;
    }, {} as Record<string, {occupied: number; total: number; percentage: number}>);


    return { 
        sortedPendingLots: calculatedPendingLots, 
        storedItemsByChamber: calculatedStoredItemsByChamber, 
        chamberOccupancy: calculatedChamberOccupancy,
        totalNetWeightInStock: calculatedTotalNetWeight,
        exporterMap: calculatedExporterMap,
        allLotsInChambers: allStoredLots,
    };
  }, [pendingLots, storedLots, otherFruitReceptions, exporters]);

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
  
    const clientConfig = (clientConfigs || []).find(c => c.clientName.toUpperCase() === lotToStore.producerShortName.toUpperCase());
    const BINS_PER_COORDINATE = clientConfig?.binsPerCoordinate || 6;
    const PALLETS_PER_COORDINATE = clientConfig?.palletsPerCoordinate || 3;
    const chamberConfig = chambersConfig[chamberId];
    const exporter = (exporters || []).find(e => e.exporterId === lotToStore.exporterId);
    const strategy = exporter?.storageStrategy || 'secuencial';
  
    // 1. Get a fresh snapshot of all occupied coordinates
    const occupiedCoordinates = new Map<string, { displayLotId: string; binCount: number }[]>();
    (allLotsInChambers || [])
      .filter(l => l.chamberId === chamberId && l.coordinate)
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
                // Mark as full to prevent mixing different products
                occupiedCoordinates.get(item.storageLocation.coordinate)!.push({ displayLotId: `other_${reception.id}`, binCount: BINS_PER_COORDINATE });
            }
        });
    });
    
    let binsToStore = lotToStore.binCount;
    const batch = writeBatch(firestore);
    
    // 2. PASS 1: Fill partially filled coordinates that contain the SAME lot ID.
    // This prioritizes grouping same lots together. This is independent of FIFO/sequential strategy.
    const allPossibleCoordsSequentially = getSortedCoordinates(chamberConfig, 'secuencial');
    for (const coord of allPossibleCoordsSequentially) {
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
                    
                    // Update our in-memory map to reflect this change for the next step
                    lotsInCoord.push({displayLotId: lotToStore.displayLotId, binCount: binsToAdd});
                }
            }
        }
    }
    
    // 3. PASS 2: Store remaining bins in empty coordinates based on the selected strategy.
    if (binsToStore > 0) {
        // Get all available coordinates, ordered by the selected strategy
        const strategyPath = getSortedCoordinates(chamberConfig, strategy);
        const availableCoordsInStrategyOrder = strategyPath.filter(coord => !occupiedCoordinates.has(coord));

        // The user selected a startCoordinate. Find its index in our strategy-ordered list.
        const startIndex = availableCoordsInStrategyOrder.indexOf(startCoordinate);
        
        if (startIndex === -1) {
            toast({ variant: 'destructive', title: 'Error de ubicación', description: `La coordenada de inicio (${startCoordinate}) no es válida o ya está ocupada.` });
            return;
        }

        // The coordinates to fill are from the start index onwards in the strategy-ordered list.
        const coordinatesToFill = availableCoordsInStrategyOrder.slice(startIndex);

        for (const coord of coordinatesToFill) {
            if (binsToStore === 0) break;
            
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
        }
    }

    if (binsToStore > 0) {
        toast({ variant: 'destructive', title: 'Error de espacio', description: `No se encontraron coordenadas suficientes. Quedaron ${binsToStore} sin almacenar.` });
        return;
    }

    // 4. Delete the original "Pendiente" lot
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

  const handleRelocate = async ({ targetChamberId, targetCoordinate, quantityToRelocate }: { targetChamberId: string; targetCoordinate: string; quantityToRelocate: number }) => {
    if (!coordToRelocate || !firestore) return;

    const { chamberId: sourceChamberId, coordinate: sourceCoordinate } = coordToRelocate;

    // Find all lot documents that are in the source coordinate
    const lotsToMove = (storedLots || []).filter(
      (lot) =>
        lot.chamberId === sourceChamberId &&
        lot.coordinate === sourceCoordinate
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
        let remaining = quantityToRelocate;

        // 1. Process Cherry ChamberLots
        for (const lot of lotsToMove) {
            if (remaining <= 0) break;
            const avail = lot.binCount;
            const amountToMove = Math.min(avail, remaining);
            if (amountToMove <= 0) continue;

            const lotRef = doc(firestore, 'chamberLots', lot.id);
            if (amountToMove === avail) {
                // Move full document
                batch.update(lotRef, {
                    chamberId: targetChamberId,
                    coordinate: targetCoordinate,
                });
            } else {
                // Partial split: decrease original
                batch.update(lotRef, {
                    binCount: avail - amountToMove,
                });
                // Create new fraction document in target
                const newLotFractionRef = doc(collection(firestore, 'chamberLots'));
                batch.set(newLotFractionRef, {
                    ...lot,
                    id: newLotFractionRef.id,
                    binCount: amountToMove,
                    chamberId: targetChamberId,
                    coordinate: targetCoordinate,
                    status: 'Almacenado',
                    storedAt: serverTimestamp()
                });
            }
            remaining -= amountToMove;
        }

        // 2. Process Other Fruit items
        const fruitUpdatesByReception: Record<string, any[]> = {};
        const getReceptionItemsArray = (receptionId: string, initialItems: any[]) => {
            if (!fruitUpdatesByReception[receptionId]) {
                fruitUpdatesByReception[receptionId] = JSON.parse(JSON.stringify(initialItems));
            }
            return fruitUpdatesByReception[receptionId];
        };

        for (const { reception, item, index } of fruitItemsToMove) {
            if (remaining <= 0) break;
            const avail = item.quantity;
            const amountToMove = Math.min(avail, remaining);
            if (amountToMove <= 0) continue;

            const itemsArray = getReceptionItemsArray(reception.id, reception.items);
            const itemToUpdate = itemsArray[index];

            if (itemToUpdate) {
                if (amountToMove === avail) {
                    // Move full item
                    itemToUpdate.storageLocation = {
                        chamberId: targetChamberId,
                        coordinate: targetCoordinate,
                    };
                } else {
                    // Split item: decrease original
                    itemToUpdate.quantity = avail - amountToMove;
                    // Add new split item in target
                    itemsArray.push({
                        ...itemToUpdate,
                        quantity: amountToMove,
                        status: 'Almacenado',
                        storageLocation: {
                            chamberId: targetChamberId,
                            coordinate: targetCoordinate,
                        },
                        storedAt: new Date()
                    });
                }
            }
            remaining -= amountToMove;
        }

        // Apply all other fruit updates
        Object.entries(fruitUpdatesByReception).forEach(([receptionId, updatedItems]) => {
            const receptionRef = doc(firestore, 'otherFruitReceptions', receptionId);
            batch.update(receptionRef, { items: updatedItems });
        });

        await batch.commit();
        
        toast({ title: 'Éxito', description: `Se reubicaron ${quantityToRelocate} unidades a ${chambersConfig[targetChamberId].name} - ${targetCoordinate}.` });

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
  
  const handleClearChamberStock = async (chamberId: string) => {
    if (!firestore) return;

    const chamberConfig = chambersConfig[chamberId];
    const chamberName = chamberConfig?.name || chamberId;

    try {
      const batch = writeBatch(firestore);
      let deletionCount = 0;

      // 1. Delete producer lots (chamberLots) in this chamber
      const chamberLotsRef = collection(firestore, 'chamberLots');
      const lotsQuery = query(
        chamberLotsRef,
        where('chamberId', '==', chamberId)
      );
      const lotsSnapshot = await getDocs(lotsQuery);
      lotsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deletionCount++;
      });

      // 2. Handle items stored in this chamber within otherFruitReceptions
      const otherFruitRef = collection(firestore, 'otherFruitReceptions');
      const otherFruitSnapshot = await getDocs(otherFruitRef);
      
      otherFruitSnapshot.forEach((receptionDoc) => {
        const data = receptionDoc.data() as OtherFruitReception;
        if (!data.items) return;

        // Check if any item in this reception is stored in the target chamber
        const hasItemsInChamber = data.items.some(
          item => item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId
        );

        if (hasItemsInChamber) {
          // Filter out items stored in this chamber
          const updatedItems = data.items.filter(
            item => !(item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId)
          );

          if (updatedItems.length === 0) {
            // Delete the entire document if no items remain
            batch.delete(receptionDoc.ref);
            deletionCount++;
          } else {
            // Check if there are still stored items left
            const hasStoredLeft = updatedItems.some(item => item.status === 'Almacenado');
            const hasPendingLeft = updatedItems.some(item => 
              item.status === 'Pendiente de almacenar' || 
              item.status === 'Pendiente de recibir' || 
              item.status === 'Recibido'
            );
            
            let newStatus = data.status;
            if (hasStoredLeft && hasPendingLeft) {
              newStatus = 'Parcialmente Almacenado';
            } else if (hasStoredLeft) {
              newStatus = 'Almacenado';
            } else if (hasPendingLeft) {
              newStatus = 'Pendiente de almacenar';
            }

            batch.update(receptionDoc.ref, {
              items: updatedItems,
              status: newStatus,
              updatedAt: serverTimestamp()
            });
            deletionCount++;
          }
        }
      });

      if (deletionCount === 0) {
        toast({ title: 'Sin Stock', description: `No hay lotes en la ${chamberName} para limpiar.` });
        return;
      }

      await batch.commit();

      // Clear localStorage coordinate memory if the cleared chamber matches the last used chamber
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const lastChamberId = window.localStorage.getItem('frio_last_chamber_id');
          if (lastChamberId === chamberId) {
            window.localStorage.removeItem('frio_last_chamber_id');
            window.localStorage.removeItem('frio_last_coordinate');
          }
        }
      } catch (err) {
        console.error('Error clearing localStorage:', err);
      }

      toast({ title: 'Éxito', description: `El stock de la ${chamberName} ha sido eliminado.` });
    } catch (e: any) {
      console.error(`Error al limpiar el stock de la cámara ${chamberId}: `, e);
      toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al limpiar el stock de la cámara.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'chamberLots or otherFruitReceptions',
          operation: 'delete'
      }));
    }
  };


  const handleTempExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firestore) return;

    setImportingTemps(true);
    try {
      const records = await parseTemperatureExcel(file);
      if (records.length === 0) {
        toast({ variant: 'destructive', title: 'Sin Datos', description: 'No se encontraron registros de temperatura válidos.' });
        return;
      }

      // Write in batches of 400
      const CHUNK_SIZE = 400;
      let committedCount = 0;
      
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(firestore);
        
        chunk.forEach(record => {
          const docId = `${record.chamberId}_${record.date.getTime()}`;
          const docRef = doc(firestore, 'chamberTemperatures', docId);
          batch.set(docRef, {
            chamberId: record.chamberId,
            temperature: record.temperature,
            timestamp: Timestamp.fromDate(record.date),
            userId: user?.uid || null,
            userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
          });
        });
        
        await batch.commit();
        committedCount += chunk.length;
      }

      toast({ title: 'Éxito', description: `Se han importado ${committedCount} registros de climatización correctamente.` });
    } catch (err: any) {
      console.error('Error importing temperature Excel:', err);
      toast({ variant: 'destructive', title: 'Error de Importación', description: err.message || 'No se pudo procesar el archivo Excel.' });
    } finally {
      setImportingTemps(false);
      if (tempFileInputRef.current) tempFileInputRef.current.value = '';
    }
  };

  const lotsInCoordToRelocate = coordToRelocate ? storedItemsByChamber[coordToRelocate.chamberId]?.[coordToRelocate.coordinate] || [] : [];


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card p-6 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#004b8d]">Cámaras de Almacenamiento</h1>
          <p className="text-sm text-muted-foreground">Monitoreo de clima, stock y movimientos en cámaras.</p>
        </div>
        {isMaestro && (
          <div className="flex items-center gap-2">
            <Input
              type="file"
              ref={tempFileInputRef}
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleTempExcelUpload}
            />
            <Button
              onClick={() => tempFileInputRef.current?.click()}
              className="bg-[#7aba28] hover:bg-[#6aa423] text-white font-bold"
              disabled={importingTemps}
            >
              {importingTemps ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar Planilla de Clima
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
            <div>
              <CardTitle>Lotes de Productor Pendientes</CardTitle>
              <CardDescription>Lotes que esperan ser asignados a una cámara.</CardDescription>
            </div>
            <div className="hidden md:block">
              <ExternalReceptionUploader />
            </div>
        </CardHeader>
        <CardContent>
          {/* Mobile View */}
          <div className="md:hidden space-y-3">
              {loading ? (
                  Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)
              ) : (sortedPendingLots || []).length > 0 ? (
                  sortedPendingLots.map((lot) => (
                      <Card key={lot.id} className="p-4">
                          <div className="flex justify-between items-start">
                              <div>
                                  <CardTitle className="text-lg">{lot.displayLotId}</CardTitle>
                                  <CardDescription>{lot.producerShortName} / {exporterMap[lot.exporterId] || lot.exporterId}</CardDescription>
                              </div>
                              <Button size="lg" onClick={() => handleStoreClick(lot)}>Almacenar</Button>
                          </div>
                          <div className="mt-4 text-sm">
                              <p><strong>Bins:</strong> {lot.binCount}</p>
                              <p><strong>Fecha Recepción:</strong> {lot.receptionDate?.toDate()?.toLocaleString('es-CL') ?? 'Sin fecha'}</p>
                          </div>
                      </Card>
                  ))
              ) : (
                  <div className="h-24 text-center flex items-center justify-center">
                      <p>No hay lotes de productor pendientes.</p>
                  </div>
              )}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block rounded-md border">
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
                ) : (sortedPendingLots || []).length > 0 ? (
                  sortedPendingLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="text-sm">{lot.receptionDate?.toDate()?.toLocaleString('es-CL', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit' }) ?? 'Sin fecha'}</TableCell>
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
                </div>
            </CardHeader>
            <CardContent>
            <Accordion type="single" collapsible className="w-full">
                {Object.entries(chambersConfig).map(([chamberId, config]) => {
                    const isRow13Enabled = !!chamberSettings?.find(s => s.id === chamberId)?.row13Enabled;
                    const activeRows = isRow13Enabled ? config.rows : config.rows.filter(r => r !== 13);
                    return (
                        <AccordionItem value={chamberId} key={chamberId}>
                            <div className="flex flex-col sm:flex-row w-full items-start sm:items-center justify-between pr-4">
                                <AccordionTrigger className="hover:no-underline py-4 flex-1">
                                    <span className="text-md sm:text-lg font-semibold">{config.name}</span>
                                </AccordionTrigger>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 py-2 sm:py-0 w-full sm:w-auto z-10">
                                    <div className="flex items-center gap-2 sm:gap-4">
                                        <ChamberTemperatureInput chamberId={chamberId} />
                                        <div className="flex items-center gap-1.5 ml-2">
                                            <Switch
                                                id={`row13-${chamberId}`}
                                                checked={isRow13Enabled}
                                                onCheckedChange={async (checked) => {
                                                    await setDoc(doc(firestore, 'chamberSettings', chamberId), { row13Enabled: checked }, { merge: true });
                                                }}
                                                className="scale-75 data-[state=checked]:bg-amber-500"
                                            />
                                            <label htmlFor={`row13-${chamberId}`} className="text-[10px] font-black uppercase tracking-wider text-muted-foreground cursor-pointer select-none">Fila 13</label>
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right w-full sm:w-auto">
                                        <p className={cn("font-mono font-semibold text-sm", (chamberOccupancy[chamberId]?.percentage ?? 0) > 50 ? 'text-destructive' : 'text-foreground')}>
                                            {chamberOccupancy[chamberId]?.occupied ?? 0} / {chamberOccupancy[chamberId]?.total ?? 0} Bins Equiv.
                                            ({(chamberOccupancy[chamberId]?.percentage ?? 0).toFixed(1)}%)
                                        </p>
                                        <Progress value={chamberOccupancy[chamberId]?.percentage ?? 0} className="w-full sm:w-48 h-2 mt-1" />
                                    </div>
                                </div>
                            </div>
                            <AccordionContent>
                                <div className="p-2 sm:p-4 bg-muted/50 rounded-b-lg border border-t-0">
                                    {isMaestro && (
                                        <div className="flex justify-end mb-4">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Limpiar Stock Cámara
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Está seguro de limpiar el stock de la {config.name}?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                        Esta acción eliminará permanentemente todos los lotes almacenados en esta cámara (productores y clientes). Esta acción no se puede deshacer.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleClearChamberStock(chamberId)} className="bg-destructive hover:bg-destructive/90">
                                                        Sí, Limpiar Cámara
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                        <div className="grid gap-1" style={{ 
                                            gridTemplateRows: `repeat(${activeRows.length}, minmax(0, 1fr))`,
                                            gridAutoFlow: 'column'
                                        }}>
                                            {config.columns.map((col, colIdx) =>
                                                activeRows.map((row, rowIdx) => {
                                            const coord = `${col.name}${row}`;
                                            const itemsInCoord = storedItemsByChamber[chamberId]?.[coord] || [];
                                          const isOccupied = itemsInCoord.length > 0;
                                        
                                          const totalBins = itemsInCoord.filter(i => i.unit === 'Bins').reduce((s, i) => s + i.quantity, 0);
                                          const totalPallets = itemsInCoord.filter(i => i.unit === 'Pallets').reduce((s, i) => s + i.quantity, 0);
                                          const totalNetWeight = itemsInCoord.reduce((sum, i) => sum + (i.quantity * (i.netWeightPerBin || 0)), 0);
                                          const clientLotIds = Array.from(new Set(itemsInCoord.map(i => i.clientLotId).filter(Boolean)));
                                        
                                          const firstItem = isOccupied ? itemsInCoord[0] : null;
                                          
                                          // Dynamic capacity lookup
                                          const clientName = firstItem?.ownerName || '';
                                          const clientConfig = (clientConfigs || []).find(c => c.clientName.toUpperCase() === clientName.toUpperCase());
                                          const coordCapacity = clientConfig 
                                            ? (firstItem?.unit === 'Pallets' ? clientConfig.palletsPerCoordinate : clientConfig.binsPerCoordinate)
                                            : (firstItem?.unit === 'Pallets' ? 3 : 6);
     
                                          const occupancyPercentage = isOccupied ? (totalBins + totalPallets) / coordCapacity * 100 : 0;

                                          const uniqueLotIds = Array.from(new Set(itemsInCoord.map(item => `${item.type}-${item.lotIdForColor}`)));
                                          const uniqueColorKeys = Array.from(new Set(itemsInCoord.map(item => getItemColorKey(item))));
                                          const isMixed = uniqueColorKeys.length > 1;

                                          let cellStyle: React.CSSProperties = {};
                                          let progressStyle: React.CSSProperties = {};

                                          if (isOccupied && firstItem) {
                                              if (!isMixed) {
                                                  const colorKey = getItemColorKey(firstItem);
                                                  const color = getColorForLot(colorKey);
                                                  cellStyle = {
                                                      '--lot-color': color,
                                                      '--lot-color-border': color.replace(')', ', 0.5)'),
                                                      '--lot-color-bg': color.replace(')', ', 0.2)'),
                                                  } as React.CSSProperties;
                                                  progressStyle = {
                                                      backgroundColor: color.replace(')', ', 0.3)'),
                                                      right: `${Math.max(0, 100 - occupancyPercentage)}%`,
                                                  };
                                              } else {
                                                  // Group quantities by color key to calculate relative slice percentages
                                                  const lotQuantities = uniqueColorKeys.map(colorKey => {
                                                      const itemsForLot = itemsInCoord.filter(item => getItemColorKey(item) === colorKey);
                                                      const totalQty = itemsForLot.reduce((sum, item) => sum + item.quantity, 0);
                                                      return { lotId: colorKey, quantity: totalQty, color: getColorForLot(colorKey) };
                                                  });
                                                  // Sort alphabetically to maintain stable color slice ordering
                                                  lotQuantities.sort((a, b) => a.lotId.localeCompare(b.lotId));
                                                  const totalCoordQuantity = lotQuantities.reduce((sum, l) => sum + l.quantity, 0);

                                                  let accumulatedPct = 0;
                                                  const bgGradients: string[] = [];
                                                  const progGradients: string[] = [];

                                                  lotQuantities.forEach((l) => {
                                                      const share = totalCoordQuantity > 0 ? (l.quantity / totalCoordQuantity) * 100 : 0;
                                                      const start = Math.round(accumulatedPct);
                                                      accumulatedPct += share;
                                                      const end = Math.round(accumulatedPct);

                                                      const colorBg = l.color.replace(')', ', 0.2)');
                                                      const colorProg = l.color.replace(')', ', 0.3)');

                                                      bgGradients.push(`${colorBg} ${start}%, ${colorBg} ${end}%`);
                                                      progGradients.push(`${colorProg} ${start}%, ${colorProg} ${end}%`);
                                                  });

                                                  cellStyle = {
                                                      backgroundImage: `linear-gradient(135deg, ${bgGradients.join(', ')})`,
                                                      borderColor: lotQuantities[0].color.replace(')', ', 0.5)'), // border color matches first lot's border style
                                                  };
                                                  progressStyle = {
                                                      backgroundImage: `linear-gradient(135deg, ${progGradients.join(', ')})`,
                                                      right: `${Math.max(0, 100 - occupancyPercentage)}%`,
                                                  };
                                              }
                                          }
    
                                          return (
                                              <Popover key={coord}>
                                              <PopoverTrigger asChild>
                                                  <div 
                                                  className={cn("h-12 w-full min-w-[60px] rounded border-2 flex items-center justify-center text-xs font-mono relative overflow-hidden cursor-pointer",
                                                      isOccupied ? 'border-[var(--lot-color-border)] bg-[var(--lot-color-bg)]' : 'bg-background border-dashed',
                                                      row === 13 && "border-amber-500/40"
                                                  )}
                                                  style={cellStyle}
                                                  >
                                                  <div className="absolute bottom-0 left-0 top-0 transition-all duration-300" style={progressStyle} />
                                                  {row === 13 && (
                                                      <div className="absolute inset-0 bg-repeat bg-[length:12px_12px] opacity-25 z-0 pointer-events-none" style={{backgroundImage: "repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 1px, transparent 1px, transparent 6px)"}} />
                                                  )}
                                                  {renderVarietyBorders(chamberId, colIdx, rowIdx, config)}
                                                  <span className="relative z-10 font-semibold">{coord}</span>
                                                  {isMixed && (
                                                      <div className="absolute top-0.5 right-1 z-20 bg-black/60 rounded px-0.5 text-[8px] font-black text-amber-500 leading-none shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                                                          ⚠
                                                      </div>
                                                  )}
                                                  {row === 13 && (
                                                      <div className="absolute top-0.5 left-1 z-20 bg-amber-500 text-white rounded px-0.5 text-[8px] font-black leading-none shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                                                          SOS
                                                      </div>
                                                  )}
                                                  </div>
                                              </PopoverTrigger>
                                              {isOccupied && (
                                                  <PopoverContent className="p-4 w-60 sm:w-64" side="bottom" align="center">
                                                  <div className="space-y-2">
                                                      <div className="border-b pb-1">
                                                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ubicación {coord}</p>
                                                          <p className="text-sm font-semibold">{uniqueLotIds.length > 1 ? 'Lotes Mezclados' : firstItem?.type === 'producerLot' ? `Lote: ${firstItem?.displayId}` : `Producto: ${firstItem?.displayId}`}</p>
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
                                                                              <span className="font-bold">{item.type === 'producerLot' ? `Lote: ${item.displayId}` : `Prod: ${item.displayId}`}</span>
                                                                              <Badge variant="outline" className="h-4 text-[9px] px-1 bg-primary/5 text-primary border-primary/20">
                                                                                  {item.quantity} {item.unit}
                                                                              </Badge>
                                                                          </div>
                                                                          <p className="text-muted-foreground mt-0.5">{item.ownerName} - {item.varietyOrProduct}</p>
                                                                          {item.clientLotId && <p className="text-muted-foreground font-mono text-[9px]">Lote Cliente: {item.clientLotId}</p>}
                                                                          {item.observation && <p className="text-muted-foreground italic text-[10px] mt-0.5">Obs: {item.observation}</p>}
                                                                      </div>
                                                                  ))}
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <>
                                                              {firstItem && (
                                                                  <>
                                                                      {clientLotIds.length > 0 && (
                                                                      <p>Lote Cliente: <span className="font-mono">{clientLotIds.join(', ')}</span></p>
                                                                      )}
                                                                      <p>
                                                                      {firstItem.type === 'producerLot' ? `Productor: ${firstItem.ownerName}` : `Cliente: ${firstItem.ownerName}`}
                                                                      </p>
                                                                      <p>Variedad/Producto: {firstItem.varietyOrProduct}</p>
                                                                      {firstItem.observation && (
                                                                        <p className="text-muted-foreground italic text-xs mt-0.5">Obs: {firstItem.observation}</p>
                                                                      )}
                                                                  </>
                                                              )}
                                                          </>
                                                      )}

                                                      <div className="grid grid-cols-2 gap-x-4 pt-1 text-xs font-semibold border-t">
                                                          <p>Bins: {totalBins}</p>
                                                          <p>Pallets: {totalPallets}</p>
                                                          {totalNetWeight > 0 && <p className="col-span-2 mt-0.5">Peso Neto: {totalNetWeight.toFixed(1)} kg</p>}
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
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
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
            clientConfigs={clientConfigs || []}
            exporters={exporters || []}
        />
      )}
    </div>
  );
}
