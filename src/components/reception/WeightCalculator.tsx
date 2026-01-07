'use client';

import * as React from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2 } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface WeightCalculatorProps {
  lot: ReceptionLot;
  onWeightSaved: () => void;
}

export function WeightCalculator({ lot, onWeightSaved }: WeightCalculatorProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [partialWeights, setPartialWeights] = React.useState<number[]>([]);
  const [currentWeight, setCurrentWeight] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

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

    const lotRef = doc(firestore, 'receptionLots', lot.id);
    const updateData = {
        totalWeight,
        status: 'Pendiente de Pre-Hidro' as const,
    };
    
    updateDoc(lotRef, updateData)
      .then(() => {
        toast({ title: 'Éxito', description: 'Peso total guardado correctamente.' });
        setPartialWeights([]);
        onWeightSaved();
      })
      .catch((error) => {
        console.error("Error saving weight: ", error);
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: lotRef.path,
            operation: 'update',
            requestResourceData: updateData,
          })
        );
        toast({ title: 'Error', description: 'No se pudo guardar el peso.', variant: 'destructive' });
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de Peso</CardTitle>
        <CardDescription>Lote ID: <span className="font-mono">{lot.id}</span></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="number"
            placeholder="Ingrese peso parcial (kg)"
            value={currentWeight}
            onChange={(e) => setCurrentWeight(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddWeight()}
          />
          <Button onClick={handleAddWeight} size="icon" aria-label="Agregar peso">
            <PlusCircle />
          </Button>
        </div>
        
        {partialWeights.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Pesos parciales:</p>
            <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
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

        <div className="text-lg font-bold">
          Peso Total Acumulado: {totalWeight.toFixed(2)} kg
        </div>
        <Button onClick={handleSaveTotalWeight} disabled={totalWeight <= 0}>
          Confirmar y Guardar Peso Total
        </Button>
      </CardContent>
    </Card>
  );
}

    