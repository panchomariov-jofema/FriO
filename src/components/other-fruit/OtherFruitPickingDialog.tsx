'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { QrCode, Trash2, CheckCircle2, ScanLine } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { OtherFruitMovement, OtherFruitMovementLocation, OtherFruitReception } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface OtherFruitPickingDialogProps {
  movement: OtherFruitMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmExit: (confirmedMovement: OtherFruitMovement) => void;
  isConfirming: boolean;
  otherFruitReceptions?: OtherFruitReception[];
}

interface PickingItem extends OtherFruitMovementLocation {
    compositeKey: string;
}

export function OtherFruitPickingDialog({ 
  movement, 
  open, 
  onOpenChange, 
  onConfirmExit, 
  isConfirming,
  otherFruitReceptions = []
}: OtherFruitPickingDialogProps) {
  const { toast } = useToast();
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  
  // Laser Scan State
  const [barcodeInput, setBarcodeInput] = React.useState('');
  const [scannedQrCodes, setScannedQrCodes] = React.useState<Set<string>>(new Set());
  const [scannedPallets, setScannedPallets] = React.useState<Set<string>>(new Set());
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isFallCreek = React.useMemo(() => {
    return movement?.clientName?.toUpperCase() === 'FALL CREEK';
  }, [movement]);

  const flatItems = React.useMemo((): PickingItem[] => {
    if (!movement?.locations) return [];
    return movement.locations.map(loc => ({
        ...loc,
        compositeKey: `${loc.receptionId}_${loc.itemIndex}`
    }));
  }, [movement]);

  // Retrieve stored bins in the coordinate(s) matching this dispatch
  const storedBins = React.useMemo(() => {
      if (!movement || !otherFruitReceptions) return [];
      const locCoords = new Set((movement.locations || []).map(l => `${l.location.chamberId}_${l.location.coordinate}`));
      return (otherFruitReceptions || []).flatMap(r => 
          (r.items || []).map((item, idx) => ({ ...item, receptionId: r.id, itemIndex: idx }))
      ).filter(item => 
          item.status === 'Almacenado' && 
          item.storageLocation && 
          locCoords.has(`${item.storageLocation.chamberId}_${item.storageLocation.coordinate}`)
      );
  }, [movement, otherFruitReceptions]);

  // Auto focus input when dialog opens or when user clicks dialog body
  React.useEffect(() => {
    if (open && isFallCreek) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [open, isFallCreek]);

  React.useEffect(() => {
    if (flatItems) {
        const initialQuantities = flatItems.reduce((acc, item) => {
            acc[item.compositeKey] = isFallCreek ? 0 : item.quantity;
            return acc;
        }, {} as Record<string, number>);
        setQuantities(initialQuantities);
        setPickedItems({});
        setScannedQrCodes(new Set());
        setScannedPallets(new Set());
        setBarcodeInput('');
    }
  }, [flatItems, isFallCreek, open]);

  if (!movement) return null;

  const handleQuantityChange = (compositeKey: string, originalCount: number, newCountStr: string) => {
    if (isFallCreek) return; // Quantities are auto-calculated from scans for Fall Creek

    let newCount = parseInt(newCountStr, 10);
    if (isNaN(newCount) || newCount < 0) {
        newCount = 0;
    }
    if (newCount > originalCount) {
        newCount = originalCount;
        toast({
            title: 'Cantidad excede lo solicitado',
            description: `No puede recoger más de ${originalCount} unidades para esta ubicación.`,
            variant: 'destructive',
        });
    }
    setQuantities(prev => ({ ...prev, [compositeKey]: newCount }));
  };

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (isFallCreek) return; // Checkboxes are disabled for Fall Creek

    const newPickedItems: Record<string, boolean> = {};
    if (checked === true) {
      flatItems.forEach(item => {
        newPickedItems[item.compositeKey] = true;
      });
    }
    setPickedItems(newPickedItems);
  };
  
  const handleItemCheck = (compositeKey: string, checked: boolean) => {
    if (isFallCreek) return; // Checkboxes are disabled for Fall Creek

    setPickedItems(prev => {
        const newPicked = {...prev};
        if(checked) {
            newPicked[compositeKey] = true;
        } else {
            delete newPicked[compositeKey];
        }
        return newPicked;
    });
  };

  // QR Scan Handler
  const handleScan = (scannedCode: string) => {
    const matchedBin = storedBins.find(b => b.containerId?.trim() === scannedCode.trim());
    if (!matchedBin) {
      toast({
        title: "Código no encontrado",
        description: "Este código QR no está registrado en las coordenadas de este despacho.",
        variant: "destructive"
      });
      return;
    }

    if (scannedQrCodes.has(scannedCode)) {
      toast({
        title: "Ya escaneado",
        description: "Este bin ya fue escaneado."
      });
      return;
    }

    const palletId = matchedBin.palletId || 'Loose';

    // Find if the variety/coordinate is requested at all
    const targetItem = flatItems.find(item => 
      item.productCode === matchedBin.productCode && 
      item.location.chamberId === matchedBin.storageLocation?.chamberId &&
      item.location.coordinate === matchedBin.storageLocation?.coordinate
    );

    if (!targetItem) {
      toast({
        title: "Diferente variedad",
        description: "Este bin corresponde a una variedad o lote no solicitado en este despacho.",
        variant: "destructive"
      });
      return;
    }

    // Calculate how many bins of this pallet are currently stored in this chamber coordinate
    const binsInChamberForPallet = storedBins.filter(b => 
      b.palletId === palletId && 
      b.storageLocation?.chamberId === matchedBin.storageLocation?.chamberId &&
      b.storageLocation?.coordinate === matchedBin.storageLocation?.coordinate
    );
    const totalStoredInPallet = binsInChamberForPallet.length;

    // Find all items of this variety/coordinate in the dispatch
    const locItems = flatItems.filter(item => 
      item.productCode === matchedBin.productCode && 
      item.location.chamberId === matchedBin.storageLocation?.chamberId &&
      item.location.coordinate === matchedBin.storageLocation?.coordinate
    );

    // Calculate total remaining bins to be picked for this variety/coordinate
    const totalRemainingForLoc = locItems.reduce((sum, item) => 
      sum + (item.quantity - (quantities[item.compositeKey] ?? 0)), 0
    );

    if (totalRemainingForLoc <= 0) {
      toast({
        title: "Ubicación completa",
        description: `Ya se ha escaneado la cantidad requerida para la ubicación ${targetItem.location.chamberId} / ${targetItem.location.coordinate}.`
      });
      return;
    }

    // Decide if we apply the smart pallet scan (auto-confirm 3 bins)
    const isPalletAlreadyScanned = palletId !== 'Loose' && scannedPallets.has(palletId);
    const canAutoConfirmPallet = palletId !== 'Loose' && !isPalletAlreadyScanned && totalStoredInPallet === 3 && totalRemainingForLoc >= 3;

    let confirmedCount = 1;
    let autoConfirmedMsg = "";

    if (canAutoConfirmPallet) {
      confirmedCount = 3;
      autoConfirmedMsg = " (Pallet completo - Auto-confirmado 3 bins)";
    }

    // Distribute the confirmedCount across the items that still need picking
    let remainingToDistribute = confirmedCount;
    const updatedQuantities = { ...quantities };

    for (const item of locItems) {
      if (remainingToDistribute <= 0) break;
      const currentQty = updatedQuantities[item.compositeKey] ?? 0;
      const needed = item.quantity - currentQty;
      if (needed > 0) {
        const toAdd = Math.min(needed, remainingToDistribute);
        updatedQuantities[item.compositeKey] = currentQty + toAdd;
        remainingToDistribute -= toAdd;
      }
    }

    // Update state
    setQuantities(updatedQuantities);

    setScannedQrCodes(prev => {
      const next = new Set(prev);
      next.add(scannedCode);
      return next;
    });

    if (palletId !== 'Loose') {
      setScannedPallets(prev => {
        const next = new Set(prev);
        next.add(palletId);
        return next;
      });
    }

    toast({
      title: "Bin Escaneado",
      description: `Se confirmó ${confirmedCount} bin(s) de la variedad ${locItems[0]?.productName || ''}${autoConfirmedMsg}.`,
    });
  };

  const handleResetScanning = () => {
    setScannedQrCodes(new Set());
    setScannedPallets(new Set());
    const resetQuantities = flatItems.reduce((acc, item) => {
        acc[item.compositeKey] = 0;
        return acc;
    }, {} as Record<string, number>);
    setQuantities(resetQuantities);
    setBarcodeInput('');
    toast({
      title: "Escaneo reiniciado",
      description: "Se han borrado los códigos escaneados y cantidades a retirar.",
    });
  };

  const handleConfirm = () => {
    if (!movement) return;

    const newMovement: OtherFruitMovement = JSON.parse(JSON.stringify(movement));
    let totalPickedOverall = 0;

    const newLocations = newMovement.locations?.map(loc => {
        const compositeKey = `${loc.receptionId}_${loc.itemIndex}`;
        const pickedQty = quantities[compositeKey] ?? 0;
        totalPickedOverall += pickedQty;
        return {...loc, quantity: pickedQty };
    }).filter(loc => loc.quantity > 0) || [];

    newMovement.locations = newLocations;
    
    // Recalculate summary items based on what was actually picked
    const summaryItems = newLocations.reduce((acc, loc) => {
      const key = loc.productCode;
      if (!acc[key]) {
          acc[key] = {
              productCode: loc.productCode,
              productName: loc.productName,
              quantity: 0,
              clientLotIds: new Set<string>(),
          };
      }
      acc[key].quantity += loc.quantity;
      if (loc.clientLotId) {
          acc[key].clientLotIds.add(loc.clientLotId);
      }
      return acc;
    }, {} as Record<string, { productCode: string; productName: string; quantity: number; clientLotIds: Set<string> }>);
    
    newMovement.items = Object.values(summaryItems).map(summary => {
        const item: any = {
            productCode: summary.productCode,
            productName: summary.productName,
            quantity: summary.quantity,
        };
        const clientLotIds = Array.from(summary.clientLotIds).join(', ');
        if (clientLotIds) {
            item.clientLotId = clientLotIds;
        }
        return item;
    });

    if (totalPickedOverall === 0) {
        toast({
            variant: 'destructive',
            title: 'Nada para confirmar',
            description: 'Debe ingresar una cantidad mayor a 0 para al menos un ítem.',
        });
        return;
    }

    onConfirmExit(newMovement);
  };
  
  const checkedCount = Object.keys(pickedItems).length;
  const allItemsCount = flatItems.length;
  const selectAllState = checkedCount === allItemsCount && allItemsCount > 0 ? true : checkedCount === 0 ? false : 'indeterminate';
  
  const allItemsPicked = allItemsCount > 0 && flatItems.every(item => {
      if (isFallCreek) {
          return (quantities[item.compositeKey] ?? 0) === item.quantity;
      }
      return !!pickedItems[item.compositeKey];
  });
  
  const totalPicked = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const totalExpected = flatItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md md:max-w-xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" onClick={() => isFallCreek && inputRef.current?.focus()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {isFallCreek ? <QrCode className="h-6 w-6 text-[#7aba28]" /> : null}
            Picking de Despacho: {movement.clientName}
          </DialogTitle>
          <DialogDescription>
            {isFallCreek 
              ? `Escanee los bins con el lector láser. Retirado: ${totalPicked} de ${totalExpected} Bins.`
              : `Confirme la recolección física de cada artículo. Total: ${totalPicked} ${movement.unit}.`
            }
          </DialogDescription>
        </DialogHeader>

        {/* Laser Scanner Input Box always focused for Fall Creek */}
        {isFallCreek && (
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (barcodeInput.trim()) {
                handleScan(barcodeInput.trim());
                setBarcodeInput('');
              }
            }}
            className="flex flex-col gap-2 p-3 bg-muted/40 border border-[#7aba28]/25 rounded-lg shadow-sm"
          >
            <div className="flex items-center justify-between">
              <Label htmlFor="laser-scanner-input" className="text-xs font-bold text-[#7aba28] uppercase tracking-wider block">
                Lector Láser (Siempre Activo)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetScanning();
                }}
                className="h-7 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 px-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Reiniciar Escaneo
              </Button>
            </div>
            <Input
              id="laser-scanner-input"
              ref={inputRef}
              placeholder="Escanee un código QR aquí con el lector láser..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onClick={(e) => e.currentTarget.focus()}
              inputMode="none"
              className="h-11 font-mono text-sm uppercase tracking-widest border-[#7aba28]/35 focus-visible:ring-[#7aba28] bg-background w-full"
              autoFocus
              autoComplete="off"
            />
          </form>
        )}

        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] px-2 text-center">
                  {!isFallCreek && (
                    <Checkbox
                        checked={selectAllState}
                        onCheckedChange={handleSelectAll}
                        aria-label="Seleccionar todo"
                    />
                  )}
                </TableHead>
                <TableHead className="px-2">Producto</TableHead>
                <TableHead className="px-2">Ubicación</TableHead>
                <TableHead className="text-right w-28 px-2">Cantidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatItems.map((item) => {
                const progress = quantities[item.compositeKey] ?? 0;
                const complete = progress === item.quantity;
                const hasScanned = progress > 0;

                return (
                  <TableRow key={item.compositeKey} className={complete ? "bg-[#7aba28]/5" : ""}>
                    <TableCell className="px-2 text-center">
                       {isFallCreek ? (
                         complete ? (
                           <CheckCircle2 className="h-5 w-5 text-[#7aba28] mx-auto" />
                         ) : hasScanned ? (
                           <ScanLine className="h-5 w-5 text-amber-500 animate-pulse mx-auto" />
                         ) : (
                           <QrCode className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                         )
                       ) : (
                         <Checkbox
                            checked={!!pickedItems[item.compositeKey]}
                            onCheckedChange={(checked) => handleItemCheck(item.compositeKey, !!checked)}
                            className="mx-auto"
                          />
                       )}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                        <div className="font-semibold text-sm leading-tight">{item.productName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.clientLotId || 'N/A'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm px-2">{item.location.chamberId}<br/>{item.location.coordinate}</TableCell>
                    <TableCell className="text-right font-medium px-2">
                       {isFallCreek ? (
                         <div className="text-sm font-semibold whitespace-nowrap">
                           <span className={complete ? "text-[#7aba28] font-bold" : "text-amber-600"}>{progress}</span>
                           <span className="text-muted-foreground font-normal text-xs"> / {item.quantity}</span>
                         </div>
                       ) : (
                         <Input
                              type="number"
                              value={quantities[item.compositeKey] ?? ''}
                              onChange={(e) => handleQuantityChange(item.compositeKey, item.quantity, e.target.value)}
                              max={item.quantity}
                              min={0}
                              className="h-8 w-16 ml-auto text-right px-1.5"
                          />
                       )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* List of scanned QR codes for Fall Creek */}
        {isFallCreek && scannedQrCodes.size > 0 && (
          <div className="space-y-1.5 p-3 bg-muted/20 border border-border rounded-md">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Escaneados en esta Sesión ({scannedQrCodes.size})
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
              {Array.from(scannedQrCodes).map((code, idx) => (
                <Badge key={idx} variant="secondary" className="font-mono text-[9px] px-1.5 py-0.5 bg-background border text-zinc-600">
                  {code}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex sm:flex-row gap-2 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="flex-1">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleConfirm} disabled={!allItemsPicked || isConfirming} className="flex-1 bg-[#7aba28] hover:bg-[#6ba323] text-white">
            {isConfirming ? 'Confirmando...' : 'Confirmar Salida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
