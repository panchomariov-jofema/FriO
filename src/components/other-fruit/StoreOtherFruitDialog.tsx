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
import { OtherFruitReception, ChamberLot, OtherFruitReceptionItem, Chamber, ClientStorageConfig, Warehouse, Aisle } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { getSortedCoordinates, getPairedCoordinates, safeToMillis, getEffectiveChamberConfig, cn, naturalSort } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Zap, Warehouse as WarehouseIcon, Snowflake } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  onConfirm: (data: { 
    chamberId: string; 
    coordinate: string; 
    warehouse?: string;
    aisle?: string;
    destinationType?: 'chamber' | 'warehouse';
    totalQuantity: number; 
    quantityPerLocation: number; 
    strategy: 'secuencial' | 'pareado' | 'aisle-access' | 'inverted-secuencial' | 'horizontal-secuencial' | 'fifo' | 'serpentina-vertical' | 'modelo-sof' | 'fifo-vertical' 
  }) => void;
  allReceptions: OtherFruitReception[];
  allChamberLots: ChamberLot[];
  clientConfig?: ClientStorageConfig;
  lastUsedChamberId?: string | null;
  lastUsedCoordinate?: string | null;
}

const DEFAULT_BINS_PER_COORDINATE = 6;
const DEFAULT_PALLETS_PER_COORDINATE = 3; 

