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
import { FileText } from 'lucide-react';
import { z } from 'zod';
import { packagingExitSchema } from '@/lib/schemas';
import { Input } from '../ui/input';
import { PackagingMovement, PackagingReception } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


type ExitFormValues = z.infer<typeof packagingExitSchema>;

interface PackagingPickingDialogProps {
  movement: PackagingMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmExit: (payload: ExitFormValues) => void;
  isConfirming: boolean;
  clientName: string;
  allReceptions: PackagingReception[];
  loadingReceptions: boolean;
}

// Helper to get a unique key for a location
const getLocationKey = (receptionId: string, itemIndex: number) => `${receptionId}_${itemIndex}`;


export function PackagingPickingDialog({ movement, open, onOpenChange, onConfirmExit, isConfirming, clientName, allReceptions, loadingReceptions }: PackagingPickingDialogProps) {
  const { toast } = useToast();
  const [confirmedPayload, setConfirmedPayload] = React.useState<ExitFormValues | null>(null);
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (movement && allReceptions.length > 0) {
        // This logic runs once when the dialog opens to prepare the picking list.
        const stockMap: Record<string, { name: string, locations: { locationKey: string, locationString: string, available: number, receptionId: string, itemIndex: number }[] }> = {};

        allReceptions
            .filter(r => r.clientId === movement.clientId && (r.status === 'Almacenado' || r.status === 'Parcialmente Almacenado'))
            .forEach(reception => {
                reception.items.forEach((item, index) => {
                    if (item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation) {
                        if (!stockMap[item.packagingMasterCode]) {
                            stockMap[item.packagingMasterCode] = { name: item.packagingMasterName, locations: [] };
                        }
                        const locationKey = getLocationKey(reception.id, index);
                        stockMap[item.packagingMasterCode].locations.push({
                            locationKey,
                            locationString: `${item.storageLocation.warehouse} / ${item.storageLocation.aisle}`,
                            available: item.palletCount,
                            receptionId: reception.id,
                            itemIndex: index,
                        });
                    }
                });
            });

        const payload: ExitFormValues = {
            clientId: movement.clientId,
            document: movement.document,
            items: [],
        };

        const errors: string[] = [];

        for(const requestedItem of movement.items) {
            const itemStock = stockMap[requestedItem.packagingMasterCode];
            if (!itemStock) {
                errors.push(`No hay stock para el artículo ${requestedItem.packagingMasterCode}.`);
                continue;
            }
            
            let needed = requestedItem.palletCount;
            const newItem: z.infer<typeof packagingExitSchema.shape.items.element> = {
                ...requestedItem,
                palletCount: 0,
                locations: [],
            };

            // FIFO: Sort locations by reception date
            itemStock.locations.sort((a,b) => {
                const receptionA = allReceptions.find(r => r.id === a.receptionId)!.createdAt.toMillis();
                const receptionB = allReceptions.find(r => r.id === b.receptionId)!.createdAt.toMillis();
                return receptionA - receptionB;
            });

            for (const loc of itemStock.locations) {
                if (needed > 0) {
                    const toWithdraw = Math.min(needed, loc.available);
                    newItem.locations!.push({
                        ...loc,
                        palletsToWithdraw: toWithdraw,
                    });
                    newItem.palletCount += toWithdraw;
                    needed -= toWithdraw;
                } else {
                    break;
                }
            }

            if (needed > 0) {
                errors.push(`Stock insuficiente para ${requestedItem.packagingMasterCode}. Solicitado: ${requestedItem.palletCount}, Disponible: ${requestedItem.palletCount - needed}`);
            }
            payload.items.push(newItem);
        }

        if (errors.length > 0) {
            toast({ title: 'Error de Stock', description: errors.join(' '), variant: 'destructive'});
            onOpenChange(false);
            return;
        }

        setConfirmedPayload(payload);
        setPickedItems({});

    }
  }, [movement, allReceptions, toast, onOpenChange]);

  const flatItems = React.useMemo(() => {
    if (!confirmedPayload) return [];
    return confirmedPayload.items.flatMap(item => 
        (item.locations || []).map(loc => ({
            ...loc,
            itemCode: item.packagingMasterCode,
            itemName: item.packagingMasterName,
            compositeKey: `${item.packagingMasterCode}_${loc.locationKey}`
        }))
    ).filter(item => item.palletsToWithdraw > 0);
  }, [confirmedPayload]);

  React.useEffect(() => {
    if (flatItems) {
        const initialQuantities = flatItems.reduce((acc, item) => {
            acc[item.compositeKey] = item.palletsToWithdraw;
            return acc;
        }, {} as Record<string, number>);
        setQuantities(initialQuantities);
    }
  }, [flatItems]);


  if (!movement || !confirmedPayload) return null; // Or a loading state

  const handleQuantityChange = (compositeKey: string, originalCount: number, newCountStr: string) => {
    let newCount = parseInt(newCountStr, 10);
    if (isNaN(newCount) || newCount < 0) {
        newCount = 0;
    }
    if (newCount > originalCount) {
        newCount = originalCount; // Cannot exceed originally allocated amount
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
    if (!confirmedPayload) return;

    const newPayload: ExitFormValues = JSON.parse(JSON.stringify(confirmedPayload));
    
    let totalPalletsOverall = 0;

    newPayload.items.forEach(item => {
        let itemTotalPallets = 0;
        if (item.locations) {
            item.locations.forEach(loc => {
                const compositeKey = `${item.packagingMasterCode}_${getLocationKey(loc.receptionId, loc.itemIndex)}`;
                const pickedQty = quantities[compositeKey] ?? 0;
                loc.palletsToWithdraw = pickedQty;
                itemTotalPallets += pickedQty;
            });
        }
        item.palletCount = itemTotalPallets;
        totalPalletsOverall += itemTotalPallets;
    });

    newPayload.items = newPayload.items.filter(item => item.palletCount > 0);

    if (totalPalletsOverall === 0) {
        toast({
            variant: 'destructive',
            title: 'Nada para confirmar',
            description: 'Debe ingresar una cantidad mayor a 0 para al menos un ítem.',
        });
        return;
    }

    onConfirmExit(newPayload);
  };
  
  const checkedCount = Object.keys(pickedItems).length;
  const allItemsCount = flatItems.length;
  const selectAllState = checkedCount === allItemsCount && allItemsCount > 0 ? true : checkedCount === 0 ? false : 'indeterminate';
  const allItemsPicked = allItemsCount > 0 && checkedCount === allItemsCount;

  const totalPallets = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  const handleGeneratePDF = () => {
    if (!movement) return;

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Picking de Salida de Embalaje: ${clientName}`, 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Confirme la recolección física de cada artículo y ubicación.`, 14, 30);

    const tableData = flatItems.map(item => [
      item.itemName,
      item.itemCode,
      item.locationString,
      quantities[item.compositeKey] ?? item.palletsToWithdraw,
    ]);
    
    const tableHeaders = [['Artículo', 'Código', 'Ubicación', 'Pallets a Retirar']];

    (doc as any).autoTable({
      startY: 35,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] },
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.text(`Total a Retirar: ${totalPallets} pallets`, 14, finalY + 10);
    
    doc.output('dataurlnewwindow');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Picking de Salida de Embalaje: {clientName}</DialogTitle>
          <DialogDescription>
            Confirme la recolección física de cada artículo y ubicación. Total a retirar: {totalPallets} pallets.
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
                            onChange={(e) => handleQuantityChange(item.compositeKey, item.palletsToWithdraw, e.target.value)}
                            max={item.palletsToWithdraw}
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
           <Button variant="outline" onClick={handleGeneratePDF}>
            <FileText className="mr-2 h-4 w-4" />
            Generar PDF
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
