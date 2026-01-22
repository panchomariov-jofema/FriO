'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Thermometer, Save } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, onSnapshot, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ChamberTemperature } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

const tempSchema = z.object({
  temperature: z.coerce.number({ invalid_type_error: 'Inválido' }),
});

type TempFormValues = z.infer<typeof tempSchema>;

interface ChamberTemperatureInputProps {
  chamberId: string;
}

export function ChamberTemperatureInput({ chamberId }: ChamberTemperatureInputProps) {
  const [latestTemp, setLatestTemp] = React.useState<ChamberTemperature | null>(null);
  const [isPopoverOpen, setPopoverOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const form = useForm<TempFormValues>({
    resolver: zodResolver(tempSchema),
    defaultValues: {
        temperature: undefined,
    }
  });
  
  React.useEffect(() => {
    if (!firestore) return;

    const q = query(
      collection(firestore, 'chamberTemperatures'),
      where('chamberId', '==', chamberId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const temps = snapshot.docs.map(doc => doc.data() as ChamberTemperature);
        temps.sort((a,b) => (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0));
        setLatestTemp(temps[0] || null);
      } else {
        setLatestTemp(null);
      }
    },
    (error) => {
        console.error(`Error fetching temperature for ${chamberId}:`, error);
        toast({ variant: 'destructive', title: 'Error de Temperatura', description: 'No se pudo cargar la última temperatura.'});
    });
    return () => unsubscribe();
  }, [firestore, chamberId, toast]);


  const onSubmit = async (values: TempFormValues) => {
    if (!firestore) return;

    const tempData = {
      chamberId,
      temperature: values.temperature,
      timestamp: serverTimestamp(),
      userId: user?.uid,
      userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName),
    };

    try {
      await addDoc(collection(firestore, 'chamberTemperatures'), tempData);
      toast({ title: 'Éxito', description: `Temperatura para ${chamberId} guardada.` });
      setPopoverOpen(false);
    } catch (error) {
      console.error('Error saving temperature:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la temperatura.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'chamberTemperatures',
        operation: 'create',
        requestResourceData: tempData,
      }));
    }
  };
  
  React.useEffect(() => {
    if (!isPopoverOpen) {
      form.reset({ temperature: undefined });
    }
  }, [isPopoverOpen, form]);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          onClick={(e) => { e.stopPropagation(); setPopoverOpen(true); }}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'flex items-center gap-2 text-muted-foreground'
          )}
        >
          <Thermometer className="h-4 w-4" />
          <span className="font-mono text-sm">{latestTemp ? `${latestTemp.temperature.toFixed(1)}°C` : '--.- °C'}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" onClick={(e) => e.stopPropagation()}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2">
            <FormField
              control={form.control}
              name="temperature"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Temp °C"
                      className="h-8"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <Button type="submit" size="icon" className="h-8 w-8">
              <Save className="h-4 w-4" />
            </Button>
          </form>
        </Form>
      </PopoverContent>
    </Popover>
  );
}
