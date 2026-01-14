'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Producer, Variety } from '@/lib/types';
import { collection, writeBatch, serverTimestamp, doc, Timestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Download, Upload } from 'lucide-react';
import { parse } from 'date-fns';

const CSV_HEADERS = ['producerId', 'document', 'variety', 'binCount', 'netWeight', 'receptionDate'];

export function ExternalReceptionUploader() {
  const [isOpen, setIsOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + CSV_HEADERS.join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_recepcion_externa.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !firestore) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length <= 1) {
        toast({ title: 'Error de archivo', description: 'El archivo CSV está vacío o solo contiene la cabecera.', variant: 'destructive' });
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim());
      if (JSON.stringify(headers) !== JSON.stringify(CSV_HEADERS)) {
        toast({ title: 'Error de formato', description: `Las cabeceras del CSV no coinciden. Esperado: ${CSV_HEADERS.join(', ')}`, variant: 'destructive' });
        return;
      }
      
      const producerMap = new Map(producers.map(p => [p.producerId, p]));
      const batch = writeBatch(firestore);
      const errors: string[] = [];

      lines.slice(1).forEach((line, index) => {
        const values = line.split(',').map(v => v.trim());
        const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
        
        const producer = producerMap.get(row.producerId);
        if (!producer) {
          errors.push(`Línea ${index + 2}: El producerId "${row.producerId}" no fue encontrado.`);
          return;
        }

        const binCount = parseInt(row.binCount, 10);
        const netWeight = parseFloat(row.netWeight);
        if (isNaN(binCount) || binCount <= 0 || isNaN(netWeight) || netWeight <= 0) {
          errors.push(`Línea ${index + 2}: binCount y netWeight deben ser números positivos.`);
          return;
        }

        let receptionTimestamp;
        if (row.receptionDate) {
            // Expecting YYYY-MM-DD HH:MM:SS format
            const parsedDate = parse(row.receptionDate, 'yyyy-MM-dd HH:mm:ss', new Date());
            if (isNaN(parsedDate.getTime())) {
                errors.push(`Línea ${index + 2}: El formato de receptionDate es inválido. Use 'YYYY-MM-DD HH:MM:SS'.`);
                return;
            }
            receptionTimestamp = Timestamp.fromDate(parsedDate);
        } else {
            receptionTimestamp = serverTimestamp(); // Fallback to now
        }
        
        const netWeightPerBin = netWeight / binCount;
        
        const chamberLotData = {
          displayLotId: `${producer.shortName}-${row.document}`,
          exporterId: producer.exporterId,
          producerShortName: producer.shortName,
          binCount: binCount,
          variety: row.variety as Variety,
          hidrocooler: 'EXTERNO',
          status: 'Pendiente por Almacenar' as const,
          netWeightPerBin: netWeightPerBin,
          receptionDate: receptionTimestamp, // Use the parsed or fallback timestamp
          storedAt: serverTimestamp(),
        };

        const lotRef = doc(collection(firestore, 'chamberLots'));
        batch.set(lotRef, chamberLotData);
      });

      if (errors.length > 0) {
        toast({
          title: `Se encontraron ${errors.length} errores en el archivo.`,
          description: <div className="h-40 w-full overflow-y-auto">{errors.map((e, i)=><p key={i} className="text-xs">{e}</p>)}</div>,
          variant: 'destructive',
          duration: 9000
        });
        return;
      }

      try {
        await batch.commit();
        toast({ title: 'Éxito', description: `${lines.length - 1} lotes cargados y listos para almacenar.` });
        setIsOpen(false);
      } catch (error: any) {
        console.error("Error al guardar lotes externos:", error);
        toast({ variant: 'destructive', title: 'Error al Guardar', description: 'No se pudieron guardar los lotes en la base de datos.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'chamberLots',
            operation: 'write'
        }));
      }

    };

    reader.readAsText(file);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        Carga Externa
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carga de Recepción Externa</DialogTitle>
            <DialogDescription>
              Suba un archivo CSV para ingresar lotes que fueron procesados fuera del frigorífico.
              Estos lotes aparecerán como pendientes por almacenar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              El archivo CSV debe tener las columnas: {CSV_HEADERS.join(', ')}. La columna `receptionDate` (formato: YYYY-MM-DD HH:MM:SS) es opcional.
            </p>
            <div className="flex gap-4">
              <Button variant="secondary" onClick={handleDownloadTemplate} className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} className="flex-1" disabled={loadingProducers}>
                <Upload className="mr-2 h-4 w-4" />
                {loadingProducers ? 'Cargando datos...' : 'Seleccionar Archivo'}
              </Button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
