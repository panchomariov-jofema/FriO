'use client';

import * as React from 'react';
import { z } from 'zod';
import { useFieldArray, useForm, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { packagingExitSchema, type StockLocation } from '@/lib/schemas';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface SelectLocationDialogProps {
  itemIndex: number | null;
  onClose: () => void;
  form: UseFormReturn<z.infer<typeof packagingExitSchema>>;
  stockByMaterial: Record<string, StockLocation[]>;
}

const locationSelectionSchema = z.object({
  locations: z.array(z.object({
    receptionId: z.string(),
    location: z.string(),
    available: z.number(),
    palletsToWithdraw: z.coerce.number().min(0),
  })).refine(
      (locations) => locations.some(loc => loc.palletsToWithdraw > 0), 
      { message: "Debe retirar al menos 1 pallet." }
  ).refine(
      (locations) => locations.every(loc => loc.palletsToWithdraw <= loc.available),
      { message: "No puede retirar más pallets de los disponibles en una ubicación." }
  ),
});

type LocationFormValues = z.infer<typeof locationSelectionSchema>;

export function SelectLocationDialog({ itemIndex, onClose, form: exitForm, stockByMaterial }: SelectLocationDialogProps) {
  const item = itemIndex !== null ? exitForm.getValues(`items.${itemIndex}`) : null;
  const availableStock = item ? stockByMaterial[item.packagingMasterId] || [] : [];
  
  const locationForm = useForm<LocationFormValues>({
    resolver: zodResolver(locationSelectionSchema),
    defaultValues: {
      locations: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: locationForm.control,
    name: 'locations',
  });
  
  React.useEffect(() => {
    if (itemIndex !== null) {
      const existingLocations = exitForm.getValues(`items.${itemIndex}.locations`);
      
      const enrichedLocations = availableStock.map(stockLoc => {
        const existing = existingLocations.find(l => l.receptionId === stockLoc.receptionId);
        return {
          ...stockLoc,
          palletsToWithdraw: existing ? existing.palletsToWithdraw : 0,
        };
      });

      replace(enrichedLocations);
    }
  }, [itemIndex, availableStock, replace, exitForm]);

  const onSubmit = (values: LocationFormValues) => {
    if (itemIndex === null) return;
    const locationsToSave = values.locations.filter(loc => loc.palletsToWithdraw > 0);
    exitForm.setValue(`items.${itemIndex}.locations`, locationsToSave, { shouldValidate: true, shouldDirty: true });
    onClose();
  };

  if (itemIndex === null || !item) {
    return null;
  }
  
  const totalAvailable = availableStock.reduce((sum, loc) => sum + loc.available, 0);

  return (
    <Dialog open={itemIndex !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seleccionar Stock para: {item.packagingMasterName}</DialogTitle>
          <DialogDescription>Total disponible: {totalAvailable} pallets. Especifique cuántos pallets retirar de cada ubicación.</DialogDescription>
        </DialogHeader>
        <Form {...locationForm}>
          <form onSubmit={locationForm.handleSubmit(onSubmit)} className="space-y-4 py-4">
             <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Disp.</TableHead>
                    <TableHead className="w-[120px]">A Retirar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>{field.location}</TableCell>
                      <TableCell>{field.available}</TableCell>
                      <TableCell>
                        <FormField
                          control={locationForm.control}
                          name={`locations.${index}.palletsToWithdraw`}
                          render={({ field: inputField }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" {...inputField} max={field.available} min={0} autoComplete="off" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
             {locationForm.formState.errors.locations?.root && (
                <p className="text-sm font-medium text-destructive">{locationForm.formState.errors.locations.root.message}</p>
             )}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit">Confirmar Cantidades</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    