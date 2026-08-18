'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitReceptionItem, OtherFruitMovement, Producer, OtherFruitMovementLocation } from '@/lib/types';
import { useFirestore, useUser } from '@/firebase';
import { mockOtherClients, mockOtherFruitReceptions, mockProducers } from '@/lib/mock-chamber5';

import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { cn, safeToMillis, formatLocaleDateString } from '@/lib/utils';
import { cleanVarietyName } from '@/lib/fall-creek-utils';


const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;

interface AggregatedLot {
  displayLotId: string;
  varietyName?: string;
  unit: 'Bins' | 'Pallets';
  totalQuantity: number;
  locations: {
    receptionId: string;
    itemIndex: number;
    coordinate: string;
    quantity: number;
    observation?: string;
    productName: string;
    productCode: string;
    clientLotId?: string;
  }[];
}

const getVarietyPriority = (varietyName: string): number => {
  const name = varietyName.toUpperCase();
  if (name.includes('CRUNCH')) return 1;
  if (name.includes('FIESTA')) return 2;
  if (name.includes('GRANDE')) return 3;
  if (name.includes('FC13') || name.includes('FC11') || name.startsWith('FC')) return 4;
  return 5;
};

const isFallCreekClient = (id: string) => id === 'EXP004' || id === '76361536-7';

