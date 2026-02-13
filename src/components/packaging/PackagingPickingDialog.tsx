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
import { PackagingMovement } from '@/lib/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


interface PackagingPickingDialogProps {
  movement: PackagingMovement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmExit: (movement: PackagingMovement) => void;
  isConfirming: boolean;
  clientName: string;
}

export function PackagingPickingDialog({ movement, open, onOpenChange, onConfirmExit, isConfirming, clientName }: PackagingPickingDialogProps) {
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});

  const flatItems = React.useMemo(() => {
    if (!movement?.items) return [];
    return movement.items.flatMap(item => 
        (item.locations || []).map(loc => ({
            ...loc,
            itemCode: item.packagingMasterCode,
            itemName: item.packagingMasterName,
            compositeKey: `${item.packagingMasterCode}_${loc.locationKey}`
        }))
    ).filter(item => item.palletsToWithdraw > 0);
  }, [movement]);

  React.useEffect(() => {
    if (movement) {
        setPickedItems({});
    }
  }, [movement]);

  if (!movement) return null;

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
    onConfirmExit(movement);
  };
  
  const checkedCount = Object.keys(pickedItems).length;
  const allItemsCount = flatItems.length;
  const selectAllState = checkedCount === allItemsCount && allItemsCount > 0 ? true : checkedCount === 0 ? false : 'indeterminate';
  const allItemsPicked = allItemsCount > 0 && checkedCount === allItemsCount;

  const totalPallets = movement.items.reduce((sum, item) => sum + item.palletCount, 0);

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
      item.palletsToWithdraw,
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
    doc.text("Cliente:", 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(clientName, 16, 57);
    doc.text(`RUT: (Dato no disponible)`, 16, 64);
    

    // --- Table ---
    const tableData = flatItems.map(item => [
      item.itemName,
      item.itemCode,
      item.locationString,
      item.palletsToWithdraw,
    ]);
    
    const tableHeaders = [['Artículo', 'Código', 'Ubicación', 'Pallets a Retirar']];

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
    doc.text(`Total a Retirar: ${totalPallets} pallets`, 14, finalY + 15);
    
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Este documento es una simulación y no tiene validez tributaria.", 14, doc.internal.pageSize.getHeight() - 10);


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
                    <TableCell className="text-right font-semibold">
                       {item.palletsToWithdraw}
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
