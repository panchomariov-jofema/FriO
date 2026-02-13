'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, PackagingReception, PackagingMaster, PackagingMovementItem } from '@/lib/types';
import { packagingExitSchema } from '@/lib/schemas';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;

interface FlatStockItem {
    key: string;
    receptionId: string;
    itemIndex: number;
    code: string;
    name: string;
    lote: string;
    location: string;
    available: number;
}

export function ExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = React.useState<string>('');
  const [document, setDocument] = React.useState('');
  const [dispatchQuantities, setDispatchQuantities] = React.useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const packagingClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toLowerCase() === 'embalaje' && c.status !== 'inactivo');
  }, [allClients]);

  const flatStock = React.useMemo<FlatStockItem[]>(() => {
    if (!selectedClientId || !allReceptions) return [];
    return allReceptions
        .filter(r => r.clientId === selectedClientId)
        .flatMap(reception =>
            reception.items.map((item, index) => ({ item, index, reception }))
        )
        .filter(({ item }) => item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation)
        .map(({ item, index, reception }) => ({
            key: getLocationKey(reception.id, index),
            receptionId: reception.id,
            itemIndex: index,
            code: item.packagingMasterCode,
            name: item.packagingMasterName,
            lote: item.lote || '-',
            location: `${item.storageLocation!.warehouse} / ${item.storageLocation!.aisle}`,
            available: item.palletCount
        }));
  }, [selectedClientId, allReceptions]);

  const handleQuantityChange = (key: string, available: number, value: string) => {
    const numValue = parseInt(value, 10);
    if (value === '' || (numValue >= 0 && !isNaN(numValue))) {
        if (numValue > available) {
            toast({
                title: "Cantidad inválida",
                description: `La cantidad no puede superar los ${available} pallets disponibles.`,
                variant: "destructive",
            });
            setDispatchQuantities(prev => ({ ...prev, [key]: available }));
        } else {
            setDispatchQuantities(prev => ({ ...prev, [key]: numValue || 0 }));
        }
    }
  };

  const onSubmit = async () => {
    setIsSubmitting(true);
    const itemsToDispatch = Object.entries(dispatchQuantities).filter(([, qty]) => qty > 0);
    
    if (itemsToDispatch.length === 0) {
        toast({ variant: 'destructive', title: 'Sin ítems', description: 'Debe ingresar una cantidad para al menos una ubicación.' });
        setIsSubmitting(false);
        return;
    }
    
    const itemsByCode = new Map<string, PackagingMovementItem>();

    for (const [locationKey, quantity] of itemsToDispatch) {
        if (quantity <= 0) continue;
        
        const stockItem = flatStock.find(s => s.key === locationKey);
        if (!stockItem) continue;

        if (!itemsByCode.has(stockItem.code)) {
            itemsByCode.set(stockItem.code, {
                packagingMasterId: allPackagingMasters?.find(m => m.code === stockItem.code)?.id || '',
                packagingMasterCode: stockItem.code,
                packagingMasterName: stockItem.name,
                palletCount: 0,
                locations: [],
            });
        }
        
        const movementItem = itemsByCode.get(stockItem.code)!;
        movementItem.palletCount += quantity;
        movementItem.locations!.push({
            locationKey: stockItem.key,
            receptionId: stockItem.receptionId,
            itemIndex: stockItem.itemIndex,
            palletsToWithdraw: quantity,
            locationString: stockItem.location,
            available: stockItem.available,
        });
    }

    const newMovementItems = Array.from(itemsByCode.values());

    try {
        const movementData = {
            type: 'salida' as const,
            clientId: selectedClientId,
            document: document || '',
            items: newMovementItems,
            status: 'Pendiente de Picking' as const,
            createdAt: serverTimestamp(),
        };

        await addDoc(collection(firestore, 'packagingMovements'), movementData);
        
        toast({ title: 'Solicitud Creada', description: 'La solicitud de salida ha sido creada y está pendiente de picking.' });
        setDispatchQuantities({});
        setDocument('');

    } catch (error) {
        console.error("Error creating packaging exit request:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la solicitud de salida.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingMovements',
            operation: 'create'
        }));
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleClientChange = (value: string) => {
    setSelectedClientId(value);
    setDispatchQuantities({});
    setDocument('');
  };

  const totalSelectedPallets = React.useMemo(() => {
    return Object.values(dispatchQuantities).reduce((sum, qty) => sum + (qty || 0), 0);
  }, [dispatchQuantities]);

  const isLoading = loadingClients || loadingMasters || loadingReceptions;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Crear Solicitud de Despacho</CardTitle>
          <CardDescription>Seleccione un cliente y luego elija el stock específico a despachar desde las ubicaciones disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <FormItem>
              <FormLabel>Cliente de Embalaje</FormLabel>
              <Select onValueChange={handleClientChange} value={selectedClientId} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                <SelectContent>{packagingClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormItem>
            <FormItem>
              <FormLabel>Documento de Salida (Opcional)</FormLabel>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} autoComplete="off" />
            </FormItem>
          </div>
        </CardContent>
      </Card>
      
      {selectedClientId && (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Pre-Orden de Picking</CardTitle>
                <CardDescription>Seleccione los pallets a despachar desde las ubicaciones de stock disponibles.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border max-h-[50vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Artículo</TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead>Lote</TableHead>
                                <TableHead>Ubicación</TableHead>
                                <TableHead>Disponible</TableHead>
                                <TableHead className="w-40">A Despachar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : flatStock.length > 0 ? (
                                flatStock.map(stockItem => (
                                    <TableRow key={stockItem.key}>
                                        <TableCell>{stockItem.name}</TableCell>
                                        <TableCell className="font-mono">{stockItem.code}</TableCell>
                                        <TableCell>{stockItem.lote}</TableCell>
                                        <TableCell>{stockItem.location}</TableCell>
                                        <TableCell>{stockItem.available}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                min="0"
                                                max={stockItem.available}
                                                value={dispatchQuantities[stockItem.key] || ''}
                                                onChange={e => handleQuantityChange(stockItem.key, stockItem.available, e.target.value)}
                                                placeholder="0"
                                                className="h-8"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">No hay stock disponible para este cliente.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex justify-between items-center mt-4">
                    <div className="font-semibold">
                        Total a Despachar: {totalSelectedPallets} pallets
                    </div>
                    <Button onClick={onSubmit} disabled={isSubmitting || totalSelectedPallets === 0}>
                        {isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Despacho'}
                    </Button>
                </div>
            </CardContent>
        </Card>
      )}
    </>
  );
}
