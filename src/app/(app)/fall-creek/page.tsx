'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitMovement } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { chambersConfig } from '@/lib/chambers-config';

const FALL_CREEK_CLIENT_NAME = 'FALL CREEK';

const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;

export default function FallCreekPage() {
    const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
    const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: allMovements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    const { toast } = useToast();
    const firestore = useFirestore();

    const [quantitiesToDispatch, setQuantitiesToDispatch] = React.useState<Record<string, number>>({});
    const [documentoDespacho, setDocumentoDespacho] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [lotFilter, setLotFilter] = React.useState('');
    const [productFilter, setProductFilter] = React.useState('');

    const fallCreekClient = React.useMemo(() => {
        if (!allClients) return null;
        return allClients.find(c => c.name.toUpperCase() === FALL_CREEK_CLIENT_NAME) || null;
    }, [allClients]);

    const availableStock = React.useMemo(() => {
        if (!fallCreekClient || !allReceptions) return [];

        return allReceptions
            .filter(r => r.clientId === fallCreekClient.clientId)
            .flatMap(reception =>
                reception.items.map((item, index) => ({
                    ...item,
                    receptionId: reception.id,
                    itemIndex: index,
                    unit: reception.unit,
                    id: getLocationKey(reception.id, index),
                    chamberName: item.storageLocation ? chambersConfig[item.storageLocation.chamberId]?.name : 'N/A',
                }))
            )
            .filter(item => item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate);
    }, [fallCreekClient, allReceptions]);

    const filteredStock = React.useMemo(() => {
        return availableStock.filter(item => {
            const lotMatch = lotFilter ? (item.clientLotId || '').toLowerCase().includes(lotFilter.toLowerCase()) : true;
            const productMatch = productFilter ? item.productName.toLowerCase().includes(productFilter.toLowerCase()) : true;
            return lotMatch && productMatch;
        });
    }, [availableStock, lotFilter, productFilter]);

    const handleQuantityChange = (key: string, available: number, newQuantityStr: string) => {
        const newQuantity = parseInt(newQuantityStr, 10);
        if (isNaN(newQuantity) || newQuantity <= 0) {
            setQuantitiesToDispatch(prev => {
                const newState = { ...prev };
                delete newState[key];
                return newState;
            });
            return;
        }

        if (newQuantity > available) {
            toast({
                title: 'Cantidad excede el stock',
                description: `Solo hay ${available} disponibles en esta ubicación.`,
                variant: 'destructive'
            });
            setQuantitiesToDispatch(prev => ({ ...prev, [key]: available }));
            return;
        }

        setQuantitiesToDispatch(prev => ({ ...prev, [key]: newQuantity, }));
    };

    const handleCreatePreDispatch = async () => {
        const itemsToDispatch = Object.entries(quantitiesToDispatch).filter(([, qty]) => qty > 0);
        if (itemsToDispatch.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar una cantidad para al menos un ítem.' });
            return;
        }
        if (!documentoDespacho.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar un documento de despacho.' });
            return;
        }
        if (!firestore || !fallCreekClient) return;

        setIsSubmitting(true);
        try {
            const batch = writeBatch(firestore);
            const movementItems: OtherFruitMovement['items'] = [];
            const receptionUpdates: Record<string, { items: OtherFruitReception['items'] }> = {};

            for (const [key, quantity] of itemsToDispatch) {
                const stockItem = availableStock.find(item => item.id === key);
                if (!stockItem) continue;

                if (!receptionUpdates[stockItem.receptionId]) {
                    const originalReception = allReceptions.find(r => r.id === stockItem.receptionId);
                    if (originalReception) {
                        receptionUpdates[stockItem.receptionId] = { items: JSON.parse(JSON.stringify(originalReception.items)) };
                    }
                }

                if (receptionUpdates[stockItem.receptionId]) {
                    const itemToUpdate = receptionUpdates[stockItem.receptionId].items[stockItem.itemIndex];
                    if(itemToUpdate && itemToUpdate.quantity >= quantity) {
                        itemToUpdate.quantity -= quantity; // Reduce stock

                        movementItems.push({
                            productCode: itemToUpdate.productCode,
                            productName: itemToUpdate.productName,
                            quantity: quantity,
                            weight: itemToUpdate.weight ? (itemToUpdate.weight / itemToUpdate.quantity) * quantity : undefined, // prorate weight
                            clientLotId: itemToUpdate.clientLotId,
                        });
                    }
                }
            }

            Object.entries(receptionUpdates).forEach(([receptionId, { items }]) => {
                const allItemsProcessed = items.every(i => i.status === 'Almacenado' && i.quantity === 0) || items.length === 0;
                const newStatus = allItemsProcessed ? 'Almacenado' : 'Parcialmente Almacenado';

                batch.update(doc(firestore, 'otherFruitReceptions', receptionId), {
                    items: items.filter(i => i.quantity > 0),
                    status: newStatus,
                    updatedAt: serverTimestamp()
                });
            });

            const movementData: Partial<OtherFruitMovement> = {
                type: 'salida',
                clientId: fallCreekClient.clientId,
                clientName: fallCreekClient.name,
                unit: fallCreekClient.unit,
                document: documentoDespacho,
                items: movementItems,
                createdAt: serverTimestamp(),
            };

            const newMovementRef = doc(collection(firestore, 'otherFruitMovements'));
            batch.set(newMovementRef, movementData);

            await batch.commit();

            toast({ title: 'Éxito', description: 'Solicitud de Pre-Despacho creada correctamente.' });
            setQuantitiesToDispatch({});
            setDocumentoDespacho('');
            setLotFilter('');
            setProductFilter('');

        } catch (e) {
            console.error("Error creating pre-dispatch", e);
            toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al crear la solicitud.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'otherFruitMovements', operation: 'create' }));
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const { totalSelectedQuantity, selectedUnit } = React.useMemo(() => {
        let total = 0;
        let unit: 'Bins' | 'Pallets' = 'Pallets';
        const itemsToDispatch = Object.entries(quantitiesToDispatch).filter(([, qty]) => qty > 0);
        
        if (itemsToDispatch.length > 0) {
            const firstKey = itemsToDispatch[0][0];
            const firstItem = availableStock.find(i => i.id === firstKey);
            if (firstItem) {
                unit = firstItem.unit;
            }
        }

        for (const [key, quantity] of itemsToDispatch) {
            const stockItem = availableStock.find(item => item.id === key);
            if(stockItem && stockItem.unit === unit) {
                 total += quantity;
            }
        }
        return { totalSelectedQuantity: total, selectedUnit: unit };
    }, [quantitiesToDispatch, availableStock]);

    const fallCreekMovements = React.useMemo(() => {
        if (!fallCreekClient || !allMovements) return [];
        return allMovements
            .filter(m => m.clientId === fallCreekClient.clientId && m.type === 'salida')
            .sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    }, [fallCreekClient, allMovements]);
    
    const loading = loadingClients || loadingReceptions || loadingMovements;

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
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Portal Cliente: {fallCreekClient.name}</CardTitle>
                    <CardDescription>Seleccione stock de sus ubicaciones para generar una solicitud de pre-despacho.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="lot-filter">Filtrar por Lote Cliente</Label>
                            <Input id="lot-filter" value={lotFilter} onChange={e => setLotFilter(e.target.value)} placeholder="Escriba un lote..." />
                        </div>
                        <div>
                            <Label htmlFor="product-filter">Filtrar por Producto</Label>
                            <Input id="product-filter" value={productFilter} onChange={e => setProductFilter(e.target.value)} placeholder="Escriba un producto..." />
                        </div>
                    </div>
                    <div className="rounded-md border max-h-96 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Lote Cliente</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Cant. Disp.</TableHead>
                                    <TableHead className="w-40">A Despachar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredStock.length > 0 ? filteredStock.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-mono">{item.clientLotId || '-'}</TableCell>
                                        <TableCell className="font-medium">{item.productName}</TableCell>
                                        <TableCell>{item.chamberName} / {item.storageLocation?.coordinate}</TableCell>
                                        <TableCell>{item.quantity} {item.unit}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                placeholder="0"
                                                min={0}
                                                max={item.quantity}
                                                value={quantitiesToDispatch[item.id] || ''}
                                                onChange={(e) => handleQuantityChange(item.id, item.quantity, e.target.value)}
                                                className="h-8"
                                            />
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">No se encontró stock con los filtros actuales.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                     {Object.keys(quantitiesToDispatch).length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-4 items-end pt-4">
                            <div className="flex-1">
                                <Label htmlFor="dispatch-doc">Documento de Despacho (Ej: Orden de Compra)</Label>
                                <Input id="dispatch-doc" value={documentoDespacho} onChange={e => setDocumentoDespacho(e.target.value)} placeholder="Ingrese un documento..." />
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="font-bold text-lg">{totalSelectedQuantity}</p>
                                    <p className="text-sm text-muted-foreground -mt-1">{selectedUnit}</p>
                                </div>
                                <Button onClick={handleCreatePreDispatch} disabled={isSubmitting} className="w-full sm:w-auto">
                                    {isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Pre-Despacho'}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Historial de Solicitudes</CardTitle></CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Documento</TableHead><TableHead>Items</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {fallCreekMovements.length > 0 ? fallCreekMovements.map(mov => (
                                <TableRow key={mov.id}>
                                    <TableCell>{mov.createdAt.toDate().toLocaleString()}</TableCell>
                                    <TableCell>{mov.document}</TableCell>
                                    <TableCell>{mov.items.map(i => `${i.quantity} ${mov.unit} de ${i.productName}`).join(', ')}</TableCell>
                                    <TableCell><Badge>Enviado</Badge></TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay solicitudes de despacho.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
