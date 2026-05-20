'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (value: string) => void;
  closeOnScan?: boolean;
  title?: string;
  description?: string;
}

const qrcodeRegionId = "reader";

export function BarcodeScanner({ 
  open, 
  onOpenChange, 
  onScan,
  closeOnScan = true,
  title,
  description
}: BarcodeScannerProps) {
  const { toast } = useToast();
  const [usePhysicalScanner, setUsePhysicalScanner] = React.useState<boolean>(false);
  
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('frio_use_physical_scanner');
      if (saved !== null) {
        setUsePhysicalScanner(saved === 'true');
      }
    }
  }, []);

  const handleTogglePhysical = (checked: boolean) => {
    setUsePhysicalScanner(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('frio_use_physical_scanner', String(checked));
    }
  };
  
  React.useEffect(() => {
    if (!open || usePhysicalScanner) {
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
            if (closeOnScan) {
              onOpenChange(false);
            } else {
              // If not closing, allow scanning again after a short delay
              setTimeout(() => {
                isScanning = true;
              }, 1000);
            }
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
  }, [open, usePhysicalScanner]);
  
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Clear input and focus when opened
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title || "Escanear Código"}</DialogTitle>
          {description ? (
            <div className={cn(
              "mt-2 p-3 rounded-lg text-sm transition-all duration-300",
              description.includes('⚠️') 
                ? "bg-amber-50 border border-amber-200 text-amber-900 font-bold animate-pulse" 
                : "bg-blue-50 border border-blue-100 text-blue-900 font-medium"
            )}>
              {description}
            </div>
          ) : (
            <DialogDescription>
              Apunte la cámara al código o use un lector físico abajo.
            </DialogDescription>
          )}
        </DialogHeader>

        {usePhysicalScanner ? (
          <div className="w-full aspect-square rounded-md overflow-hidden bg-muted/30 flex flex-col items-center justify-center relative border-2 border-dashed border-[#7aba28]/20">
            <style>{`
              @keyframes scan {
                0% { top: 10%; }
                50% { top: 90%; }
                100% { top: 10%; }
              }
              .laser-line {
                position: absolute;
                left: 0;
                width: 100%;
                height: 2px;
                background-color: #ef4444;
                box-shadow: 0 0 8px #ef4444;
                animation: scan 2s infinite linear;
              }
            `}</style>
            <div className="absolute inset-0 border-2 border-primary/10 pointer-events-none z-10" />
            <div className="laser-line" />
            <ScanLine className="h-16 w-16 text-[#004b8d]/30 animate-pulse" />
            <p className="text-sm font-bold text-[#004b8d]/80 mt-4">Lector físico activo</p>
            <p className="text-xs text-muted-foreground mt-1">Apunte y escanee el código QR/Barra</p>
          </div>
        ) : (
          <div id={qrcodeRegionId} className="w-full aspect-square rounded-md overflow-hidden bg-black/5 flex items-center justify-center relative">
             <div className="absolute inset-0 border-2 border-primary/20 pointer-events-none z-10" />
          </div>
        )}
        
        <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-muted/20 my-1">
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lector / Cámara</span>
            <span className="text-[10px] text-muted-foreground">Alternar entre lector de hardware o cámara</span>
          </div>
          <Switch 
            checked={usePhysicalScanner} 
            onCheckedChange={handleTogglePhysical}
            className="data-[state=checked]:bg-[#7aba28]"
          />
        </div>

        <div className="pt-3 border-t">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Entrada Manual / Lector Láser</p>
          <div className="flex gap-2">
            <input 
              ref={inputRef}
              type="text" 
              placeholder="Escriba o escanee..."
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) {
                    onScan(val);
                    if (closeOnScan) {
                      onOpenChange(false);
                    } else {
                      (e.target as HTMLInputElement).value = '';
                    }
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
