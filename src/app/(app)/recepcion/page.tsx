'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Exporter, Variety, Producer } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { LotList } from '@/components/reception/LotList';
import { useProducersByExporter } from '@/hooks/use-producers-by-exporter';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { receptionLotSchema } from '@/lib/schemas';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

const varieties: Variety[] = ['SANTINA', 'LAPINS', 'REGINA', 'KORDIA', 'SKEENA', 'SWEETHEART', 'SYLVIA', 'SUNBURST'];

type LotFormValues = z.infer<typeof receptionLotSchema>;

export default function RecepcionPage() {
  const [selectedExporter, setSelectedExporter] = React.useState<string | null>(null);
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: producers, loading: loadingProducers } = useProducersByExporter(selectedExporter);
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<LotFormValues>({
    resolver: zodResolver(receptionLotSchema),
    defaultValues: {
      document: '',
      variety: undefined,
      binCount: 0,
      toteCount: 0,
      emptyTotes: 0,
      noTotes: 0,
    },
  });

  const binCount = form.watch('binCount');
  const isFormSubmitting = form.formState.isSubmitting;
  
  React.useEffect(() => {
    if (!form.formState.dirtyFields.toteCount) {
      form.setValue('toteCount', binCount * 24);
    }
  }, [binCount, form]);

  const onSubmit = (values: LotFormValues) => {
    const selectedProducerId = form.getValues('producerId');
    if (!selectedExporter || !selectedProducerId) {
        toast({
            variant: 'destructive',
            title: 'Error de validación',
            description: 'Debe seleccionar un exportador y un productor.',
        });
        return;
    }
    
    const producer = producers.find(p => p.producerId === selectedProducerId);
    if (!producer) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar el productor seleccionado.' });
        return;
    }

    const displayLotId = `${producer.shortName}-${values.document}`;

    const lotData = {
      ...values,
      displayLotId,
      exporterId: selectedExporter,
      producerId: selectedProducerId,
      status: 'Pendiente de Peso' as const,
      createdAt: serverTimestamp(),
    };

    const collRef = collection(firestore, 'receptionLots');
    addDoc(collRef, lotData)
      .then(() => {
        toast({ title: 'Éxito', description: `Lote ${displayLotId} creado correctamente.` });
        form.reset({
          ...form.getValues(),
          document: '',
          variety: undefined,
          binCount: 0,
          toteCount: 0,
          emptyTotes: 0,
          noTotes: 0,
        });
        // Keep exporter and producer selected
        form.setValue('exporterId', selectedExporter);
        form.setValue('producerId', selectedProducerId);
      })
      .catch((error) => {
        console.error("Error creating lot: ", error);
        toast({
          variant: 'destructive',
          title: 'Error al crear el lote',
          description: error.message || 'No se pudo guardar el registro.',
        });
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: collRef.path,
            operation: 'create',
            requestResourceData: lotData,
          })
        );
      });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crear Lote de Recepción</CardTitle>
          <CardDescription>Complete los datos para registrar un nuevo lote de fruta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exporter-select">Exportador</Label>
                  <Select
                    value={selectedExporter ?? ''}
                    onValueChange={(value) => {
                        setSelectedExporter(value);
                        form.setValue('exporterId', value);
                        form.reset({ ...form.getValues(), producerId: undefined });
                    }}
                    disabled={loadingExporters}
                  >
                    <SelectTrigger id="exporter-select">
                      <SelectValue placeholder="Seleccione un exportador..." />
                    </SelectTrigger>
                    <SelectContent>
                      {exporters.map(e => (
                        <SelectItem key={e.id} value={e.exporterId}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FormField control={form.control} name="producerId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Productor</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!selectedExporter || loadingProducers}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione un productor..." />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {producers.map(p => (
                                <SelectItem key={p.id} value={p.producerId}>
                                    {p.shortName}
                                </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="document" render={({ field }) => (
                  <FormItem><FormLabel>Documento</FormLabel><FormControl><Input {...field} value={field.value || ''} autoComplete="off" inputMode="numeric" pattern="[0-9]*" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="variety" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Variedad</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione una variedad" /></SelectTrigger></FormControl>
                            <SelectContent>{varieties.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="binCount" render={({ field }) => (
                  <FormItem><FormLabel>Cantidad de Bins</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} autoComplete="off" inputMode="numeric" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="toteCount" render={({ field }) => (
                  <FormItem><FormLabel>Cantidad de Totes</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} autoComplete="off" inputMode="numeric" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="emptyTotes" render={({ field }) => (
                  <FormItem><FormLabel>Totes Vacíos (Opcional)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} autoComplete="off" inputMode="numeric" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="noTotes" render={({ field }) => (
                  <FormItem><FormLabel>Sin Totes (Opcional)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} autoComplete="off" inputMode="numeric" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isFormSubmitting || !selectedExporter || !form.getValues('producerId')}>
                  {isFormSubmitting ? 'Guardando...' : 'Crear Lote'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <LotList
        exporterId={selectedExporter}
      />
    </div>
  );
}
