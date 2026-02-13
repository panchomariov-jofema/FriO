'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { PackagingReceptionItem, Warehouse, Aisle } from '@/lib/types';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { naturalSort } from '@/lib/utils';
import { Input } from '../ui/input';
import { PlusCircle, Trash2 } from 'lucide-react';

interface StorePackagingDialogProps {
  item: (PackagingReceptionItem & { document?: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { locations: { warehouse: string; aisle: string; quantity: number }[] }) => void;
}

const locationSchema = z.object({
  warehouse: z.string().min(1, "Debe seleccionar un almacén."),
  aisle: z.string().min(1, "Debe seleccionar un pasillo."),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0."),
});

const storeSchema = z.object({
  locations: z.array(locationSchema).min(1, "Debe agregar al menos una ubicación."),
});


type StoreFormValues = z.infer<typeof storeSchema>;

export function StorePackagingDialog({ item, open, onOpenChange, onConfirm }: StorePackagingDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: { locations: [{ warehouse: '', aisle: '', quantity: 0 }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'locations',
  });

  const { data: warehouses, loading: loadingWarehouses } = useFirestoreCollection<Warehouse>('warehouses');
  const { data: allAisles, loading: loadingAisles } = useFirestoreCollection<Aisle>('aisles');
  
  const sortedWarehouses = React.useMemo(() => {
    if (!warehouses) return [];
    return [...warehouses].sort((a,b) => naturalSort(a.name, b.name));
  }, [warehouses]);
  
  const watchedLocations = form.watch('locations');

  const totalAssigned = React.useMemo(() => {
    return watchedLocations.reduce((sum, loc) => sum + (Number(loc.quantity) || 0), 0);
  }, [watchedLocations]);
  
  const remainingQuantity = item ? item.palletCount - totalAssigned : 0;

  React.useEffect(() => {
    if (open && item) {
      form.reset({ locations: [{ warehouse: '', aisle: '', quantity: item.palletCount }] });
    }
  }, [form, open, item]);

  const onSubmit = (values: StoreFormValues) => {
    if (totalAssigned > (item?.palletCount ?? 0)) {
        form.setError('locations', { message: `La cantidad total (${totalAssigned}) excede los pallets pendientes (${item?.palletCount}).`});
        return;
    }
     if (totalAssigned < (item?.palletCount ?? 0)) {
        form.setError('locations', { message: `Debe asignar todos los pallets pendientes. Faltan ${item?.palletCount! - totalAssigned}.`});
        return;
    }
    onConfirm(values);
  };
  
  const AislesSelect = ({ control, index }: { control: any, index: number }) => {
    const warehouseName = form.watch(`locations.${index}.warehouse`);
    const filteredAisles = React.useMemo(() => {
        if (!warehouseName || !allAisles || !warehouses) {
        return [];
        }
        const selectedWarehouse = warehouses.find(w => w.name === warehouseName);
        if (!selectedWarehouse) {
        return [];
        }
        return allAisles.filter(a => a.warehouseIds && a.warehouseIds.includes(selectedWarehouse.id))
        .sort((a,b) => naturalSort(a.name, b.name));
    }, [warehouseName, allAisles, warehouses]);

    return (
        <FormField
            control={control}
            name={`locations.${index}.aisle`}
            render={({ field }) => (
                <FormItem>
                    <FormLabel className={index > 0 ? 'sr-only' : ''}>Pasillo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingAisles || !warehouseName}>
                        <FormControl>
                            <SelectTrigger><SelectValue placeholder={!warehouseName ? 'Seleccione almacén' : 'Seleccione...'} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {filteredAisles.length > 0 ? (
                            filteredAisles.map(a => (
                                <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                            ))
                            ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">
                                {warehouseName ? "No hay pasillos." : "Seleccione almacén."}
                            </div>
                            )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )}
        />
    )
  }

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Almacenar Artículo</DialogTitle>
          <DialogDescription>
            Distribuya los <span className="font-bold">{item.palletCount}</span> pallets de <span className="font-semibold">{item.packagingMasterName}</span> en una o más ubicaciones.
          </DialogDescription>
        </DialogHeader>
        <div className="text-right font-medium">
            Pendientes por asignar: <span className={remainingQuantity < 0 ? 'text-destructive' : ''}>{remainingQuantity}</span>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            
             {fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2 p-3 border rounded-md">
                     <div className="flex-1 grid grid-cols-3 gap-4">
                        <FormField
                            control={form.control}
                            name={`locations.${index}.warehouse`}
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className={index > 0 ? 'sr-only' : ''}>Almacén</FormLabel>
                                <Select onValueChange={(value) => { field.onChange(value); form.setValue(`locations.${index}.aisle`, ''); }} value={field.value} disabled={loadingWarehouses}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {sortedWarehouses.map(w => (
                                        <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <AislesSelect control={form.control} index={index} />
                        <FormField
                            control={form.control}
                            name={`locations.${index}.quantity`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className={index > 0 ? 'sr-only' : ''}>Cantidad</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} autoComplete="off" inputMode='numeric' min="1" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                     <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1} className="mt-6">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
             ))}

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ warehouse: '', aisle: '', quantity: 0 })}
            >
                <PlusCircle className="mr-2 h-4 w-4" />
                Añadir Ubicación
            </Button>
            
            {form.formState.errors.locations?.root?.message && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.locations.root.message}</p>
            )}

            <DialogFooter className="pt-4 sticky bottom-0 bg-background">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
