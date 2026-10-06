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
import { naturalSort, getEffectiveChamberConfig } from '@/lib/utils';
import type { ClientStorageConfig, Exporter } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface RelocateLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelocate: (data: { targetChamberId: string; targetCoordinate: string; quantityToRelocate: number; selectedItemIds?: string[] }) => void;
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
  selectedItemIds: z.array(z.string()).optional(),
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
  
  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean; colsKLEnabled?: boolean }>('chamberSettings');
  
  const isPackaging = React.useMemo(() => {
    const first = lotsInCoordinate[0];
    if (!first) return false;
    const name = (first.ownerName || '').toUpperCase();
    const id = (first.exporterId || '').toUpperCase();
    if (name.includes('FALL CREEK') || id.includes('FALL CREEK')) return false;
    if (name.includes('VITAFOOD') || id.includes('VITAFOOD') || name.includes('EMBALAJE') || id.includes('EMBALAJE')) return true;
    const client = (exporters || []).find(e => e.exporterId === first.exporterId || e.name.toUpperCase() === name);
    return client?.type?.toUpperCase() === 'EMBALAJE';
  }, [lotsInCoordinate, exporters]);

  const totalQuantityInCoord = React.useMemo(() => {
    return lotsInCoordinate.reduce((sum, item) => sum + item.quantity, 0);
  }, [lotsInCoordinate]);

  const form = useForm<RelocateFormValues>({
    resolver: zodResolver(relocateSchema),
    defaultValues: {
      targetChamberId: undefined,
      targetCoordinate: undefined,
      quantityToRelocate: undefined,
      selectedItemIds: [],
    },
  });
  
  const targetChamberId = form.watch('targetChamberId');
  const watchQuantityToRelocate = form.watch('quantityToRelocate');
  const watchSelectedItemIds = form.watch('selectedItemIds') || [];

  const { availableCoordinates, occupancyMap } = React.useMemo(() => {
    if (!targetChamberId) return { availableCoordinates: [], occupancyMap: new Map() };

    const rawChamberConfig = chambersConfig[targetChamberId];
    if (!rawChamberConfig) return { availableCoordinates: [], occupancyMap: new Map() };

    const isChamberRow13Enabled = !!chamberSettings?.find(s => s.id === targetChamberId)?.row13Enabled;
    const isChamberColsKLEnabled = targetChamberId === 'CAMARA-3' && !!chamberSettings?.find(s => s.id === targetChamberId)?.colsKLEnabled;
    const chamberConfig = getEffectiveChamberConfig(rawChamberConfig, isChamberRow13Enabled, isChamberColsKLEnabled);

    let allPossibleCoords = chamberConfig.columns
        .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
        .filter(coord => !chamberConfig.blocked?.includes(coord))
        .sort(naturalSort);

    // 1. Calculate current occupancy and document set for all coordinates in target chamber
    const occupancyMap = new Map<string, { 
      quantity: number; 
      palletsCount: number;
      ownerName: string; 
      unit: string; 
      documents: Set<string>; 
      productCodes: Set<string>; 
      varieties: Set<string>;
      hasFruit: boolean;
      hasPackaging: boolean;
    }>();
    
    allChamberLots.forEach(lot => {
      if (lot.status === 'Almacenado' && lot.chamberId === targetChamberId && lot.coordinate) {
        const current = occupancyMap.get(lot.coordinate) || { 
          quantity: 0, 
          palletsCount: 0,
          ownerName: lot.producerShortName, 
          unit: 'Bins', 
          documents: new Set<string>(), 
          productCodes: new Set<string>(), 
          varieties: new Set<string>(),
          hasFruit: true,
          hasPackaging: false
        };
        const lotDoc = lot.displayLotId.split('-').slice(1).join('-');
        current.documents.add(lotDoc);
        if (lot.variety) {
            current.varieties.add(lot.variety.trim().toUpperCase());
        }
        occupancyMap.set(lot.coordinate, { 
            quantity: current.quantity + lot.binCount, 
            palletsCount: current.palletsCount,
            ownerName: lot.producerShortName, 
            unit: 'Bins',
            documents: current.documents,
            productCodes: current.productCodes,
            varieties: current.varieties,
            hasFruit: true,
            hasPackaging: current.hasPackaging
        });
      }
    });

    allOtherFruitReceptions.forEach(reception => {
        const isFC = reception.clientName?.toUpperCase() === 'FALL CREEK';
        const isPkg = Boolean(
          reception.clientName?.toUpperCase().includes('VITAFOOD') ||
          reception.clientId?.toUpperCase().includes('VITAFOOD') ||
          reception.clientName?.toUpperCase().includes('EMBALAJE') ||
          reception.clientId?.toUpperCase().includes('EMBALAJE')
        );

        (reception.items || []).forEach(item => {
            if(item.status === 'Almacenado' && item.storageLocation?.chamberId === targetChamberId && item.storageLocation.coordinate) {
                const current = occupancyMap.get(item.storageLocation.coordinate) || { 
                  quantity: 0, 
                  palletsCount: 0,
                  ownerName: reception.clientName, 
                  unit: reception.unit, 
                  documents: new Set<string>(), 
                  productCodes: new Set<string>(), 
                  varieties: new Set<string>(),
                  hasFruit: !isPkg,
                  hasPackaging: isPkg
                };
                current.documents.add(reception.document);
                if (item.productCode) {
                    current.productCodes.add(item.productCode);
                }
                if (item.productName) {
                    current.varieties.add(item.productName.trim().toUpperCase());
                }
                if (isPkg) {
                    current.hasPackaging = true;
                } else {
                    current.hasFruit = true;
                }
                
                // Packaging: each item is 1 pallet (counts as 1 pallet, 2 bins equiv).
                const equivalentUnits = isPkg ? 2 : ((isFC && reception.unit === 'Pallets') ? 3 * item.quantity : (reception.unit === 'Bins' ? item.quantity : item.quantity * 2));
                const itemPalletCount = isPkg ? 1 : (reception.unit === 'Pallets' ? item.quantity : 0);

                occupancyMap.set(item.storageLocation.coordinate, { 
                    quantity: current.quantity + equivalentUnits, 
                    palletsCount: current.palletsCount + itemPalletCount,
                    ownerName: reception.clientName, 
                    unit: reception.unit,
                    documents: current.documents,
                    productCodes: current.productCodes,
                    varieties: current.varieties,
                    hasFruit: current.hasFruit,
                    hasPackaging: current.hasPackaging
                });
            }
        });
    });

    // 2. Determine quantity and identity of lot to relocate
    const unitType = lotsInCoordinate[0]?.unit || 'Bins';
    const multiplier = (lotsInCoordinate[0]?.ownerName?.toUpperCase() === 'FALL CREEK' && unitType === 'Pallets') ? 3 : (unitType === 'Bins' ? 1 : 2);
    
    const qtyToMove = watchQuantityToRelocate !== undefined && !isNaN(Number(watchQuantityToRelocate)) 
      ? Number(watchQuantityToRelocate) 
      : (isPackaging ? lotsInCoordinate.length : totalQuantityInCoord);

    const palletsToRelocate = isPackaging ? qtyToMove : 0;
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

        if (isPackaging) {
            // Sanitary check: cannot place packaging in coordinate with fruit
            if (occupancyData && occupancyData.hasFruit) return false;

            const currentPallets = occupancyData?.palletsCount || 0;
            const MAX_PACKAGING_PALLETS = 4;
            if ((currentPallets + palletsToRelocate) > MAX_PACKAGING_PALLETS) return false;

            // If coordinate already has packaging items, must be same client
            if (occupancyData && occupancyData.hasPackaging && currentPallets > 0) {
                if (occupancyData.ownerName.toUpperCase() !== incomingOwnerName.toUpperCase()) return false;
            }

            return true;
        }

        // Regular fruit rules:
        if (occupancyData && occupancyData.hasPackaging) return false;

        const currentOccupancy = occupancyData?.quantity || 0;
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

            // If other fruit relocation, prevent mixing different varieties/products and unit types (Pallets vs Bins)
            if (firstItemToRelocate?.type === 'otherFruit') {
                if (existingOwnerName.toUpperCase() !== incomingOwnerName.toUpperCase()) return false;
                
                if (occupancyData.unit && occupancyData.unit !== unitType) return false;
                
                const isFallCreek = incomingOwnerName.toUpperCase() === 'FALL CREEK';
                if (isFallCreek) {
                    const incomingVariety = (firstItemToRelocate.varietyOrProduct || '').trim().toUpperCase();
                    if (incomingVariety && occupancyData.varieties && occupancyData.varieties.size > 0) {
                        const targetHasDifferentVariety = Array.from(occupancyData.varieties).some(v => v !== incomingVariety);
                        if (targetHasDifferentVariety) return false;
                    }
                } else if (firstItemToRelocate.displayId) {
                    const targetHasDifferentProduct = Array.from(occupancyData.productCodes || []).some(code => code !== firstItemToRelocate.displayId);
                    if (targetHasDifferentProduct) return false;
                }
            }
            // REGLA CEREZA: Solo mismo cliente y mismo documento
            else if (existingType === 'CEREZA') {
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
  }, [targetChamberId, allChamberLots, allOtherFruitReceptions, sourceChamberId, sourceCoordinate, lotsInCoordinate, clientConfigs, exporters, watchQuantityToRelocate, totalQuantityInCoord, chamberSettings, isPackaging]);

  React.useEffect(() => {
    if (open) {
      const defaultItemIds = lotsInCoordinate[0]?.type === 'otherFruit' 
        ? lotsInCoordinate.map(i => i.id)
        : [];
      form.reset({
        targetChamberId: undefined,
        targetCoordinate: undefined,
        quantityToRelocate: isPackaging ? lotsInCoordinate.length : totalQuantityInCoord,
        selectedItemIds: defaultItemIds,
      });
    }
  }, [open, form, totalQuantityInCoord, lotsInCoordinate, isPackaging]);

  const onSubmit = (values: RelocateFormValues) => {
    if (values.targetChamberId === sourceChamberId && values.targetCoordinate === sourceCoordinate) {
        toast({ variant: 'destructive', title: 'Error', description: 'La ubicación de destino no puede ser la misma que la de origen.'});
        return;
    }

    if (isPackaging) {
        if (values.quantityToRelocate > lotsInCoordinate.length) {
            form.setError('quantityToRelocate', {
                type: 'manual',
                message: `La cantidad no puede ser mayor a los pallets disponibles (${lotsInCoordinate.length}).`
            });
            return;
        }

        const selectedItems = lotsInCoordinate.filter(i => (values.selectedItemIds || []).includes(i.id));
        if (values.selectedItemIds && values.selectedItemIds.length > 0 && values.quantityToRelocate > selectedItems.length) {
            form.setError('quantityToRelocate', {
                type: 'manual',
                message: `La cantidad (${values.quantityToRelocate}) no puede ser mayor a los pallets seleccionados (${selectedItems.length}).`
            });
            return;
        }

        // Validate target coordinate packaging capacity (max 4 pallets)
        const targetCoordinate = values.targetCoordinate;
        const occupancyData = occupancyMap.get(targetCoordinate);
        const currentPallets = occupancyData?.palletsCount || 0;

        if ((currentPallets + values.quantityToRelocate) > 4) {
            toast({
                variant: 'destructive',
                title: 'Error de Capacidad',
                description: `Límite máximo 4 Pallets por coordenada (actualmente tiene ${currentPallets}).`
            });
            form.setError('targetCoordinate', {
                type: 'manual',
                message: 'Límite máximo 4 Pallets'
            });
            return;
        }
    } else {
        if (values.quantityToRelocate > totalQuantityInCoord) {
            form.setError('quantityToRelocate', {
                type: 'manual',
                message: `La cantidad no puede ser mayor a la disponible en el origen (${totalQuantityInCoord}).`
            });
            return;
        }

        if (item.type === 'otherFruit') {
            const selectedItems = lotsInCoordinate.filter(i => (values.selectedItemIds || []).includes(i.id));
            const selectedTotal = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
            if (values.quantityToRelocate > selectedTotal) {
                form.setError('quantityToRelocate', {
                    type: 'manual',
                    message: `La cantidad no puede ser mayor a la suma de los ítems seleccionados (${selectedTotal}).`
                });
                return;
            }
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
    }

    onRelocate({
        targetChamberId: values.targetChamberId,
        targetCoordinate: values.targetCoordinate,
        quantityToRelocate: values.quantityToRelocate,
        selectedItemIds: lotsInCoordinate[0]?.type === 'otherFruit' ? values.selectedItemIds : undefined,
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
                    <span>Cant. Disponible: <span className="font-semibold">{isPackaging ? `${lotsInCoordinate.length} Pallet${lotsInCoordinate.length > 1 ? 's' : ''} (${totalQuantityInCoord} UN)` : `${totalQuantityInCoord} ${item.unit}`}</span></span>
                </div>
             </AlertDescription>
          </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {item.type === 'otherFruit' && (
              <FormField
                control={form.control}
                name="selectedItemIds"
                render={({ field }) => (
                  <FormItem className="space-y-2 border p-3 rounded-lg bg-muted/10">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-[#004b8d]">
                      {isPackaging ? 'Seleccione Pallets a Reubicar' : 'Seleccione Bins / Pallets a Reubicar'}
                    </FormLabel>
                    <div className="space-y-2 max-h-48 overflow-y-auto mt-1">
                      {lotsInCoordinate.map((coordItem) => {
                        const isChecked = (field.value || []).includes(coordItem.id);
                        return (
                          <div key={coordItem.id} className="flex items-center space-x-2 border-b pb-1.5 last:border-0 last:pb-0">
                            <Checkbox 
                              id={`item-${coordItem.id}`} 
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const newSelection = checked
                                  ? [...(field.value || []), coordItem.id]
                                  : (field.value || []).filter((id: string) => id !== coordItem.id);
                                field.onChange(newSelection);
                                
                                // Sync quantityToRelocate automatically!
                                if (isPackaging) {
                                  form.setValue('quantityToRelocate', newSelection.length);
                                } else {
                                  const selectedItems = lotsInCoordinate.filter(i => newSelection.includes(i.id));
                                  const totalQty = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
                                  form.setValue('quantityToRelocate', totalQty);
                                }
                              }}
                            />
                            <label 
                              htmlFor={`item-${coordItem.id}`}
                              className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-bold">{coordItem.palletId ? `Pallet: ${coordItem.palletId}` : `Ref: ${coordItem.displayId}`}</span>
                                <Badge variant="outline" className="h-4 text-[9px] px-1 bg-[#7aba28]/10 text-[#7aba28] border-[#7aba28]/20">
                                  {isPackaging ? `1 Pallet (${coordItem.quantity} UN)` : `${coordItem.quantity} ${coordItem.unit}`}
                                </Badge>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {coordItem.varietyOrProduct} {coordItem.clientLotId ? `| Lote: ${coordItem.clientLotId}` : ''}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
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
                  <FormLabel>
                    {isPackaging 
                      ? `Cantidad de Pallets a Reubicar (Máx. ${lotsInCoordinate.length})` 
                      : `Cantidad a Reubicar (${item.unit})`}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min={1} 
                      max={isPackaging ? lotsInCoordinate.length : totalQuantityInCoord} 
                      placeholder="Ingrese cantidad..." 
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

