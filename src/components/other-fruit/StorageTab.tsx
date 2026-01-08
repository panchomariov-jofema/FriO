'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
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
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada.' }),
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

function StorageForm({ item, onCancel, allReceptions }: { item: PendingItem, onCancel: () => void, allReceptions: OtherFruitReception[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const form = useForm<StoreFormValues>({
        resolver: zodResolver(storeSchema),
        defaultValues: { chamberId: undefined, coordinate: undefined, quantity: item.quantity },
    });

    const targetChamberId = form.watch('chamberId');
    const targetCoordinate = form.watch('coordinate');

    const { availableCoordinates, occupancyMessage } = React.useMemo(() => {
        if (!targetChamberId) return { availableCoordinates: [], occupancyMessage: '' };
        
        const chamberConfig = chambersConfig[targetChamberId];
        if (!chamberConfig) return { availableCoordinates: [], occupancyMessage: '' };
        
        const allPossibleCoords = chamberConfig.columns.flatMap(col => chamberConfig.rows.map(row => `${col}${row}`));

        const occupiedCoords = new Map<string, { bins: number, pallets: number }>();
        allReceptions.forEach(reception => {
            reception.items.forEach(item => {
                if (item.status === 'Almacenado' && item.storageLocation?.chamberId === targetChamberId && item.storageLocation?.coordinate) {
                    const coord = item.storageLocation.coordinate;
                    if (!occupiedCoords.has(coord)) {
                        occupiedCoords.set(coord, { bins: 0, pallets: 0 });
                    }
                    const current = occupiedCoords.get(coord)!;
                    if (reception.unit === 'Bins') {
                        current.bins += item.quantity;
                    } else {
                        current.pallets += item.quantity;
                    }
                }
            });
        });

        const available = allPossibleCoords.filter(coord => {
            const occupied = occupiedCoords.get(coord);
            if (!occupied) return true; // Completely empty
            if (occupied.bins >= 6) return false; // Full of bins
            if (occupied.pallets >= 2) return false; // Full of pallets
            return true;
        }).sort(naturalSort);

        const currentOccupancy = occupiedCoords.get(targetCoordinate);
        let message = '';
        if (targetCoordinate && currentOccupancy) {
            const parts = [];
            if(currentOccupancy.bins > 0) parts.push(`${currentOccupancy.bins} Bins`);
            if(currentOccupancy.pallets > 0) parts.push(`${currentOccupancy.pallets} Pallets`);
            message = `Ocupación actual: ${parts.join(', ')}.`;
        }

        return { availableCoordinates: available, occupancyMessage: message };
    }, [targetChamberId, targetCoordinate, allReceptions]);

    const handleStoreConfirm = async (values: StoreFormValues) => {
        if (!firestore) return;

        // Validation
        if(values.quantity > item.quantity) {
            form.setError('quantity', { message: `No puede exceder la cantidad pendiente (${item.quantity}).` });
            return;
        }

        const maxCapacity = item.unit === 'Bins' ? 6 : 2;
        const receptionDoc = allReceptions.find(r => r.id === item.receptionId);
        const alreadyInCoordinate = (receptionDoc?.items || [])
            .filter(i => i.status === 'Almacenado' && i.storageLocation?.chamberId === values.chamberId && i.storageLocation.coordinate === values.coordinate)
            .reduce((sum, i) => sum + i.quantity, 0);
        
        if (alreadyInCoordinate + values.quantity > maxCapacity) {
             form.setError('quantity', { message: `Capacidad excedida. Disponible: ${maxCapacity - alreadyInCoordinate}.` });
             return;
        }
        
        // Logic
        try {
            const receptionDocRef = doc(firestore, 'otherFruitReceptions', item.receptionId);
            const originalReception = allReceptions.find(r => r.id === item.receptionId);
            if (!originalReception) return;

            const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
            const itemToUpdate = updatedItems[item.itemIndex] as OtherFruitReceptionItem;

            const remainingQuantity = itemToUpdate.quantity - values.quantity;

            if (remainingQuantity > 0) {
                // Split the item
                itemToUpdate.quantity = remainingQuantity; // The original item now has the remaining quantity
                
                const newItem: OtherFruitReceptionItem = {
                    ...itemToUpdate,
                    quantity: values.quantity,
                    status: 'Almacenado',
                    storageLocation: { chamberId: values.chamberId, coordinate: values.coordinate },
                    storedAt: new Date(),
                };
                updatedItems.push(newItem);
            } else {
                // Update the whole item
                itemToUpdate.status = 'Almacenado';
                itemToUpdate.storageLocation = { chamberId: values.chamberId, coordinate: values.coordinate };
                itemToUpdate.storedAt = new Date();
            }
            
            const allItemsStored = updatedItems.every((i: OtherFruitReceptionItem) => i.status === 'Almacenado');
            const newStatus = allItemsStored ? 'Almacenado' : 'Parcialmente Almacenado';

            const updateData = {
                items: updatedItems,
                status: newStatus,
                updatedAt: serverTimestamp(),
            };
            
            await updateDoc(receptionDocRef, updateData);
            toast({ title: 'Éxito', description: `${values.quantity} ${item.unit} almacenados.` });
            onCancel();

        } catch(error) {
            console.error("Error storing fruit item:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
            const receptionDocRef = doc(firestore, 'otherFruitReceptions', item.receptionId);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: receptionDocRef.path,
                operation: 'update'
            }));
        }
    };

    return (
        <TableRow>
            <TableCell colSpan={6} className="p-0">
                <div className="p-4 bg-muted/50">
                    <h4 className="font-semibold mb-4">Almacenar: {item.quantity} {item.unit} de {item.productName}</h4>
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
                                        <FormLabel>Coordenada</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!targetChamberId}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {availableCoordinates.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">{occupancyMessage}</p>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="quantity" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cantidad a Almacenar</FormLabel>
                                        <FormControl><Input type="number" {...field} max={item.quantity} /></FormControl>
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
  const { data, loading } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const [itemToStore, setItemToStore] = React.useState<PendingItem | null>(null);

  const pendingItems = React.useMemo(() => {
    return (data || [])
        .filter(lot => lot.status === 'Pendiente de almacenar' || lot.status === 'Parcialmente Almacenado')
        .flatMap((lot) => 
            lot.items
                .map((item, itemIndex) => ({ ...item, receptionId: lot.id, clientName: lot.clientName, document: lot.document, itemIndex, unit: lot.unit }))
                .filter(item => item.status === 'Pendiente de almacenar')
        )
        .sort((a,b) => {
            const lotA = data.find(l => l.id === a.receptionId);
            const lotB = data.find(l => l.id === b.receptionId);
            if (!lotA?.createdAt) return 1;
            if (!lotB?.createdAt) return -1;
            return lotA.createdAt.toMillis() - lotB.createdAt.toMillis();
        });
  }, [data]);


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
                            <StorageForm item={itemToStore} onCancel={() => setItemToStore(null)} allReceptions={data} />
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
