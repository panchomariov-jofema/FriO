'use client';

import * as React from 'react';
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
    
    let html5QrCode: any = null;

    // Dynamically import the library only on the client-side
    import('html5-qrcode').then(({ Html5Qrcode }) => {
        html5QrCode = new Html5Qrcode(qrcodeRegionId);
        let isScanning = true;

        const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
          if (isScanning) {
            isScanning = false; // Prevent multiple calls
            onScan(decodedText);
            onOpenChange(false);
          }
        };

        const config = { 
            fps: 10, 
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const qrboxSize = Math.floor(minEdge * 0.8);
                return {
                    width: qrboxSize,
                    height: qrboxSize,
                };
            }
        };
        
        html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            qrCodeSuccessCallback, 
            undefined
        ).catch((err: any) => {
            console.error("Failed to start html5-qrcode scanner", err);
            
            // Contexto seguro check (Camera requires HTTPS or Localhost)
            const isNotSecure = typeof window !== 'undefined' && !window.isSecureContext;
            
            toast({
                variant: "destructive",
                title: "Error de Cámara",
                description: isNotSecure 
                    ? "La cámara requiere una conexión segura (HTTPS). Chrome bloquea la cámara en IPs locales (192.168.x.x) sin SSL."
                    : "No se pudo iniciar el escáner. Verifique los permisos o si otra app usa la cámara.",
            });
            onOpenChange(false);
        });

    }).catch((error) => {
        console.error("Failed to load html5-qrcode library", error);
        toast({
            variant: "destructive",
            title: "Error de Carga",
            description: "No se pudo cargar la biblioteca de escaneo.",
        });
        onOpenChange(false);
    });

    // Cleanup function to stop the scanner when the component unmounts or dialog closes.
    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch((err: any) => {
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
        <div id={qrcodeRegionId} className="w-full aspect-square rounded-md overflow-hidden bg-black/5 flex items-center justify-center relative">
           <div className="absolute inset-0 border-2 border-primary/20 pointer-events-none z-10" />
        </div>
        
        <div className="pt-4 border-t">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Entrada Manual / Lector Láser</p>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Escriba o escanee..."
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) {
                    onScan(val);
                    onOpenChange(false);
                  }
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
