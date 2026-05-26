'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ChamberLot, OtherFruitReception, StoredItem } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { Alert, AlertDescription } from '../ui/alert';
import { useToast } from '@/hooks/use-toast';
import { naturalSort } from '@/lib/utils';
import type { ClientStorageConfig, Exporter } from '@/lib/types';

interface RelocateLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelocate: (data: { targetChamberId: string; targetCoordinate: string }) => void;
  sourceChamberId: string;
  sourceCoordinate: string;
  lotsInCoordinate: StoredItem[];
  allChamberLots: ChamberLot[];
  allOtherFruitReceptions: OtherFruitReception[];
  clientConfigs: ClientStorageConfig[];
  exporters: Exporter[];
}

const relocateSchema = z.object({
  targetChamberId: z.string({ required_error: 'Debe seleccionar una cámara de destino.' }),
  targetCoordinate: z.string({ required_error: 'Debe seleccionar una coordenada de destino.' }),
});

type RelocateFormValues = z.infer<typeof relocateSchema>;

export function RelocateLotDialog({
  open,
  onOpenChange,
  onRelocate,
  sourceChamberId,
  sourceCoordinate,
  lotsInCoordinate,
  allChamberLots,
  allOtherFruitReceptions,
  clientConfigs,
  exporters,
}: RelocateLotDialogProps) {
  const { toast } = useToast();
  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: {
      targetChamberId: undefined,
      targetCoordinate: undefined,
    },
  });
  
  const targetChamberId = form.watch('targetChamberId');

  const { availableCoordinates } = React.useMemo(() => {
    if (!targetChamberId) return { availableCoordinates: [] };

    const chamberConfig = chambersConfig[targetChamberId];
    if (!chamberConfig) return { availableCoordinates: [] };

    const allPossibleCoords = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);

    // 1. Calculate current occupancy and document set for all coordinates in target chamber
    const occupancyMap = new Map<string, { quantity: number; ownerName: string; unit: string; documents: Set<string> }>();
    
    allChamberLots.forEach(lot => {
      if (lot.status === 'Almacenado' && lot.chamberId === targetChamberId && lot.coordinate) {
        const current = occupancyMap.get(lot.coordinate) || { quantity: 0, ownerName: lot.producerShortName, unit: 'Bins', documents: new Set<string>() };
        const lotDoc = lot.displayLotId.split('-').slice(1).join('-');
        current.documents.add(lotDoc);
        occupancyMap.set(lot.coordinate, { 
            quantity: current.quantity + lot.binCount, 
            ownerName: lot.producerShortName, 
            unit: 'Bins',
            documents: current.documents
        });
      }
    });

    allOtherFruitReceptions.forEach(reception => {
        reception.items.forEach(item => {
            if(item.status === 'Almacenado' && item.storageLocation?.chamberId === targetChamberId && item.storageLocation.coordinate) {
                const current = occupancyMap.get(item.storageLocation.coordinate) || { quantity: 0, ownerName: reception.clientName, unit: reception.unit, documents: new Set<string>() };
                current.documents.add(reception.document);
                
                // Determine units: if it's Fall Creek, 1 pallet = 3 bins.
                const multiplier = (reception.clientName?.toUpperCase() === 'FALL CREEK' && reception.unit === 'Pallets') ? 3 : (reception.unit === 'Bins' ? 1 : 2);
                const equivalentUnits = item.quantity * multiplier;

                occupancyMap.set(item.storageLocation.coordinate, { 
                    quantity: current.quantity + equivalentUnits, 
                    ownerName: reception.clientName, 
                    unit: reception.unit,
                    documents: current.documents
                });
            }
        });
    });

    // 2. Determine quantity and identity of lot to relocate
    const quantityToRelocate = lotsInCoordinate.reduce((sum, item) => {
        const multiplier = (item.ownerName?.toUpperCase() === 'FALL CREEK' && item.unit === 'Pallets') ? 3 : (item.unit === 'Bins' ? 1 : 2);
        return sum + (item.quantity * multiplier);
    }, 0);

    const firstItemToRelocate = lotsInCoordinate[0];
    const incomingOwnerName = firstItemToRelocate?.ownerName || '';
    const incomingDocument = firstItemToRelocate?.receptionId ? 
        allOtherFruitReceptions.find(r => r.id === firstItemToRelocate.receptionId)?.document : 
        (firstItemToRelocate?.displayId ? firstItemToRelocate.displayId.split('-').slice(1).join('-') : undefined);

    // 3. Filter coordinates by capacity and mixing rules
    const available = allPossibleCoords.filter(coord => {
        // Always exclude source coordinate if moving within the same chamber
        if (targetChamberId === sourceChamberId && coord === sourceCoordinate) return false;

        const occupancyData = occupancyMap.get(coord);
        const currentOccupancy = occupancyData?.quantity || 0;
        
        // Rule: Absolute maximum capacity of 9 Bins
        const MAX_CAPACITY = 9;
        if ((currentOccupancy + quantityToRelocate) > MAX_CAPACITY) return false;

        // If coordinate is not empty, check mixing rules
        if (occupancyData && occupancyData.quantity > 0) {
            const existingOwnerName = occupancyData.ownerName;
            
            // Find types in exporters list
            const existingExporter = exporters.find(e => e.name.toUpperCase() === existingOwnerName.toUpperCase());
            const incomingExporter = exporters.find(e => e.name.toUpperCase() === incomingOwnerName.toUpperCase());
            
            const existingType = existingExporter?.type?.toUpperCase() || 'EXPORTADOR';
            const incomingType = incomingExporter?.type?.toUpperCase() || 'EXPORTADOR';

            // REGLA CEREZA: Solo mismo cliente y mismo documento
            if (existingType === 'CEREZA') {
                if (existingOwnerName.toUpperCase() !== incomingOwnerName.toUpperCase()) return false;
                if (!incomingDocument || !occupancyData.documents.has(incomingDocument)) return false;
            } 
            // REGLA EXPORTADOR: Solo mismo cliente (permite distintos documentos)
            else if (existingType === 'EXPORTADOR') {
                if (existingOwnerName.toUpperCase() !== incomingOwnerName.toUpperCase()) return false;
            }
            // Fallback for safety: if they are different owners, don't mix unless both are EXPORTADOR and rules say so
            // But the rule says "no entre exportadores", so same owner is always required.
            else {
                if (existingOwnerName.toUpperCase() !== incomingOwnerName.toUpperCase()) return false;
            }
        }

        return true;
    });

    return { 
        availableCoordinates: available,
    };
  }, [targetChamberId, allChamberLots, allOtherFruitReceptions, sourceChamberId, sourceCoordinate, lotsInCoordinate, clientConfigs, exporters]);


  React.useEffect(() => {
    if (open) {
      form.reset({
        targetChamberId: undefined,
        targetCoordinate: undefined,
      });
    }
  }, [open, form]);

  const onSubmit = (values: RelocateFormValues) => {
    if (values.targetChamberId === sourceChamberId && values.targetCoordinate === sourceCoordinate) {
        toast({ variant: 'destructive', title: 'Error', description: 'La ubicación de destino no puede ser la misma que la de origen.'});
        return;
    }
    onRelocate(values);
  };

  const item = lotsInCoordinate[0];
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reubicar Coordenada</DialogTitle>
          <DialogDescription>
            Mover todo el contenido de la coordenada <span className="font-mono font-semibold">{sourceCoordinate}</span> en <span className="font-semibold">{chambersConfig[sourceChamberId]?.name}</span> a una nueva ubicación.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="my-4">
             <AlertDescription>
                <div className="flex justify-between items-center text-sm">
                    <span>
                      {item.type === 'producerLot' ? 'Lote' : 'Producto'}: <span className="font-semibold">{item.displayId}</span>
                    </span>
                    <span>
                      {item.type === 'producerLot' ? 'Productor' : 'Cliente'}: <span className="font-semibold">{item.ownerName}</span>
                    </span>
                    <span>Cant: <span className="font-semibold">{item.quantity} {item.unit}</span></span>
                </div>
             </AlertDescription>
          </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="targetChamberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cámara de Destino</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue('targetCoordinate', ''); // Reset coordinate on chamber change
                  }} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una cámara" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(chambersConfig).map(chamber => (
                        <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetCoordinate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coordenada de Destino (Disponibles según reglas)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!targetChamberId || availableCoordinates.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                      <SelectValue placeholder={!targetChamberId ? "Seleccione una cámara primero" : "Seleccione una coordenada"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCoordinates.length > 0 ? (
                        availableCoordinates.map(coord => (
                          <SelectItem key={coord} value={coord}>{coord}</SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-sm text-center text-muted-foreground">No hay coordenadas con capacidad suficiente.</div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit">Confirmar Reubicación</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