export function OtherFruitExitTab({ clientId: fixedClientId }: { clientId?: string }) {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allProducers } = useFirestoreCollection<Producer>('producers');
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [selectedSubClientId, setSelectedSubClientId] = React.useState('');
  const [document, setDocument] = React.useState('');
  const [lotFilter, setLotFilter] = React.useState('');
  const [quantitiesToDispatch, setQuantitiesToDispatch] = React.useState<Record<string, number>>({});
  const [isDispatching, setIsDispatching] = React.useState(false);

  const clients = React.useMemo(() => {
    const raw = allClients || [];
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      const merged = [...raw];
      mockOtherClients.forEach(mockC => {
        if (!merged.some(c => c.clientId === mockC.clientId)) {
          merged.push(mockC);
        }
      });
      return merged;
    }
    return raw;
  }, [allClients]);

  const receptions = React.useMemo(() => {
    const raw = allReceptions || [];
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return [...raw, ...mockOtherFruitReceptions];
    }
    return raw;
  }, [allReceptions]);

  const producers = React.useMemo(() => {
    const raw = allProducers || [];
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return [...raw, ...mockProducers];
    }
    return raw;
  }, [allProducers]);

  const subClients = React.useMemo(() => {
    return producers.filter(p => {
      if (p.status === 'inactivo') return false;
      if (Array.isArray(p.exporterId)) {
        return p.exporterId.includes('EXP004') || p.exporterId.includes('76361536-7');
      }
      return p.exporterId === 'EXP004' || p.exporterId === '76361536-7';
    });
  }, [producers]);

  const fruitClients = React.useMemo(() => {
    const rawClients = (clients || []).filter(c => c.type && c.type.toUpperCase() === 'FRUTA');
    if (!receptions) return [];

    const clientsWithStock = new Set<string>();
    receptions.forEach(reception => {
      const hasStoredItem = reception.items?.some(
        item => item && item.status === 'Almacenado' && item.quantity > 0
      );
      if (hasStoredItem) {
        clientsWithStock.add(reception.clientId);
      }
    });

    return rawClients.filter(c => clientsWithStock.has(c.clientId));
  }, [clients, receptions]);
  const loading = loadingClients || loadingReceptions;
  
  React.useEffect(() => {
    if (fixedClientId) {
      setSelectedClientId(fixedClientId);
      setSelectedSubClientId('');
      setQuantitiesToDispatch({});
      setDocument('');
      setLotFilter('');
    }
  }, [fixedClientId]);


  const aggregatedStockByLot = React.useMemo(() => {
    if (!selectedClientId || !receptions) return [];

    const lotMap = new Map<string, AggregatedLot>();

    receptions.forEach(reception => {
      if (reception.clientId !== selectedClientId) return;

      const lotId = reception.displayLotId || reception.document || reception.id;
      if (!lotId) return;

      (reception.items || []).forEach((item, index) => {
        if (item && item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate) {
          let displayKey = '';
          let varietyName = '';

          if (isFallCreekClient(selectedClientId)) {
            varietyName = cleanVarietyName(item.productName);
            displayKey = `${varietyName} - ${item.clientLotId || 'Sin Lote'}`;
          } else {
            displayKey = item.clientLotId 
              ? `${lotId}-${item.clientLotId}` 
              : lotId;
          }

          if (!lotMap.has(displayKey)) {
            lotMap.set(displayKey, {
              displayLotId: displayKey,
              varietyName: varietyName || undefined,
              unit: reception.unit,
              totalQuantity: 0,
              locations: [],
            });
          }

          const lot = lotMap.get(displayKey)!;
          lot.totalQuantity += item.quantity;
          lot.locations.push({
            receptionId: reception.id,
            itemIndex: index,
            coordinate: item.storageLocation.coordinate,
            quantity: item.quantity,
            observation: item.observation,
            productName: item.productName,
            productCode: item.productCode,
            clientLotId: item.clientLotId,
          });
        }
      });
    });

    const result = Array.from(lotMap.values()).filter(lot => lot.totalQuantity > 0);

    // Sort locations in each lot by FIFO (oldest reception first)
    result.forEach(lot => {
      lot.locations.sort((a, b) => {
        const recA = receptions.find(r => r.id === a.receptionId);
        const recB = receptions.find(r => r.id === b.receptionId);
        const timeA = recA?.createdAt ? safeToMillis(recA.createdAt) : 0;
        const timeB = recB?.createdAt ? safeToMillis(recB.createdAt) : 0;
        return timeA - timeB;
      });
    });

    return result;
  }, [selectedClientId, receptions]);
  
  const filteredLots = React.useMemo(() => {
    let lots = [];
    if (!lotFilter) {
        lots = aggregatedStockByLot;
    } else {
        const lowercasedFilter = lotFilter.toLowerCase();
        lots = aggregatedStockByLot.filter(lot => {
            const displayIdMatch = lot.displayLotId.toLowerCase().includes(lowercasedFilter);
            if (displayIdMatch) {
                return true;
            }

            const clientLotIdMatch = lot.locations.some(
                loc => loc.clientLotId && loc.clientLotId.toLowerCase().includes(lowercasedFilter)
            );
            return clientLotIdMatch;
        });
    }

    if (isFallCreekClient(selectedClientId)) {
        lots = [...lots].sort((a, b) => {
            const varA = a.varietyName || '';
            const varB = b.varietyName || '';
            
            const prioA = getVarietyPriority(varA);
            const prioB = getVarietyPriority(varB);
            
            if (prioA !== prioB) {
                return prioA - prioB;
            }
            
            // FIFO: Oldest reception first
            const getLotFifoTime = (lotItem: typeof a) => {
                let oldestTime = Infinity;
                lotItem.locations.forEach(loc => {
                    const rec = receptions?.find(r => r.id === loc.receptionId);
                    if (rec && rec.createdAt) {
                        const time = safeToMillis(rec.createdAt);
                        if (time < oldestTime) {
                            oldestTime = time;
                        }
                    }
                });
                return oldestTime === Infinity ? 0 : oldestTime;
            };

            return getLotFifoTime(a) - getLotFifoTime(b);
        });
    }
    return lots;
  }, [aggregatedStockByLot, lotFilter, selectedClientId, receptions]);

  const fallCreekGroups = React.useMemo(() => {
    if (!selectedClientId || !isFallCreekClient(selectedClientId) || !receptions) return [];

    const varietyMap = new Map<string, {
      varietyName: string;
      totalQuantity: number;
      unit: 'Bins' | 'Pallets';
      lotsMap: Map<string, {
        clientLotId: string;
        totalQuantity: number;
        fifoTime: number;
        locations: {
          receptionId: string;
          itemIndex: number;
          coordinate: string;
          chamberId: string;
          quantity: number;
          productName: string;
          productCode: string;
          receptionDate: string;
        }[];
      }>;
    }>();

    receptions.forEach(reception => {
      if (reception.clientId !== selectedClientId) return;

      const lotId = reception.displayLotId || reception.document || reception.id;
      if (!lotId) return;

      (reception.items || []).forEach((item, index) => {
        if (item && item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate) {
          const varietyName = cleanVarietyName(item.productName);
          const clientLotId = item.clientLotId || 'Sin Lote';

          if (!varietyMap.has(varietyName)) {
            varietyMap.set(varietyName, {
              varietyName,
              totalQuantity: 0,
              unit: reception.unit,
              lotsMap: new Map(),
            });
          }

          const varietyGroup = varietyMap.get(varietyName)!;
          varietyGroup.totalQuantity += item.quantity;

          if (!varietyGroup.lotsMap.has(clientLotId)) {
            varietyGroup.lotsMap.set(clientLotId, {
              clientLotId,
              totalQuantity: 0,
              fifoTime: Infinity,
              locations: [],
            });
          }

          const lotGroup = varietyGroup.lotsMap.get(clientLotId)!;
          lotGroup.totalQuantity += item.quantity;
          
          const recTime = reception.createdAt ? safeToMillis(reception.createdAt) : 0;
          if (recTime > 0 && recTime < lotGroup.fifoTime) {
            lotGroup.fifoTime = recTime;
          }

          lotGroup.locations.push({
            receptionId: reception.id,
            itemIndex: index,
            coordinate: item.storageLocation.coordinate,
            chamberId: item.storageLocation.chamberId || '',
            quantity: item.quantity,
            productName: cleanVarietyName(item.productName),
            productCode: item.productCode,
            receptionDate: formatLocaleDateString(reception.createdAt),
          });
        }
      });
    });

    // Convert Map to sorted array
    const sortedVarieties = Array.from(varietyMap.values()).map(varGroup => {
      // Sort lots by FIFO (oldest reception first)
      const sortedLots = Array.from(varGroup.lotsMap.values()).map(lot => {
        // Sort locations within the lot by FIFO (oldest reception first)
        lot.locations.sort((a, b) => {
          const recA = receptions.find(r => r.id === a.receptionId);
          const recB = receptions.find(r => r.id === b.receptionId);
          const timeA = recA?.createdAt ? safeToMillis(recA.createdAt) : 0;
          const timeB = recB?.createdAt ? safeToMillis(recB.createdAt) : 0;
          return timeA - timeB;
        });
        
        return {
          ...lot,
          fifoTime: lot.fifoTime === Infinity ? 0 : lot.fifoTime,
        };
      }).sort((a, b) => a.fifoTime - b.fifoTime);

      return {
        varietyName: varGroup.varietyName,
        totalQuantity: varGroup.totalQuantity,
        unit: varGroup.unit,
        lots: sortedLots,
      };
    });

    // Sort varieties by getVarietyPriority
    sortedVarieties.sort((a, b) => {
      return getVarietyPriority(a.varietyName) - getVarietyPriority(b.varietyName);
    });

    return sortedVarieties;
  }, [selectedClientId, receptions]);

  const filteredFallCreekGroups = React.useMemo(() => {
    if (!lotFilter) return fallCreekGroups;
    
    const lowercasedFilter = lotFilter.toLowerCase();
    
    return fallCreekGroups.map(varGroup => {
      const matchingLots = varGroup.lots.filter(lot => {
        // Match Lot ID
        if (lot.clientLotId.toLowerCase().includes(lowercasedFilter)) return true;
        // Match coordinate or chamber or variety inside lot
        return lot.locations.some(loc => 
          loc.coordinate.toLowerCase().includes(lowercasedFilter) ||
          loc.chamberId.toLowerCase().includes(lowercasedFilter) ||
          loc.productName.toLowerCase().includes(lowercasedFilter)
        );
      });
      
      if (matchingLots.length === 0) return null;
      
      return {
        ...varGroup,
        totalQuantity: matchingLots.reduce((sum, l) => sum + l.totalQuantity, 0),
        lots: matchingLots,
      };
    }).filter(Boolean) as typeof fallCreekGroups;
  }, [fallCreekGroups, lotFilter]);

  const handleClientChange = (val: string) => {
    setSelectedClientId(val);
    setSelectedSubClientId('');
    setQuantitiesToDispatch({});
    setDocument('');
    setLotFilter('');
  };

  const handleQuantityChange = (item: AggregatedLot['locations'][0], newQuantityStr: string) => {
    const key = getLocationKey(item.receptionId, item.itemIndex);
    const newQuantity = parseInt(newQuantityStr, 10);

    if (isNaN(newQuantity) || newQuantity <= 0) {
      setQuantitiesToDispatch(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
      return;
    }

    if (newQuantity > item.quantity) {
      toast({
        title: 'Cantidad excede el stock',
        description: `Solo hay ${item.quantity} disponibles en esta ubicación.`,
        variant: 'destructive'
      });
      // Optionally reset to max
      setQuantitiesToDispatch(prev => ({
        ...prev,
        [key]: item.quantity,
      }));
      return;
    }
    
    setQuantitiesToDispatch(prev => ({
      ...prev,
      [key]: newQuantity,
    }));
  };
  
  const handleSelectAllForLot = (lot: AggregatedLot, isSelected: boolean) => {
    setQuantitiesToDispatch(prev => {
      const newQuantities = { ...prev };
      lot.locations.forEach(loc => {
        const key = getLocationKey(loc.receptionId, loc.itemIndex);
        if (isSelected) {
          newQuantities[key] = loc.quantity;
        } else {
          delete newQuantities[key];
        }
      });
      return newQuantities;
    });
  };
  const handleDispatch = async () => {
    const itemsToDispatch = Object.entries(quantitiesToDispatch).filter(([, qty]) => qty > 0);
    if (itemsToDispatch.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar una cantidad para al menos una ubicación.' });
      return;
    }

    if (!document.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'El Documento de Despacho es obligatorio.' });
        return;
    }
    
    if (isFallCreekClient(selectedClientId) && !selectedSubClientId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar un SubCliente para despachar a Fall Creek.' });
        return;
    }

    const client = fruitClients.find(c => c.clientId === selectedClientId);
    if (!client) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado.' });
      return;
    }

    const selectedSubClient = isFallCreekClient(selectedClientId)
      ? producers.find(p => p.id === selectedSubClientId)
      : null;

    setIsDispatching(true);

    try {
        const batch = writeBatch(firestore);
        const receptionUpdates = new Map<string, OtherFruitReceptionItem[]>();
        const movementItems: OtherFruitMovement['items'] = [];
        const movementLocations: OtherFruitMovement['locations'] = [];
        
        for (const [key, quantityToDispatch] of itemsToDispatch) {
            const [receptionId, itemIndexStr] = key.split('_');
            const itemIndex = parseInt(itemIndexStr, 10);
            
            const originalReception = receptions.find(r => r.id === receptionId);
            if (!originalReception) continue;
            
            if (!receptionUpdates.has(receptionId)) {
                receptionUpdates.set(receptionId, JSON.parse(JSON.stringify(originalReception.items)));
            }
            
            const updatedItems = receptionUpdates.get(receptionId)!;
            const itemToUpdate = updatedItems[itemIndex];
            
            if (itemToUpdate && itemToUpdate.quantity >= quantityToDispatch) {
                itemToUpdate.quantity -= quantityToDispatch;
                
                const newItemForMovement: {
                    productCode: string;
                    productName: string;
                    quantity: number;
                    observation?: string;
                    clientLotId?: string;
                } = {
                    productCode: itemToUpdate.productCode,
                    productName: itemToUpdate.productName,
                    quantity: quantityToDispatch,
                };

                if (typeof itemToUpdate.observation !== 'undefined') {
                    newItemForMovement.observation = itemToUpdate.observation;
                }
                if (typeof itemToUpdate.clientLotId !== 'undefined') {
                    newItemForMovement.clientLotId = itemToUpdate.clientLotId;
                }
                
                movementItems.push(newItemForMovement);

                const locationObj: any = {
                    receptionId,
                    itemIndex,
                    quantity: quantityToDispatch,
                    unit: originalReception.unit,
                    productCode: itemToUpdate.productCode,
                    productName: itemToUpdate.productName,
                    location: {
                        chamberId: itemToUpdate.storageLocation?.chamberId || '',
                        coordinate: itemToUpdate.storageLocation?.coordinate || ''
                    }
                };
                if (itemToUpdate.clientLotId) {
                    locationObj.clientLotId = itemToUpdate.clientLotId;
                }
                movementLocations.push(locationObj);
            }
        }

        const hasRealWrites = !client.clientId.startsWith('mock-');

        const movementData: Partial<OtherFruitMovement> = {
            type: 'salida',
            status: 'Pendiente de Picking',
            clientId: client.clientId,
            clientName: client.name,
            unit: client.unit,
            document: document,
            destinationClientName: (selectedSubClient ? selectedSubClient.name : null) as any,
            destinationClientRUT: (selectedSubClient ? selectedSubClient.rut : null) as any,
            items: movementItems,
            locations: movementLocations,
            createdAt: serverTimestamp() as any,
            userId: (user?.uid || null) as any,
            userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
        };

        if (hasRealWrites) {
            const movementRef = doc(collection(firestore, 'otherFruitMovements'));
            batch.set(movementRef, movementData);

            if (isFallCreekClient(selectedClientId) && selectedSubClientId) {
                const totalBins = movementItems.reduce((sum, item) => sum + item.quantity, 0);
                if (totalBins > 0) {
                    const binMovementRef = doc(collection(firestore, 'binMaterialMovements'));
                    const binMovementData = {
                        type: 'salida',
                        document: document,
                        driverName: '',
                        driverRUT: '',
                        patente_vehiculo: '',
                        exporterId: 'EXP005',
                        producerId: selectedSubClientId,
                        items: [
                            {
                                binMaterialId: 'C6hVKlGF375OxDvoe9l7',
                                binMaterialCode: '10017',
                                binMaterialName: 'BINS_PALOGIX',
                                quantity: totalBins
                            }
                        ],
                        observation: `Despacho automático desde Fall Creek`,
                        createdAt: serverTimestamp()
                    };
                    batch.set(binMovementRef, binMovementData);
                }
            }

            await batch.commit();
        } else {
            console.log("Mock dispatch successful (skipped Firestore writes):", movementData);
        }
        toast({ title: 'Éxito', description: 'Despacho registrado. Tarea de picking creada.' });
        setQuantitiesToDispatch({});
        setDocument('');

    } catch (error) {
         console.error("Error creating fruit dispatch:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar el despacho.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'otherFruitMovements or otherFruitReceptions',
            operation: 'write'
        }));
    } finally {
        setIsDispatching(false);
    }
  }
  
  const totalSelectedQuantity = React.useMemo(() => {
    return Object.values(quantitiesToDispatch).reduce((sum, qty) => sum + qty, 0);
  }, [quantitiesToDispatch]);


  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Despacho de Fruta (Clientes)</CardTitle>
        <CardDescription>
          Seleccione un cliente para ver su stock. Expanda cada lote para despachar una cantidad específica de cada coordenada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("grid gap-4", isFallCreekClient(selectedClientId) ? "grid-cols-1 md:grid-cols-4" : "grid-cols-1 md:grid-cols-3")}>
            {!fixedClientId && (
              <div>
                <Label>Cliente</Label>
                <Select value={selectedClientId} onValueChange={handleClientChange} disabled={loading}>
                  <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                  <SelectContent>
                    {fruitClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isFallCreekClient(selectedClientId) && (
              <div>
                <Label>SubCliente</Label>
                <Select value={selectedSubClientId} onValueChange={setSelectedSubClientId}>
                  <SelectTrigger><SelectValue placeholder="Seleccione un subcliente..." /></SelectTrigger>
                  <SelectContent>
                    {subClients.map(sc => <SelectItem key={sc.id} value={sc.id}>{sc.shortName || sc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
                <Label>Filtrar por Lote</Label>
                <Input placeholder="Escriba para filtrar..." value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} disabled={!selectedClientId} />
            </div>
            <div>
              <Label>Documento de Despacho</Label>
              <Input type="text" placeholder="Ej: 12345" value={document} onChange={(e) => setDocument(e.target.value)} disabled={!selectedClientId} required />
            </div>
        </div>

        {selectedClientId && (
            loadingReceptions ? <Skeleton className="h-24 w-full" />
            : (
            <>
            {isFallCreekClient(selectedClientId) ? (
                <Accordion type="multiple" className="w-full space-y-2">
                    {filteredFallCreekGroups.map(group => {
                        const groupValue = `var_${group.varietyName}`;
                        return (
                            <AccordionItem value={groupValue} key={groupValue} className="border border-muted rounded-lg bg-card shadow-sm overflow-hidden">
                                <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 hover:no-underline [&[data-state=open]]:bg-muted/30">
                                    <div className="flex justify-between items-center w-full pr-4">
                                        <span className="font-bold text-base text-[#004b8d]">{group.varietyName}</span>
                                        <span className="font-bold text-sm text-[#7aba28] bg-[#7aba28]/10 px-2.5 py-0.5 rounded-full">{group.totalQuantity} {group.unit}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-4 py-2 bg-muted/10 space-y-2">
                                    <Accordion type="multiple" className="w-full space-y-1">
                                        {group.lots.map(lot => {
                                            const lotValue = `lot_${group.varietyName}_${lot.clientLotId}`;
                                            
                                            const allLocationKeysForLot = lot.locations.map(l => getLocationKey(l.receptionId, l.itemIndex));
                                            const selectedKeysInLot = allLocationKeysForLot.filter(key => key in quantitiesToDispatch);
                                            const isAllSelected = selectedKeysInLot.length === allLocationKeysForLot.length && 
                                                allLocationKeysForLot.every(key => quantitiesToDispatch[key] === lot.locations.find(l => getLocationKey(l.receptionId, l.itemIndex) === key)?.quantity);
                                            const isSomeSelected = selectedKeysInLot.length > 0;

                                            return (
                                                <AccordionItem value={lotValue} key={lotValue} className="border border-muted/50 rounded bg-white overflow-hidden shadow-sm">
                                                    <AccordionTrigger className="px-4 py-2 hover:bg-muted/30 hover:no-underline">
                                                        <div className="flex justify-between items-center w-full pr-4">
                                                            <span className="font-mono text-sm font-semibold">{lot.clientLotId}</span>
                                                            <span className="font-semibold text-xs text-muted-foreground">{lot.totalQuantity} {group.unit}</span>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="p-0 border-t border-muted/30">
                                                        <Table>
                                                            <TableHeader className="bg-muted/20">
                                                                <TableRow>
                                                                    <TableHead className="w-12 px-4">
                                                                        <Checkbox
                                                                            checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                                                                            onCheckedChange={(checked) => handleSelectAllForLot(lot as any, !!checked)}
                                                                            aria-label="Seleccionar todo en este lote"
                                                                        />
                                                                    </TableHead>
                                                                    <TableHead className="text-xs font-bold uppercase tracking-wider">Cámara</TableHead>
                                                                    <TableHead className="text-xs font-bold uppercase tracking-wider">Coordenada</TableHead>
                                                                    <TableHead className="text-xs font-bold uppercase tracking-wider">Variedad</TableHead>
                                                                    <TableHead className="text-xs font-bold uppercase tracking-wider">Fecha Recepción</TableHead>
                                                                    <TableHead className="text-xs font-bold uppercase tracking-wider">Disp.</TableHead>
                                                                    <TableHead className="text-xs font-bold uppercase tracking-wider w-28 px-4">A Despachar</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {lot.locations.map(loc => {
                                                                    const key = getLocationKey(loc.receptionId, loc.itemIndex);
                                                                    return (
                                                                        <TableRow key={key} className="hover:bg-muted/10">
                                                                            <TableCell className="px-4">
                                                                                <Checkbox 
                                                                                    checked={!!quantitiesToDispatch[key]}
                                                                                    onCheckedChange={(checked) => handleQuantityChange(loc as any, checked ? loc.quantity.toString() : '0')}
                                                                                />
                                                                            </TableCell>
                                                                            <TableCell className="font-semibold text-[#004b8d]">{loc.chamberId}</TableCell>
                                                                            <TableCell className="font-mono font-medium">{loc.coordinate}</TableCell>
                                                                            <TableCell className="text-xs">{loc.productName}</TableCell>
                                                                            <TableCell className="text-xs text-muted-foreground">{loc.receptionDate}</TableCell>
                                                                            <TableCell className="font-semibold">{loc.quantity}</TableCell>
                                                                            <TableCell className="px-4">
                                                                                <Input
                                                                                    type="number"
                                                                                    min={0}
                                                                                    max={loc.quantity}
                                                                                    value={quantitiesToDispatch[key] || ''}
                                                                                    onChange={(e) => handleQuantityChange(loc as any, e.target.value)}
                                                                                    placeholder="0"
                                                                                    className="h-8 text-right font-semibold"
                                                                                />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            );
                                        })}
                                    </Accordion>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            ) : (
                <Accordion type="multiple" className="w-full">
                    {filteredLots.map(lot => {
                        const allLocationKeysForLot = lot.locations.map(l => getLocationKey(l.receptionId, l.itemIndex));
                        const selectedKeysInLot = allLocationKeysForLot.filter(key => key in quantitiesToDispatch);
                        const isAllSelected = selectedKeysInLot.length === allLocationKeysForLot.length && allLocationKeysForLot.every(key => quantitiesToDispatch[key] === lot.locations.find(l => getLocationKey(l.receptionId, l.itemIndex) === key)?.quantity);
                        const isSomeSelected = selectedKeysInLot.length > 0;

                        return (
                            <AccordionItem value={lot.displayLotId} key={lot.displayLotId}>
                                <AccordionTrigger>
                                    <div className="flex justify-between w-full pr-4">
                                        <span className="font-mono">{lot.displayLotId}</span>
                                        <div className="flex items-center gap-4 text-sm">
                                          <span className="font-semibold">{lot.totalQuantity} {lot.unit}</span>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                                                    onCheckedChange={(checked) => handleSelectAllForLot(lot, !!checked)}
                                                    aria-label="Seleccionar todo en este lote"
                                                />
                                            </TableHead>
                                            <TableHead>Coordenada</TableHead>
                                            <TableHead>Producto</TableHead>
                                            <TableHead className="hidden md:table-cell">Lote Cliente</TableHead>
                                            <TableHead className="hidden md:table-cell">Observación</TableHead>
                                            <TableHead>Disp.</TableHead>
                                            <TableHead className="w-32">A Despachar</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {lot.locations.map(loc => {
                                            const key = getLocationKey(loc.receptionId, loc.itemIndex);
                                            return (
                                                <TableRow key={key}>
                                                    <TableCell>
                                                        <Checkbox 
                                                            checked={!!quantitiesToDispatch[key]}
                                                            onCheckedChange={(checked) => handleQuantityChange(loc, checked ? loc.quantity.toString() : '0')}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono">{loc.coordinate}</TableCell>
                                                    <TableCell>{loc.productName}</TableCell>
                                                    <TableCell className="font-mono hidden md:table-cell">{loc.clientLotId || '-'}</TableCell>
                                                    <TableCell className="hidden md:table-cell">{loc.observation || '-'}</TableCell>
                                                    <TableCell>{loc.quantity}</TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            max={loc.quantity}
                                                            value={quantitiesToDispatch[key] || ''}
                                                            onChange={(e) => handleQuantityChange(loc, e.target.value)}
                                                            placeholder="0"
                                                            className="h-8"
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
             {((isFallCreekClient(selectedClientId) ? filteredFallCreekGroups.length : filteredLots.length) === 0) && (
                <div className="text-center p-8 border-dashed border rounded-md text-sm text-muted-foreground">
                    No hay stock disponible para este cliente y filtro.
                </div>
            )}

            {Object.keys(quantitiesToDispatch).length > 0 && (
                 <div className="flex justify-between items-center pt-4">
                    <div className="text-sm font-medium">
                        Total a despachar: {totalSelectedQuantity} {aggregatedStockByLot.find(l => l.locations.some(loc => quantitiesToDispatch[getLocationKey(loc.receptionId, loc.itemIndex)]))?.unit}
                    </div>
                    <Button onClick={handleDispatch} disabled={isDispatching}>
                        {isDispatching ? "Despachando..." : "Confirmar Despacho"}
                    </Button>
                </div>
            )}
            </>
            )
        )}
      </CardContent>
    </Card>
  );
}
