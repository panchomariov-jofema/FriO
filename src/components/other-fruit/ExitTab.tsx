'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Search, PackageX } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

// --- Component for Lot-specific Search ---
function SearchByLot() {
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [searchLotId, setSearchLotId] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [isDispatching, setIsDispatching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
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
      .sort((a,b) => (a.storedAt instanceof Date ? a.storedAt.getTime() : a.storedAt?.toMillis() || 0) - (b.storedAt instanceof Date ? b.storedAt.getTime() : b.storedAt?.toMillis() || 0));

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
      return { ...item, key, quantityToDispatch: dispatchQuantities[key] || 0 };
    }).filter(item => item.quantityToDispatch > 0);

    if (itemsToDispatch.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'No ha especificado una cantidad para despachar.' });
      setIsDispatching(false);
      return;
    }

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
            batch.update(receptionRef, { items, updatedAt: serverTimestamp() });
        });

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
        handleSearch();

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
        <CardDescription>Busque un lote de cliente específico para despachar el stock asociado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Input type="text" placeholder="ID Lote del Cliente..." value={searchLotId} onChange={(e) => setSearchLotId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} disabled={loadingReceptions}/>
          <Button onClick={handleSearch} disabled={loadingReceptions || isSearching}><Search className="mr-2 h-4 w-4" />Buscar</Button>
        </div>
        {(isSearching || loadingReceptions) && <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>}
        {!isSearching && !loadingReceptions && searchResults.length > 0 && (
          <>
            <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Ubicación</TableHead><TableHead>Disponible</TableHead><TableHead className="w-[150px]">A Despachar</TableHead></TableRow></TableHeader><TableBody>
              {searchResults.map((item) => { const key = `${item.receptionId}-${item.itemIndex}`; return (
                  <TableRow key={key}>
                    <TableCell>{item.productName} ({item.productCode})</TableCell>
                    <TableCell className="font-mono">{item.storageLocation?.chamberId} / {item.storageLocation?.coordinate}</TableCell>
                    <TableCell>{item.quantity} {item.unit}</TableCell>
                    <TableCell><Input type="number" min="0" max={item.quantity} value={dispatchQuantities[key] || ''} onChange={(e) => handleDispatchAmountChange(key, e.target.value)} placeholder="0" /></TableCell>
                  </TableRow>
              );})}
            </TableBody></Table></div>
            <div className="flex justify-end items-center gap-4">
              <p className="text-sm font-medium">Total a Despachar: {totalToDispatch}</p>
              <Button onClick={handleDispatch} disabled={isDispatching || totalToDispatch === 0}>{isDispatching ? 'Despachando...' : 'Confirmar Despacho'}</Button>
            </div>
          </>
        )}
        {searchLotId && !isSearching && !loadingReceptions && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center p-8 border rounded-md border-dashed">
                <PackageX className="h-12 w-12 text-muted-foreground" /><p className="mt-4 text-sm font-semibold">No se encontró stock para el lote: '{searchLotId}'</p><p className="mt-1 text-xs text-muted-foreground">Verifique el ID del lote o si el stock ya ha sido despachado.</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Component for General Exit ---
function GeneralExit() {
    const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
    const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selectedClientId, setSelectedClientId] = React.useState('');
    const [document, setDocument] = React.useState('');
    const [quantitiesToDispatch, setQuantitiesToDispatch] = React.useState<Record<string, number>>({});
    const [isDispatching, setIsDispatching] = React.useState(false);

    const fruitClients = React.useMemo(() => (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA'), [allClients]);

    const aggregatedStock = React.useMemo(() => {
        if (!selectedClientId) return [];

        const stockMap = new Map<string, { productName: string; unit: 'Bins' | 'Pallets'; totalQuantity: number; locations: { receptionId: string; itemIndex: number; storedAt: any; quantity: number }[] }>();

        (allReceptions || []).forEach(reception => {
            if (reception.clientId !== selectedClientId) return;

            reception.items.forEach((item, index) => {
                if (item.status === 'Almacenado' && item.quantity > 0) {
                    if (!stockMap.has(item.productCode)) {
                        stockMap.set(item.productCode, {
                            productName: item.productName,
                            unit: reception.unit,
                            totalQuantity: 0,
                            locations: []
                        });
                    }
                    const product = stockMap.get(item.productCode)!;
                    product.totalQuantity += item.quantity;
                    product.locations.push({
                        receptionId: reception.id,
                        itemIndex: index,
                        storedAt: item.storedAt,
                        quantity: item.quantity
                    });
                }
            });
        });

        stockMap.forEach(product => {
            product.locations.sort((a, b) => (a.storedAt?.toMillis() || 0) - (b.storedAt?.toMillis() || 0)); // FIFO
        });

        return Array.from(stockMap.entries()).map(([productCode, data]) => ({ productCode, ...data }));
    }, [selectedClientId, allReceptions]);

    const handleQuantityChange = (productCode: string, value: string) => {
        const amount = parseInt(value, 10);
        setQuantitiesToDispatch(prev => ({
            ...prev,
            [productCode]: isNaN(amount) ? 0 : amount,
        }));
    };

    const handleGeneralDispatch = async () => {
        setIsDispatching(true);

        const itemsToDispatch = Object.entries(quantitiesToDispatch).map(([productCode, quantity]) => ({ productCode, quantity })).filter(item => item.quantity > 0);
        if (itemsToDispatch.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar una cantidad para al menos un producto.' });
            setIsDispatching(false);
            return;
        }

        const client = fruitClients.find(c => c.clientId === selectedClientId);
        if (!client) {
            toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado.' });
            setIsDispatching(false);
            return;
        }

        try {
            const batch = writeBatch(firestore);
            const receptionUpdates = new Map<string, OtherFruitReceptionItem[]>();
            const movementItems = [];

            for (const item of itemsToDispatch) {
                const stock = aggregatedStock.find(s => s.productCode === item.productCode);
                if (!stock || item.quantity > stock.totalQuantity) {
                    throw new Error(`Stock insuficiente para ${stock?.productName || item.productCode}.`);
                }

                let needed = item.quantity;
                movementItems.push({ productCode: item.productCode, productName: stock.productName, quantity: item.quantity });

                for (const location of stock.locations) {
                    if (needed === 0) break;

                    if (!receptionUpdates.has(location.receptionId)) {
                        const originalReception = allReceptions.find(r => r.id === location.receptionId);
                        if (originalReception) {
                            receptionUpdates.set(location.receptionId, JSON.parse(JSON.stringify(originalReception.items)));
                        }
                    }

                    const updatedItems = receptionUpdates.get(location.receptionId);
                    if (updatedItems) {
                        const itemToUpdate = updatedItems[location.itemIndex];
                        if (itemToUpdate) {
                            const canTake = Math.min(needed, itemToUpdate.quantity);
                            itemToUpdate.quantity -= canTake;
                            needed -= canTake;
                        }
                    }
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
                document: document || `SALIDA-${Date.now()}`,
                items: movementItems,
                createdAt: serverTimestamp(),
            });

            await batch.commit();
            toast({ title: 'Éxito', description: 'Salida general registrada y stock actualizado.' });
            setQuantitiesToDispatch({});
            setDocument('');

        } catch (error: any) {
            console.error("Error creating general fruit dispatch:", error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo registrar la salida.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'otherFruitMovements or otherFruitReceptions',
                operation: 'write'
            }));
        } finally {
            setIsDispatching(false);
        }
    };
    
    const loading = loadingClients || loadingReceptions;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Registrar Salida General</CardTitle>
                <CardDescription>Seleccione un cliente y las cantidades de productos a despachar. El sistema usará el stock más antiguo (FIFO).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                    <Select value={selectedClientId} onValueChange={setSelectedClientId} disabled={loading}>
                        <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                        <SelectContent>
                            {fruitClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input placeholder="Documento de Salida (Opcional)" value={document} onChange={(e) => setDocument(e.target.value)} disabled={!selectedClientId} />
                </div>

                {selectedClientId && (
                    <>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Disponible</TableHead><TableHead className="w-[150px]">A Despachar</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {loadingReceptions ? <TableRow><TableCell colSpan={3}><Skeleton className="h-8" /></TableCell></TableRow>
                                : aggregatedStock.length > 0 ? aggregatedStock.map(stock => (
                                    <TableRow key={stock.productCode}>
                                        <TableCell>{stock.productName} ({stock.productCode})</TableCell>
                                        <TableCell>{stock.totalQuantity} {stock.unit}</TableCell>
                                        <TableCell><Input type="number" placeholder="0" min="0" max={stock.totalQuantity} value={quantitiesToDispatch[stock.productCode] || ''} onChange={(e) => handleQuantityChange(stock.productCode, e.target.value)} /></TableCell>
                                    </TableRow>
                                ))
                                : <TableRow><TableCell colSpan={3} className="text-center h-24">No hay stock para este cliente.</TableCell></TableRow>
                                }
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleGeneralDispatch} disabled={isDispatching || Object.values(quantitiesToDispatch).every(q => q === 0)}>
                            {isDispatching ? "Despachando..." : "Confirmar Salida General"}
                        </Button>
                    </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

export function OtherFruitExitTab() {
  return (
    <div className="space-y-6">
        <GeneralExit />
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
                <AccordionTrigger>
                    <h3 className="text-lg font-medium">Salida por Lote de Cliente Específico</h3>
                </AccordionTrigger>
                <AccordionContent>
                    <SearchByLot />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </div>
  );
}
