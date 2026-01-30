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
import { ScrollArea } from '../ui/scroll-area';
import { Download } from 'lucide-react';
import { Input } from '../ui/input';
import { OtherFruitMovement, OtherFruitMovementLocation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface OtherFruitPickingDialogProps {
  movement: OtherFruitMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmExit: (confirmedMovement: OtherFruitMovement) => void;
  isConfirming: boolean;
}

interface PickingItem extends OtherFruitMovementLocation {
    compositeKey: string;
}

function convertToCSV(data: any[], headers: {key: string, label: string}[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            const stringValue = String(row[header.key] ?? '');
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}

function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function OtherFruitPickingDialog({ movement, open, onOpenChange, onConfirmExit, isConfirming }: OtherFruitPickingDialogProps) {
  const { toast } = useToast();
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  
  const flatItems = React.useMemo((): PickingItem[] => {
    if (!movement?.locations) return [];
    return movement.locations.map(loc => ({
        ...loc,
        compositeKey: `${loc.receptionId}_${loc.itemIndex}`
    }));
  }, [movement]);

  React.useEffect(() => {
    if (flatItems) {
        const initialQuantities = flatItems.reduce((acc, item) => {
            acc[item.compositeKey] = item.quantity;
            return acc;
        }, {} as Record<string, number>);
        setQuantities(initialQuantities);
        setPickedItems({});
    }
  }, [flatItems]);


  if (!movement) return null;

  const handleQuantityChange = (compositeKey: string, originalCount: number, newCountStr: string) => {
    let newCount = parseInt(newCountStr, 10);
    if (isNaN(newCount) || newCount < 0) {
        newCount = 0;
    }
    if (newCount > originalCount) {
        newCount = originalCount;
    }
    setQuantities(prev => ({ ...prev, [compositeKey]: newCount }));
  };

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    const newPickedItems: Record<string, boolean> = {};
    if (checked === true) {
      flatItems.forEach(item => {
        newPickedItems[item.compositeKey] = true;
      });
    }
    setPickedItems(newPickedItems);
  };
  
  const handleItemCheck = (compositeKey: string, checked: boolean) => {
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
  const allItemsPicked = allItemsCount > 0 && checkedCount === allItemsCount;

  const handleExportCSV = () => {
    const dataToExport = flatItems.map(item => ({
        lote_cliente: item.clientLotId || 'N/A',
        producto: item.productName,
        camara: item.location.chamberId,
        coordenada: item.location.coordinate,
        cantidad: quantities[item.compositeKey] ?? item.quantity,
        unidad: item.unit
    }));
    
    const headers = [
        { key: 'lote_cliente', label: 'Lote Cliente' },
        { key: 'producto', label: 'Producto' },
        { key: 'camara', label: 'Cámara' },
        { key: 'coordenada', label: 'Coordenada' },
        { key: 'cantidad', label: 'Cantidad a Retirar' },
        { key: 'unidad', label: 'Unidad' },
    ];

    const csv = convertToCSV(dataToExport, headers);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `picking_fruta_${movement.clientName}_${date}.csv`);
  };
  
  const totalPicked = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Picking de Despacho de Fruta: {movement.clientName}</DialogTitle>
          <DialogDescription>
            Confirme la recolección física de cada artículo y ubicación. Total a retirar: {totalPicked} {movement.unit}.
          </DialogDescription>
        </DialogHeader>
        <div>
          <ScrollArea className="max-h-96 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                        checked={selectAllState}
                        onCheckedChange={handleSelectAll}
                        aria-label="Seleccionar todo"
                    />
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right w-36">Cantidad a Retirar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatItems.map((item) => (
                  <TableRow key={item.compositeKey}>
                    <TableCell>
                       <Checkbox
                          checked={!!pickedItems[item.compositeKey]}
                          onCheckedChange={(checked) => handleItemCheck(item.compositeKey, !!checked)}
                        />
                    </TableCell>
                    <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-sm text-muted-foreground font-mono">{item.clientLotId || 'N/A'}</div>
                    </TableCell>
                    <TableCell className="font-mono">{item.location.chamberId} / {item.location.coordinate}</TableCell>
                    <TableCell className="text-right">
                       <Input
                            type="number"
                            value={quantities[item.compositeKey] ?? ''}
                            onChange={(e) => handleQuantityChange(item.compositeKey, item.quantity, e.target.value)}
                            max={item.quantity}
                            min={0}
                            className="h-8 w-24 ml-auto text-right"
                        />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        <DialogFooter className="sm:justify-between pt-4">
           <Button variant="outline" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleConfirm} disabled={!allItemsPicked || isConfirming}>
              {isConfirming ? 'Confirmando...' : 'Confirmar Salida'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    