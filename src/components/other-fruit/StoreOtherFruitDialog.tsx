'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OtherFruitReception, ChamberLot, OtherFruitReceptionItem } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { useToast } from '@/hooks/use-toast';
import { naturalSort } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';

interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientName: string;
    document: string;
    itemIndex: number;
    unit: 'Bins' | 'Pallets';
}

interface StoreOtherFruitDialogProps {
  item: PendingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { chamberId: string; coordinate: string; quantity: number }) => void;
  allReceptions: OtherFruitReception[];
  allChamberLots: ChamberLot[];
}

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada.' }),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  strategy: z.enum(['secuencial', 'pareado']).default('secuencial'),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreOtherFruitDialog({ item, open, onOpenChange, onConfirm, allReceptions, allChamberLots }: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      strategy: 'secuencial',
    }
  });
  const { toast } = useToast();

  const selectedChamberId = form.watch('chamberId');
  const storageStrategy = form.watch('strategy');

  const pareadoSort = (a: string, b: string) => {
    const re = /^([A-Z]+)(\d+)$/;
    const matchA = a.match(re);
    const matchB = b.match(re);

    if (!matchA || !matchB) return 0;

    const [, aLetter, aNumStr] = matchA;
    const [, bLetter, bNumStr] = matchB;
    
    const aNum = parseInt(aNumStr, 10);
    const bNum = parseInt(bNumStr, 10);

    if (aNum < bNum) return -1;
    if (aNum > bNum) return 1;

    if (aLetter < bLetter) return -1;
    if (aLetter > bLetter) return 1;
    
    return 0;
  };


  const { availableCoordinates, suggestion } = React.useMemo(() => {
    if (!selectedChamberId || !item) {
      return { availableCoordinates: [], suggestion: null };
    }

    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) {
      return { availableCoordinates: [], suggestion: null };
    }

    const BINS_PER_COORDINATE = 6;
    const PALLETS_PER_COORDINATE = 3; 
    const capacity = item.unit === 'Bins' ? BINS_PER_COORDINATE : PALLETS_PER_COORDINATE;

    const occupancyMap = new Map<string, { productCode: string, quantity: number, isMixed: boolean }>();

    // Mark coordinates with producer lots as unavailable/mixed
    (allChamberLots || []).forEach(lot => {
      if (lot.chamberId === selectedChamberId && lot.coordinate) {
          occupancyMap.set(lot.coordinate, { productCode: 'PRODUCER_LOT', quantity: 99, isMixed: true });
      }
    });

    // Build occupancy for other fruit
    (allReceptions || []).forEach(reception => {
        reception.items.forEach(storedItem => {
            if (storedItem.status === 'Almacenado' && storedItem.storageLocation?.chamberId === selectedChamberId && storedItem.storageLocation.coordinate) {
                const coord = storedItem.storageLocation.coordinate;
                const existing = occupancyMap.get(coord);
                if (existing) {
                    if (existing.productCode !== storedItem.productCode) {
                        existing.isMixed = true;
                    }
                    existing.quantity += storedItem.quantity;
                } else {
                    occupancyMap.set(coord, {
                        productCode: storedItem.productCode,
                        quantity: storedItem.quantity,
                        isMixed: false
                    });
                }
            }
        });
    });
    
    const sortFunction = storageStrategy === 'pareado' ? pareadoSort : naturalSort;

    const allPossibleCoords = chamberConfig.columns
      .flatMap(col => chamberConfig.rows.map(row => `${col}${row}`))
      .filter(coord => !chamberConfig.blocked?.includes(coord))
      .sort(sortFunction);

    // Pareado (Product-based): Find partially filled coordinate with the same product
    const partialSameProductCoord = allPossibleCoords.find(coord => {
      const occupiedBy = occupancyMap.get(coord);
      return occupiedBy && !occupiedBy.isMixed && occupiedBy.productCode === item.productCode && occupiedBy.quantity < capacity;
    });

    let currentSuggestion: string | null = null;
    if (partialSameProductCoord) {
      currentSuggestion = partialSameProductCoord;
    } else {
      // Secuencial: Find the first completely empty coordinate
      const firstEmpty = allPossibleCoords.find(coord => !occupancyMap.has(coord));
      if (firstEmpty) {
        currentSuggestion = firstEmpty;
      }
    }
    
    // The dropdown should only show completely empty coordinates OR the one we are suggesting if it's partially full
    const availableCoords = allPossibleCoords.filter(coord => {
        const occupiedBy = occupancyMap.get(coord);
        if (!occupiedBy) return true; // It's empty
        // It's not empty, check if it's the suggested one (pareado)
        return coord === currentSuggestion;
    });
    
    return { availableCoordinates: availableCoords, suggestion: currentSuggestion };

  }, [selectedChamberId, item, allReceptions, allChamberLots, storageStrategy]);

  React.useEffect(() => {
    if (open && item) {
      form.reset({
        quantity: item.quantity,
        chamberId: undefined,
        coordinate: undefined,
        strategy: 'secuencial',
       });
    }
  }, [item, open, form]);

  React.useEffect(() => {
    if (suggestion) {
        form.setValue('coordinate', suggestion, { shouldValidate: true });
    } else if (open) {
        form.resetField('coordinate');
    }
  }, [suggestion, open, form]);


  if (!item) return null;
  
  const onSubmit = (values: StoreFormValues) => {
    const { unit } = item;
    const { quantity } = values;
    const BINS_PER_COORDINATE = 6;
    const PALLETS_PER_COORDINATE = 3; 

    if (unit === 'Bins' && quantity > BINS_PER_COORDINATE) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `Una coordenada no puede tener más de ${BINS_PER_COORDINATE} bins.`});
        return;
    }
    if (unit === 'Pallets' && quantity > PALLETS_PER_COORDINATE) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `Una coordenada no puede tener más de ${PALLETS_PER_COORDINATE} pallets.`});
        return;
    }
    if (quantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }
    onConfirm(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Almacenar Producto</DialogTitle>
          <DialogDescription>
            Guardar <span className="font-semibold">{item.productName}</span>. Pendiente: {item.quantity} {item.unit}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="strategy"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Estrategia de Almacenamiento</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="secuencial" />
                        </FormControl>
                        <FormLabel className="font-normal">Secuencial (A1, A2, A3...)</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="pareado" />
                        </FormControl>
                        <FormLabel className="font-normal">Pareado (A1, B1, A2...)</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="chamberId" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cámara</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.resetField('coordinate'); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                        {Object.values(chambersConfig).map(chamber => (
                            <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="coordinate" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Coordenada</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedChamberId}>
                        <FormControl><SelectTrigger><SelectValue placeholder={!selectedChamberId ? "Seleccione cámara" : "Seleccione..."} /></SelectTrigger></FormControl>
                        <SelectContent>
                        {availableCoordinates.length > 0 ? (
                            availableCoordinates.map(coord => (
                            <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                            ))
                        ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">No hay coords. disponibles.</div>
                        )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
            </div>
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad a Almacenar ({item.unit})</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} autoComplete="off" inputMode="numeric" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground pt-1">
                      Pendiente: {item.quantity} {item.unit}.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
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
