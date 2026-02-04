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
import type { ChamberLot, Dispatch, Exporter, Producer, ReceptionLot } from '@/lib/types';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, writeBatch, serverTimestamp, doc, addDoc, getDoc, deleteDoc, orderBy } from 'firebase/firestore';
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

const dispatchSchema = z.object({
  exporterId: z.string().min(1, 'Debe seleccionar un cliente.'),
  packingId: z.string().optional(),
  maxBins: z.coerce
    .number({ invalid_type_error: 'Debe ser un número.' })
    .positive('La cantidad de bins debe ser mayor a 0.'),
});

type DispatchFormValues = z.infer<typeof dispatchSchema>;

// Helper to convert array of objects to CSV
function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value?.toDate) { // Firebase Timestamp
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
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isUndoing, setIsUndoing] = React.useState(false);
  const [pickingDispatch, setPickingDispatch] = React.useState<Dispatch | null>(null);
  const [showOnlyPending, setShowOnlyPending] = React.useState(true);
  
  const dispatchesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const collRef = collection(firestore, 'dispatches');
    if (showOnlyPending) {
        return query(collRef, where('status', '==', 'Pendiente de Picking'), orderBy('createdAt', 'desc'));
    }
    return query(collRef, orderBy('createdAt', 'desc'));
  }, [firestore, showOnlyPending]);
  const { data: filteredDispatches, loading: loadingDispatches } = useCollection<Dispatch>(dispatchesQuery);


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

    const perChamber = storedLots.reduce((acc, lot) => {
      const chamberName = chambersConfig[lot.chamberId!]?.name || lot.chamberId!;
      acc[chamberName] = (acc[chamberName] || 0) + lot.binCount;
      return acc;
    }, {} as Record<string, number>);

    const perExporter = storedLots.reduce((acc, lot) => {
      const id = lot.exporterId || 'undefined';
      acc[id] = (acc[id] || 0) + lot.binCount;
      return acc;
    }, {} as Record<string, number>);

    const perProducer = storedLots.reduce((acc, lot) => {
      const producerName = lot.producerShortName;
      acc[producerName] = (acc[producerName] || 0) + lot.binCount;
      return acc;
    }, {} as Record<string, number>);

    return { binsPerChamber: perChamber, binsPerExporter: perExporter, binsPerProducer: perProducer };
  }, [chamberLots]);

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

        // 1. Group all chamber lot fractions by their original displayLotId
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

        // 2. Sort the grouped lots by receptionDate (FIFO), handling possible nulls
        const sortedGroupedLots = Object.values(groupedLots).sort((a, b) => {
            if (!a.receptionDate) return 1;
            if (!b.receptionDate) return -1;
            return a.receptionDate.toMillis() - b.receptionDate.toMillis();
        });

        // 3. Select whole lots without exceeding maxBins
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
  
        // 4. Create dispatch document and reserve stock
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

        // Mark lots as 'Despachado' to reserve them
        binsToDispatch.forEach(lot => {
            const lotRef = doc(firestore, 'chamberLots', lot.id);
            batch.update(lotRef, { status: 'Despachado' });
        });

        // Create the dispatch document
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

        // Recalculate final values based on picked quantities
        const finalBins: Dispatch['bins'] = [];
        let finalTotalBins = 0;
        let finalTotalNetWeight = 0;

        for (const originalBin of dispatchToConfirm.bins) {
            const pickedCount = pickedQuantities[originalBin.chamberLotId] ?? 0;
            const originalCount = originalBin.binCount;
            const remainder = originalCount - pickedCount;

            // The original dispatched lot is always removed from its 'Despachado' state.
            const lotRef = doc(firestore, 'chamberLots', originalBin.chamberLotId);
            batch.delete(lotRef);

            // If there's a remainder, create a new lot with 'Almacenado' status.
            if (remainder > 0) {
                const originalLotData = chamberLots.find(l => l.id === originalBin.chamberLotId);
                if (originalLotData) {
                    const newLotData = {
                        ...originalLotData,
                        binCount: remainder,
                        status: 'Almacenado' as const,
                    };
                    delete (newLotData as any).id; // Make sure firestore generates a new ID
                    const newLotRef = doc(chamberLotsCollectionRef);
                    batch.set(newLotRef, newLotData);
                }
            }

            // Update the list of bins in the final dispatch document if any were picked.
            if (pickedCount > 0) {
                const lotData = chamberLots.find(l => l.id === originalBin.chamberLotId);
                finalTotalBins += pickedCount;
                if (lotData?.netWeightPerBin) {
                    finalTotalNetWeight += pickedCount * lotData.netWeightPerBin;
                }
                finalBins.push({ ...originalBin, binCount: pickedCount });
            }
        }
        
        // Update the dispatch document with the final corrected data and 'Completado' status.
        const dispatchRef = doc(firestore, 'dispatches', dispatchToConfirm.id);
        batch.update(dispatchRef, {
            status: 'Completado',
            bins: finalBins,
            totalBins: finalTotalBins,
            totalNetWeight: finalTotalNetWeight,
        });

        await batch.commit();

        toast({
            title: 'Despacho Confirmado',
            description: `El stock ha sido rebajado y las ubicaciones están libres.`,
        });

    } catch (error: any) {
        console.error("Error confirming dispatch:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al confirmar el despacho.' });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: 'dispatches or chamberLots',
                operation: 'write',
            })
        );
    } finally {
        setIsConfirming(false);
        setPickingDispatch(null);
    }
};


