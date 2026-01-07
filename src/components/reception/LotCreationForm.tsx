'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { receptionLotSchema } from '@/lib/schemas';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface LotCreationFormProps {
  exporterId: string;
  producerId: string;
  onLotCreated: () => void;
}

type LotFormValues = z.infer<typeof receptionLotSchema>;

export function LotCreationForm({ exporterId, producerId, onLotCreated }: LotCreationFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const form = useForm<LotFormValues>({
    resolver: zodResolver(receptionLotSchema),
    defaultValues: {
      exporterId,
      producerId,
      document: '',
      variety: '',
      binCount: 0,
      toteCount: 0,
      emptyTotes: 0,
      status: 'Pendiente de Peso',
      createdAt: null,
    },
  });

  const binCount = form.watch('binCount');

  React.useEffect(() => {
    form.setValue('toteCount', binCount * 24);
  }, [binCount, form]);
  
  React.useEffect(() => {
    form.reset({
      exporterId,
      producerId,
      document: '',
      variety: '',
      binCount: 0,
      toteCount: 0,
      emptyTotes: 0,
      status: 'Pendiente de Peso',
      createdAt: null,
    })
  }, [exporterId, producerId, form]);

  const onSubmit = async (values: LotFormValues) => {
    const lotData = {
      ...values,
      status: 'Pendiente de Peso' as const,
      createdAt: serverTimestamp(),
    };
    
    const collRef = collection(firestore, 'receptionLots');
    addDoc(collRef, lotData)
      .then(() => {
        toast({ title: 'Éxito', description: 'Lote creado correctamente.' });
        form.reset();
        onLotCreated();
      })
      .catch((error) => {
        console.error("Error creating lot: ", error);
        toast({
          title: 'Error',
          description: 'No se pudo crear el lote. Verifique la consola para más detalles.',
          variant: 'destructive',
        });
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear Nuevo Lote</CardTitle>
        <CardDescription>Ingrese los detalles para registrar un nuevo lote de fruta.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="document" render={({ field }) => (
              <FormItem><FormLabel>Documento</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="variety" render={({ field }) => (
              <FormItem><FormLabel>Variedad</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="binCount" render={({ field }) => (
              <FormItem><FormLabel>Cantidad de Bins</FormLabel><FormControl><Input type="number" {...field} value={field.value || 0} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="toteCount" render={({ field }) => (
              <FormItem><FormLabel>Cantidad de Totes</FormLabel><FormControl><Input type="number" {...field} value={field.value || 0} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="emptyTotes" render={({ field }) => (
              <FormItem><FormLabel>Totes Vacíos (Opcional)</FormLabel><FormControl><Input type="number" {...field} value={field.value || 0} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Guardando...' : 'Guardar Lote'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
