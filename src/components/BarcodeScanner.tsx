'use client';

import * as React from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (value: string) => void;
}

const qrcodeRegionId = "reader";

export function BarcodeScanner({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const { toast } = useToast();
  
  React.useEffect(() => {
    if (!open) {
      return;
    }

    // `Html5Qrcode` comes with its own camera permission handling.
    const html5QrCode = new Html5Qrcode(qrcodeRegionId);
    let isScanning = true;

    const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
      if (isScanning) {
        isScanning = false; // Prevent multiple calls
        onScan(decodedText);
        onOpenChange(false);
      }
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    // Start scanning.
    html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        qrCodeSuccessCallback, 
        undefined /* qrCodeErrorCallback is optional */
    ).catch(err => {
        console.error("Failed to start html5-qrcode scanner", err);
        toast({
            variant: "destructive",
            title: "Error de Cámara",
            description: "No se pudo iniciar el escáner. Verifique los permisos de la cámara.",
        });
        onOpenChange(false);
    });

    // Cleanup function to stop the scanner when the component unmounts or dialog closes.
    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => {
          // This can fail if the scanner is already stopped, so we just log the error.
          console.warn("Could not stop html5-qrcode scanner on cleanup:", err);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear Código de Barras</DialogTitle>
          <DialogDescription>
            Apunte la cámara al código de barras. La lectura será automática.
          </DialogDescription>
        </DialogHeader>
        <div id={qrcodeRegionId} className="w-full aspect-square" />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
