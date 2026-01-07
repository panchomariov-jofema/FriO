'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface TemperatureFormProps {
  lot: ReceptionLot;
  onTempSaved: () => void;
}

const tempSchema = z.object({
  preHydroTemp: z.coerce.number().optional(),
  postHydroTemp: z.coerce.number().optional(),
});

type TempFormValues = z.infer<typeof tempSchema>;

export function TemperatureForm({ lot, onTempSaved }: TemperatureFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const form = useForm<TempFormValues>({
    resolver: zodResolver(tempSchema),
    defaultValues: {
      preHydroTemp: lot.preHydroTemp || undefined,
      postHydroTemp: lot.postHydroTemp || undefined,
    },
  });
  
  React.useEffect(() => {
    form.reset({
      preHydroTemp: lot.preHydroTemp || undefined,
      postHydroTemp: lot.postHydroTemp || undefined,
    });
  }, [lot, form]);

  const showPreHydro = lot.status === 'Pendiente de Pre-Hidro';
  const showPostHydro = lot.status === 'Pendiente de Post-Hidro';

  const handleSavePreHydro = async () => {
    const { preHydroTemp } = form.getValues();
    if (typeof preHydroTemp !== 'number') {
      form.setError('preHydroTemp', { message: 'Debe ingresar un valor.'});
      return;
    }

    const lotRef = doc(firestore, 'receptionLots', lot.id);
    const updateData = {
      preHydroTemp,
      status: 'Pendiente de Post-Hidro' as const,
    };
    
    updateDoc(lotRef, updateData)
      .then(() => {
        toast({ title: 'Éxito', description: 'Temperatura Pre-Hidro guardada.' });
        onTempSaved();
      })
      .catch((error) => {
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: lotRef.path,
            operation: 'update',
            requestResourceData: updateData,
          })
        );
      });
  };

  const handleFinish = async () => {
    const { postHydroTemp } = form.getValues();
     if (typeof postHydroTemp !== 'number') {
      form.setError('postHydroTemp', { message: 'Debe ingresar un valor.'});
      return;
    }

    const lotRef = doc(firestore, 'receptionLots', lot.id);
    const updateData = {
      postHydroTemp,
      status: 'Cerrado' as const,
    };

    updateDoc(lotRef, updateData)
     .then(() => {
        toast({ title: 'Éxito', description: 'Lote cerrado correctamente.' });
        onTempSaved();
      })
      .catch((error) => {
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: lotRef.path,
            operation: 'update',
            requestResourceData: updateData,
          })
        );
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de Temperatura</CardTitle>
        <CardDescription>Lote ID: <span className="font-mono">{lot.id}</span></CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-4">
            {showPreHydro && (
              <div className="space-y-4">
                <FormField control={form.control} name="preHydroTemp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura Pre-Hidro (°C)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value || ''} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button onClick={form.handleSubmit(handleSavePreHydro)}>Guardar Temp. Pre-Hidro</Button>
              </div>
            )}
            {showPostHydro && (
              <div className="space-y-4">
                 <FormField control={form.control} name="postHydroTemp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura Post-Hidro (°C)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value || ''} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button onClick={form.handleSubmit(handleFinish)}>TERMINAR</Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

    