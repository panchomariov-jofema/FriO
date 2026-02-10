'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Video } from 'lucide-react';

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (value: string) => void;
}

export function BarcodeScanner({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | null>(null);
  const [scannedValue, setScannedValue] = React.useState('');
  const { toast } = useToast();

  React.useEffect(() => {
    let stream: MediaStream | null = null;

    const getCameraPermission = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
          variant: 'destructive',
          title: 'Cámara no soportada',
          description: 'Su navegador no soporta el acceso a la cámara.',
        });
        setHasCameraPermission(false);
        return;
      }
      
      try {
        // Use a more generic video constraint for better compatibility
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Acceso a la cámara denegado',
          description: 'Por favor, habilite el permiso de la cámara en la configuración de su navegador.',
        });
      }
    };

    if (open) {
      getCameraPermission();
    } else {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }

    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, [open, toast]);

  const handleConfirm = () => {
    if (scannedValue.trim()) {
      onScan(scannedValue.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) setScannedValue('');
        onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear Código de Barras</DialogTitle>
          <DialogDescription>
            Apunte la cámara al código de barras e ingrese el número manualmente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
            {hasCameraPermission === false && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4">
                    <Video className="h-10 w-10 mb-4" />
                    <p className="text-center font-semibold">Se requiere acceso a la cámara.</p>
                    <p className="text-center text-sm">Revise los permisos de su navegador.</p>
                </div>
            )}
          </div>

          <Input
            value={scannedValue}
            onChange={(e) => setScannedValue(e.target.value)}
            placeholder="Ingrese el valor del código manualmente"
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                }
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!scannedValue.trim()}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
