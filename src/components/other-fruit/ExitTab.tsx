'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitReceptionItem, OtherFruitMovement } from '@/lib/types';
import { useFirestore } from '@/firebase';
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

const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;

interface AggregatedLot {
  displayLotId: string;
  unit: 'Bins' | 'Pallets';
  totalQuantity: number;
  totalWeight: number;
  locations: {
    receptionId: string;
    itemIndex: number;
    coordinate: string;
    quantity: number;
    weight?: number;
    productName: string;
    productCode: string;
    clientLotId?: string;
  }[];
}

export function OtherFruitExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [document, setDocument] = React.useState('');
  const [lotFilter, setLotFilter] = React.useState('');
  const [quantitiesToDispatch, setQuantitiesToDispatch] = React.useState<Record<string, number>>({});
  const [isDispatching, setIsDispatching] = React.useState(false);

  const fruitClients = React.useMemo(() => (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA'), [allClients]);
  const loading = loadingClients || loadingReceptions;

  const aggregatedStockByLot = React.useMemo(() => {
    if (!selectedClientId || !allReceptions) return [];

    const lotMap = new Map<string, AggregatedLot>();

    allReceptions.forEach(reception => {
      if (reception.clientId !== selectedClientId) return;

      if (!reception.displayLotId) return;

      reception.items.forEach((item, index) => {
        if (item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate && reception.displayLotId) {
          if (!lotMap.has(reception.displayLotId)) {
            lotMap.set(reception.displayLotId, {
              displayLotId: reception.displayLotId,
              unit: reception.unit,
              totalQuantity: 0,
              totalWeight: 0,
              locations: [],
            });
          }

          const lot = lotMap.get(reception.displayLotId)!;
          lot.totalQuantity += item.quantity;
          lot.totalWeight += item.weight || 0;
          lot.locations.push({
            receptionId: reception.id,
            itemIndex: index,
            coordinate: item.storageLocation.coordinate,
            quantity: item.quantity,
            weight: item.weight,
            productName: item.productName,
            productCode: item.productCode,
            clientLotId: item.clientLotId,
          });
        }
      });
    });
    return Array.from(lotMap.values()).filter(lot => lot.totalQuantity > 0);
  }, [selectedClientId, allReceptions]);
  
  const filteredLots = React.useMemo(() => {
    if (!lotFilter) {
        return aggregatedStockByLot;
    }
    const lowercasedFilter = lotFilter.toLowerCase();
    return aggregatedStockByLot.filter(lot => {
        // Check if the main displayLotId matches
        const displayIdMatch = lot.displayLotId.toLowerCase().includes(lowercasedFilter);
        if (displayIdMatch) {
            return true;
        }

        // Also check if any of the clientLotIds within this aggregated lot match
        const clientLotIdMatch = lot.locations.some(
            loc => loc.clientLotId && loc.clientLotId.toLowerCase().includes(lowercasedFilter)
        );
        return clientLotIdMatch;
    });
  }, [aggregatedStockByLot, lotFilter]);

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
    
    const client = fruitClients.find(c => c.clientId === selectedClientId);
    if (!client) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado.' });
      return;
    }

    setIsDispatching(true);

    try {
        const batch = writeBatch(firestore);
        const receptionUpdates = new Map<string, OtherFruitReceptionItem[]>();
        const movementItems: OtherFruitMovement['items'] = [];
        
        for (const [key, quantityToDispatch] of itemsToDispatch) {
            const [receptionId, itemIndexStr] = key.split('_');
            const itemIndex = parseInt(itemIndexStr, 10);
            
            const originalReception = allReceptions.find(r => r.id === receptionId);
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
                    weight?: number;
                    clientLotId?: string;
                } = {
                    productCode: itemToUpdate.productCode,
                    productName: itemToUpdate.productName,
                    quantity: quantityToDispatch,
                };

                if (typeof itemToUpdate.clientLotId !== 'undefined') {
                    newItemForMovement.clientLotId = itemToUpdate.clientLotId;
                }
                
                movementItems.push(newItemForMovement);
            }
        }

        receptionUpdates.forEach((items, receptionId) => {
            const receptionRef = doc(firestore, 'otherFruitReceptions', receptionId);
            batch.update(receptionRef, { items, updatedAt: serverTimestamp() });
        });

        const movementRef = doc(collection(firestore, 'otherFruitMovements'));
        batch.set(movementRef, {
            type: 'salida',
            clientId: client.clientId,
            clientName: client.name,
            unit: client.unit,
            document: document,
            items: movementItems,
            createdAt: serverTimestamp(),
        });
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Despacho registrado y stock actualizado.' });
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
        <CardTitle>Registrar Despacho de Fruta (Otros Clientes)</CardTitle>
        <CardDescription>
          Seleccione un cliente para ver su stock. Expanda cada lote para despachar una cantidad específica de cada coordenada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Cliente</Label>
              <Select value={selectedClientId} onValueChange={(val) => {setSelectedClientId(val); setQuantitiesToDispatch({});}} disabled={loading}>
                <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                <SelectContent>
                  {fruitClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
                <Label>Filtrar por Lote</Label>
                <Input placeholder="Escriba para filtrar..." value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} disabled={!selectedClientId} />
            </div>
            <div>
              <Label>Documento de Despacho</Label>
              <Input type="number" placeholder="Ej: 12345" value={document} onChange={(e) => setDocument(e.target.value)} disabled={!selectedClientId} required />
            </div>
        </div>

        {selectedClientId && (
            loadingReceptions ? <Skeleton className="h-24 w-full" />
            : (
            <>
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
                                      {lot.totalWeight > 0 && <span className="font-semibold text-muted-foreground">{lot.totalWeight.toFixed(2)} kg</span>}
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
                                        <TableHead>Lote Cliente</TableHead>
                                        <TableHead>Peso</TableHead>
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
                                                <TableCell className="font-mono">{loc.clientLotId || '-'}</TableCell>
                                                <TableCell>{loc.weight ? loc.weight.toFixed(2) : '-'}</TableCell>
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
             {filteredLots.length === 0 && (
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
