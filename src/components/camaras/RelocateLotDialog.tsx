'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ChamberLot, OtherFruitReception, StoredItem } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { Alert, AlertDescription } from '../ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { naturalSort } from '@/lib/utils';
import type { ClientStorageConfig, Exporter } from '@/lib/types';

interface RelocateLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelocate: (data: { targetChamberId: string; targetCoordinate: string; quantityToRelocate: number; selectedPalletId?: string }) => void;
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
  quantityToRelocate: z.coerce.number({ required_error: 'Debe ingresar una cantidad.' })
    .positive('La cantidad debe ser mayor a 0.'),
  selectedPalletId: z.string().optional(),
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
  
  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');
  
  const palletIds = React.useMemo(() => {
    return Array.from(new Set(lotsInCoordinate.map(i => i.palletId).filter((pid): pid is string => !!pid)));
  }, [lotsInCoordinate]);

  const totalQuantityInCoord = React.useMemo(() => {
    return lotsInCoordinate.reduce((sum, item) => sum + item.quantity, 0);
  }, [lotsInCoordinate]);

  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: {
      targetChamberId: undefined,
      targetCoordinate: undefined,
      quantityToRelocate: undefined,
      selectedPalletId: 'all',
    },
  });
  
  const targetChamberId = form.watch('targetChamberId');
  const watchQuantityToRelocate = form.watch('quantityToRelocate');
  const watchSelectedPalletId = form.watch('selectedPalletId');

  React.useEffect(() => {
    if (watchSelectedPalletId && watchSelectedPalletId !== 'all') {
      const palletItems = lotsInCoordinate.filter(item => item.palletId === watchSelectedPalletId);
      const palletQty = palletItems.reduce((sum, item) => sum + item.quantity, 0);
      form.setValue('quantityToRelocate', palletQty);
    } else {
      form.setValue('quantityToRelocate', totalQuantityInCoord);
    }
  }, [watchSelectedPalletId, lotsInCoordinate, totalQuantityInCoord, form]);

  const { availableCoordinates, occupancyMap } = React.useMemo(() => {
    if (!targetChamberId) return { availableCoordinates: [], occupancyMap: new Map() };

    const chamberConfig = chambersConfig[targetChamberId];
    if (!chamberConfig) return { availableCoordinates: [], occupancyMap: new Map() };

    let allPossibleCoords = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);

    const isChamberRow13Enabled = !!chamberSettings?.find(s => s.id === targetChamberId)?.row13Enabled;
    if (isChamberRow13Enabled) {
      const isLargeChamber = ['CAMARA-4', 'CAMARA-5', 'CAMARA-6'].includes(targetChamberId);
      const allowedComodinColumns = isLargeChamber ? ['A', 'B', 'C', 'M', 'N', 'O'] : ['A', 'B', 'C', 'H', 'I', 'J'];
      const extraCoords = chamberConfig.columns
        .filter(col => allowedComodinColumns.includes(col.name))
        .flatMap(col => [`${col.name}13`, `${col.name}14`]);
      allPossibleCoords = [...allPossibleCoords, ...extraCoords].sort(naturalSort);
    }

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
        (reception.items || []).forEach(item => {
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
    const unitType = lotsInCoordinate[0]?.unit || 'Bins';
    const multiplier = (lotsInCoordinate[0]?.ownerName?.toUpperCase() === 'FALL CREEK' && unitType === 'Pallets') ? 3 : (unitType === 'Bins' ? 1 : 2);
    
    const qtyToMove = watchQuantityToRelocate !== undefined && !isNaN(Number(watchQuantityToRelocate)) 
      ? Number(watchQuantityToRelocate) 
      : totalQuantityInCoord;
    const quantityToRelocateInBins = qtyToMove * multiplier;

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
        if ((currentOccupancy + quantityToRelocateInBins) > MAX_CAPACITY) return false;

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
            // Fallback for safety: if they are different owners, don't mix
            else {
                if (existingOwnerName.toUpperCase() !== incomingOwnerName.toUpperCase()) return false;
            }
        }

        return true;
    });

    return { 
        availableCoordinates: available,
        occupancyMap
    };
  }, [targetChamberId, allChamberLots, allOtherFruitReceptions, sourceChamberId, sourceCoordinate, lotsInCoordinate, clientConfigs, exporters, watchQuantityToRelocate, totalQuantityInCoord, chamberSettings]);

  React.useEffect(() => {
    if (open) {
      form.reset({
        targetChamberId: undefined,
        targetCoordinate: undefined,
        quantityToRelocate: totalQuantityInCoord,
        selectedPalletId: 'all',
      });
    }
  }, [open, form, totalQuantityInCoord]);

  const onSubmit = (values: RelocateFormValues) => {
    if (values.targetChamberId === sourceChamberId && values.targetCoordinate === sourceCoordinate) {
        toast({ variant: 'destructive', title: 'Error', description: 'La ubicación de destino no puede ser la misma que la de origen.'});
        return;
    }

    if (values.quantityToRelocate > totalQuantityInCoord) {
        form.setError('quantityToRelocate', {
            type: 'manual',
            message: `La cantidad no puede ser mayor a la disponible en el origen (${totalQuantityInCoord}).`
        });
        return;
    }

    // Validate the target chamber's capacity conditions
    const targetCoordinate = values.targetCoordinate;
    const occupancyData = occupancyMap.get(targetCoordinate);
    const currentOccupancy = occupancyData?.quantity || 0;

    const unitType = lotsInCoordinate[0]?.unit || 'Bins';
    const multiplier = (lotsInCoordinate[0]?.ownerName?.toUpperCase() === 'FALL CREEK' && unitType === 'Pallets') ? 3 : (unitType === 'Bins' ? 1 : 2);
    const quantityToRelocateInBins = values.quantityToRelocate * multiplier;

    const MAX_CAPACITY = 9;
    if ((currentOccupancy + quantityToRelocateInBins) > MAX_CAPACITY) {
        toast({
            variant: 'destructive',
            title: 'Error de Capacidad',
            description: 'Límite máximo 9 Bins'
        });
        form.setError('targetCoordinate', {
            type: 'manual',
            message: 'Límite máximo 9 Bins'
        });
        return;
    }

    onRelocate({
        targetChamberId: values.targetChamberId,
        targetCoordinate: values.targetCoordinate,
        quantityToRelocate: values.quantityToRelocate,
        selectedPalletId: values.selectedPalletId === 'all' ? undefined : values.selectedPalletId,
    });
  };

  const item = lotsInCoordinate[0];
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reubicar Coordenada</DialogTitle>
          <DialogDescription>
            Mover el contenido de la coordenada <span className="font-mono font-semibold">{sourceCoordinate}</span> en <span className="font-semibold">{chambersConfig[sourceChamberId]?.name}</span> a una nueva ubicación.
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
                    <span>Cant. Disponible: <span className="font-semibold">{totalQuantityInCoord} {item.unit}</span></span>
                </div>
             </AlertDescription>
          </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {palletIds.length > 0 && (
              <FormField
                control={form.control}
                name="selectedPalletId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pallet ID a Reubicar</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione un Pallet ID" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">Todo (Reubicación general)</SelectItem>
                        {palletIds.map(pid => (
                          <SelectItem key={pid} value={pid}>{pid}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="quantityToRelocate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad a Reubicar ({item.unit})</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min={1} 
                      max={totalQuantityInCoord} 
                      placeholder="Ingrese cantidad..." 
                      disabled={watchSelectedPalletId !== undefined && watchSelectedPalletId !== 'all'}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormLabel>Coordenada de Destino (Disponibles según capacidad y reglas)</FormLabel>
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

