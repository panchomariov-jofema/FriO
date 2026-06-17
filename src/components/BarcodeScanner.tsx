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
  usePhysicalScanner?: boolean;
  currentCount?: number;
  totalCount?: number;
}

const qrcodeRegionId = "reader";

export function BarcodeScanner({ 
  open, 
  onOpenChange, 
  onScan,
  closeOnScan = true,
  title,
  description,
  usePhysicalScanner: propUsePhysicalScanner,
  currentCount,
  totalCount
}: BarcodeScannerProps) {
  const { toast } = useToast();
  const [localUsePhysicalScanner, setLocalUsePhysicalScanner] = React.useState<boolean>(false);
  
  React.useEffect(() => {
    if (propUsePhysicalScanner === undefined && typeof window !== 'undefined') {
      const saved = localStorage.getItem('frio_use_physical_scanner');
      if (saved !== null) {
        setLocalUsePhysicalScanner(saved === 'true');
      }
    }
  }, [propUsePhysicalScanner, open]);

  const handleTogglePhysical = (checked: boolean) => {
    setLocalUsePhysicalScanner(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('frio_use_physical_scanner', String(checked));
    }
  };

  const activeUsePhysicalScanner = propUsePhysicalScanner !== undefined 
    ? propUsePhysicalScanner 
    : localUsePhysicalScanner;
  
  React.useEffect(() => {
    if (!open || activeUsePhysicalScanner) {
      return;
    }
    
    let html5QrCode: any = null;
    let isMounted = true;
    let timerId: any = null;

    timerId = setTimeout(() => {
      if (!isMounted) return;

      // Dynamically import the library only on the client-side
      import('html5-qrcode').then(({ Html5Qrcode }) => {
          if (!isMounted) return;
          // Ensure the element exists in DOM before creating instance
          const el = document.getElementById(qrcodeRegionId);
          if (!el) return;

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
                  // Sensible minimum size of 250px if viewfinder size is 0 or too small
                  const qrboxSize = minEdge > 120 ? Math.floor(minEdge * 0.7) : 250;
                  return {
                      width: qrboxSize,
                      height: qrboxSize,
                  };
              },
              aspectRatio: 1.0
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
    }, 350); // 350ms delay to allow Dialog animation to finish

    // Cleanup function to stop the scanner when the component unmounts or dialog closes.
    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      const el = document.getElementById(qrcodeRegionId);
      if (el && html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch((err: any) => {
          console.warn("Could not stop html5-qrcode scanner on cleanup:", err);
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeUsePhysicalScanner]);
  
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

        {/* ALWAYS keep the reader div mounted in DOM to prevent html5-qrcode crashes, 
            but hide it using 'hidden' class when physical scanner mode is active */}
        <div 
          id={qrcodeRegionId} 
          className={cn(
            "w-full aspect-square rounded-md overflow-hidden bg-black/5 flex items-center justify-center relative",
            activeUsePhysicalScanner && "hidden"
          )}
        >
           <div className="absolute inset-0 border-2 border-primary/20 pointer-events-none z-10" />
        </div>

        {/* Prominent count/progress card for physical reader mode */}
        {activeUsePhysicalScanner && (
          <div className="w-full py-6 px-4 rounded-xl bg-muted/40 flex flex-col items-center justify-center border-2 border-dashed border-[#7aba28]/40 shadow-inner">
            {currentCount !== undefined && totalCount !== undefined ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-baseline gap-1 bg-[#004b8d]/10 px-8 py-4 rounded-2xl border border-[#004b8d]/20 shadow-md">
                  <span className="text-6xl font-black text-[#004b8d] tracking-tight">{currentCount}</span>
                  <span className="text-3xl font-bold text-muted-foreground/60 mx-1">/</span>
                  <span className="text-3xl font-bold text-muted-foreground">{totalCount}</span>
                </div>
                <span className="text-xs uppercase font-extrabold tracking-widest text-[#004b8d] mt-2">
                  Bins Escaneados
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <ScanLine className="h-8 w-8 text-[#004b8d]/40 shrink-0" />
                <div className="flex flex-col text-left">
                  <p className="text-xs font-bold text-[#004b8d]">Lector de Hardware Activo</p>
                  <p className="text-[10px] text-muted-foreground">La cámara está desactivada. Escanee usando su lector físico.</p>
                </div>
              </div>
            )}
          </div>
        )}
        
        {propUsePhysicalScanner === undefined && (
          <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-muted/20 my-1">
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lector / Cámara</span>
              <span className="text-[10px] text-muted-foreground">Alternar entre lector de hardware o cámara</span>
            </div>
            <Switch 
              checked={localUsePhysicalScanner} 
              onCheckedChange={handleTogglePhysical}
              className="data-[state=checked]:bg-[#7aba28]"
            />
          </div>
        )}

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
