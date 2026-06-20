'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScanLine, Check } from 'lucide-react';
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
  const [devices, setDevices] = React.useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = React.useState<string>('');
  const [scanSuccessFlash, setScanSuccessFlash] = React.useState<boolean>(false);

  const playBeepSound = () => {
    if (typeof window !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(850, ctx.currentTime); // Clean scan beep
          
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12); // fade out over 120ms
          
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.12);
        }
      } catch (err) {
        console.warn("Could not play scan sound:", err);
      }
    }
  };

  const handleScanSuccess = (value: string) => {
    playBeepSound();
    setScanSuccessFlash(true);
    setTimeout(() => {
      setScanSuccessFlash(false);
    }, 450);
    onScan(value.trim());
  };
  
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

    const checkAndStart = () => {
      if (!isMounted) return;
      const el = document.getElementById(qrcodeRegionId);
      if (!el) {
        timerId = setTimeout(checkAndStart, 50);
        return;
      }
      
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Wait and check again shortly, as the dialog is still animating
        timerId = setTimeout(checkAndStart, 50);
        return;
      }

      // Element is visible and has non-zero size, we can import and start
      import('html5-qrcode').then(({ Html5Qrcode }) => {
          if (!isMounted) return;

          // Request camera permission and list available devices
          Html5Qrcode.getCameras().then((cameras) => {
              if (!isMounted) return;
              if (cameras && cameras.length > 0) {
                  // Filter out front-facing cameras by checking standard labels
                  const rearCameras = cameras.filter(c => {
                      const label = (c.label || '').toLowerCase();
                      return !(
                          label.includes('front') || 
                          label.includes('delantera') || 
                          label.includes('user') || 
                          label.includes('selfie') || 
                          label.includes('anterior')
                      );
                  });
                  
                  const filteredCameras = rearCameras.length > 0 ? rearCameras : cameras;
                  setDevices(filteredCameras);
                  
                  // Read saved camera or default to the last one (which is usually the main rear camera on Android)
                  const saved = localStorage.getItem('frio_selected_camera_id');
                  const isSavedValid = filteredCameras.some(c => c.id === saved);
                  
                  let activeId = '';
                  if (selectedCameraId && filteredCameras.some(c => c.id === selectedCameraId)) {
                      activeId = selectedCameraId;
                  } else if (isSavedValid) {
                      activeId = saved!;
                  } else {
                      activeId = filteredCameras[filteredCameras.length - 1].id;
                  }
                  
                  if (selectedCameraId !== activeId) {
                      setSelectedCameraId(activeId);
                  }
                  
                  startScanning(activeId);
              } else {
                  // Fallback if no cameras found
                  startScanning({ facingMode: "environment" });
              }
          }).catch((err) => {
              console.warn("Could not list cameras, using default facingMode:", err);
              startScanning({ facingMode: "environment" });
          });

          function startScanning(cameraSource: any) {
              if (!isMounted) return;
              
              html5QrCode = new Html5Qrcode(qrcodeRegionId);
              let isScanning = true;

              const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
                if (isScanning) {
                  isScanning = false; // Prevent multiple calls
                  
                  handleScanSuccess(decodedText);
                  
                  if (closeOnScan) {
                    onOpenChange(false);
                  } else {
                    // If not closing, allow scanning again after a delay to show flash and move to next item
                    setTimeout(() => {
                      isScanning = true;
                    }, 1500);
                  }
                }
              };

              const config = { 
                  fps: 15, 
                  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                      // Use a safe percentage so it is always smaller than the viewfinder
                      const qrboxSize = minEdge > 0 ? Math.floor(minEdge * 0.7) : 150;
                      
                      // Ensure it never exceeds the actual boundaries (which triggers canvas crop errors)
                      const safeWidth = minEdge > 0 ? Math.min(qrboxSize, viewfinderWidth - 25) : 150;
                      const safeHeight = minEdge > 0 ? Math.min(qrboxSize, viewfinderHeight - 25) : 150;
                      
                      return {
                          width: Math.max(safeWidth, 50),
                          height: Math.max(safeHeight, 50),
                      };
                  },
                  videoConstraints: {
                      ...(typeof cameraSource === 'string'
                          ? { deviceId: { exact: cameraSource } }
                          : { facingMode: "environment" }),
                      width: { ideal: 1280 },
                      height: { ideal: 720 }
                  }
              };
              
              const startSource = typeof cameraSource === 'string' 
                  ? { deviceId: { exact: cameraSource } }
                  : cameraSource;
                  
              html5QrCode.start(
                  startSource, 
                  config, 
                  qrCodeSuccessCallback, 
                  undefined
              ).then(() => {
                  // Apply continuous autofocus constraint
                  setTimeout(() => {
                      if (html5QrCode && html5QrCode.isScanning) {
                          html5QrCode.applyVideoConstraints({
                              focusMode: "continuous"
                          } as any).catch((err: any) => {
                              console.warn("Could not apply autofocus constraint:", err);
                          });
                      }
                  }, 1000);
              }).catch((err: any) => {
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
          }

      }).catch((error) => {
          console.error("Failed to load html5-qrcode library", error);
          toast({
              variant: "destructive",
              title: "Error de Carga",
              description: "No se pudo cargar la biblioteca de escaneo.",
          });
          onOpenChange(false);
      });
    };

    // Trigger size check loop with a delay to let any transitions complete smoothly
    timerId = setTimeout(checkAndStart, 300);

    // Cleanup function to stop the scanner when the component unmounts or dialog closes.
    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      const localScanner = html5QrCode;
      if (localScanner && localScanner.isScanning) {
        // Defer stopping the camera stream to let the UI toggle and render instantly
        setTimeout(() => {
          if (localScanner && localScanner.isScanning) {
            localScanner.stop().catch((err: any) => {
              console.warn("Could not stop html5-qrcode scanner on cleanup:", err);
            });
          }
        }, 150);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeUsePhysicalScanner, selectedCameraId]);
  
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Clear input and focus when opened
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.value = '';
          if (activeUsePhysicalScanner) {
            inputRef.current.focus();
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, activeUsePhysicalScanner]);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (activeUsePhysicalScanner) {
            inputRef.current?.focus();
          }
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
           
           {/* Success visual flash overlay for camera feed */}
           {scanSuccessFlash && (
             <div className="absolute inset-0 bg-green-500/40 flex items-center justify-center z-20 animate-in fade-in zoom-in duration-150">
               <div className="bg-white rounded-full p-4 shadow-lg scale-110 transition-transform">
                 <Check className="h-10 w-10 text-green-600 animate-bounce" />
               </div>
             </div>
           )}
        </div>

        {/* Camera Selector Dropdown */}
        {!activeUsePhysicalScanner && devices.length > 1 && (
          <div className="flex flex-col gap-1 my-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Seleccionar Cámara / Lente</span>
            <select
              value={selectedCameraId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedCameraId(newId);
                localStorage.setItem('frio_selected_camera_id', newId);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {devices.map((device, idx) => (
                <option key={device.id} value={device.id}>
                  {device.label || `Cámara ${idx + 1} (${device.id.substring(0, 8)})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Prominent count/progress card for physical reader mode */}
        {activeUsePhysicalScanner && (
          <div className={cn(
            "w-full py-6 px-4 rounded-xl flex flex-col items-center justify-center border-2 border-dashed shadow-inner transition-all duration-300",
            scanSuccessFlash 
              ? "bg-green-50 border-green-500 scale-105" 
              : "bg-muted/40 border-[#7aba28]/40"
          )}>
            {scanSuccessFlash ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Check className="h-10 w-10 text-green-600 animate-bounce" />
                <span className="text-sm font-black text-green-700 uppercase tracking-tight">¡Leído con Éxito!</span>
              </div>
            ) : currentCount !== undefined && totalCount !== undefined ? (
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) {
                    handleScanSuccess(val);
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
