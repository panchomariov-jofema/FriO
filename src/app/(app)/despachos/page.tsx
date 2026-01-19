
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
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, writeBatch, serverTimestamp, doc, addDoc, getDoc } from 'firebase/firestore';
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


export default function DespachosPage() {
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: receptionLots, loading: loadingReceptionLots } = useFirestoreCollection<ReceptionLot>('receptionLots');
  const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isUndoing, setIsUndoing] = React.useState(false);
  const [pickingDispatch, setPickingDispatch] = React.useState<Dispatch | null>(null);

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

  const { binsPerChamber, binsPerExporter } = React.useMemo(() => {
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

    return { binsPerChamber: perChamber, binsPerExporter: perExporter };
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

        // 2. Sort the grouped lots by receptionDate (FIFO)
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
  
        // 4. Create batch and dispatch document
        const batch = writeBatch(firestore);
        let totalNetWeight = 0;

        const dispatchBinsPayload = binsToDispatch.map(lot => {
            const lotRef = doc(firestore, 'chamberLots', lot.id);
            batch.update(lotRef, { status: 'Despachado' });

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
          status: 'Pendiente de Salida' as const,
          createdAt: serverTimestamp(),
          bins: dispatchBinsPayload,
        };
  
        const dispatchRef = doc(collection(firestore, 'dispatches'));
        batch.set(dispatchRef, dispatchData);
  
        await batch.commit();
        
        toast({
          title: 'Despacho Creado',
          description: `Se ha creado un despacho con ${accumulatedBins} bins para ${selectedExporter.name}.`,
        });
        form.reset({ exporterId: undefined, packingId: undefined, maxBins: 0 });
  
    } catch (error: any) {
        console.error("Error creating dispatch:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al crear el despacho.' });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: 'dispatches or chamberLots',
                operation: 'write',
            })
        );
    }
  };

  const handleConfirmDispatch = async (dispatchToConfirm: Dispatch) => {
    if (!firestore) return;
    setIsConfirming(true);

    try {
        const batch = writeBatch(firestore);

        const lotsToDelete = dispatchToConfirm.bins.map(bin => bin.chamberLotId);
        const uniqueLotsToDelete = [...new Set(lotsToDelete)];

        for (const lotId of uniqueLotsToDelete) {
             const lotRef = doc(firestore, 'chamberLots', lotId);
             const lotDoc = await getDoc(lotRef);
             if (lotDoc.exists() && lotDoc.data().status === 'Despachado') {
                 batch.delete(lotRef);
             }
        }

        const dispatchRef = doc(firestore, 'dispatches', dispatchToConfirm.id);
        batch.update(dispatchRef, { status: 'Completado' });

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

        // Revert chamber lots
        for (const bin of dispatchToUndo.bins) {
            const lotRef = doc(firestore, 'chamberLots', bin.chamberLotId);
            const lotDoc = await getDoc(lotRef);
            
            if (lotDoc.exists()) {
                const currentLot = lotDoc.data() as ChamberLot;
                if (currentLot.status === 'Despachado') {
                    // If it was fully dispatched, just revert status
                    batch.update(lotRef, { status: 'Almacenado' });
                } else {
                    // This case is now less likely as we don't split lots, but keep as safeguard
                    batch.update(lotRef, { binCount: currentLot.binCount + bin.binCount });
                }
            } else {
              // This case shouldn't happen if dispatch is 'Pendiente', but as a safeguard
              console.warn(`Lot ${bin.chamberLotId} not found, cannot undo.`);
            }
        }

        // Delete the dispatch document
        const dispatchRef = doc(firestore, 'dispatches', dispatchToUndo.id);
        batch.delete(dispatchRef);

        await batch.commit();

        toast({
            title: 'Despacho Deshecho',
            description: `El despacho para ${dispatchToUndo.exporterName} ha sido cancelado y el stock restaurado.`,
        });

    } catch (error: any) {
        console.error("Error undoing dispatch:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al deshacer el despacho.' });
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: 'dispatches or chamberLots',
                operation: 'write',
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


  const summaryIsLoading = loadingChamberLots || loadingExporters;
  const sortedDispatches = React.useMemo(() => {
    if (!dispatches) return [];
    return [...dispatches].sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toMillis() - a.createdAt.toMillis();
    });
  }, [dispatches]);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
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
      </div>

    <Tabs defaultValue="automatico" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="automatico">Despacho Automático</TabsTrigger>
            <TabsTrigger value="manual">Despacho Manual</TabsTrigger>
        </TabsList>
        <TabsContent value="automatico">
            <Card>
                <CardHeader>
                <CardTitle>Crear Nuevo Despacho Automático</CardTitle>
                <CardDescription>
                    Seleccione un cliente y la cantidad de bins a despachar. El sistema asignará los lotes más antiguos (FIFO) sin dividirlos.
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
                                <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <Button type="submit" disabled={form.formState.isSubmitting} className="lg:col-span-1">
                            {form.formState.isSubmitting ? 'Procesando...' : 'Crear Despacho'}
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
            <CardTitle>Despachos Creados</CardTitle>
            <CardDescription>Lista de despachos pendientes y completados.</CardDescription>
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
                        ) : sortedDispatches.length > 0 ? (
                            sortedDispatches.map(dispatch => (
                                <TableRow key={dispatch.id}>
                                    <TableCell className="font-medium">{dispatch.exporterName}</TableCell>
                                    <TableCell>{dispatch.createdAt?.toDate().toLocaleDateString()}</TableCell>
                                    <TableCell>{dispatch.totalBins}</TableCell>
                                    <TableCell className="hidden md:table-cell">{dispatch.totalNetWeight ? `${dispatch.totalNetWeight.toFixed(2)} kg` : '-'}</TableCell>
                                    <TableCell><Badge variant={dispatch.status === 'Completado' ? 'default' : 'secondary'}>{dispatch.status}</Badge></TableCell>
                                    <TableCell className="text-right space-x-2">
                                        {dispatch.status === 'Pendiente de Salida' && (
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
                                                        <AlertDialogTitle>¿Deshacer el despacho?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                           Esta acción cancelará el despacho y restaurará el stock a su estado original. Los bins volverán a estar disponibles.
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
                                <TableCell colSpan={6} className="h-24 text-center">No hay despachos creados.</TableCell>
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
