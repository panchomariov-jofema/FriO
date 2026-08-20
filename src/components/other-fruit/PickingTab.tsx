'use client';

import * as React from 'react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception, OtherClient, OtherFruitMovementLocation, PackagingMovement, PackagingReception, Dispatch, ChamberLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, collection, writeBatch, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { OtherFruitPickingDialog } from './OtherFruitPickingDialog';
import { PackagingPickingDialog } from '../packaging/PackagingPickingDialog';
import { packagingExitSchema } from '@/lib/schemas';
import { z } from 'zod';
import { DispatchPickingDialog } from '../dispatch/DispatchPickingDialog';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { FileText, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

type ConsolidatedMovement = (OtherFruitMovement & { taskType: 'fruit' }) | (PackagingMovement & { taskType: 'packaging' }) | (Dispatch & { taskType: 'producerFruit' });

export function OtherFruitPickingTab() {
  const { data: otherFruitMovements, loading: loadingFruitMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
  const { data: packagingMovements, loading: loadingPackagingMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');
  const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
  const { data: allChamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: packagingReceptions, loading: loadingPackagingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: otherFruitReceptions, loading: loadingOtherFruitReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [pickingMovement, setPickingMovement] = React.useState<ConsolidatedMovement | null>(null);
  const [deleteMovement, setDeleteMovement] = React.useState<ConsolidatedMovement | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const pendingMovements = React.useMemo((): ConsolidatedMovement[] => {
    const fruitTasks: ConsolidatedMovement[] = (otherFruitMovements || [])
      .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking')
      .map(m => ({ ...m, taskType: 'fruit' }));

    const packagingTasks: ConsolidatedMovement[] = (packagingMovements || [])
      .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking')
      .map(m => ({ ...m, taskType: 'packaging' }));
      
    const producerFruitTasks: ConsolidatedMovement[] = (dispatches || [])
      .filter(d => d.status === 'Pendiente de Picking')
      .map(d => ({ ...d, taskType: 'producerFruit' }));

    return [...fruitTasks, ...packagingTasks, ...producerFruitTasks]
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [otherFruitMovements, packagingMovements, dispatches]);

  const clientMap = React.useMemo(() => {
    return (allClients || []).reduce((acc, client) => {
        acc[client.clientId] = client.name;
        return acc;
    }, {} as Record<string,string>)
  }, [allClients]);
  
  const handleStartPicking = (movement: ConsolidatedMovement) => {
    setPickingMovement(movement);
  };
  
  const handleGeneratePdfForPackaging = (mov: PackagingMovement) => {
    const clientName = clientMap[mov.clientId] || mov.clientId;
    const totalPallets = mov.items.reduce((sum, item) => sum + item.palletCount, 0);
    const flatItems = mov.items.flatMap(item => 
        (item.locations || []).map(loc => ({
            ...loc,
            itemCode: item.packagingMasterCode,
            itemName: item.packagingMasterName,
            compositeKey: `${item.packagingMasterCode}_${loc.locationKey}`
        }))
    ).filter(item => item.palletsToWithdraw > 0);

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Picking de Salida de Embalaje: ${clientName}`, 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Confirme la recolección física de cada artículo y ubicación.`, 14, 30);

    const tableData = flatItems.map(item => [
      item.itemName,
      item.itemCode,
      item.locationString,
      item.palletsToWithdraw,
    ]);
    
    const tableHeaders = [['Artículo', 'Código', 'Ubicación', 'Pallets a Retirar']];

    (doc as any).autoTable({
      startY: 35,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] },
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.text(`Total a Retirar: ${totalPallets} pallets`, 14, finalY + 10);
    
  };

  const handleGeneratePdfForFruit = (mov: OtherFruitMovement) => {
    // Find all stored bins matching this dispatch's coordinates
    const locCoords = new Set((mov.locations || []).map(l => `${l.location.chamberId}_${l.location.coordinate}`));
    const matchedStoredBins = (otherFruitReceptions || []).flatMap(r => 
        (r.items || []).map((item, idx) => ({ ...item, receptionId: r.id, itemIndex: idx }))
    ).filter(item => 
        item.status === 'Almacenado' && 
        item.storageLocation && 
        locCoords.has(`${item.storageLocation.chamberId}_${item.storageLocation.coordinate}`)
    );

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Picking de Despacho de Fruta: ${mov.clientName}`, 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Confirme la recolección física y verifique los códigos QR indicados.`, 14, 30);
    
    const tableData = (mov.locations || []).map(loc => {
      // Find QRs in this coordinate
      const validBinsInThisLoc = matchedStoredBins.filter(b => 
        b.productCode === loc.productCode && 
        b.storageLocation?.chamberId === loc.location.chamberId && 
        b.storageLocation?.coordinate === loc.location.coordinate
      );
      
      const qrsString = validBinsInThisLoc.map(b => `${b.containerId} (${b.palletId || 'Suelto'})`).join('\n') || 'N/A';
      
      return [
        loc.productName,
        loc.clientLotId || 'N/A',
        `${loc.location.chamberId} / ${loc.location.coordinate}`,
        loc.quantity,
        qrsString
      ];
    });
    
    const tableHeaders = [['Producto', 'Lote Cliente', 'Ubicación', 'Cantidad a Retirar', 'Códigos QR / Bins en Ubicación']];

    (doc as any).autoTable({
      startY: 35,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] },
      columnStyles: {
        4: { fontStyle: 'bold', textColor: [22, 163, 74] } // style for QR codes column
      }
    });
    
    const totalBins = (mov.locations || []).reduce((sum, item) => sum + item.quantity, 0);
    const finalY = (doc as any).lastAutoTable.finalY;
    
    doc.setFontSize(12);
    doc.text(`Total a Retirar: ${totalBins} bins`, 14, finalY + 10);
    
    doc.output('dataurlnewwindow');
  };

  const handleConfirmFruitExit = async (confirmedMovement: OtherFruitMovement) => {
    if (!firestore || !confirmedMovement) return;
    setIsConfirming(true);

    try {
        const batch = writeBatch(firestore);
        
        const movementRef = doc(firestore, 'otherFruitMovements', confirmedMovement.id);
        batch.update(movementRef, { 
            status: 'Completado',
            items: confirmedMovement.items,
        });

        const receptionUpdates = new Map<string, { ref: any, items: any[] }>();
        (confirmedMovement.locations || []).forEach(loc => {
            if (!receptionUpdates.has(loc.receptionId)) {
                const receptionDoc = otherFruitReceptions.find(r => r.id === loc.receptionId);
                if (receptionDoc) {
                    receptionUpdates.set(loc.receptionId, {
                        ref: doc(firestore, 'otherFruitReceptions', loc.receptionId),
                        items: JSON.parse(JSON.stringify(receptionDoc.items || []))
                    });
                }
            }
            
            const update = receptionUpdates.get(loc.receptionId);
            if (update) {
                const itemToUpdate = update.items[loc.itemIndex];
                if (itemToUpdate && itemToUpdate.quantity >= loc.quantity) {
                    itemToUpdate.quantity -= loc.quantity;
                    if (itemToUpdate.quantity === 0) itemToUpdate.status = 'Despachado';
                }
            }
        });

        receptionUpdates.forEach(update => {
            batch.update(update.ref, { items: update.items, updatedAt: serverTimestamp() });
        });

        const isFallCreek = confirmedMovement.clientName?.toUpperCase() === 'FALL CREEK' || confirmedMovement.clientId === '76361536-7';
        if (isFallCreek && confirmedMovement.destinationClientId) {
            const totalBins = confirmedMovement.items.reduce((sum, item) => sum + item.quantity, 0);
            if (totalBins > 0) {
                const binMovementRef = doc(collection(firestore, 'binMaterialMovements'));
                const binMovementData = {
                    type: 'salida',
                    document: confirmedMovement.document || '',
                    driverName: '',
                    driverRUT: '',
                    patente_vehiculo: '',
                    exporterId: 'EXP005',
                    producerId: confirmedMovement.destinationClientId,
                    items: [
                        {
                            binMaterialId: 'C6hVKlGF375OxDvoe9l7',
                            binMaterialCode: '10017',
                            binMaterialName: 'BINS_PALOGIX',
                            quantity: totalBins
                        }
                    ],
                    observation: `Despacho automático desde Fall Creek (Confirmación de Picking)`,
                    createdAt: serverTimestamp()
                };
                batch.set(binMovementRef, binMovementData);
            }
        }
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de fruta confirmada y stock actualizado.' });
        setPickingMovement(null);

    } catch (error) {
        console.error("Error confirming fruit exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la salida.' });
    } finally {
        setIsConfirming(false);
    }
  };

  const handleConfirmPackagingExit = async (confirmedMovement: PackagingMovement) => {
    if (!firestore || !pickingMovement) return;
    setIsConfirming(true);
    
    try {
        const batch = writeBatch(firestore);
        const movementRef = doc(firestore, 'packagingMovements', pickingMovement.id);
        batch.update(movementRef, { status: 'Completado' });
        
        for(const item of confirmedMovement.items) {
            if (item.locations) {
              for(const loc of item.locations) {
                if (loc.palletsToWithdraw > 0) {
                    const receptionDoc = packagingReceptions.find(r => r.id === loc.receptionId);
                    if (receptionDoc) {
                        const receptionRef = doc(firestore, 'packagingReceptions', loc.receptionId);
                        const newItems = JSON.parse(JSON.stringify(receptionDoc.items || []));
                        const itemToUpdate = newItems[loc.itemIndex];

                        if (itemToUpdate && itemToUpdate.palletCount >= loc.palletsToWithdraw) {
                            itemToUpdate.palletCount -= loc.palletsToWithdraw;
                        }
                        batch.update(receptionRef, { items: newItems, updatedAt: serverTimestamp() });
                    }
                }
              }
            }
        }
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Salida de embalaje confirmada y stock actualizado.' });
        setPickingMovement(null);
    } catch (error) {
        console.error("Error confirming packaging exit:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la salida.' });
    } finally {
        setIsConfirming(false);
    }
  };
  
  const handleConfirmProducerFruitExit = async (dispatchToConfirm: Dispatch, pickedQuantities: Record<string, number>) => {
    if (!firestore || !allChamberLots) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos necesarios.' });
        return;
    };
    setIsConfirming(true);

    try {
        const batch = writeBatch(firestore);

        for (const originalBin of dispatchToConfirm.bins) {
            const originalLot = allChamberLots.find(l => l.id === originalBin.chamberLotId);
            if (!originalLot) {
                console.warn(`Could not find original ChamberLot with id ${originalBin.chamberLotId}`);
                continue;
            }

            const pickedCount = pickedQuantities[originalBin.chamberLotId] ?? 0;
            const remainder = originalLot.binCount - pickedCount;

            const lotRef = doc(firestore, 'chamberLots', originalBin.chamberLotId);

            if (remainder > 0) {
                batch.update(lotRef, { binCount: remainder });
            } else {
                batch.delete(lotRef);
            }
        }
        
        const finalBins = dispatchToConfirm.bins.map(bin => ({
            ...bin,
            binCount: pickedQuantities[bin.chamberLotId] ?? 0,
        })).filter(bin => bin.binCount > 0);
        
        const finalTotalBins = finalBins.reduce((sum, bin) => sum + bin.binCount, 0);

        const dispatchRef = doc(firestore, 'dispatches', dispatchToConfirm.id);
        batch.update(dispatchRef, {
            status: 'Completado',
            bins: finalBins,
            totalBins: finalTotalBins,
        });

        await batch.commit();

        toast({ title: 'Éxito', description: 'Salida de fruta de productor confirmada.' });
        setPickingMovement(null);

    } catch (e: any) {
        console.error("Error confirming producer fruit exit:", e);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la salida de la fruta del productor.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'dispatches or chamberLots',
            operation: 'write'
        }));
    } finally {
        setIsConfirming(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteMovement || !firestore) return;
    setIsDeleting(true);
    try {
      if (deleteMovement.taskType === 'fruit') {
        await deleteDoc(doc(firestore, 'otherFruitMovements', deleteMovement.id));
      } else if (deleteMovement.taskType === 'packaging') {
        await deleteDoc(doc(firestore, 'packagingMovements', deleteMovement.id));
      } else if (deleteMovement.taskType === 'producerFruit') {
        await deleteDoc(doc(firestore, 'dispatches', deleteMovement.id));
      }
      toast({ title: 'Éxito', description: 'El picking de despacho ha sido eliminado correctamente.' });
      setDeleteMovement(null);
    } catch (e: any) {
      console.error("Error deleting picking:", e);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el picking de despacho.' });
    } finally {
      setIsDeleting(false);
    }
  };


  const loading = loadingFruitMovements || loadingPackagingMovements || loadingPackagingReceptions || loadingOtherFruitReceptions || loadingClients || loadingDispatches || loadingChamberLots;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tareas de Picking Pendientes</CardTitle>
          <CardDescription>Lista de solicitudes de despacho (Fruta y Embalajes) que deben ser verificadas por el operador de bodega.</CardDescription>
        </CardHeader>
        <CardContent>
            {/* Mobile View */}
            <div className="md:hidden space-y-3">
              {loading ? (
                   Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
              ) : pendingMovements.length > 0 ? (
                  pendingMovements.map((mov) => {
                     const isProducerFruit = mov.taskType === 'producerFruit';
                     const clientName = isProducerFruit ? (mov as Dispatch).exporterName : (mov as any).clientName || clientMap[mov.clientId];
                     const quantity = isProducerFruit ? `${(mov as Dispatch).totalBins} Bins` : `${(mov as any).items.reduce((sum: number, item: any) => sum + (item.quantity || item.palletCount), 0)} ${(mov as any).unit || 'Pallets'}`;
                     const typeLabel = mov.taskType === 'fruit' ? 'Fruta (Socio)' : mov.taskType === 'packaging' ? 'Embalaje' : 'Fruta (Productor)';

                      return (
                          <Card key={mov.id} className="p-4 flex flex-col gap-3">
                              <div className="flex justify-between items-start gap-4">
                                  <div>
                                      <CardTitle className="text-lg">{clientName}</CardTitle>
                                      <CardDescription>{mov.createdAt?.toDate()?.toLocaleString() ?? 'Sin fecha'}</CardDescription>
                                      <div className="mt-2">
                                          <Badge variant={mov.taskType === 'fruit' ? 'outline' : mov.taskType === 'packaging' ? 'default' : 'secondary'}>
                                              {typeLabel}
                                          </Badge>
                                          <p className="font-semibold text-lg mt-1">{quantity}</p>
                                      </div>
                                  </div>
                                  <div className="flex flex-col gap-2 items-end">
                                    {mov.taskType === 'packaging' && (
                                        <Button variant="outline" size="sm" onClick={() => handleGeneratePdfForPackaging(mov as PackagingMovement)}>
                                            <FileText className="mr-2 h-4 w-4" />
                                            PDF
                                        </Button>
                                    )}
                                    {mov.taskType === 'fruit' && (
                                        <Button variant="outline" size="sm" onClick={() => handleGeneratePdfForFruit(mov as OtherFruitMovement)}>
                                            <FileText className="mr-2 h-4 w-4" />
                                            PDF
                                        </Button>
                                    )}
                                    <Button size="lg" onClick={() => handleStartPicking(mov)}>Hacer Picking</Button>
                                  </div>
                              </div>
                              <div className="border-t pt-2 flex justify-between items-center">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setDeleteMovement(mov)}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive px-2 h-8 text-xs font-semibold flex items-center gap-1.5"
                                  >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Eliminar Picking
                                  </Button>
                              </div>
                          </Card>
                      )
                  })
              ) : (
                   <div className="h-24 text-center flex items-center justify-center">
                      <p>No hay tareas de picking pendientes.</p>
                   </div>
              )}
          </div>
          {/* Desktop View */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Solicitud</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : pendingMovements.length > 0 ? (
                  pendingMovements.map((mov) => {
                     const isProducerFruit = mov.taskType === 'producerFruit';
                     const clientName = isProducerFruit ? (mov as Dispatch).exporterName : (mov as any).clientName || clientMap[mov.clientId];
                     const quantity = isProducerFruit ? `${(mov as Dispatch).totalBins} Bins` : `${(mov as any).items.reduce((sum: number, item: any) => sum + (item.quantity || item.palletCount), 0)} ${(mov as any).unit || 'Pallets'}`;

                     return (
                        <TableRow key={mov.id}>
                          <TableCell>{mov.createdAt?.toDate()?.toLocaleString() ?? 'Sin fecha'}</TableCell>
                          <TableCell>
                            <Badge variant={mov.taskType === 'fruit' ? 'outline' : mov.taskType === 'packaging' ? 'default' : 'secondary'}>
                                {mov.taskType === 'fruit' ? 'Fruta (Socio)' : mov.taskType === 'packaging' ? 'Embalaje' : 'Fruta (Productor)'}
                            </Badge>
                          </TableCell>
                          <TableCell>{clientName}</TableCell>
                          <TableCell>{quantity}</TableCell>
                          <TableCell><Badge variant="secondary">{mov.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setDeleteMovement(mov)}
                                  className="text-destructive border-destructive hover:bg-destructive/10 mr-auto"
                                  title="Eliminar solicitud de picking"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                {mov.taskType === 'packaging' && (
                                    <Button variant="outline" size="sm" onClick={() => handleGeneratePdfForPackaging(mov as PackagingMovement)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF
                                    </Button>
                                )}
                                {mov.taskType === 'fruit' && (
                                    <Button variant="outline" size="sm" onClick={() => handleGeneratePdfForFruit(mov as OtherFruitMovement)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        PDF
                                    </Button>
                                )}
                                <Button size="sm" onClick={() => handleStartPicking(mov)}>Hacer Picking</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                     )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">No hay tareas de picking pendientes.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {pickingMovement?.taskType === 'producerFruit' && (
        <DispatchPickingDialog
          dispatch={pickingMovement as Dispatch}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmDispatch={handleConfirmProducerFruitExit}
          isConfirming={isConfirming}
          isPickingMode={true}
        />
      )}
      {pickingMovement?.taskType === 'fruit' && (
        <OtherFruitPickingDialog
          movement={pickingMovement as OtherFruitMovement}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmExit={handleConfirmFruitExit}
          isConfirming={isConfirming}
          otherFruitReceptions={otherFruitReceptions || []}
        />
      )}
       {pickingMovement?.taskType === 'packaging' && (
        <PackagingPickingDialog 
          movement={pickingMovement as PackagingMovement}
          open={!!pickingMovement}
          onOpenChange={(open) => !open && setPickingMovement(null)}
          onConfirmExit={handleConfirmPackagingExit}
          isConfirming={isConfirming}
          clientName={clientMap[pickingMovement.clientId] || ''}
        />
      )}

      <Dialog open={!!deleteMovement} onOpenChange={(open) => !open && setDeleteMovement(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              ¿Eliminar Picking de Despacho?
            </DialogTitle>
            <DialogDescription className="pt-2 text-zinc-600">
              Esta acción eliminará de forma permanente esta solicitud de picking. 
              El stock y las coordenadas reservadas para este despacho volverán a estar disponibles de inmediato en la oficina.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteMovement(null)} 
              disabled={isDeleting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete} 
              disabled={isDeleting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
