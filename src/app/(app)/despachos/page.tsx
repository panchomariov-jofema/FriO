'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, Dispatch, Exporter, Producer, ReceptionLot, OtherFruitReception } from '@/lib/types';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, writeBatch, serverTimestamp, doc, orderBy } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { chambersConfig } from '@/lib/chambers-config';
import { usePackingsByExporter } from '@/hooks/use-packings-by-exporter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManualDispatchTab } from '@/components/dispatch/ManualDispatchTab';
import { Download } from 'lucide-react';
import { DispatchPickingDialog } from '@/components/dispatch/DispatchPickingDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Switch } from '@/components/ui/switch';


const dispatchSchema = z.object({
  exporterId: z.string().min(1, 'Debe seleccionar un cliente.'),
  packingId: z.string().optional(),
  maxBins: z.coerce
    .number({ invalid_type_error: 'Debe ser un número.' })
    .positive('La cantidad de bins debe ser mayor a 0.'),
});


type DispatchFormValues = z.infer<typeof dispatchSchema>;


function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value?.toDate) {
                value = value.toDate().toLocaleString();
            }
            const stringValue = String(value ?? '');
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}


function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}


function DespachosPageContent() {
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: receptionLots, loading: loadingReceptionLots } = useFirestoreCollection<ReceptionLot>('receptionLots');
  const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
  const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');

  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isUndoing, setIsUndoing] = React.useState(false);
  const [pickingDispatch, setPickingDispatch] = React.useState<Dispatch | null>(null);
  const [showOnlyPending, setShowOnlyPending] = React.useState(true);
  const [showCherryOnly, setShowCherryOnly] = React.useState(false);
  
  const dispatchesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const collRef = collection(firestore, 'dispatches');
    // The query without orderBy is more stable and avoids needing composite indexes
    // Sorting will be done on the client side.
    if (showOnlyPending) {
      return query(collRef, where('status', '==', 'Pendiente de Picking'));
    }
    return query(collRef);
  }, [firestore, showOnlyPending, user]);
  
  const { data: dispatches, loading: loadingDispatches } = useCollection<Dispatch>(dispatchesQuery);

  const filteredDispatches = React.useMemo(() => {
    if (!dispatches) return [];
    // Always sort by date on the client side
    return [...dispatches].sort((a,b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [dispatches]);


  const form = useForm<DispatchFormValues>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: {
      exporterId: undefined,
      packingId: undefined,
      maxBins: 0,
    },
  });

  const selectedExporterId = form.watch('exporterId');
  const { data: packings, loading: loadingPackings } = usePackingsByExporter(selectedExporterId);
  
  const getExporterName = (exporterId: string) => {
    if (exporterId === 'undefined' || !exporterId) return 'Subsole';
    return exporters?.find(e => e.exporterId === exporterId)?.name || exporterId;
  };

  const { binsPerChamber, binsPerExporter, binsPerProducer } = React.useMemo(() => {
    const storedLots = (chamberLots || []).filter(lot => lot.status === 'Almacenado');

    const storedOtherFruit = showCherryOnly ? [] : (otherFruitReceptions || [])
        .flatMap(r => r.items.map(item => ({ ...item, reception: r })))
        .filter((item) => item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.chamberId);


    // Bins per Chamber
    const perChamber = storedLots.reduce((acc, lot) => {
      const chamberName = chambersConfig[lot.chamberId!]?.name || lot.chamberId!;
      acc[chamberName] = (acc[chamberName] || 0) + lot.binCount;
      return acc;
    }, {} as Record<string, number>);

    storedOtherFruit.forEach((item) => {
        if(item.storageLocation?.chamberId) {
            const chamberName = chambersConfig[item.storageLocation.chamberId]?.name || item.storageLocation.chamberId;
            const equivalentBins = item.reception.unit === 'Pallets' ? item.quantity * 2 : item.quantity;
            perChamber[chamberName] = (perChamber[chamberName] || 0) + equivalentBins;
        }
    });

    // Bins per Exporter/Client
    const perExporter: Record<string, number> = storedLots.reduce((acc, lot) => {
        const id = lot.exporterId;
        acc[id] = (acc[id] || 0) + lot.binCount;
        return acc;
    }, {} as Record<string, number>);
    
    storedOtherFruit.forEach((item) => {
        const clientName = item.reception.clientName;
        const equivalentBins = item.reception.unit === 'Pallets' ? item.quantity * 2 : item.quantity;
        perExporter[clientName] = (perExporter[clientName] || 0) + equivalentBins;
    });

    // Bins per Producer
    const perProducer = storedLots.reduce((acc, lot) => {
      const producerName = lot.producerShortName;
      if (producerName) {
          acc[producerName] = (acc[producerName] || 0) + lot.binCount;
      }
      return acc;
    }, {} as Record<string, number>);

    return { binsPerChamber: perChamber, binsPerExporter: perExporter, binsPerProducer: perProducer };
  }, [chamberLots, otherFruitReceptions, showCherryOnly]);

  const onSubmit = async (values: DispatchFormValues) => {
    if (!firestore || !exporters || !chamberLots) return;
  
    const selectedExporter = exporters.find(e => e.exporterId === values.exporterId);
    if (!selectedExporter) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado.' });
        return;
    }
  
    try {
        const availableLots = (chamberLots || [])
            .filter(lot => lot.status === 'Almacenado' && lot.exporterId === values.exporterId);

        if (availableLots.length === 0) {
            toast({ variant: 'destructive', title: 'Sin Stock', description: 'No hay bins disponibles para este cliente.' });
            return;
        }

        const groupedLots = availableLots.reduce((acc, lot) => {
            if (!acc[lot.displayLotId]) {
                acc[lot.displayLotId] = {
                    totalBins: 0,
                    receptionDate: lot.receptionDate,
                    fractions: []
                };
            }
            acc[lot.displayLotId].totalBins += lot.binCount;
            acc[lot.displayLotId].fractions.push(lot);
            return acc;
        }, {} as Record<string, { totalBins: number, receptionDate: any, fractions: ChamberLot[] }>);

        const sortedGroupedLots = Object.values(groupedLots).sort((a, b) => {
            if (!a.receptionDate) return 1;
            if (!b.receptionDate) return -1;
            return a.receptionDate.toMillis() - b.receptionDate.toMillis();
        });

        const binsToDispatch: ChamberLot[] = [];
        let accumulatedBins = 0;
        
        for (const groupedLot of sortedGroupedLots) {
            if (accumulatedBins + groupedLot.totalBins <= values.maxBins) {
                accumulatedBins += groupedLot.totalBins;
                binsToDispatch.push(...groupedLot.fractions);
            }
        }
  
        if (binsToDispatch.length === 0) {
            toast({ variant: 'destructive', title: 'Sin Stock suficiente', description: 'No se encontraron lotes completos que se ajusten a la cantidad solicitada.' });
            return;
        }
  
        let totalNetWeight = 0;

        const dispatchBinsPayload = binsToDispatch.map(lot => {
            if (lot.netWeightPerBin && lot.netWeightPerBin > 0) {
                totalNetWeight += lot.binCount * lot.netWeightPerBin;
            }
            return {
                chamberLotId: lot.id,
                displayLotId: lot.displayLotId,
                chamberId: lot.chamberId!,
                coordinate: lot.coordinate!,
                binCount: lot.binCount,
            };
        });
  
        const dispatchData = {
          exporterId: selectedExporter.exporterId,
          exporterName: selectedExporter.name,
          packingId: values.packingId || null,
          totalBins: accumulatedBins,
          totalNetWeight: totalNetWeight,
          status: 'Pendiente de Picking' as const,
          createdAt: serverTimestamp(),
          bins: dispatchBinsPayload,
        };
  
        const batch = writeBatch(firestore);

        binsToDispatch.forEach(lot => {
            const lotRef = doc(firestore, 'chamberLots', lot.id);
            batch.update(lotRef, { status: 'Despachado' });
        });

        const dispatchRef = doc(collection(firestore, 'dispatches'));
        batch.set(dispatchRef, dispatchData);

        await batch.commit();
        
        toast({
          title: 'Solicitud de Despacho Creada',
          description: `Se ha creado una solicitud con ${accumulatedBins} bins para ${selectedExporter.name}.`,
        });
        form.reset({ exporterId: undefined, packingId: undefined, maxBins: 0 });
  
    } catch (error: any) {
        console.error("Error creating dispatch request:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al crear la solicitud de despacho.' });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: 'dispatches',
                operation: 'create',
            })
        );
    }
  };

  const handleConfirmDispatch = async (dispatchToConfirm: Dispatch, pickedQuantities: Record<string, number>) => {
    if (!firestore || !chamberLots) return;
    setIsConfirming(true);

    try {
        const batch = writeBatch(firestore);
        const chamberLotsCollectionRef = collection(firestore, 'chamberLots');

        const finalBins: Dispatch['bins'] = [];
        let finalTotalBins = 0;
        let finalTotalNetWeight = 0;

        for (const originalBin of dispatchToConfirm.bins) {
            const pickedCount = pickedQuantities[originalBin.chamberLotId] ?? 0;
            const originalCount = originalBin.binCount;
            const remainder = originalCount - pickedCount;

            const lotRef = doc(firestore, 'chamberLots', originalBin.chamberLotId);
            batch.delete(lotRef);

            if (remainder > 0) {
                const originalLotData = chamberLots.find(l => l.id === originalBin.chamberLotId);
                if (originalLotData) {
                    const newLotData = {
                        ...originalLotData,
                        binCount: remainder,
                        status: 'Almacenado' as const,
                    };
                    delete (newLotData as any).id;
                    const newLotRef = doc(chamberLotsCollectionRef);
                    batch.set(newLotRef, newLotData);
                }
            }

            if (pickedCount > 0) {
                const lotData = chamberLots.find(l => l.id === originalBin.chamberLotId);
                finalTotalBins += pickedCount;
                if (lotData?.netWeightPerBin) {
                    finalTotalNetWeight += pickedCount * lotData.netWeightPerBin;
                }
                finalBins.push({ ...originalBin, binCount: pickedCount });
            }
        }
        
        const dispatchRef = doc(firestore, 'dispatches', dispatchToConfirm.id);
        batch.update(dispatchRef, {
            status: 'Completado',
            bins: finalBins,
            totalBins: finalTotalBins,
            totalNetWeight: finalTotalNetWeight,
        });

        await batch.commit();

        toast({
            title: 'Éxito',
            description: `Despacho para ${dispatchToConfirm.exporterName} completado.`,
        });
        setPickingDispatch(null);

    } catch (e: any) {
        console.error('Error confirming dispatch:', e);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Ocurrió un error al confirmar el despacho.',
        });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `dispatches/${dispatchToConfirm.id}`,
            operation: 'update',
        }));
    } finally {
        setIsConfirming(false);
    }
  };

  const handleUndoDispatch = async (dispatchToUndo: Dispatch) => {
    if (!firestore) return;
    setIsUndoing(true);

    try {
      const batch = writeBatch(firestore);

      // Revert status of chamber lots
      dispatchToUndo.bins.forEach(bin => {
        const lotRef = doc(firestore, 'chamberLots', bin.chamberLotId);
        batch.update(lotRef, { status: 'Almacenado' });
      });
      
      // Delete the dispatch document
      const dispatchRef = doc(firestore, 'dispatches', dispatchToUndo.id);
      batch.delete(dispatchRef);

      await batch.commit();
      
      toast({
        title: 'Solicitud Deshecha',
        description: `Se ha cancelado la solicitud para ${dispatchToUndo.exporterName}.`,
      });

    } catch (error: any) {
      console.error("Error undoing dispatch:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al deshacer la solicitud.',
      });
       errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: `dispatches/${dispatchToUndo.id}`,
          operation: 'delete',
        })
      );
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="relative">
        <div className="absolute top-0 right-0 flex items-center space-x-2 z-10">
          <Switch id="cherry-filter" checked={showCherryOnly} onCheckedChange={setShowCherryOnly} />
          <Label htmlFor="cherry-filter">Solo Cereza</Label>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Stock por Cámara</CardTitle></CardHeader>
            <CardContent>
              {loadingChamberLots || loadingOtherFruit ? <Skeleton className="h-20" /> : (
                <ul className="space-y-1 text-sm">
                  {Object.entries(binsPerChamber).map(([chamber, count]) => (
                    <li key={chamber} className="flex justify-between"><span>{chamber}:</span><span className="font-semibold">{count} bins</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Stock por Exportador</CardTitle></CardHeader>
            <CardContent>
              {loadingChamberLots || loadingExporters || loadingOtherFruit ? <Skeleton className="h-20" /> : (
                <ul className="space-y-1 text-sm">
                  {Object.entries(binsPerExporter).map(([exporterKey, count]) => (
                    <li key={exporterKey} className="flex justify-between"><span>{getExporterName(exporterKey)}:</span><span className="font-semibold">{count} bins</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Stock por Productor</CardTitle></CardHeader>
            <CardContent>
              {loadingChamberLots || loadingProducers ? <Skeleton className="h-20" /> : (
                <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
                  {Object.entries(binsPerProducer).map(([producerName, count]) => (
                    <li key={producerName} className="flex justify-between"><span>{producerName}:</span><span className="font-semibold">{count} bins</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Tabs defaultValue="automatico" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="automatico">Despacho Automático (FIFO)</TabsTrigger>
            <TabsTrigger value="manual">Despacho Manual</TabsTrigger>
        </TabsList>
        <TabsContent value="automatico">
            <Card>
                <CardHeader>
                    <CardTitle>Crear Solicitud de Despacho Automático (FIFO)</CardTitle>
                    <CardDescription>
                    Seleccione un cliente y la cantidad máxima de bins. El sistema seleccionará los lotes más antiguos (FIFO) sin dividirlos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                        <FormField control={form.control} name="exporterId" render={({ field }) => (
                            <FormItem><FormLabel>Cliente Exportador</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={loadingExporters}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un cliente" /></SelectTrigger></FormControl>
                                <SelectContent>{exporters?.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="packingId" render={({ field }) => (
                            <FormItem><FormLabel>Packing de Destino (Opcional)</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedExporterId || loadingPackings}>
                                <FormControl><SelectTrigger><SelectValue placeholder={!selectedExporterId ? 'Seleccione exportador' : 'Opcional...'} /></SelectTrigger></FormControl>
                                <SelectContent>{packings?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="maxBins" render={({ field }) => (
                            <FormItem><FormLabel>Cantidad Máx. de Bins</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <div className="lg:col-span-3 flex justify-end">
                            <Button type="submit" disabled={form.formState.isSubmitting}>Crear Solicitud FIFO</Button>
                        </div>
                    </form>
                    </Form>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="manual">
            <ManualDispatchTab
                exporters={exporters}
                loadingExporters={loadingExporters}
                chamberLots={chamberLots}
                loadingChamberLots={loadingChamberLots}
            />
        </TabsContent>
      </Tabs>


      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Solicitudes de Despacho</CardTitle>
              <CardDescription>Lista de solicitudes creadas.</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox id="show-pending" checked={showOnlyPending} onCheckedChange={(checked) => setShowOnlyPending(!!checked)} />
                <Label htmlFor="show-pending">Mostrar solo pendientes</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Creación</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>N° Bins</TableHead>
                  <TableHead>Peso Neto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDispatches ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                ) : filteredDispatches.length > 0 ? (
                  filteredDispatches.map((dispatch) => (
                    <TableRow key={dispatch.id}>
                      <TableCell>{dispatch.createdAt?.toDate().toLocaleString()}</TableCell>
                      <TableCell>{dispatch.exporterName}</TableCell>
                      <TableCell>{dispatch.totalBins}</TableCell>
                      <TableCell>{dispatch.totalNetWeight ? `${dispatch.totalNetWeight.toFixed(2)} kg` : '-'}</TableCell>
                      <TableCell><Badge variant={dispatch.status === 'Completado' ? 'default' : 'secondary'}>{dispatch.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {dispatch.status === 'Pendiente de Picking' ? (
                          <div className="flex justify-end gap-2">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm">Deshacer</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Está seguro de deshacer esta solicitud?</AlertDialogTitle>
                                        <AlertDialogDescription>Esta acción devolverá los lotes al stock disponible y eliminará la solicitud de despacho. No se puede revertir.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleUndoDispatch(dispatch)} disabled={isUndoing}>
                                            {isUndoing ? 'Deshaciendo...' : 'Sí, Deshacer'}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Button size="sm" onClick={() => setPickingDispatch(dispatch)}>Hacer Picking</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setPickingDispatch(dispatch)}>Ver PDF</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay solicitudes de despacho.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {pickingDispatch && (
        <DispatchPickingDialog 
            dispatch={pickingDispatch}
            open={!!pickingDispatch}
            onOpenChange={(open) => !open && setPickingDispatch(null)}
            onConfirmDispatch={handleConfirmDispatch}
            isConfirming={isConfirming}
        />
      )}
    </div>
  );
}

export default function DespachosPage() {
  const { user, isUserLoading } = useUser();

  if (isUserLoading || !user) {
    return <LoadingScreen />;
  }

  return <DespachosPageContent />;
}
