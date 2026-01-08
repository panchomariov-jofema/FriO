'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, PackagingReceptionItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { RelocatePackagingDialog } from './RelocatePackagingDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface StockEntry extends PackagingReceptionItem {
  receptionId: string;
  itemIndex: number;
}

interface AggregatedStock {
  total: number;
  pending: number;
  locations: Record<string, { totalPallets: number; entries: StockEntry[] }>;
}

export function StockTab() {
  const { data: allLots, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const [itemToRelocate, setItemToRelocate] = React.useState<StockEntry | null>(null);
  const [isRelocateDialogOpen, setRelocateDialogOpen] = React.useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();

  const stockByMaterial = React.useMemo(() => {
    const stock: Record<string, AggregatedStock> = {};

    allLots.forEach(lot => {
      lot.items.forEach((item, index) => {
        if (!stock[item.packagingMasterName]) {
          stock[item.packagingMasterName] = { total: 0, locations: {}, pending: 0 };
        }
        
        const currentMaterial = stock[item.packagingMasterName];
        currentMaterial.total += item.palletCount;

        const stockEntry: StockEntry = {
          ...item,
          receptionId: lot.id,
          itemIndex: index,
        };

        if (item.status === 'Almacenado' && item.storageLocation) {
          const locationKey = `${item.storageLocation.warehouse} / ${item.storageLocation.aisle}`;
          if (!currentMaterial.locations[locationKey]) {
            currentMaterial.locations[locationKey] = { totalPallets: 0, entries: [] };
          }
          currentMaterial.locations[locationKey].totalPallets += item.palletCount;
          currentMaterial.locations[locationKey].entries.push(stockEntry);
        } else if (item.status === 'Pendiente de almacenar') {
          currentMaterial.pending += item.palletCount;
        }
      });
    });
      
    return Object.entries(stock).sort((a,b) => a[0].localeCompare(b[0]));
  }, [allLots]);

  const handleRelocateClick = (entry: StockEntry) => {
    setItemToRelocate(entry);
    setRelocateDialogOpen(true);
  };

  const handleRelocateConfirm = async (newLocation: { warehouse: string; aisle: string; }) => {
    if (!itemToRelocate || !firestore) return;

    const originalReception = allLots.find(lot => lot.id === itemToRelocate.receptionId);
    if (!originalReception) return;

    const updatedItems = [...originalReception.items];
    updatedItems[itemToRelocate.itemIndex] = {
      ...updatedItems[itemToRelocate.itemIndex],
      storageLocation: newLocation,
      storedAt: serverTimestamp(),
    };
    
    try {
      const receptionDocRef = doc(firestore, 'packagingReceptions', itemToRelocate.receptionId);
      await updateDoc(receptionDocRef, { items: updatedItems });
      toast({ title: 'Éxito', description: 'Ubicación actualizada correctamente.' });
      setRelocateDialogOpen(false);
    } catch(e) {
      console.error("Error relocating item: ", e);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la ubicación.' });
    }
  };
  
  const handleDeleteClick = async (entry: StockEntry) => {
    if (!firestore) return;
    
    const originalReception = allLots.find(lot => lot.id === entry.receptionId);
    if (!originalReception) return;

    const updatedItems = [...originalReception.items];
    const itemToUpdate = updatedItems[entry.itemIndex];
    
    delete itemToUpdate.storageLocation;
    delete itemToUpdate.storedAt;
    itemToUpdate.status = 'Pendiente de almacenar';

    const allItemsPending = updatedItems.every(item => item.status === 'Pendiente de almacenar');
    const newStatus = allItemsPending ? 'Pendiente de almacenar' : 'Parcialmente Almacenado';

    try {
      const receptionDocRef = doc(firestore, 'packagingReceptions', entry.receptionId);
      await updateDoc(receptionDocRef, { items: updatedItems, status: newStatus });
      toast({ title: 'Éxito', description: 'El ítem fue devuelto a "Pendientes de Almacenar".' });
    } catch (error) {
      console.error("Error deleting stock entry: ", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo revertir el almacenamiento.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `packagingReceptions/${entry.receptionId}`,
        operation: 'update'
      }));
    }
  };


  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Stock de Embalajes en Bodega</CardTitle>
        <CardDescription>Resumen del total de pallets por material, incluyendo stock físico y pendientes de almacenar.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : stockByMaterial.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {stockByMaterial.map(([materialName, data]) => (
              <AccordionItem value={materialName} key={materialName}>
                <AccordionTrigger>
                  <div className="flex w-full items-center justify-between pr-4">
                    <span className="text-base font-semibold">{materialName}</span>
                    <span className="font-mono font-bold text-lg">{data.total} Pallets</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-2 bg-muted/50 rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ubicación</TableHead>
                          <TableHead>Cant. Pallets</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.pending > 0 && (
                            <TableRow>
                                <TableCell className="font-semibold text-secondary-foreground">Pendiente de Almacenar</TableCell>
                                <TableCell className="font-semibold">{data.pending}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        )}
                        {Object.entries(data.locations).sort().map(([location, locData]) => (
                          locData.entries.map((entry, index) => (
                            <TableRow key={`${entry.receptionId}-${entry.itemIndex}`}>
                                {index === 0 && <TableCell rowSpan={locData.entries.length} className="align-top">{location}</TableCell>}
                                <TableCell>{entry.palletCount}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRelocateClick(entry)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Esta acción no borra el registro, sino que lo devuelve a la pestaña "Pendientes de Almacenar". 
                                                    ¿Desea continuar?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDeleteClick(entry)} className="bg-destructive hover:bg-destructive/90">
                                                    Sí, Devolver
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                          ))
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
            <p className="text-muted-foreground">No hay stock registrado.</p>
          </div>
        )}
      </CardContent>
    </Card>
    
    <RelocatePackagingDialog
        item={itemToRelocate}
        open={isRelocateDialogOpen}
        onOpenChange={setRelocateDialogOpen}
        onConfirm={handleRelocateConfirm}
    />
    </>
  );
}
