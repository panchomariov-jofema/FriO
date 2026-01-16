'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Search, PackageX } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';

interface FoundStockItem extends OtherFruitReceptionItem {
  receptionId: string;
  itemIndex: number;
  clientName: string;
  unit: 'Bins' | 'Pallets';
}

export function OtherFruitExitTab() {
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [searchLotId, setSearchLotId] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [isDispatching, setIsDispatching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<FoundStockItem[]>([]);
  const [dispatchQuantities, setDispatchQuantities] = React.useState<Record<string, number>>({});

  const handleSearch = () => {
    setIsSearching(true);
    setSearchResults([]);
    setDispatchQuantities({});

    if (!searchLotId.trim()) {
      toast({ title: 'Error de Búsqueda', description: 'Debe ingresar un ID de lote de cliente.', variant: 'destructive' });
      setIsSearching(false);
      return;
    }

    const results = (allReceptions || [])
      .flatMap(reception =>
        reception.items.map((item, index) => ({
          ...item,
          receptionId: reception.id,
          itemIndex: index,
          clientName: reception.clientName,
          unit: reception.unit,
        }))
      )
      .filter(item => item.clientLotId === searchLotId && item.status === 'Almacenado' && item.quantity > 0)
      .sort((a,b) => (a.storedAt instanceof Date ? a.storedAt.getTime() : a.storedAt?.toMillis() || 0) - (b.storedAt instanceof Date ? b.storedAt.getTime() : b.storedAt?.toMillis() || 0)); // FIFO

    setSearchResults(results);
    setIsSearching(false);
    
    if (results.length === 0) {
      toast({ title: 'Sin Resultados', description: `No se encontró stock almacenado para el lote de cliente '${searchLotId}'.` });
    }
  };

  const handleDispatchAmountChange = (itemKey: string, value: string) => {
    const amount = parseInt(value, 10);
    setDispatchQuantities(prev => ({
      ...prev,
      [itemKey]: isNaN(amount) ? 0 : amount,
    }));
  };

  const handleDispatch = async () => {
    setIsDispatching(true);

    const itemsToDispatch = searchResults.map((item) => {
      const key = `${item.receptionId}-${item.itemIndex}`;
      return {
        ...item,
        key,
        quantityToDispatch: dispatchQuantities[key] || 0,
      };
    }).filter(item => item.quantityToDispatch > 0);

    if (itemsToDispatch.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'No ha especificado una cantidad para despachar.' });
      setIsDispatching(false);
      return;
    }

    // Validation
    for (const item of itemsToDispatch) {
      if (item.quantityToDispatch > item.quantity) {
        toast({
          variant: 'destructive',
          title: 'Error de Stock',
          description: `La cantidad a despachar para ${item.productName} (${item.quantityToDispatch}) excede la disponible (${item.quantity}).`,
        });
        setIsDispatching(false);
        return;
      }
    }
    
    const client = allReceptions.find(r => r.id === itemsToDispatch[0].receptionId);
    if (!client) {
         toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar la información del cliente.' });
         setIsDispatching(false);
         return;
    }


    try {
        const batch = writeBatch(firestore);
        const receptionUpdates = new Map<string, OtherFruitReceptionItem[]>();

        itemsToDispatch.forEach(item => {
            if (!receptionUpdates.has(item.receptionId)) {
                const originalReception = allReceptions.find(r => r.id === item.receptionId);
                if (originalReception) {
                    receptionUpdates.set(item.receptionId, JSON.parse(JSON.stringify(originalReception.items)));
                }
            }
            
            const updatedItems = receptionUpdates.get(item.receptionId);
            if (updatedItems) {
                const itemToUpdate = updatedItems[item.itemIndex];
                if (itemToUpdate) {
                    itemToUpdate.quantity -= item.quantityToDispatch;
                }
            }
        });

        receptionUpdates.forEach((items, receptionId) => {
            const receptionRef = doc(firestore, 'otherFruitReceptions', receptionId);
            const allItemsStored = items.every((i: OtherFruitReceptionItem) => i.status === 'Almacenado' || i.quantity <= 0);
            const hasPendingItems = items.some((i: OtherFruitReceptionItem) => i.status === 'Pendiente de almacenar' && i.quantity > 0);
            
            let newStatus: OtherFruitReception['status'] = 'Parcialmente Almacenado';
            if (hasPendingItems) {
                newStatus = 'Parcialmente Almacenado';
            } else if (allItemsStored && items.filter(i => i.quantity > 0).length > 0) {
                 newStatus = 'Almacenado';
            } else if (items.filter(i => i.quantity > 0).length === 0) {
                 newStatus = 'Almacenado'; // Considered fully stored even if empty
            }

            batch.update(receptionRef, { items, status: newStatus, updatedAt: serverTimestamp() });
        });

        // Create the movement document
        const movementRef = doc(collection(firestore, 'otherFruitMovements'));
        batch.set(movementRef, {
            type: 'salida',
            clientId: client.clientId,
            clientName: client.clientName,
            unit: client.unit,
            document: `LOTE_CLIENTE ${searchLotId}`,
            items: itemsToDispatch.map(item => ({
                productCode: item.productCode,
                productName: item.productName,
                quantity: item.quantityToDispatch,
                clientLotId: item.clientLotId,
            })),
            createdAt: serverTimestamp(),
        });
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Despacho registrado y stock actualizado.' });
        handleSearch(); // Refresh search results

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
  };
  
  const totalToDispatch = Object.values(dispatchQuantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salida por Lote de Cliente</CardTitle>
        <CardDescription>Busque un lote de cliente específico para despachar el stock asociado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Input
            type="text"
            placeholder="ID Lote del Cliente..."
            value={searchLotId}
            onChange={(e) => setSearchLotId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={loadingReceptions}
          />
          <Button onClick={handleSearch} disabled={loadingReceptions || isSearching}>
            <Search className="mr-2 h-4 w-4" />
            Buscar
          </Button>
        </div>

        {(isSearching || loadingReceptions) && (
            <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
            </div>
        )}

        {!isSearching && !loadingReceptions && searchResults.length > 0 && (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Disponible</TableHead>
                    <TableHead className="w-[150px]">A Despachar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((item) => {
                    const key = `${item.receptionId}-${item.itemIndex}`;
                    return (
                      <TableRow key={key}>
                        <TableCell>{item.productName} ({item.productCode})</TableCell>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-mono">{item.storageLocation?.chamberId} / {item.storageLocation?.coordinate}</TableCell>
                        <TableCell>{item.quantity} {item.unit}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={dispatchQuantities[key] || ''}
                            onChange={(e) => handleDispatchAmountChange(key, e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end items-center gap-4">
                <p className="text-sm font-medium">Total a Despachar: {totalToDispatch}</p>
                <Button onClick={handleDispatch} disabled={isDispatching || totalToDispatch === 0}>
                    {isDispatching ? 'Despachando...' : 'Confirmar Despacho'}
                </Button>
            </div>
          </>
        )}
        
        {searchLotId && !isSearching && !loadingReceptions && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center p-8 border rounded-md border-dashed">
                <PackageX className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm font-semibold">
                    No se encontró stock para el lote: '{searchLotId}'
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Verifique el ID del lote o si el stock ya ha sido despachado.
                </p>
            </div>
        )}

      </CardContent>
    </Card>
  );
}