const storeSchema = z.object({
  destinationType: z.enum(['chamber', 'warehouse']).default('chamber'),
  chamberId: z.string().optional(),
  coordinate: z.string().optional(),
  warehouse: z.string().optional(),
  aisle: z.string().optional(),
  totalQuantity: z.coerce.number().positive('La cantidad total debe ser mayor a 0.'),
  quantityPerLocation: z.coerce.number().positive('La cantidad por ubicación debe ser mayor a 0.'),
  strategy: z.enum(['secuencial', 'pareado', 'aisle-access', 'inverted-secuencial', 'horizontal-secuencial', 'fifo', 'serpentina-vertical', 'modelo-sof', 'fifo-vertical']).default('secuencial'),
}).superRefine((data, ctx) => {
  if (data.destinationType === 'chamber') {
    if (!data.chamberId || data.chamberId.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe seleccionar una cámara.', path: ['chamberId'] });
    }
    if (!data.coordinate || data.coordinate.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe seleccionar una coordenada.', path: ['coordinate'] });
    }
  } else {
    if (!data.warehouse || data.warehouse.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe seleccionar un almacén.', path: ['warehouse'] });
    }
    if (!data.aisle || data.aisle.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe seleccionar un pasillo.', path: ['aisle'] });
    }
  }
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
    defaultValues: {
      destinationType: 'chamber',
      chamberId: '',
      coordinate: '',
      warehouse: '',
      aisle: '',
      strategy: 'secuencial'
    }
  });
  const { toast } = useToast();

  const { data: chamberSettings } = useFirestoreCollection<{ id: string; row13Enabled?: boolean }>('chamberSettings');
  const { data: warehouses } = useFirestoreCollection<Warehouse>('warehouses');
  const { data: allAisles } = useFirestoreCollection<Aisle>('aisles');

  const destinationType = form.watch('destinationType') || 'chamber';
  const selectedChamberId = form.watch('chamberId');
  const selectedCoordinate = form.watch('coordinate');
  const selectedWarehouse = form.watch('warehouse');
  const selectedAisle = form.watch('aisle');

  const isSubmitDisabled = destinationType === 'chamber' 
    ? (!selectedChamberId || !selectedCoordinate || selectedCoordinate === '')
    : (!selectedWarehouse || !selectedAisle || selectedAisle === '');
  
  const isItemPackaging = Boolean(
    item?.clientName?.toUpperCase().includes('VITAFOOD') ||
    item?.clientName?.toUpperCase().includes('EMBALAJE')
  );

  const sortedWarehouses = useMemo(() => {
    if (!warehouses) return [];
    return [...warehouses].sort((a, b) => naturalSort(a.name, b.name));
  }, [warehouses]);

  const filteredAisles = useMemo(() => {
    if (!selectedWarehouse || !allAisles || !warehouses) return [];
    const whObj = warehouses.find(w => w.name === selectedWarehouse || w.id === selectedWarehouse);
    if (!whObj) return [];
    return allAisles
      .filter(a => a.warehouseIds && a.warehouseIds.includes(whObj.id))
      .sort((a, b) => naturalSort(a.name, b.name));
  }, [selectedWarehouse, allAisles, warehouses]);

  const chamberSanitaryMap = useMemo(() => {
    const map = new Map<string, { hasFruit: boolean; hasPackaging: boolean }>();
    Object.keys(chambersConfig).forEach(chId => {
      map.set(chId, { hasFruit: false, hasPackaging: false });
    });

    // 1. Cherry lots are always Fruit
    (allChamberLots || []).forEach(lot => {
      if (lot.status === 'Almacenado' && lot.chamberId && lot.binCount > 0) {
        const entry = map.get(lot.chamberId);
        if (entry) entry.hasFruit = true;
      }
    });

    // 2. Receptions (Fruit vs Packaging)
    (allReceptions || []).forEach(reception => {
      const isPkg = reception.clientName?.toUpperCase().includes('VITAFOOD') || reception.clientName?.toUpperCase().includes('EMBALAJE');
      (reception.items || []).forEach(it => {
        if (it.status === 'Almacenado' && it.storageLocation?.chamberId && it.quantity > 0) {
          const entry = map.get(it.storageLocation.chamberId);
          if (entry) {
            if (isPkg) {
              entry.hasPackaging = true;
            } else {
              entry.hasFruit = true;
            }
          }
        }
      });
    });

    return map;
  }, [allChamberLots, allReceptions]);

  const capacityPerCoord = useMemo(() => {
    if (!item) return DEFAULT_PALLETS_PER_COORDINATE;
    const isFC = item.clientName === 'FALL CREEK' || item.clientName?.toUpperCase() === 'FALL CREEK';
    const isVita = item.clientName?.toUpperCase().includes('VITAFOOD');
    if (item.unit === 'Bins') {
      return clientConfig?.binsPerCoordinate ?? (isFC ? 9 : DEFAULT_BINS_PER_COORDINATE);
    }
    return clientConfig?.palletsPerCoordinate ?? (isFC ? 3 : (isVita ? 2 : DEFAULT_PALLETS_PER_COORDINATE));
  }, [item, clientConfig]);

  const { availableCoordinates, suggestion } = useMemo(() => {
    if (!selectedChamberId || !item) {
      return { availableCoordinates: [], suggestion: null };
    }

    // Incompatibility check for the selected chamber
    const sanitary = chamberSanitaryMap.get(selectedChamberId);
    if (isItemPackaging && sanitary?.hasFruit) {
      return { availableCoordinates: [], suggestion: null };
    }
    if (!isItemPackaging && sanitary?.hasPackaging) {
      return { availableCoordinates: [], suggestion: null };
    }

    const rawChamberConfig = chambersConfig[selectedChamberId];
    if (!rawChamberConfig) {
      return { availableCoordinates: [], suggestion: null };
    }
    const isChamberRow13Enabled = !!chamberSettings?.find(s => s.id === selectedChamberId)?.row13Enabled;
    const chamberConfig = getEffectiveChamberConfig(rawChamberConfig, isChamberRow13Enabled);

    const occupancyMap = new Map<string, { lots: {displayLotId: string, binCount: number, clientId: string, clientName?: string, productCode?: string, productName?: string, unit?: string }[] }>();
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
            clientId: lot.exporterId,
            productName: lot.variety,
            unit: 'Bins'
          });

          const time = safeToMillis(lot.storedAt);
          if (time > latestTimestamp) {
              latestTimestamp = time;
              lastCoordInChamber = lot.coordinate;
          }
        }
    });
    
    (allReceptions || []).forEach(reception => {
        const isFC = reception.clientName === 'FALL CREEK' || reception.clientName?.toUpperCase() === 'FALL CREEK';
        const multiplier = (isFC && reception.unit === 'Pallets') ? 3 : (reception.unit === 'Bins' ? 1 : 2);

        (reception.items || []).forEach((storedItem, idx) => {
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
                     clientId: reception.clientId,
                     clientName: reception.clientName,
                     productCode: storedItem.productCode,
                     productName: storedItem.productName,
                     unit: reception.unit
                   });
                }

                const time = safeToMillis(storedItem.storedAt);
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

    const isFallCreek = (item.clientName?.toUpperCase() === 'FALL CREEK' || item.clientId === '76361536-7');

    const currentSuggestion = prioritizedCoords.find(coord => {
        if (chamberConfig.blocked?.includes(coord)) return false;
        const entry = occupancyMap.get(coord);
        if (!entry || entry.lots.length === 0) return true; // Empty is always good

        // Incompatibility check: must be the SAME client
        const hasDifferentClient = entry.lots.some(l => l.clientId !== item.clientId);
        if (hasDifferentClient) return false;

        // Prevent mixing different unit types (Pallets vs Bins) in the same coordinate
        const hasDifferentUnit = entry.lots.some(l => l.unit && l.unit !== item.unit);
        if (hasDifferentUnit) return false;

        // Prevent mixing different varieties/products in the same coordinate
        const hasDifferentProduct = entry.lots.some(l => {
            if (isFallCreek) {
                const targetVariety = (l.productName || '').trim().toUpperCase();
                const incomingVariety = (item.productName || '').trim().toUpperCase();
                return targetVariety && incomingVariety ? targetVariety !== incomingVariety : false;
            }
            if (!l.productCode) return true;
            return l.productCode !== item.productCode;
        });
        if (hasDifferentProduct) return false;

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

        // Prevent mixing different unit types (Pallets vs Bins) in the same coordinate
        const hasDifferentUnit = entry.lots.some(l => l.unit && l.unit !== item.unit);
        if (hasDifferentUnit) return false;

        // Prevent mixing different varieties/products in the same coordinate
        const hasDifferentProduct = entry.lots.some(l => {
            if (isFallCreek) {
                const targetVariety = (l.productName || '').trim().toUpperCase();
                const incomingVariety = (item.productName || '').trim().toUpperCase();
                return targetVariety && incomingVariety ? targetVariety !== incomingVariety : false;
            }
            if (!l.productCode) return true;
            return l.productCode !== item.productCode;
        });
        if (hasDifferentProduct) return false;

        const currentOccupancy = entry.lots.reduce((sum, l) => sum + l.binCount, 0);
        return currentOccupancy + unitsPerItem <= occupancyThreshold;
    });

    return { availableCoordinates: available, suggestion: currentSuggestion };

  }, [selectedChamberId, item, allReceptions, allChamberLots, form.watch('strategy'), capacityPerCoord, lastUsedChamberId, lastUsedCoordinate, chamberSettings]);

  useEffect(() => {
    if (open && item) {
       const isFallCreek = item.clientName === 'FALL CREEK' || item.clientName?.toUpperCase() === 'FALL CREEK';
       let strategy = clientConfig?.strategy ?? (isFallCreek ? 'aisle-access' : 'secuencial');
       let totalQuantity = item.quantity;
       let qtyPerLocation = item.unit === 'Bins'
         ? (clientConfig?.binsPerCoordinate ?? (isFallCreek ? 9 : DEFAULT_BINS_PER_COORDINATE))
         : (clientConfig?.palletsPerCoordinate ?? (isFallCreek ? 3 : DEFAULT_PALLETS_PER_COORDINATE));

        // Session continuity: Only preselect chamber if there is an active session choice from lastUsedChamberId
        let chamberId = (lastUsedChamberId && chambersConfig[lastUsedChamberId]) ? lastUsedChamberId : '';
        
        // Sanitary validation: Ensure packaging doesn't preselect a chamber with fruit
        if (chamberId && isItemPackaging) {
          const sanitary = chamberSanitaryMap.get(chamberId);
          if (sanitary?.hasFruit) {
            chamberId = '';
          }
        }

       form.reset({
         totalQuantity,
         quantityPerLocation: qtyPerLocation,
         chamberId: chamberId || undefined,
         coordinate: undefined,
         strategy: strategy as any,
         destinationType: 'chamber'
        });
    }
  }, [item, open, form, clientConfig, lastUsedChamberId, isItemPackaging, chamberSanitaryMap]);

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
    if (values.destinationType === 'chamber') {
      if (values.quantityPerLocation > capacityPerCoord) {
          toast({ variant: 'destructive', title: 'Límite Excedido', description: `La cantidad por ubicación no puede ser mayor a ${capacityPerCoord} para este cliente.`});
          return;
      }
      if (values.chamberId) {
          localStorage.setItem('frio_last_chamber_id', values.chamberId);
      }
    }
    if (values.totalQuantity > item.quantity) {
        toast({ variant: 'destructive', title: 'Cantidad Inválida', description: `No puede almacenar más de lo pendiente (${item.quantity}).`});
        return;
    }
    
    onConfirm({
      chamberId: values.destinationType === 'warehouse' ? (values.warehouse || '') : (values.chamberId || ''),
      coordinate: values.destinationType === 'warehouse' ? (values.aisle || '') : (values.coordinate || ''),
      warehouse: values.warehouse,
      aisle: values.aisle,
      destinationType: values.destinationType,
      totalQuantity: values.totalQuantity,
      quantityPerLocation: values.quantityPerLocation,
      strategy: values.strategy || 'secuencial'
    });
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
            {destinationType === 'chamber' && suggestion && (
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

        {isItemPackaging && (
          <Tabs 
            value={destinationType} 
            onValueChange={(val: any) => {
              form.setValue('destinationType', val);
              if (val === 'warehouse') {
                form.setValue('chamberId', '');
                form.setValue('coordinate', '');
              } else {
                form.setValue('warehouse', '');
                form.setValue('aisle', '');
              }
            }} 
            className="w-full mt-2"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chamber" className="flex items-center justify-center gap-2 font-bold text-xs sm:text-sm">
                <Snowflake className="w-4 h-4 text-blue-500" />
                Cámara Frigorífica / Galpón
              </TabsTrigger>
              <TabsTrigger value="warehouse" className="flex items-center justify-center gap-2 font-bold text-xs sm:text-sm">
                <WarehouseIcon className="w-4 h-4 text-amber-600" />
                Almacén / Pasillo (emb)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {destinationType === 'chamber' && suggestion && selectedChamberId && (
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-2">
            {destinationType === 'chamber' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="chamberId" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Cámara</FormLabel>
                    <Select onValueChange={(value) => { field.onChange(value); form.resetField('coordinate'); }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                        {Object.values(chambersConfig).map(chamber => {
                            const sanitary = chamberSanitaryMap.get(chamber.id);
                            const isIncompatible = isItemPackaging ? sanitary?.hasFruit : sanitary?.hasPackaging;
                            const reason = isItemPackaging ? 'Incompatible (Tiene Fruta)' : 'Incompatible (Tiene Embalaje)';

                            return (
                                <SelectItem key={chamber.id} value={chamber.id} disabled={isIncompatible}>
                                  <span className={cn(isIncompatible && "text-muted-foreground line-through opacity-60")}>
                                    {chamber.name}
                                  </span>
                                  {isIncompatible && (
                                    <span className="text-[10px] text-destructive ml-1.5 font-bold">
                                      ⚠️ [{reason}]
                                    </span>
                                  )}
                                  {!isIncompatible && clientConfig?.chamberOverrides?.[chamber.id] && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      (Cap. Reservada: {clientConfig.chamberOverrides[chamber.id]})
                                    </span>
                                  )}
                                </SelectItem>
                            );
                        })}
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
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="warehouse" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Almacén / Bodega (emb)</FormLabel>
                      <Select 
                        onValueChange={(val) => { 
                          field.onChange(val); 
                          form.resetField('aisle'); 
                        }} 
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione Almacén..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedWarehouses.length > 0 ? (
                            sortedWarehouses.map(wh => (
                              <SelectItem key={wh.id} value={wh.name}>
                                {wh.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">
                              No hay almacenes configurados en Datos Maestros.
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="aisle" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pasillo (emb)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value} 
                        disabled={!selectedWarehouse}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={!selectedWarehouse ? "Seleccione almacén primero" : "Seleccione pasillo..."} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredAisles.length > 0 ? (
                            filteredAisles.map(aisle => (
                              <SelectItem key={aisle.id} value={aisle.name}>
                                {aisle.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-xs text-center text-muted-foreground">
                              No hay pasillos para este almacén.
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                )} />
              </div>
            )}
            
            {/* Hidden quantity fields */}
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
