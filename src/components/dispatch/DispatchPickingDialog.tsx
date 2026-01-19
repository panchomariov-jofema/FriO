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
import { Printer } from 'lucide-react';
import { naturalSort } from '@/lib/utils';

interface DispatchPickingDialogProps {
  dispatch: Dispatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDispatch: (dispatch: Dispatch) => void;
  isConfirming: boolean;
}

export function DispatchPickingDialog({ dispatch, open, onOpenChange, onConfirmDispatch, isConfirming }: DispatchPickingDialogProps) {
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (dispatch) {
      setPickedItems({});
    }
  }, [dispatch]);

  const handlePrint = () => {
    window.print();
  };

  if (!dispatch) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl printable-area">
        <DialogHeader className="no-print">
          <DialogTitle>Picking de Despacho: {dispatch.exporterName}</DialogTitle>
          <DialogDescription>
            Confirme la recolección física de cada ubicación. Total: {dispatch.totalBins} bins.
          </DialogDescription>
        </DialogHeader>
        <div>
          <ScrollArea className="max-h-96 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] no-print">
                     <Checkbox
                        checked={selectAllState}
                        onCheckedChange={handleSelectAll}
                        aria-label="Seleccionar todo"
                      />
                  </TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Cámara</TableHead>
                  <TableHead>Coordenada</TableHead>
                  <TableHead>Bins</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allItems.map((bin) => (
                  <TableRow key={bin.chamberLotId}>
                    <TableCell className="no-print">
                       <Checkbox
                          checked={!!pickedItems[bin.chamberLotId]}
                          onCheckedChange={(checked) => handleItemCheck(bin.chamberLotId, !!checked)}
                        />
                    </TableCell>
                    <TableCell>{bin.displayLotId}</TableCell>
                    <TableCell>{bin.chamberId}</TableCell>
                    <TableCell>{bin.coordinate}</TableCell>
                    <TableCell>{bin.binCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        <DialogFooter className="sm:justify-between pt-4 no-print">
           <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir Picking
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={() => onConfirmDispatch(dispatch)} disabled={!allItemsPicked || isConfirming}>
              {isConfirming ? 'Confirmando...' : 'Confirmar Salida'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
