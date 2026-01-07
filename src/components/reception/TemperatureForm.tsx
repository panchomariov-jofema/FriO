'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../ui/dialog';

interface TemperatureFormProps {
  lot: ReceptionLot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTempSaved: () => void;
}

const tempSchema = z.object({
  preHydroTemp: z.coerce.number({invalid_type_error: 'Debe ingresar un número.'}).optional(),
  postHydroTemp: z.coerce.number({invalid_type_error: 'Debe ingresar un número.'}).optional(),
});

type TempFormValues = z.infer<typeof tempSchema>;

export function TemperatureForm({ lot, open, onOpenChange, onTempSaved }: TemperatureFormProps) {
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
    if (open) {
        form.reset({
          preHydroTemp: lot.preHydroTemp || undefined,
          postHydroTemp: lot.postHydroTemp || undefined,
        });
    }
  }, [lot, open, form]);

  const showPreHydro = lot.status === 'Pendiente de Pre-Hidro';
  const showPostHydro = lot.status === 'Pendiente de Post-Hidro';
  
  const onSubmit = (values: TempFormValues) => {
    const lotRef = doc(firestore, 'receptionLots', lot.id);

    if (showPreHydro) {
      if (typeof values.preHydroTemp !== 'number') {
        form.setError('preHydroTemp', { message: 'Debe ingresar un valor.'});
        return;
      }
      const updateData = {
        preHydroTemp: values.preHydroTemp,
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

    } else if (showPostHydro) {
        if (typeof values.postHydroTemp !== 'number') {
            form.setError('postHydroTemp', { message: 'Debe ingresar un valor.'});
            return;
        }
        const updateData = {
            postHydroTemp: values.postHydroTemp,
        };

        updateDoc(lotRef, updateData)
        .then(() => {
            toast({ title: 'Éxito', description: 'Temperatura Post-Hidro guardada.' });
            // No cerramos el diálogo aquí, el usuario debe hacer clic en TERMINAR
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
    }
  };

  const handleFinish = () => {
    const lotRef = doc(firestore, 'receptionLots', lot.id);
    const updateData = {
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
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
            <DialogTitle>Registro de Temperatura</DialogTitle>
            <DialogDescription>Lote ID: <span className="font-mono">{lot.id}</span></DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {showPreHydro && (
              <div className="space-y-4">
                <FormField control={form.control} name="preHydroTemp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura Pre-Hidro (°C)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                  <Button type="submit">Guardar y Continuar</Button>
                </DialogFooter>
              </div>
            )}
            {showPostHydro && (
              <div className="space-y-4">
                 <FormField control={form.control} name="postHydroTemp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperatura Post-Hidro (°C)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} autoComplete="off" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cerrar</Button></DialogClose>
                    <Button type="submit" disabled={form.formState.isSubmitting}>Guardar Temperatura</Button>
                    <Button onClick={handleFinish} disabled={typeof lot.postHydroTemp !== 'number'}>TERMINAR</Button>
                </DialogFooter>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
