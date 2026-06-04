'use client';

import * as React from 'react';
import { useMemo, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OtherFruitReception, ChamberLot, OtherFruitReceptionItem, Chamber, ClientStorageConfig } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { getSortedCoordinates, getPairedCoordinates } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Zap } from 'lucide-react';

interface PendingItem extends OtherFruitReceptionItem {
    receptionId: string;
    clientId?: string;
    clientName: string;
    document: string;
    itemIndices: number[];
    unit: 'Bins' | 'Pallets';
}

interface StoreOtherFruitDialogProps {
  item: PendingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { chamberId: string; coordinate: string; totalQuantity: number; quantityPerLocation: number; strategy: 'secuencial' | 'pareado' | 'aisle-access' | 'inverted-secuencial' | 'horizontal-secuencial' | 'fifo' | 'serpentina-vertical' | 'modelo-sof' | 'fifo-vertical' }) => void;
  allReceptions: OtherFruitReception[];
  allChamberLots: ChamberLot[];
  clientConfig?: ClientStorageConfig;
  lastUsedChamberId?: string | null;
  lastUsedCoordinate?: string | null;
}

const DEFAULT_BINS_PER_COORDINATE = 6;
const DEFAULT_PALLETS_PER_COORDINATE = 3; 

const storeSchema = z.object({
  chamberId: z.string({ required_error: 'Debe seleccionar una cámara.' }).min(1, 'Debe seleccionar una cámara.'),
  coordinate: z.string({ required_error: 'Debe seleccionar una coordenada de inicio.' }).min(1, 'Debe seleccionar una coordenada de inicio.'),
  totalQuantity: z.coerce.number().positive('La cantidad total debe ser mayor a 0.'),
  quantityPerLocation: z.coerce.number().positive('La cantidad por ubicación debe ser mayor a 0.'),
  strategy: z.enum(['secuencial', 'pareado', 'aisle-access', 'inverted-secuencial', 'horizontal-secuencial', 'fifo', 'serpentina-vertical', 'modelo-sof', 'fifo-vertical']).default('secuencial'),
});

type StoreFormValues = z.infer<typeof storeSchema>;


