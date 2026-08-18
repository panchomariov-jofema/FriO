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
import { FileText, Building, QrCode, Trash2, Camera, CheckCircle2, ScanLine } from 'lucide-react';
import { Input } from '../ui/input';
import { OtherFruitMovement, OtherFruitMovementLocation, OtherFruitReception } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { BarcodeScanner } from '../BarcodeScanner';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';

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
  
  // QR Scanning State
  const [scannedQrCodes, setScannedQrCodes] = React.useState<Set<string>>(new Set());
  const [scannedPallets, setScannedPallets] = React.useState<Set<string>>(new Set());
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const [usePhysicalScanner, setUsePhysicalScanner] = React.useState(false);

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

    // Find target picking item matching variety/product code and chamber/coordinate
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

    const compositeKey = targetItem.compositeKey;
    const currentQty = quantities[compositeKey] ?? 0;
    const targetQty = targetItem.quantity;
    const remainingQty = targetQty - currentQty;

    if (remainingQty <= 0) {
      toast({
        title: "Ubicación completa",
        description: `Ya se ha escaneado la cantidad requerida para la ubicación ${targetItem.location.chamberId} / ${targetItem.location.coordinate}.`
      });
      return;
    }

    // Apply the smart scanning rule
    let confirmedCount = 1;
    let autoConfirmedMsg = "";
    
    if (palletId !== 'Loose') {
      const isPalletAlreadyScanned = scannedPallets.has(palletId);
      if (!isPalletAlreadyScanned && remainingQty >= 3) {
        confirmedCount = 3;
        autoConfirmedMsg = " (Pallet completo - Auto-confirmado 3 bins)";
      }
    }

    setQuantities(prev => ({
      ...prev,
      [compositeKey]: Math.min(targetQty, (prev[compositeKey] ?? 0) + confirmedCount)
    }));

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
      description: `Se confirmó ${confirmedCount} bin(s) de la variedad ${targetItem.productName}${autoConfirmedMsg}.`,
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              {isFallCreek ? <QrCode className="h-6 w-6 text-[#7aba28]" /> : null}
              Picking de Despacho de Fruta: {movement.clientName}
            </DialogTitle>
            <DialogDescription>
              {isFallCreek 
                ? `Por favor, escanee los códigos QR de los bins. Total recolectado: ${totalPicked} de ${totalExpected} Bins.`
                : `Confirme la recolección física de cada artículo y ubicación. Total a retirar: ${totalPicked} ${movement.unit}.`
              }
            </DialogDescription>
          </DialogHeader>

          {/* QR Scanning Controls for Fall Creek */}
          {isFallCreek && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-muted/40 border border-[#7aba28]/25 rounded-lg shadow-sm">
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-[#7aba28] hover:bg-[#6ba323] text-white font-bold h-10 px-4 flex items-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Escanear con Cámara
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResetScanning}
                  className="h-10 text-muted-foreground border-dashed flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Limpiar Escaneo
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="physical-scanner-toggle-picking"
                  checked={usePhysicalScanner}
                  onCheckedChange={setUsePhysicalScanner}
                />
                <Label htmlFor="physical-scanner-toggle-picking" className="text-xs font-bold text-muted-foreground uppercase cursor-pointer select-none">
                  Pistola / PDA Física
                </Label>
              </div>
            </div>
          )}

          <div>
            <ScrollArea className="max-h-96 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      {!isFallCreek && (
                        <Checkbox
                            checked={selectAllState}
                            onCheckedChange={handleSelectAll}
                            aria-label="Seleccionar todo"
                        />
                      )}
                    </TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right w-36">Cantidad a Retirar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatItems.map((item) => {
                    const progress = quantities[item.compositeKey] ?? 0;
                    const complete = progress === item.quantity;
                    const hasScanned = progress > 0;

                    return (
                      <TableRow key={item.compositeKey} className={complete ? "bg-[#7aba28]/5" : ""}>
                        <TableCell>
                           {isFallCreek ? (
                             complete ? (
                               <CheckCircle2 className="h-5 w-5 text-[#7aba28]" />
                             ) : hasScanned ? (
                               <ScanLine className="h-5 w-5 text-amber-500 animate-pulse" />
                             ) : (
                               <QrCode className="h-5 w-5 text-muted-foreground/30" />
                             )
                           ) : (
                             <Checkbox
                                checked={!!pickedItems[item.compositeKey]}
                                onCheckedChange={(checked) => handleItemCheck(item.compositeKey, !!checked)}
                              />
                           )}
                        </TableCell>
                        <TableCell>
                            <div className="font-semibold text-sm">{item.productName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{item.clientLotId || 'N/A'}</div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.location.chamberId} / {item.location.coordinate}</TableCell>
                        <TableCell className="text-right font-medium">
                           {isFallCreek ? (
                             <div className="text-sm font-semibold">
                               <span className={complete ? "text-[#7aba28] font-bold" : "text-amber-600"}>{progress}</span>
                               <span className="text-muted-foreground font-normal"> / {item.quantity} Bins</span>
                             </div>
                           ) : (
                             <Input
                                  type="number"
                                  value={quantities[item.compositeKey] ?? ''}
                                  onChange={(e) => handleQuantityChange(item.compositeKey, item.quantity, e.target.value)}
                                  max={item.quantity}
                                  min={0}
                                  className="h-8 w-24 ml-auto text-right"
                              />
                           )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* List of scanned QR codes for Fall Creek */}
          {isFallCreek && scannedQrCodes.size > 0 && (
            <div className="space-y-1.5 p-3 bg-muted/20 border border-border rounded-md">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Códigos QR Escaneados en esta Sesión ({scannedQrCodes.size})</span>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {Array.from(scannedQrCodes).map((code, idx) => (
                  <Badge key={idx} variant="secondary" className="font-mono text-[9px] px-1.5 py-0.5 bg-background border text-zinc-600">
                    {code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

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

      {/* QR scanner dialog for camera/physical code scanning */}
      {isFallCreek && (
        <BarcodeScanner
          open={isScannerOpen}
          onOpenChange={setIsScannerOpen}
          onScan={handleScan}
          closeOnScan={false}
          title={`Lector de Bins - Picking Despacho`}
          description="Escanee los códigos QR de los bins ubicados en las coordenadas indicadas."
          usePhysicalScanner={usePhysicalScanner}
          currentCount={totalPicked}
          totalCount={totalExpected}
        />
      )}
    </>
  );
}
