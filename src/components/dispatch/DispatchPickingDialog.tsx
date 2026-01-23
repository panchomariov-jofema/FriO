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
import type { Dispatch } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { Download } from 'lucide-react';
import { naturalSort } from '@/lib/utils';
import { Input } from '../ui/input';

interface DispatchPickingDialogProps {
  dispatch: Dispatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDispatch: (dispatch: Dispatch, quantities: Record<string, number>) => void;
  isConfirming: boolean;
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

export function DispatchPickingDialog({ dispatch, open, onOpenChange, onConfirmDispatch, isConfirming }: DispatchPickingDialogProps) {
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (dispatch) {
      setPickedItems({});
      const initialQuantities = dispatch.bins.reduce((acc, bin) => {
        acc[bin.chamberLotId] = bin.binCount;
        return acc;
      }, {} as Record<string, number>);
      setQuantities(initialQuantities);
    }
  }, [dispatch]);

  if (!dispatch) return null;

  const handleQuantityChange = (chamberLotId: string, originalCount: number, newCountStr: string) => {
    let newCount = parseInt(newCountStr, 10);
    if (isNaN(newCount) || newCount < 0) {
      newCount = 0;
    }
    if (newCount > originalCount) {
      newCount = originalCount;
    }
    setQuantities(prev => ({ ...prev, [chamberLotId]: newCount }));
  };

  const totalPickedBins = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  const allItems = [...dispatch.bins].sort((a, b) => naturalSort(a.coordinate, b.coordinate));
  const allItemsPicked = allItems.length > 0 && allItems.every(item => pickedItems[item.chamberLotId]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    const newPickedItems: Record<string, boolean> = {};
    if (checked === true) {
      allItems.forEach(item => {
        newPickedItems[item.chamberLotId] = true;
      });
    }
    setPickedItems(newPickedItems);
  };
  
  const handleItemCheck = (chamberLotId: string, checked: boolean) => {
    setPickedItems(prev => {
        const newPicked = {...prev};
        if(checked) {
            newPicked[chamberLotId] = true;
        } else {
            delete newPicked[chamberLotId];
        }
        return newPicked;
    });
  };
  
  const checkedCount = Object.keys(pickedItems).length;
  const allItemsCount = allItems.length;
  const selectAllState = checkedCount === allItemsCount && allItemsCount > 0 ? true : checkedCount === 0 ? false : 'indeterminate';

  const handleExportCSV = () => {
    const dataToExport = allItems.map(item => ({
        lote: item.displayLotId,
        camara: item.chamberId,
        coordenada: item.coordinate,
        bins: quantities[item.chamberLotId] ?? item.binCount,
    }));
    
    const headers = [
        { key: 'lote', label: 'Lote' },
        { key: 'camara', label: 'Cámara' },
        { key: 'coordenada', label: 'Coordenada' },
        { key: 'bins', label: 'Bins' },
    ];
    
    const csv = convertToCSV(dataToExport, headers);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `picking_despacho_${dispatch.exporterName}_${date}.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Picking de Despacho: {dispatch.exporterName}</DialogTitle>
          <DialogDescription>
            Confirme la recolección física de cada ubicación. Total a despachar: {totalPickedBins} bins.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-96 border rounded-md">
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
                <TableHead>Lote</TableHead>
                <TableHead>Cámara</TableHead>
                <TableHead>Coordenada</TableHead>
                <TableHead className="w-24">Bins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems.map((bin) => (
                <TableRow key={bin.chamberLotId}>
                  <TableCell>
                     <Checkbox
                        checked={!!pickedItems[bin.chamberLotId]}
                        onCheckedChange={(checked) => handleItemCheck(bin.chamberLotId, !!checked)}
                      />
                  </TableCell>
                  <TableCell>{bin.displayLotId}</TableCell>
                  <TableCell>{bin.chamberId}</TableCell>
                  <TableCell>{bin.coordinate}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={quantities[bin.chamberLotId] ?? ''}
                      onChange={(e) => handleQuantityChange(bin.chamberLotId, bin.binCount, e.target.value)}
                      max={bin.binCount}
                      min={0}
                      className="h-8 w-20"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
            <Button onClick={() => onConfirmDispatch(dispatch, quantities)} disabled={!allItemsPicked || isConfirming}>
              {isConfirming ? 'Confirmando...' : 'Confirmar Salida'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