export function StoreOtherFruitDialog({ 
  item, 
  open, 
  onOpenChange, 
  onConfirm, 
  allReceptions, 
  allChamberLots, 
  clientConfig,
  lastUsedChamberId,
  lastUsedCoordinate
}: StoreOtherFruitDialogProps) {
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
  });
  const { toast } = useToast();

  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');
  const selectedChamberId = form.watch('chamberId');
  const selectedCoordinate = form.watch('coordinate');
  const isSubmitDisabled = !selectedChamberId || !selectedCoordinate || selectedCoordinate === '';
  
  const capacityPerCoord = useMemo(() => {
    if (!item) return DEFAULT_PALLETS_PER_COORDINATE;
    // Fall Creek rule: 9 bins total per coordinate
    if (item.clientName === 'FALL CREEK' || item.clientName?.toUpperCase() === 'FALL CREEK') return 9; 
    if (item.unit === 'Bins') {
      return clientConfig?.binsPerCoordinate ?? DEFAULT_BINS_PER_COORDINATE;
    }
    return clientConfig?.palletsPerCoordinate ?? DEFAULT_PALLETS_PER_COORDINATE;
  }, [item, clientConfig]);

  const { availableCoordinates, suggestion } = useMemo(() => {
    if (!selectedChamberId || !item) {
      return { availableCoordinates: [], suggestion: null };
    }

    const chamberConfig = chambersConfig[selectedChamberId];
    if (!chamberConfig) {
      return { availableCoordinates: [], suggestion: null };
    }

    const occupancyMap = new Map<string, { lots: {displayLotId: string, binCount: number, clientId: string }[] }>();
    let lastCoordInChamber: string | null = null;
    let latestTimestamp = 0;
    
    (allChamberLots || []).forEach(lot => {
        if (lot.status === 'Almacenado' && lot.chamberId === selectedChamberId && lot.coordinate && lot.binCount > 0) {
          if (!occupancyMap.has(lot.coordinate)) {
            occupancyMap.set(lot.coordinate, { lots: [] });
          }
          // Note: for ChamberLots (Cherry), we treat exporterId as the clientId
          occupancyMap.get(lot.coordinate)!.lots.push({ 
            displayLotId: lot.displayLotId, 
            binCount: lot.binCount,
            clientId: lot.exporterId 
          });

          const time = (lot as any).storedAt?.toMillis ? (lot as any).storedAt.toMillis() : 0;
          if (time > latestTimestamp) {
              latestTimestamp = time;
              lastCoordInChamber = lot.coordinate;
          }
        }
    });
    
    (allReceptions || []).forEach(reception => {
        const isFC = reception.clientName === 'FALL CREEK' || reception.clientName?.toUpperCase() === 'FALL CREEK';
        const multiplier = (isFC && reception.unit === 'Pallets') ? 3 : (reception.unit === 'Bins' ? 1 : 2);

        reception.items.forEach((storedItem, idx) => {
            if (storedItem.status === 'Almacenado' && storedItem.storageLocation?.chamberId === selectedChamberId && storedItem.storageLocation.coordinate && storedItem.quantity > 0) {
                const equivalentUnits = storedItem.quantity * multiplier;
                const lotId = `other_${reception.id}_${storedItem.containerId || storedItem.palletId || idx}`;
                if (!occupancyMap.has(storedItem.storageLocation.coordinate)) {
                    occupancyMap.set(storedItem.storageLocation.coordinate, { lots: [] });
                }
                const exists = occupancyMap.get(storedItem.storageLocation.coordinate)!.lots.some(l => l.displayLotId === lotId);
                if (!exists) {
                   occupancyMap.get(storedItem.storageLocation.coordinate)!.lots.push({ 
                     displayLotId: lotId, 
                     binCount: equivalentUnits,
                     clientId: reception.clientId 
                   });
                }

                const time = (storedItem as any).storedAt?.toMillis ? (storedItem as any).storedAt.toMillis() : (storedItem as any).storedAt instanceof Date ? (storedItem as any).storedAt.getTime() : 0;
                if (time > latestTimestamp) {
                    latestTimestamp = time;
                    lastCoordInChamber = storedItem.storageLocation.coordinate;
                }
            }
        });
    });

    const formStrategy = form.watch('strategy') || 'secuencial';

    let allPossibleCoords;
    if (formStrategy === 'pareado') {
      allPossibleCoords = getPairedCoordinates(chamberConfig);
    } else if (formStrategy === 'aisle-access') {
      allPossibleCoords = getSortedCoordinates(chamberConfig, 'aisle-access');
    } else if (formStrategy === 'inverted-secuencial') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'inverted-secuencial');
    } else if (formStrategy === 'horizontal-secuencial') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'horizontal-secuencial');
    } else if (formStrategy === 'fifo') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'fifo');
    } else if (formStrategy === 'serpentina-vertical') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'serpentina-vertical');
    } else if (formStrategy === 'modelo-sof') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'modelo-sof');
    } else if (formStrategy === 'fifo-vertical') {
        allPossibleCoords = getSortedCoordinates(chamberConfig, 'fifo-vertical');
    } else {
      allPossibleCoords = getSortedCoordinates(chamberConfig, 'secuencial');
    }
    
    const occupancyThreshold = capacityPerCoord;
    const unitsPerItem = (item.clientName?.toUpperCase() === 'FALL CREEK' && item.unit === 'Pallets') ? 3 : (item.unit === 'Bins' ? 1 : 2);

    // Determine the starting point for suggestion search
    let startIndex = 0;
    const effectiveLastChamber = lastUsedChamberId || (typeof window !== 'undefined' ? localStorage.getItem('frio_last_chamber_id') : null);
    const effectiveSessionCoord = lastUsedCoordinate || (typeof window !== 'undefined' ? localStorage.getItem('frio_last_coordinate') : null);
    const isContinuingChamber = selectedChamberId === effectiveLastChamber;
    
    // We prioritize real DB state (lastCoordInChamber) over localStorage if there's any occupancy.
    // If the chamber is completely empty in the DB, we ignore all session/localStorage history and start from A1.
    const hasAnyOccupancy = occupancyMap.size > 0;
    const effectiveLastCoord = hasAnyOccupancy
      ? (isContinuingChamber && lastUsedCoordinate 
          ? lastUsedCoordinate 
          : (lastCoordInChamber || (isContinuingChamber && effectiveSessionCoord ? effectiveSessionCoord : null)))
      : null;
    
    if (effectiveLastCoord && formStrategy !== 'modelo-sof' && formStrategy !== 'serpentina-vertical' && formStrategy !== 'fifo-vertical') {
        const foundIdx = allPossibleCoords.indexOf(effectiveLastCoord);
        if (foundIdx !== -1) {
            const entry = occupancyMap.get(effectiveLastCoord);
            const currentOccupancy = entry ? entry.lots.reduce((sum, l) => sum + l.binCount, 0) : 0;
            if (currentOccupancy + unitsPerItem > occupancyThreshold) {
                startIndex = foundIdx + 1;
            } else {
                startIndex = foundIdx;
            }
        }
    }

    // Create a prioritized search list: From last used position forward, then wrap around
    const prioritizedCoords = [
        ...allPossibleCoords.slice(startIndex),
        ...allPossibleCoords.slice(0, startIndex)
    ];

    const currentSuggestion = prioritizedCoords.find(coord => {
        if (chamberConfig.blocked?.includes(coord)) return false;
        const entry = occupancyMap.get(coord);
        if (!entry || entry.lots.length === 0) return true; // Empty is always good

        // Incompatibility check: must be the SAME client
        const hasDifferentClient = entry.lots.some(l => l.clientId !== item.clientId);
        if (hasDifferentClient) return false;

        const currentOccupancy = entry.lots.reduce((sum, l) => sum + l.binCount, 0);
        return currentOccupancy + unitsPerItem <= occupancyThreshold;
    }) || null;

    let available = allPossibleCoords.filter(coord => {
        if (chamberConfig.blocked?.includes(coord)) return false;
        
        const entry = occupancyMap.get(coord);
        if (!entry || entry.lots.length === 0) return true; // Empty

        // Compatibility: only same client allowed for Exportador/Other Fruit
        const hasDifferentClient = entry.lots.some(l => l.clientId !== item.clientId);
        if (hasDifferentClient) return false;

        const currentOccupancy = entry.lots.reduce((sum, l) => sum + l.binCount, 0);
        return currentOccupancy + unitsPerItem <= occupancyThreshold;
    });

    const isChamberRow13Enabled = !!chamberSettings?.find(s => s.id === selectedChamberId)?.row13Enabled;
    if (isChamberRow13Enabled) {
        const row13Coords = chamberConfig.columns.map(col => `${col.name}13`);
        const availableRow13 = row13Coords.filter(coord => {
            const entry = occupancyMap.get(coord);
            if (!entry || entry.lots.length === 0) return true; // Empty

            const hasDifferentClient = entry.lots.some(l => l.clientId !== item.clientId);
            if (hasDifferentClient) return false;

            const currentOccupancy = entry.lots.reduce((sum, l) => sum + l.binCount, 0);
            return currentOccupancy + unitsPerItem <= occupancyThreshold;
        });
        available = [...available, ...availableRow13];
    }
    
    return { availableCoordinates: available, suggestion: currentSuggestion };

  }, [selectedChamberId, item, allReceptions, allChamberLots, form.watch('strategy'), capacityPerCoord, lastUsedChamberId, lastUsedCoordinate, chamberSettings]);

  useEffect(() => {
    if (open && item) {
       const isFallCreek = item.clientName === 'FALL CREEK' || item.clientName?.toUpperCase() === 'FALL CREEK';
       let strategy = isFallCreek ? 'aisle-access' : (clientConfig?.strategy ?? 'secuencial');
       let totalQuantity = item.quantity;
       let qtyPerLocation = isFallCreek 
         ? 9 
         : (item.unit === 'Bins' 
           ? (clientConfig?.binsPerCoordinate ?? DEFAULT_BINS_PER_COORDINATE)
           : (clientConfig?.palletsPerCoordinate ?? DEFAULT_PALLETS_PER_COORDINATE));

        // Prioritize session continuity (lastUsedChamberId from props or localStorage) over client preferred chamber
        const savedChamber = lastUsedChamberId || (typeof window !== 'undefined' ? localStorage.getItem('frio_last_chamber_id') : null);
        let chamberId = (savedChamber && chambersConfig[savedChamber]) ? savedChamber : clientConfig?.preferredChamberId;
        
        // Validation: Ensure the preferred chamber actually exists in config
        if (chamberId && !chambersConfig[chamberId]) {
            chamberId = undefined;
        }

       form.reset({
         totalQuantity,
         quantityPerLocation: qtyPerLocation,
         chamberId: chamberId,
         coordinate: undefined,
         strategy: strategy as any,
        });
    }
  }, [item, open, form, clientConfig, lastUsedChamberId]);

  useEffect(() => {
    if (suggestion) {
        form.setValue('coordinate', suggestion, { shouldValidate: true });
    } else if (open) {
        form.resetField('coordinate');
    }
  }, [suggestion, open, form, selectedChamberId]);
  
  const handleQuickConfirm = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!item || !suggestion || !selectedChamberId) return;

    const values = form.getValues();
    const qtyPerLocation = values.quantityPerLocation || capacityPerCoord;
    const totalQuantity = values.totalQuantity || item.quantity;

    if (qtyPerLocation > capacityPerCoord) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `La cantidad por ubicación no puede ser mayor a ${capacityPerCoord} para este cliente.`});
        return;
    }
    if (totalQuantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }

    // Persist last used chamber
    localStorage.setItem('frio_last_chamber_id', selectedChamberId);

    onConfirm({
      chamberId: selectedChamberId,
      coordinate: suggestion,
      totalQuantity,
      quantityPerLocation: qtyPerLocation,
      strategy: values.strategy || 'secuencial'
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (open && e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'BUTTON' || activeElement.tagName === 'A' || activeElement.tagName === 'TEXTAREA')) {
          return;
        }

        if (selectedCoordinate && selectedCoordinate !== '') {
          return;
        }

        if (suggestion && selectedChamberId) {
          e.preventDefault();
          e.stopPropagation();
          handleQuickConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, suggestion, selectedChamberId, selectedCoordinate, form, item]);

  const onSubmit = (values: StoreFormValues) => {
    if (!item) return;
    if (values.quantityPerLocation > capacityPerCoord) {
        toast({ variant: 'destructive', title: 'Límite Excedido', description: `La cantidad por ubicación no puede ser mayor a ${capacityPerCoord} para este cliente.`});
        return;
    }
    if (values.totalQuantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }
    
    // Persist last used chamber
    localStorage.setItem('frio_last_chamber_id', values.chamberId);
    
    onConfirm(values);
  };
  
  if (!item) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Almacenar Producto
            {suggestion && (
                <div className="ml-auto flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs animate-pulse">
                     <div className="w-2 h-2 bg-primary rounded-full" />
                     Ubicación Sugerida Lista
                </div>
            )}
          </DialogTitle>
          <div className="text-sm text-muted-foreground text-base">
            <div>
              Guardar <span className="font-bold text-foreground">{item.productName}</span> para <span className="font-bold text-foreground">{item.clientName}</span>.
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-primary border-primary/30">
                  {item.unit === 'Bins' ? 'BIN' : 'PALLET'}: {item.palletId || item.containerId || item.productCode}
                </Badge>
                <span className="text-muted-foreground">•</span>
                <span className="font-medium text-foreground">{item.quantity} {item.unit}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {suggestion && selectedChamberId && (
            <div 
                className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-4 border-primary rounded-xl p-5 flex items-center justify-between group hover:from-primary/20 hover:via-primary/10 transition-all cursor-pointer shadow-sm relative overflow-hidden" 
                onClick={handleQuickConfirm}
            >
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Zap className="w-16 h-16 text-primary rotate-12" />
                </div>
                
                <div className="flex items-center gap-5 relative z-10">
                    <div className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl flex flex-col items-center justify-center font-bold shadow-xl group-hover:scale-105 group-hover:rotate-2 transition-all duration-300">
                        <span className="text-[9px] uppercase opacity-70 tracking-tighter">Coord</span>
                        <span className="text-2xl leading-none">{suggestion}</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Sugerencia IA</p>
                            <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-primary/20 text-primary/70">OPTIMIZADO</Badge>
                        </div>
                        <p className="text-xl font-black tracking-tight text-foreground/90">{chambersConfig[selectedChamberId]?.name}</p>
                    </div>
                </div>
                <div className="text-right relative z-10">
                    <p className="text-sm font-black text-primary mb-1">CONFIRMAR RÁPIDO</p>
                    <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-muted-foreground bg-white/50 px-2 py-1 rounded-full shadow-inner border border-black/5">
                        <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px]">ENTER</kbd>
                    </div>
                </div>
            </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <div className="hidden">
             <FormField
                control={form.control}
                name="strategy"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel>Estrategia de Almacenamiento</FormLabel>
                        <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="grid grid-cols-2 gap-4"
                            >
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="secuencial" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Secuencial (A1 &rarr; L12)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="inverted-secuencial" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Invertido (A12 &rarr; A1)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="horizontal-secuencial" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Horizontal (A1 &rarr; O1)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="aisle-access" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Pasillo (Fall Creek)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="fifo" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">FIFO (Serpiente)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="serpentina-vertical" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Serpentina Vertical</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="modelo-sof" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">Modelo SOF (Serpentina Continua)</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="fifo-vertical" />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer text-xs">FIFO Vertical</FormLabel>
                                </FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            </div>
             <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="chamberId" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cámara</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.resetField('coordinate'); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                        {Object.values(chambersConfig).map(chamber => (
                            <SelectItem key={chamber.id} value={chamber.id}>
                              {chamber.name} 
                              {clientConfig?.chamberOverrides?.[chamber.id] && ` (Cap. Reservada: ${clientConfig.chamberOverrides[chamber.id]})`}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="coordinate" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Coordenada de Inicio</FormLabel>
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
            
            {/* Hidden quantity fields to simplify UI as requested */}
            <input type="hidden" {...form.register('totalQuantity')} />
            <input type="hidden" {...form.register('quantityPerLocation')} />
            
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitDisabled}>Confirmar Almacenamiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
