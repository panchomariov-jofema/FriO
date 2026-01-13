'use client';

import * as React from 'react';
import { doc, updateDoc, collection, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Producer, ReceptionLot } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2 } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../ui/dialog';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';


interface WeightCalculatorProps {
  lot: ReceptionLot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWeightSaved: () => void;
}

export function WeightCalculator({ lot, open, onOpenChange, onWeightSaved }: WeightCalculatorProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [partialWeights, setPartialWeights] = React.useState<number[]>([]);
  const [currentWeight, setCurrentWeight] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  const { data: producers } = useFirestoreCollection<Producer>('producers');

  React.useEffect(() => {
    if (open) {
      setPartialWeights([]);
      setCurrentWeight('');
    }
  }, [open]);

  const totalWeight = React.useMemo(() => {
    return partialWeights.reduce((acc, w) => acc + w, 0);
  }, [partialWeights]);

  const handleAddWeight = () => {
    const weight = parseFloat(currentWeight);
    if (!isNaN(weight) && weight > 0) {
      setPartialWeights(prev => [...prev, weight]);
      setCurrentWeight('');
    }
    inputRef.current?.focus();
  };
  
  const handleRemoveWeight = (index: number) => {
    setPartialWeights(prev => prev.filter((_, i) => i !== index));
  }

  const handleSaveTotalWeight = async () => {
    if (totalWeight <= 0) {
      toast({ title: 'Error', description: 'El peso total debe ser mayor a 0.', variant: 'destructive' });
      return;
    }
    if (!firestore) return;

    const producer = producers.find(p => p.producerId === lot.producerId);
    if (!producer) {
        toast({ title: 'Error', description: 'No se pudo encontrar el productor para crear el registro en hidrocooler.', variant: 'destructive' });
        return;
    }
    
    const displayLotId = `${producer.shortName}-${lot.document}`;

    // Calculate net weight per bin
    const netWeight = totalWeight - (lot.binCount * 65) + (lot.noTotes || 0);
    const netWeightPerBin = netWeight > 0 && lot.binCount > 0 ? netWeight / lot.binCount : 0;

    const batch = writeBatch(firestore);

    // 1. Update reception lot
    const lotRef = doc(firestore, 'receptionLots', lot.id);
    const receptionUpdate = {
        totalWeight,
        netWeightPerBin,
        status: 'Pendiente de Pre-Hidro' as const,
        displayLotId: displayLotId,
    };
    batch.update(lotRef, receptionUpdate);

    // 2. Create hidrocooler lot
    const hidrocoolerRef = collection(firestore, 'hidrocoolerLots');
    const hidrocoolerLotData = {
        displayLotId: displayLotId,
        producerShortName: producer.shortName,
        binCount: lot.binCount,
        netWeightPerBin: netWeightPerBin,
        status: 'Pendiente de Pre-Hidro' as const,
        createdAt: serverTimestamp(),
    };
    // We can't use batch.add, so we create a new doc ref
    const newHidroLotRef = doc(hidrocoolerRef);
    batch.set(newHidroLotRef, hidrocoolerLotData);
    
    batch.commit()
      .then(() => {
        toast({ title: 'Éxito', description: 'Peso guardado y lote enviado a Hidrocooler.' });
        onWeightSaved();
      })
      .catch((error) => {
        console.error("Error saving weight and sending to hydro: ", error);
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: `receptionLots/${lot.id} or hidrocoolerLots`,
            operation: 'write',
            requestResourceData: { receptionUpdate, hidrocoolerLotData },
          })
        );
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registro de Peso</DialogTitle>
          <DialogDescription>Lote ID: <span className="font-mono">{lot.displayLotId || `${lot.producerId}-${lot.document}`}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                placeholder="Ingrese peso parcial (kg)"
                value={currentWeight}
                onChange={(e) => setCurrentWeight(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWeight()}
                autoComplete="off"
              />
              <Button onClick={handleAddWeight} size="icon" aria-label="Agregar peso">
                <PlusCircle />
              </Button>
            </div>
            
            {partialWeights.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pesos parciales:</p>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-2 border rounded-md p-2">
                  {partialWeights.map((weight, index) => (
                    <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <span className="text-sm">{weight} kg</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveWeight(index)}>
                        <Trash2 className="h-4 w-4 text-destructive"/>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-lg font-bold text-center pt-2">
              Peso Total Acumulado: {totalWeight.toFixed(2)} kg
            </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSaveTotalWeight} disabled={totalWeight <= 0}>
            Confirmar y Enviar a Hidro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
