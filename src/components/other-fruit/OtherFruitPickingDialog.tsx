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
import { FileText, Building } from 'lucide-react';
import { Input } from '../ui/input';
import { OtherFruitMovement, OtherFruitMovementLocation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


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
        toast({
            title: 'Cantidad excede lo solicitado',
            description: `No puede recoger más de ${originalCount} unidades para esta ubicación.`,
            variant: 'destructive',
        });
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
  
  const totalPicked = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  const handleGeneratePDF = () => {
    if (!movement) return;

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Picking de Despacho de Fruta: ${movement.clientName}`, 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Confirme la recolección física de cada artículo y ubicación.`, 14, 30);
    
    const tableData = flatItems.map(item => [
      item.productName,
      item.clientLotId || 'N/A',
      `${item.location.chamberId} / ${item.location.coordinate}`,
      quantities[item.compositeKey] ?? item.quantity,
    ]);
    
    const tableHeaders = [['Producto', 'Lote Cliente', 'Ubicación', 'Cantidad a Retirar']];

    (doc as any).autoTable({
      startY: 35,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.text(`Total a Retirar: ${totalPicked} ${movement.unit}`, 14, finalY + 10);
    
    doc.output('dataurlnewwindow');
  };

  const handleGenerateDTE = () => {
    if (!movement) return;

    const doc = new jsPDF();
    const today = new Date();

    // --- Header ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Guía de Despacho Electrónica (SIMULACIÓN)`, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Folio: (simulado) ${movement.id.substring(0, 8)}`, 190, 30, { align: 'right' });
    doc.text(`Fecha: ${today.toLocaleDateString('es-CL')}`, 190, 35, { align: 'right' });
    if (movement.document) {
      doc.text(`Documento Ref: ${movement.document}`, 190, 40, { align: 'right' });
    }

    // --- Watermark ---
    doc.setFontSize(50);
    doc.setTextColor(220, 220, 220);
    doc.text("DOCUMENTO DE MUESTRA", doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() / 2, { align: 'center', angle: -45 });
    doc.setTextColor(0, 0, 0);

    // --- Client Info ---
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Retira:", 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(movement.clientName, 16, 57);
    
    doc.setFont('helvetica', 'bold');
    doc.text("Destino:", 100, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(movement.destinationClientName || 'No especificado', 102, 57);
    doc.text(`RUT: ${movement.destinationClientRUT || '(No especificado)'}`, 102, 64);
    

    // --- Table ---
    const tableData = flatItems.map(item => [
      item.productName,
      item.clientLotId || 'N/A',
      `${item.location.chamberId} / ${item.location.coordinate}`,
      quantities[item.compositeKey] ?? item.quantity,
    ]);
    
    const tableHeaders = [['Producto', 'Lote Cliente', 'Ubicación', 'Cantidad a Retirar']];

    (doc as any).autoTable({
      startY: 75,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] },
    });
    
    // --- Footer ---
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total a Retirar: ${totalPicked} ${movement.unit}`, 14, finalY + 15);
    
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Este documento es una simulación y no tiene validez tributaria.", 14, doc.internal.pageSize.getHeight() - 10);


    doc.output('dataurlnewwindow');
  };

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
           <div className="flex gap-2">
                <Button variant="outline" onClick={handleGeneratePDF}>
                    <FileText className="mr-2 h-4 w-4" />
                    Generar Picking PDF
                </Button>
                <Button variant="outline" onClick={handleGenerateDTE}>
                    <Building className="mr-2 h-4 w-4" />
                    Generar DTE (sim)
                </Button>
            </div>
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
