'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Exporter, OtherClient, ClientStorageConfig } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { chambersConfig } from '@/lib/chambers-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const configSchema = z.object({
  clientId: z.string({ required_error: 'Debe seleccionar un cliente.' }),
  strategy: z.enum(['secuencial', 'fifo', 'aisle-access', 'horizontal-secuencial', 'inverted-secuencial']).default('secuencial'),
  binsPerCoordinate: z.coerce.number().min(1).max(20).default(6),
  palletsPerCoordinate: z.coerce.number().min(1).max(10).default(3),
  chamberOverrides: z.record(z.coerce.number()).optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

interface ClientStorageConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientStorageConfigDialog({ open, onOpenChange }: ClientStorageConfigDialogProps) {
  const { data: configs, loading: loadingConfigs } = useFirestoreCollection<ClientStorageConfig>('clientStorageConfigs');
  const { data: exporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: otherClients } = useFirestoreCollection<OtherClient>('otherClients');
  
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      strategy: 'secuencial',
      binsPerCoordinate: 6,
      palletsPerCoordinate: 3,
      chamberOverrides: {},
    },
  });

  const allClients = React.useMemo(() => {
    const clients = [
      ...(exporters || []).map(e => ({ id: e.id, name: e.name, type: 'Exportador' })),
      ...(otherClients || []).map(c => ({ id: c.id, name: c.name, type: 'Otro Cliente' })),
    ];
    return clients.sort((a, b) => a.name.localeCompare(b.name));
  }, [exporters, otherClients]);

  const handleEdit = (config: ClientStorageConfig) => {
    setEditingId(config.id);
    form.reset({
      clientId: config.id,
      strategy: config.strategy,
      binsPerCoordinate: config.binsPerCoordinate,
      palletsPerCoordinate: config.palletsPerCoordinate,
      chamberOverrides: config.chamberOverrides || {},
    });
  };

  const handleNew = () => {
    setEditingId('new');
    form.reset({
      clientId: '',
      strategy: 'secuencial',
      binsPerCoordinate: 6,
      palletsPerCoordinate: 3,
      chamberOverrides: {},
    });
  };

  const onSubmit = async (values: ConfigFormValues) => {
    if (!firestore) return;

    const client = allClients.find(c => c.id === values.clientId);
    if (!client) return;

    const configRef = doc(firestore, 'clientStorageConfigs', values.clientId);
    const configData: ClientStorageConfig = {
      id: values.clientId,
      clientName: client.name,
      strategy: values.strategy,
      binsPerCoordinate: values.binsPerCoordinate,
      palletsPerCoordinate: values.palletsPerCoordinate,
      chamberOverrides: values.chamberOverrides,
    };

    try {
      await setDoc(configRef, configData);
      toast({ title: 'Configuración Guardada', description: `Se ha actualizado la logística para ${client.name}.` });
      setEditingId(null);
    } catch (error) {
      console.error("Error saving config:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la configuración.' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    if (!confirm('¿Está seguro de eliminar esta configuración?')) return;

    try {
      await deleteDoc(doc(firestore, 'clientStorageConfigs', id));
      toast({ title: 'Eliminado', description: 'Configuración eliminada correctamente.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Centro de Control Logístico</DialogTitle>
          <DialogDescription>
            Defina modelos de almacenamiento y capacidades reservadas por cliente.
          </DialogDescription>
        </DialogHeader>

        {!editingId ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleNew}>Nueva Configuración</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configs?.map(config => (
                <Card key={config.id} className="hover:border-primary transition-colors">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-lg">{config.clientName}</h4>
                        <p className="text-sm text-muted-foreground">Estrategia: <span className="capitalize">{config.strategy}</span></p>
                        <p className="text-sm text-muted-foreground">Densidad: {config.binsPerCoordinate} Bins / {config.palletsPerCoordinate} Pallets</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(config)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(config.id)}>Borrar</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {configs?.length === 0 && (
                <div className="col-span-2 py-12 text-center text-muted-foreground">
                  No hay configuraciones personalizadas. Se usará el estándar.
                </div>
              )}
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value} 
                        disabled={editingId !== 'new'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un cliente..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allClients.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name} ({client.type})
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
                  name="strategy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estrategia de Almacenamiento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="secuencial">Lineal (A1 &rarr; L12)</SelectItem>
                          <SelectItem value="horizontal-secuencial">Horizontal (A1 &rarr; E1)</SelectItem>
                          <SelectItem value="inverted-secuencial">Invertido (A12 &rarr; A1)</SelectItem>
                          <SelectItem value="fifo">FIFO (Serpiente)</SelectItem>
                          <SelectItem value="aisle-access">Acceso Pasillos (Muestreo SAG)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="binsPerCoordinate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bins por Coordenada</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Estándar: 6. Fall Creek: 9.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="palletsPerCoordinate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pallets por Coordenada</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Estándar: 3. Fall Creek: 3.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold text-sm border-b pb-2">Capacidades Reales / Reservadas en Cámaras</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.values(chambersConfig).map(chamber => (
                    <FormField
                      key={chamber.id}
                      control={form.control}
                      name={`chamberOverrides.${chamber.id}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs uppercase">{chamber.name}</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="600" 
                              {...field} 
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Volver</Button>
                <Button type="submit">Guardar Cambios</Button>
              </div>
            </form>
          </Form>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
