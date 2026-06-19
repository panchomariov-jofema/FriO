'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Thermometer, Save, Droplets } from 'lucide-react';
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
  humidity: z.coerce.number({ invalid_type_error: 'Inválido' })
    .min(0, 'Mínimo 0%')
    .max(100, 'Máximo 100%'),
});

type TempFormValues = z.infer<typeof tempSchema>;

interface ChamberTemperatureInputProps {
  chamberId: string;
  readOnly?: boolean;
}

export function ChamberTemperatureInput({ chamberId, readOnly = false }: ChamberTemperatureInputProps) {
  const [latestTemp, setLatestTemp] = React.useState<ChamberTemperature | null>(null);
  const [isPopoverOpen, setPopoverOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const form = useForm<TempFormValues>({
    resolver: zodResolver(tempSchema),
    defaultValues: {
        temperature: undefined,
        humidity: undefined,
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
        toast({ variant: 'destructive', title: 'Error de Temperatura', description: 'No se pudo cargar la última temperatura y humedad.'});
    });
    return () => unsubscribe();
  }, [firestore, chamberId, toast]);


  const onSubmit = async (values: TempFormValues) => {
    if (!firestore) return;

    const tempData = {
      chamberId,
      temperature: values.temperature,
      humidity: values.humidity,
      timestamp: serverTimestamp(),
      userId: user?.uid,
      userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName),
    };

    try {
      await addDoc(collection(firestore, 'chamberTemperatures'), tempData);
      toast({ title: 'Éxito', description: `Temperatura y humedad para ${chamberId} guardadas.` });
      setPopoverOpen(false);
    } catch (error) {
      console.error('Error saving temperature/humidity:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la temperatura y humedad.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'chamberTemperatures',
        operation: 'create',
        requestResourceData: tempData,
      }));
    }
  };
  
  React.useEffect(() => {
    if (!isPopoverOpen) {
      form.reset({ temperature: undefined, humidity: undefined });
    }
  }, [isPopoverOpen, form]);

  const content = (
    <div
      role={readOnly ? undefined : "button"}
      onClick={!readOnly ? (e) => { e.stopPropagation(); setPopoverOpen(true); } : undefined}
      className={cn(
        'flex items-center gap-4 text-muted-foreground transition-colors rounded-md px-2 py-1',
        !readOnly && 'hover:bg-muted cursor-pointer'
      )}
    >
      <div className="flex items-center gap-1">
        <Thermometer className="h-4 w-4 text-blue-500" />
        <span className="font-mono text-sm">{latestTemp ? `${latestTemp.temperature.toFixed(1)}°C` : '--.- °C'}</span>
      </div>
      <div className="flex items-center gap-1">
        <Droplets className="h-4 w-4 text-sky-500" />
        <span className="font-mono text-sm">{latestTemp && latestTemp.humidity !== undefined ? `${latestTemp.humidity}% HR` : '--% HR'}</span>
      </div>
    </div>
  );

  if (readOnly) {
    return content;
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        {content}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" onClick={(e) => e.stopPropagation()}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
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
              <FormField
                control={form.control}
                name="humidity"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        placeholder="Humedad %"
                        className="h-8"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" size="sm" className="w-full h-8">
              <Save className="h-4 w-4 mr-2" />
              Guardar Registro
            </Button>
          </form>
        </Form>
      </PopoverContent>
    </Popover>
  );
}
