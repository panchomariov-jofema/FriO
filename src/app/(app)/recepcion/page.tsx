'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Exporter, Producer, ReceptionLot } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { LotList } from '@/components/reception/LotList';
import { useProducersByExporter } from '@/hooks/use-producers-by-exporter';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { receptionLotSchema } from '@/lib/schemas';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { ProducerCombobox } from '@/components/bins-materials/ProducerCombobox';

type LotFormValues = z.infer<typeof receptionLotSchema>;

export default function RecepcionPage() {
  const [selectedExporter, setSelectedExporter] = React.useState<string | null>(null);
  const { data: allExporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  
  const exporters = React.useMemo(() => {
    return allExporters.filter(e => e.status !== 'inactivo');
  }, [allExporters]);

  const { data: producers, loading: loadingProducers } = useProducersByExporter(selectedExporter);
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const form = useForm<LotFormValues>({
    resolver: zodResolver(receptionLotSchema),
    defaultValues: {
      document: '',
      variety: undefined,
      binCount: 0,
      toteCount: 0,
      laminaCount: 0,
      emptyTotes: 0,
      noTotes: 0,
    },
  });

  const binCount = form.watch('binCount');
  const selectedProducerId = form.watch('producerId');
  const isFormSubmitting = form.formState.isSubmitting;
  
  React.useEffect(() => {
    const numericBins = Number(binCount) || 0;
    if (!form.formState.dirtyFields.toteCount) {
      form.setValue('toteCount', numericBins * 24);
    }
    if (!form.formState.dirtyFields.laminaCount) {
      form.setValue('laminaCount', numericBins * 1);
    }
  }, [binCount, form]);

  // Set default exporter to SUBSOLE
  React.useEffect(() => {
    if (!loadingExporters && exporters.length > 0 && !selectedExporter) {
      const subsoleExporter = exporters.find(e => e.name.toUpperCase() === 'SUBSOLE');
      if (subsoleExporter) {
        setSelectedExporter(subsoleExporter.exporterId);
        form.setValue('exporterId', subsoleExporter.exporterId);
      }
    }
  }, [exporters, loadingExporters, selectedExporter, form]);

  const onSubmit = (values: LotFormValues) => {
    const currentProducerId = form.getValues('producerId');
    if (!selectedExporter || !currentProducerId) {
        toast({
            variant: 'destructive',
            title: 'Error de validación',
            description: 'Debe seleccionar un exportador y un productor.',
        });
        return;
    }
    
    const producer = producers.find(p => p.producerId === currentProducerId || p.id === currentProducerId);
    if (!producer) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo encontrar el productor seleccionado o está inactivo.' });
        return;
    }

    const displayLotId = `${producer.shortName}-${values.document}`;
    
    const totalWeight = values.totalWeight || 0;
    
    const netWeight = totalWeight > 0 
      ? totalWeight - (values.binCount * 65) + (values.noTotes || 0)
      : 0;

    const netWeightPerBin = (netWeight > 0 && values.binCount > 0)
      ? netWeight / values.binCount
      : 0;

    const lotData: Partial<ReceptionLot> = {
      document: values.document,
      displayLotId,
      exporterId: selectedExporter,
      producerId: producer.producerId,
      binCount: Number(values.binCount) || 0,
      toteCount: Number(values.toteCount) || 0,
      laminaCount: Number(values.laminaCount) || 0,
      emptyTotes: Number(values.emptyTotes) || 0,
      noTotes: Number(values.noTotes) || 0,
      status: 'Pendiente de Peso' as const,
      createdAt: serverTimestamp() as any,
      netWeightPerBin: netWeightPerBin > 0 ? netWeightPerBin : 0,
      userId: user?.uid || '',
      userName: user?.email || user?.displayName || 'Sistema',
    };

    const collRef = collection(firestore, 'receptionLots');
    addDoc(collRef, lotData)
      .then(() => {
        toast({ title: 'Éxito', description: `Recepción ${displayLotId} registrada correctamente.` });
        form.reset({
          document: '',
          variety: undefined,
          binCount: 0,
          toteCount: 0,
          laminaCount: 0,
          emptyTotes: 0,
          noTotes: 0,
          exporterId: selectedExporter,
          producerId: currentProducerId,
        });
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
          <CardTitle>Registrar Recepción (Retorno con Fruta)</CardTitle>
          <CardDescription>Complete los datos para registrar el retorno de bins, totes y láminas con fruta del productor.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:max-w-none max-w-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exporter-select">Exportador</Label>
                  <Select
                    value={selectedExporter ?? ''}
                    onValueChange={(value) => {
                        setSelectedExporter(value);
                        form.setValue('exporterId', value);
                        form.setValue('producerId', '');
                    }}
                    disabled={loadingExporters}
                  >
                    <SelectTrigger id="exporter-select" className="h-11 sm:h-10 text-base sm:text-sm">
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
                        <FormControl>
                            <ProducerCombobox
                                producers={producers}
                                value={field.value || null}
                                onSelect={(val) => field.onChange(val)}
                                disabled={!selectedExporter || loadingProducers}
                                loading={loadingProducers}
                                hasExporterSelected={!!selectedExporter}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="document" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>N° Guía / Documento</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} placeholder="Ej: 1234" autoComplete="off" inputMode="numeric" className="h-11 sm:h-10 text-base sm:text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="binCount" render={({ field }) => (
                  <FormItem className="border sm:border-none p-3 sm:p-0 rounded-lg bg-card sm:bg-transparent">
                    <FormLabel className="text-base sm:text-sm font-semibold sm:font-medium">Cantidad de Bins</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ''}
                        autoComplete="off"
                        inputMode="numeric"
                        min="0"
                        onFocus={(e) => e.target.select()}
                        className="h-12 sm:h-10 text-lg sm:text-sm font-semibold"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="toteCount" render={({ field }) => (
                  <FormItem className="border sm:border-none p-3 sm:p-0 rounded-lg bg-card sm:bg-transparent">
                    <FormLabel className="text-base sm:text-sm font-semibold sm:font-medium">
                      Cantidad de Totes <span className="text-muted-foreground font-normal">(x24)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ''}
                        autoComplete="off"
                        inputMode="numeric"
                        min="0"
                        onFocus={(e) => e.target.select()}
                        className="h-12 sm:h-10 text-lg sm:text-sm font-semibold"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="laminaCount" render={({ field }) => (
                  <FormItem className="border sm:border-none p-3 sm:p-0 rounded-lg bg-card sm:bg-transparent">
                    <FormLabel className="text-base sm:text-sm font-semibold sm:font-medium">
                      Cantidad de Láminas <span className="text-muted-foreground font-normal">(x1)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ''}
                        autoComplete="off"
                        inputMode="numeric"
                        min="0"
                        onFocus={(e) => e.target.select()}
                        className="h-12 sm:h-10 text-lg sm:text-sm font-semibold"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="emptyTotes" render={({ field }) => (
                  <FormItem className="border sm:border-none p-3 sm:p-0 rounded-lg bg-card sm:bg-transparent">
                    <FormLabel className="text-base sm:text-sm font-semibold sm:font-medium">
                      Totes Vacíos Adicionales <span className="text-muted-foreground font-normal">(Opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ''}
                        autoComplete="off"
                        inputMode="numeric"
                        min="0"
                        onFocus={(e) => e.target.select()}
                        className="h-12 sm:h-10 text-lg sm:text-sm font-semibold"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-start md:justify-end">
                <Button type="submit" disabled={isFormSubmitting || !selectedExporter || !selectedProducerId} className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-semibold">
                  {isFormSubmitting ? 'Guardando...' : 'Registrar Recepción'}
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