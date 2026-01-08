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
import type { ChamberLot, Dispatch, Exporter } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, writeBatch, serverTimestamp, doc, addDoc } from 'firebase/firestore';
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

const dispatchSchema = z.object({
  exporterId: z.string().min(1, 'Debe seleccionar un cliente.'),
  maxBins: z.coerce
    .number({ invalid_type_error: 'Debe ser un número.' })
    .positive('La cantidad de bins debe ser mayor a 0.'),
});

type DispatchFormValues = z.infer<typeof dispatchSchema>;

export default function DespachosPage() {
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<DispatchFormValues>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: {
      exporterId: undefined,
      maxBins: 0,
    },
  });

  const onSubmit = async (values: DispatchFormValues) => {
    if (!firestore) return;

    const selectedExporter = exporters.find(e => e.exporterId === values.exporterId);
    if (!selectedExporter) {
        toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado.' });
        return;
    }

    try {
      // 1. Find available bins for the exporter, ordered by FIFO (storedAt)
      const chamberLotsRef = collection(firestore, 'chamberLots');
      const q = query(
        chamberLotsRef,
        where('exporterId', '==', values.exporterId),
        where('status', '==', 'Almacenado')
      );
      
      const querySnapshot = await getDocs(q);
      
      const availableLots = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as ChamberLot))
        .sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis());

      if (availableLots.length === 0) {
        toast({ variant: 'destructive', title: 'Sin Stock', description: 'No hay bins disponibles para este cliente.' });
        form.reset();
        return;
      }
      
      // 2. Select bins up to the requested quantity
      let binsToDispatch = [];
      let binsCount = 0;
      for (const lot of availableLots) {
        if (binsCount >= values.maxBins) break;

        const binsNeeded = values.maxBins - binsCount;
        const binsFromLot = Math.min(lot.binCount, binsNeeded);
        
        binsToDispatch.push({
            chamberLotId: lot.id,
            displayLotId: lot.displayLotId,
            chamberId: lot.chamberId!,
            coordinate: lot.coordinate!,
            binCount: binsFromLot,
        });

        binsCount += binsFromLot;
      }

      const actualTotalBins = binsToDispatch.reduce((sum, bin) => sum + bin.binCount, 0);

      // 3. Create dispatch record and update bin status in a batch
      const batch = writeBatch(firestore);

      const dispatchData = {
        exporterId: selectedExporter.exporterId,
        exporterName: selectedExporter.name,
        totalBins: actualTotalBins,
        status: 'Pendiente de Salida' as const,
        createdAt: serverTimestamp(),
        bins: binsToDispatch,
      };

      const dispatchRef = doc(collection(firestore, 'dispatches'));
      batch.set(dispatchRef, dispatchData);

      // 4. Update the status of the used chamberLots
      binsToDispatch.forEach(binInfo => {
        const lotRef = doc(firestore, 'chamberLots', binInfo.chamberLotId);
        batch.update(lotRef, { status: 'Despachado' });
      });

      await batch.commit();
      
      toast({
        title: 'Despacho Creado',
        description: `Se ha creado un despacho con ${actualTotalBins} bins para ${selectedExporter.name}.`,
      });
      form.reset({ exporterId: undefined, maxBins: 0 });

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Crear Nuevo Despacho</CardTitle>
          <CardDescription>
            Seleccione un cliente y la cantidad de bins a despachar. El sistema asignará los lotes más antiguos (FIFO).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid sm:grid-cols-3 gap-4 items-end">
              <FormField
                control={form.control}
                name="exporterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente (Exportador)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingExporters}>
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
                name="maxBins"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad Máxima de Bins</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Procesando...' : 'Crear Despacho'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
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
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Detalles</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingDispatches ? (
                             Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                        ) : dispatches.length > 0 ? (
                            dispatches.map(dispatch => (
                                <TableRow key={dispatch.id}>
                                    <TableCell className="font-medium">{dispatch.exporterName}</TableCell>
                                    <TableCell>{dispatch.createdAt?.toDate().toLocaleDateString()}</TableCell>
                                    <TableCell>{dispatch.totalBins}</TableCell>
                                    <TableCell><Badge variant={dispatch.status === 'Completado' ? 'default' : 'secondary'}>{dispatch.status}</Badge></TableCell>
                                    <TableCell className="text-right">
                                       <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                             <Button variant="outline" size="sm">Ver Bins</Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Bins en Despacho para {dispatch.exporterName}</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                 Total: {dispatch.totalBins} bins.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <div className="max-h-60 overflow-y-auto border rounded-md">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Lote</TableHead>
                                                            <TableHead>Cámara</TableHead>
                                                            <TableHead>Coord.</TableHead>
                                                            <TableHead>Bins</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {dispatch.bins.map((bin, index) => (
                                                            <TableRow key={index}>
                                                                <TableCell>{bin.displayLotId}</TableCell>
                                                                <TableCell>{bin.chamberId}</TableCell>
                                                                <TableCell>{bin.coordinate}</TableCell>
                                                                <TableCell>{bin.binCount}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cerrar</AlertDialogCancel>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">No hay despachos creados.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

    