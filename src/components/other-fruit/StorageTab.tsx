'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { chambersConfig } from '@/lib/chambers-config';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils';


// Helper for natural sorting
const naturalSort = (a: string, b: string) => {
    const re = /(\d+)/;
    const aNum = parseInt(a.split(re)[1] || '0', 10);
    const bNum = parseInt(b.split(re)[1] || '0', 10);
    const aLetter = a.split(re)[0];
    const bLetter = b.split(re)[0];
    if (aLetter < bLetter) return -1;
    if (aLetter > bLetter) return 1;
    return aNum - bNum;
};

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada de inicio.' }),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0"),
});
type StoreFormValues = z.infer<typeof storeSchema>;


interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

function StorageForm({ item, onCancel, allReceptions, allChamberLots }: { item: PendingItem, onCancel: () => void, allReceptions: OtherFruitReception[], allChamberLots: ChamberLot[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const form = useForm<StoreFormValues>({
        resolver: zodResolver(storeSchema),
        defaultValues: { 
            chamberId: undefined, 
            coordinate: undefined, 
            quantity: item.unit === 'Pallets' ? 1 : 6, 
        },
    });

    const targetChamberId = form.watch('chamberId');

    const { availableCoordinates, occupancyMap } = React.useMemo(() => {
        if (!targetChamberId) return { availableCoordinates: [], occupancyMap: new Map() };
        
        const chamberConfig = chambersConfig[targetChamberId];
        if (!chamberConfig) return { availableCoordinates: [], occupancyMap: new Map() };
        
        const allPossibleCoords = chamberConfig.columns.flatMap(col => chamberConfig.rows.map(row => `${col}${row}`)).sort(naturalSort);
        
        const currentOccupancyMap = new Map<string, { bins: number, pallets: number }>();

        const getCoord = (coord: string) => {
            if (!currentOccupancyMap.has(coord)) {
                currentOccupancyMap.set(coord, { bins: 0, pallets: 0 });
            }
            return currentOccupancyMap.get(coord)!;
        };

        allReceptions.forEach(reception => {
            if (reception.status !== 'Almacenado' && reception.status !== 'Parcialmente Almacenado') return;
            reception.items.forEach(storedItem => {
                if (storedItem.status === 'Almacenado' && storedItem.storageLocation?.chamberId === targetChamberId && storedItem.storageLocation.coordinate) {
                    const coordData = getCoord(storedItem.storageLocation.coordinate);
                    if (reception.unit === 'Bins') {
                        coordData.bins += storedItem.quantity;
                    } else {
                        coordData.pallets += storedItem.quantity;
                    }
                }
            });
        });

        allChamberLots.forEach(chamberLot => {
            if (chamberLot.status === 'Almacenado' && chamberLot.chamberId === targetChamberId && chamberLot.coordinate) {
                const coordData = getCoord(chamberLot.coordinate);
                coordData.bins += chamberLot.binCount;
            }
        });
        
        const available = allPossibleCoords.filter(coord => {
            const occupied = currentOccupancyMap.get(coord);
            if (!occupied) return true;
            if (item.unit === 'Bins') return occupied.pallets === 0;
            if (item.unit === 'Pallets') return occupied.bins === 0;
            return false;
        });
        
        return { 
            availableCoordinates: available, 
            occupancyMap: currentOccupancyMap,
        };
    }, [targetChamberId, allReceptions, allChamberLots, item.unit]);

    const handleStoreConfirm = async (values: StoreFormValues) => {
        if (!firestore) return;
        
        const quantityPerCoord = values.quantity;

        if (item.unit === 'Pallets') {
            if (quantityPerCoord !== 1 && quantityPerCoord !== 2) {
                form.setError('quantity', { message: `Para pallets, la cantidad debe ser 1 o 2.` });
                return;
            }
        } else { // Bins
             if (quantityPerCoord < 1 || quantityPerCoord > 6) {
                form.setError('quantity', { message: `Para bins, la cantidad debe ser entre 1 y 6.` });
                return;
            }
        }
        
        const maxCapacity = item.unit === 'Bins' ? 6 : 2;
        let pendingToStore = item.quantity;
        
        const startIndex = availableCoordinates.indexOf(values.coordinate);
        if (startIndex === -1) {
            toast({ variant: 'destructive', title: 'Error', description: 'La coordenada de inicio no está disponible.' });
            return;
        }

        const batch = writeBatch(firestore);
        const receptionDocRef = doc(firestore, 'otherFruitReceptions', item.receptionId);
        const originalReception = allReceptions.find(r => r.id === item.receptionId);
        if (!originalReception) return;
        const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
        const originalItemToUpdate = updatedItems[item.itemIndex] as OtherFruitReceptionItem;


        try {
            for (let i = startIndex; i < availableCoordinates.length && pendingToStore > 0; i++) {
                const currentCoord = availableCoordinates[i];
                const occupancy = occupancyMap.get(currentCoord) || { bins: 0, pallets: 0 };
                const currentStockInCoord = item.unit === 'Bins' ? occupancy.bins : occupancy.pallets;
                const spaceAvailable = maxCapacity - currentStockInCoord;

                if (spaceAvailable > 0) {
                    const amountToStoreInThisCoord = Math.min(pendingToStore, quantityPerCoord, spaceAvailable);
                    
                    if (amountToStoreInThisCoord > 0) {
                        // For pallets, if user wants to store 2 but only 1 fits, skip.
                        if (item.unit === 'Pallets' && quantityPerCoord === 2 && amountToStoreInThisCoord < 2) {
                            continue;
                        }

                        const newItem: OtherFruitReceptionItem = {
                            ...originalItemToUpdate,
                            quantity: amountToStoreInThisCoord,
                            status: 'Almacenado',
                            storageLocation: { chamberId: values.chamberId, coordinate: currentCoord },
                            storedAt: new Date(),
                        };
                        updatedItems.push(newItem);
                        pendingToStore -= amountToStoreInThisCoord;
                    }
                }
            }

            if (pendingToStore > 0) {
                 toast({ variant: 'destructive', title: 'Espacio Insuficiente', description: `Solo se pudieron almacenar ${item.quantity - pendingToStore} de ${item.quantity}. No hay suficientes coordenadas libres.` });
            }

            if (pendingToStore < item.quantity) { // If at least one item was stored
                originalItemToUpdate.quantity = pendingToStore; // Update remaining quantity on original item
                
                 if (pendingToStore === 0) {
                    // if all was stored, we can remove the original pending item
                     updatedItems.splice(item.itemIndex, 1);
                }
                
                const allItemsStored = updatedItems.every((i: OtherFruitReceptionItem) => i.status === 'Almacenado');
                const newStatus = pendingToStore === 0 && allItemsStored ? 'Almacenado' : 'Parcialmente Almacenado';

                batch.update(receptionDocRef, { 
                    items: updatedItems,
                    status: newStatus,
                    updatedAt: serverTimestamp() 
                });

                await batch.commit();
                toast({ title: 'Éxito', description: `${item.quantity - pendingToStore} ${item.unit} almacenados automáticamente.` });
                onCancel();
            } else {
                 toast({ variant: 'destructive', title: 'Sin espacio', description: 'No se pudo almacenar ningún item. Verifique la disponibilidad.' });
            }

        } catch(error) {
            console.error("Error storing fruit item automatically:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar el almacenamiento automático.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: receptionDocRef.path, operation: 'update' }));
        }
    };

    return (
        <TableRow>
            <TableCell colSpan={6} className="p-0">
                <div className="p-4 bg-muted/50">
                    <h4 className="font-semibold mb-4">Almacenamiento Automático: {item.quantity} {item.unit} de {item.productName}</h4>
                     <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleStoreConfirm)} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <FormField control={form.control} name="chamberId" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cámara</FormLabel>
                                        <Select onValueChange={(v) => { field.onChange(v); form.setValue('coordinate', '')}} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                                            <SelectContent>{Object.values(chambersConfig).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="coordinate" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Coordenada de Inicio</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!targetChamberId}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {availableCoordinates.length > 0 ? (
                                                    availableCoordinates.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                                                ) : (
                                                    <div className="p-2 text-xs text-center text-muted-foreground">No hay coordenadas disponibles para {item.unit}.</div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="quantity" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cantidad por Coordenada</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            {...field}
                                            inputMode="numeric"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
                                <Button type="submit">Confirmar Almacenamiento</Button>
                            </div>
                        </form>
                     </Form>
                </div>
            </TableCell>
        </TableRow>
    )
}


export function OtherFruitStorageTab() {
  const { data: otherFruitReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const [itemToStore, setItemToStore] = React.useState<PendingItem | null>(null);

  const loading = loadingReceptions || loadingChamberLots;

  const pendingItems = React.useMemo(() => {
    return (otherFruitReceptions || [])
        .filter(lot => lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado')
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: lot.unit }))
                .filter(item => item.status === 'Pendiente de almacenar')
        )
        .sort((a,b) => {
            const lotA = otherFruitReceptions.find(l => l.id === a.receptionId);
            const lotB = otherFruitReceptions.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt?.toMillis) return 1;
            if (!lotB?.createdAt?.toMillis) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });
  }, [otherFruitReceptions]);


  return (
    <Card>
    <CardHeader>
        <CardTitle>Productos Pendientes de Almacenar</CardTitle>
        <CardDescription>Productos de fruta que han sido recepcionados y esperan una ubicación en cámara.</CardDescription>
    </CardHeader>
    <CardContent>
        <div className="rounded-md border">
        <Table>
            <TableHeader>
            <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Cód. Prod</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cantidad Pendiente</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                ))
            ) : pendingItems.length > 0 ? (
                pendingItems.map((item) => (
                    <React.Fragment key={`${item.receptionId}-${item.itemIndex}`}>
                        <TableRow className={cn(itemToStore?.receptionId === item.receptionId && itemToStore?.itemIndex === item.itemIndex && "bg-muted/30")}>
                            <TableCell>{item.clientName}</TableCell>
                            <TableCell className="font-mono">{item.document}</TableCell>
                            <TableCell className="font-mono">{item.productCode}</TableCell>
                            <TableCell className="font-medium">{item.productName}</TableCell>
                            <TableCell className="font-semibold">{item.quantity} {item.unit}</TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" onClick={() => setItemToStore(item)} disabled={!!itemToStore}>Almacenar</Button>
                            </TableCell>
                        </TableRow>
                        {itemToStore?.receptionId === item.receptionId && itemToStore?.itemIndex === item.itemIndex && (
                            <StorageForm 
                                item={itemToStore} 
                                onCancel={() => setItemToStore(null)} 
                                allReceptions={otherFruitReceptions} 
                                allChamberLots={chamberLots || []}
                            />
                        )}
                   </React.Fragment>
                ))
            ) : (
                <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">No hay productos pendientes de almacenar.</TableCell>
                </TableRow>
            )}
            </TableBody>
        </Table>
        </div>
    </CardContent>
    </Card>
  );
}