const handleUndoDispatch = async (dispatchToUndo: Dispatch) => {
    if (!firestore) return;
    setIsUndoing(true);

    try {
        const batch = writeBatch(firestore);

        // 1. Set chamberLots status back to 'Almacenado'
        dispatchToUndo.bins.forEach(bin => {
            const lotRef = doc(firestore, 'chamberLots', bin.chamberLotId);
            batch.update(lotRef, { status: 'Almacenado' });
        });
        
        // 2. Delete the dispatch document
        const dispatchRef = doc(firestore, 'dispatches', dispatchToUndo.id);
        batch.delete(dispatchRef);

        await batch.commit();

        toast({
            title: 'Solicitud Deshecha',
            description: `La solicitud de despacho para ${dispatchToUndo.exporterName} ha sido cancelada.`,
        });

    } catch (error: any) {
        console.error("Error undoing dispatch request:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al deshacer la solicitud.' });
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

  const handleExportDispatch = (dispatch: Dispatch) => {
    if (!receptionLots || !producers) {
        toast({ variant: 'destructive', title: 'Error', description: 'Los datos de recepción o productores aún no están cargados.' });
        return;
    }
    
    // Group bins by displayLotId
    const groupedBins = dispatch.bins.reduce((acc, bin) => {
        if (!acc[bin.displayLotId]) {
            acc[bin.displayLotId] = {
                totalBins: 0,
                displayLotId: bin.displayLotId,
            };
        }
        acc[bin.displayLotId].totalBins += bin.binCount;
        return acc;
    }, {} as Record<string, { totalBins: number, displayLotId: string }>);


    const dataToExport = Object.values(groupedBins).map(groupedBin => {
        const originalReception = receptionLots.find(lot => lot.displayLotId === groupedBin.displayLotId);
        const producer = producers.find(p => p.producerId === originalReception?.producerId);

        const netWeight = (originalReception?.netWeightPerBin && originalReception.binCount > 0)
            ? originalReception.netWeightPerBin * groupedBin.totalBins
            : null;

        return {
            'Cantidad de Bins': groupedBin.totalBins,
            'Cantidad de Totes': originalReception?.toteCount ?? '',
            'Productor': originalReception?.producerId ?? '',
            'Nombre Productor': producer?.name ?? '',
            'Variedad': originalReception?.variety ?? '',
            'Kilos Netos': netWeight?.toFixed(2) ?? '',
            'Fecha de Recepción': originalReception?.createdAt?.toDate().toLocaleDateString() ?? '',
            'N° Documento de recepcion': originalReception?.document ?? '',
        };
    });

    const headers = ['Cantidad de Bins', 'Cantidad de Totes', 'Productor', 'Nombre Productor', 'Variedad', 'Kilos Netos', 'Fecha de Recepción', 'N° Documento de recepcion'];
    const csv = convertToCSV(dataToExport, headers);
    const date = dispatch.createdAt.toDate().toISOString().split('T')[0];
    downloadCSV(csv, `despacho_${dispatch.exporterName}_${date}.csv`);
};


  const summaryIsLoading = loadingChamberLots || loadingExporters || loadingProducers;
  
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumen: Bins por Cámara</CardTitle>
            <CardDescription>Total de bins en estado "Almacenado" por cada cámara.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cámara</TableHead>
                    <TableHead className="text-right">Total Bins</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryIsLoading ? (
                    <TableRow><TableCell colSpan={2}><Skeleton className="h-4 w-full my-1" /></TableCell></TableRow>
                  ) : Object.keys(binsPerChamber).length > 0 ? (
                    Object.entries(binsPerChamber).map(([chamberName, count]) => (
                      <TableRow key={chamberName}>
                        <TableCell className="font-medium">{chamberName}</TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={2} className="h-24 text-center">No hay bins almacenados.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resumen: Bins por Exportador</CardTitle>
            <CardDescription>Total de bins en estado "Almacenado" por cada cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exportador</TableHead>
                      <TableHead className="text-right">Total Bins</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryIsLoading ? (
                       <TableRow><TableCell colSpan={2}><Skeleton className="h-4 w-full my-1" /></TableCell></TableRow>
                    ) : Object.keys(binsPerExporter).length > 0 ? (
                      Object.entries(binsPerExporter).map(([exporterId, count]) => (
                        <TableRow key={exporterId}>
                          <TableCell className="font-medium">{getExporterName(exporterId)}</TableCell>
                          <TableCell className="text-right">{count}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={2} className="h-24 text-center">No hay bins almacenados.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
            </div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader>
            <CardTitle>Resumen: Bins por Productor</CardTitle>
            <CardDescription>Total de bins en estado "Almacenado" por cada productor.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Productor</TableHead>
                      <TableHead className="text-right">Total Bins</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryIsLoading ? (
                       <TableRow><TableCell colSpan={2}><Skeleton className="h-4 w-full my-1" /></TableCell></TableRow>
                    ) : Object.keys(binsPerProducer).length > 0 ? (
                      Object.entries(binsPerProducer).map(([producerName, count]) => (
                        <TableRow key={producerName}>
                          <TableCell className="font-medium">{producerName}</TableCell>
                          <TableCell className="text-right">{count}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={2} className="h-24 text-center">No hay bins almacenados.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
            </div>
          </CardContent>
        </Card>
      </div>

    <Tabs defaultValue="automatico" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="automatico">Despacho Automático</TabsTrigger>
            <TabsTrigger value="manual">Despacho Manual</TabsTrigger>
        </TabsList>
        <TabsContent value="automatico">
            <Card>
                <CardHeader>
                <CardTitle>Crear Solicitud de Despacho Automático</CardTitle>
                <CardDescription>
                    Seleccione un cliente y la cantidad de bins. El sistema reservará los lotes más antiguos (FIFO) sin dividirlos para un posterior picking.
                </CardDescription>
                </CardHeader>
                <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <FormField
                            control={form.control}
                            name="exporterId"
                            render={({ field }) => (
                            <FormItem className="lg:col-span-1">
                                <FormLabel>Cliente (Exportador)</FormLabel>
                                <Select
                                onValueChange={(value) => {
                                    field.onChange(value);
                                    form.setValue('packingId', undefined); // Reset packing when exporter changes
                                }}
                                value={field.value}
                                disabled={loadingExporters}>
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder="Seleccione un cliente..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {exporters?.map(e => (
                                    <SelectItem key={e.id} value={e.exporterId}>
                                        {e.name}
                                    </SelectItem>
                                    ))}
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="packingId"
                            render={({ field }) => (
                            <FormItem className="lg:col-span-1">
                                <FormLabel>Packing</FormLabel>
                                <Select
                                onValueChange={field.onChange}
                                value={field.value}
                                disabled={!selectedExporterId || loadingPackings}
                                >
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder={!selectedExporterId ? 'Seleccione exportador' : 'Seleccione un packing...'} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {packings?.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                    </SelectItem>
                                    ))}
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="maxBins"
                            render={({ field }) => (
                            <FormItem className="lg:col-span-1">
                                <FormLabel>Cantidad Máxima de Bins</FormLabel>
                                <FormControl>
                                <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" inputMode="numeric" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <Button type="submit" disabled={form.formState.isSubmitting} className="lg:col-span-1">
                            {form.formState.isSubmitting ? 'Procesando...' : 'Crear Solicitud'}
                        </Button>
                    </div>
                    </form>
                </Form>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="manual">
            <ManualDispatchTab 
              exporters={exporters || []}
              loadingExporters={loadingExporters}
              chamberLots={chamberLots || []}
              loadingChamberLots={loadingChamberLots}
            />
        </TabsContent>
    </Tabs>

      
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Solicitudes de Despacho</CardTitle>
              <CardDescription>Lista de despachos pendientes de picking y completados.</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="show-pending" checked={showOnlyPending} onCheckedChange={(checked) => setShowOnlyPending(!!checked)} />
              <Label htmlFor="show-pending" className="whitespace-nowrap">Solo Solicitudes Pendientes</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Total Bins</TableHead>
                            <TableHead className="hidden md:table-cell">Peso Neto</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingDispatches ? (
                             Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                        ) : (filteredDispatches || []).length > 0 ? (
                            filteredDispatches?.map(dispatch => (
                                <TableRow key={dispatch.id}>
                                    <TableCell className="font-medium">{dispatch.exporterName}</TableCell>
                                    <TableCell>{dispatch.createdAt?.toDate().toLocaleDateString()}</TableCell>
                                    <TableCell>{dispatch.totalBins}</TableCell>
                                    <TableCell className="hidden md:table-cell">{dispatch.totalNetWeight ? `${dispatch.totalNetWeight.toFixed(2)} kg` : '-'}</TableCell>
                                    <TableCell><Badge variant={dispatch.status === 'Completado' ? 'default' : 'secondary'}>{dispatch.status}</Badge></TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {dispatch.status === 'Pendiente de Picking' && (
                                            <>
                                            <Button variant="outline" size="sm" onClick={() => setPickingDispatch(dispatch)}>
                                                Hacer Picking
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm" disabled={isConfirming || isUndoing}>Deshacer</Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Deshacer la solicitud?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                           Esta acción cancelará la solicitud de despacho y devolverá los bins al stock.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleUndoDispatch(dispatch)} className="bg-destructive hover:bg-destructive/90">
                                                            Sí, Deshacer
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                            </>
                                        )}
                                        {dispatch.status === 'Completado' && (
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => handleExportDispatch(dispatch)}
                                                disabled={loadingReceptionLots || loadingProducers}
                                            >
                                                <Download className="mr-2 h-4 w-4" />
                                                Exportar
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    {showOnlyPending ? "No hay despachos pendientes." : "No hay despachos creados."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
      
      <DispatchPickingDialog
        dispatch={pickingDispatch}
        open={!!pickingDispatch}
        onOpenChange={(open) => !open && setPickingDispatch(null)}
        onConfirmDispatch={handleConfirmDispatch}
        isConfirming={isConfirming}
      />
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
