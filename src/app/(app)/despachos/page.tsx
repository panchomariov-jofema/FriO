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
import { collection, query, where, writeBatch, serverTimestamp, doc, orderBy, deleteDoc, addDoc } from 'firebase/firestore';
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


function DespachosPageContent() {
  const { data: allExporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: allProducers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
  const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');

  const exporters = React.useMemo(() => allExporters.filter(e => e.status !== 'inactivo'), [allExporters]);
  const producers = React.useMemo(() => allProducers.filter(p => p.status !== 'inactivo'), [allProducers]);

  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isUndoing, setIsUndoing] = React.useState(false);
  const [dispatchToView, setDispatchToView] = React.useState<Dispatch | null>(null);
  const [showOnlyPending, setShowOnlyPending] = React.useState(true);
  const [showCherryOnly, setShowCherryOnly] = React.useState(false);
  
  const dispatchesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const collRef = collection(firestore, 'dispatches');
    if (showOnlyPending) {
      return query(collRef, where('status', '==', 'Pendiente de Picking'));
    }
    return query(collRef, orderBy('createdAt', 'desc'));
  }, [firestore, showOnlyPending, user]);
  
  const { data: dispatches, isLoading: loadingDispatches } = useCollection<Dispatch>(dispatchesQuery);

  const filteredDispatches = React.useMemo(() => {
    if (!dispatches) return [];
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
    return exporters?.find(e => e.exporterId === exporterId)?.name || exporterId;
  };

  const { binsPerChamber, binsPerExporter, binsPerProducer } = React.useMemo(() => {
    const activeExporterIds = new Set(exporters.map(e => e.exporterId));
    const activeProducerNames = new Set(producers.map(p => p.shortName));

    const storedLots = (chamberLots || [])
        .filter(lot => lot.status === 'Almacenado' && activeExporterIds.has(lot.exporterId));

    const storedOtherFruit = showCherryOnly ? [] : (otherFruitReceptions || [])
        .flatMap(r => (r.items || []).map(item => ({ ...item, reception: r })))
        .filter((item) => 
            item &&
            item.status === 'Almacenado' && 
            item.quantity > 0 && 
            item.storageLocation?.chamberId &&
            activeExporterIds.has(item.reception.clientId)
        );


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
      if (producerName && activeProducerNames.has(producerName)) {
          acc[producerName] = (acc[producerName] || 0) + lot.binCount;
      }
      return acc;
    }, {} as Record<string, number>);

    return { binsPerChamber: perChamber, binsPerExporter: perExporter, binsPerProducer: perProducer };
  }, [chamberLots, otherFruitReceptions, showCherryOnly, exporters, producers]);

  const onSubmit = async (values: DispatchFormValues) => {
    if (!firestore || !exporters || !chamberLots) return;
  
    const selectedExporter = exporters.find(e => e.exporterId === values.exporterId);
    if (!selectedExporter) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado o inactivo.' });
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
  
        await addDoc(collection(firestore, 'dispatches'), dispatchData);
        
        toast({
          title: 'Solicitud de Despacho Creada',
          description: `Se ha creado una solicitud con ${accumulatedBins} bins para ${selectedExporter.name}. La tarea está disponible en el módulo de Picking.`,
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

  const handleUndoDispatch = async (dispatchToUndo: Dispatch) => {
    if (!firestore) return;
    setIsUndoing(true);

    try {
      const dispatchRef = doc(firestore, 'dispatches', dispatchToUndo.id);
      await deleteDoc(dispatchRef);
      
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
      <div className="flex justify-end">
        <div className="flex items-center space-x-2">
          <Switch id="cherry-filter" checked={showCherryOnly} onChange={() => setShowCherryOnly(!showCherryOnly)} />
          <Label htmlFor="cherry-filter">Solo Cereza</Label>
        </div>
      </div>
      {/* Summary Cards */}
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
              <CardDescription>Lista de solicitudes creadas. El picking se realiza en el módulo de Socios Comerciales.</CardDescription>
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
                          <AlertDialog>
                              <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm">Deshacer</Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader>
                                      <AlertDialogTitle>¿Está seguro de deshacer esta solicitud?</AlertDialogTitle>
                                      <AlertDialogDescription>Esta acción eliminará la solicitud de despacho. No se puede revertir.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleUndoDispatch(dispatch)} disabled={isUndoing}>
                                          {isUndoing ? 'Deshaciendo...' : 'Sí, Deshacer'}
                                      </AlertDialogAction>
                                  </AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setDispatchToView(dispatch)}>Ver PDF</Button>
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
      
      {dispatchToView && (
        <DispatchPickingDialog 
            dispatch={dispatchToView}
            open={!!dispatchToView}
            onOpenChange={(open) => !open && setDispatchToView(null)}
            onConfirmDispatch={() => {}} // No-op, just for viewing
            isConfirming={false}
            isPickingMode={false} // Important: Disables confirmation functionality
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