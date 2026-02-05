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
import { FileText, Building } from 'lucide-react';
import { naturalSort } from '@/lib/utils';
import { Input } from '../ui/input';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';


interface DispatchPickingDialogProps {
  dispatch: Dispatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDispatch: (dispatch: Dispatch, quantities: Record<string, number>) => void;
  isConfirming: boolean;
}

export function DispatchPickingDialog({ dispatch, open, onOpenChange, onConfirmDispatch, isConfirming }: DispatchPickingDialogProps) {
  const [pickedItems, setPickedItems] = React.useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const { toast } = useToast();

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
      toast({
        title: 'Cantidad excede lo solicitado',
        description: `No puede recoger más de ${originalCount} bins para esta ubicación.`,
        variant: 'destructive',
      });
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

  const handleGeneratePDF = () => {
    if (!dispatch) return;

    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(`Picking de Despacho: ${dispatch.exporterName}`, 14, 22);

    // Subtitle
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Confirme la recolección física de cada ubicación.`, 14, 30);


    // Table data
    const tableData = allItems.map(item => [
      item.displayLotId,
      item.chamberId,
      item.coordinate,
      quantities[item.chamberLotId] ?? item.binCount,
    ]);
    
    const tableHeaders = [['Lote', 'Cámara', 'Coordenada', 'Bins']];

    (doc as any).autoTable({
      startY: 35,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] }, // A green color for header
    });
    
    // Total
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.text(`Total a Despachar: ${totalPickedBins} bins`, 14, finalY + 10);
    
    // Open in new window
    doc.output('dataurlnewwindow');
};

const handleGenerateDTE = () => {
    if (!dispatch) return;

    const doc = new jsPDF();
    const today = new Date();

    // --- Header ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Guía de Despacho Electrónica (SIMULACIÓN)`, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Folio: (simulado) ${dispatch.id.substring(0, 8)}`, 190, 30, { align: 'right' });
    doc.text(`Fecha: ${today.toLocaleDateString('es-CL')}`, 190, 35, { align: 'right' });

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
    doc.text(dispatch.exporterName, 16, 57);
    doc.text(`RUT: (Dato no disponible)`, 16, 64);
    
    doc.setFont('helvetica', 'bold');
    doc.text("Destino:", 100, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Packing (ID: ${dispatch.packingId || 'No especificado'})`, 102, 57);

    // --- Table ---
    const tableData = allItems.map(item => [
      item.displayLotId,
      item.chamberId,
      item.coordinate,
      quantities[item.chamberLotId] ?? item.binCount,
    ]);
    
    const tableHeaders = [['Lote', 'Cámara', 'Coordenada', 'Bins']];

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
    doc.text(`Total a Despachar: ${totalPickedBins} bins`, 14, finalY + 15);
    
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Este documento es una simulación y no tiene validez tributaria.", 14, doc.internal.pageSize.getHeight() - 10);


    doc.output('dataurlnewwindow');
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
            <Button onClick={() => onConfirmDispatch(dispatch, quantities)} disabled={!allItemsPicked || isConfirming}>
              {isConfirming ? 'Confirmando...' : 'Confirmar Salida'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
