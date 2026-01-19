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
import { z } from 'zod';
import { packagingExitSchema } from '@/lib/schemas';
import { Input } from '../ui/input';

type ExitFormValues = z.infer<typeof packagingExitSchema>;

interface PackagingPickingDialogProps {
  payload: ExitFormValues | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmExit: (payload: ExitFormValues) => void;
  isConfirming: boolean;
  clientName: string;
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

const flattenPayload = (payload: ExitFormValues) => {
    if (!payload) return [];
    return payload.items.flatMap(item => 
        (item.locations || []).map(loc => ({
            ...loc,
            itemCode: item.packagingMasterCode,
            itemName: item.packagingMasterName,
            compositeKey: `${item.packagingMasterCode}_${loc.locationKey}`
        }))
    ).filter(item => item.palletsToWithdraw > 0);
};

export function PackagingPickingDialog({ payload, open, onOpenChange, onConfirmExit, isConfirming, clientName }: PackagingPickingDialogProps) {
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  const flatItems = React.useMemo(() => payload ? flattenPayload(payload) : [], [payload]);

  React.useEffect(() => {
    if (payload) {
      const initialQuantities = flatItems.reduce((acc, item) => {
        acc[item.compositeKey] = item.palletsToWithdraw;
        return acc;
      }, {} as Record<string, number>);
      setQuantities(initialQuantities);
      setPickedItems({});
    }
  }, [payload, flatItems]);

  if (!payload) return null;

  const handleQuantityChange = (compositeKey: string, available: number, newCountStr: string) => {
    let newCount = parseInt(newCountStr, 10);
    if (isNaN(newCount) || newCount < 0) {
      newCount = 0;
    }
    if (newCount > available) {
      newCount = available;
    }
    setQuantities(prev => ({ ...prev, [compositeKey]: newCount }));
  };
  
  const totalPickedPallets = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

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
  
  const checkedCount = Object.keys(pickedItems).length;
  const allItemsCount = flatItems.length;
  const selectAllState = checkedCount === allItemsCount && allItemsCount > 0 ? true : checkedCount === 0 ? false : 'indeterminate';
  const allItemsPicked = allItemsCount > 0 && checkedCount === allItemsCount;

  const handleExportCSV = () => {
    const dataToExport = flatItems.map(item => ({
        codigo: item.itemCode,
        articulo: item.itemName,
        ubicacion: item.locationString,
        cantidad: quantities[item.compositeKey] ?? item.palletsToWithdraw,
    }));
    
    const headers = [
        { key: 'codigo', label: 'Código' },
        { key: 'articulo', label: 'Artículo' },
        { key: 'ubicacion', label: 'Ubicación' },
        { key: 'cantidad', label: 'Pallets a Retirar' },
    ];

    const csv = convertToCSV(dataToExport, headers);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `picking_embalaje_${clientName}_${date}.csv`);
  };

  const handleConfirm = () => {
    if (!payload) return;

    const newPayload: ExitFormValues = JSON.parse(JSON.stringify(payload));
    
    newPayload.items.forEach(item => {
        let totalPalletsForItem = 0;
        if (item.locations) {
            const updatedLocations = item.locations.map(loc => {
                const compositeKey = `${item.packagingMasterCode}_${loc.locationKey}`;
                const newQuantity = quantities[compositeKey];
                
                if (typeof newQuantity === 'number') {
                    loc.palletsToWithdraw = newQuantity;
                }
                return loc;
            }).filter(loc => loc.palletsToWithdraw > 0);

            item.locations = updatedLocations;
            
            totalPalletsForItem = item.locations.reduce((sum, loc) => sum + loc.palletsToWithdraw, 0);
        }
        item.palletCount = totalPalletsForItem;
    });

    newPayload.items = newPayload.items.filter(item => item.palletCount > 0);

    onConfirmExit(newPayload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Picking de Salida de Embalaje: {clientName}</DialogTitle>
          <DialogDescription>
            Confirme la recolección física de cada artículo y ubicación. Total a retirar: {totalPickedPallets} pallets.
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
                  <TableHead>Artículo</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right w-36">Pallets a Retirar</TableHead>
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
                        <div className="font-medium">{item.itemName}</div>
                        <div className="text-sm text-muted-foreground">{item.itemCode}</div>
                    </TableCell>
                    <TableCell>{item.locationString}</TableCell>
                    <TableCell className="text-right">
                       <Input
                            type="number"
                            value={quantities[item.compositeKey] ?? ''}
                            onChange={(e) => handleQuantityChange(item.compositeKey, item.available || item.palletsToWithdraw, e.target.value)}
                            max={item.available || item.palletsToWithdraw}
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
