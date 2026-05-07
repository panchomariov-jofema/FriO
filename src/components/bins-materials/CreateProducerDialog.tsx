'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

interface CreateProducerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (producerId: string) => void;
}

export function CreateProducerDialog({ open, onOpenChange, onSuccess }: CreateProducerDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState('');
  const [rut, setRut] = React.useState('');
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    setLoading(true);
    try {
      const producerId = rut.trim();
      const producerData = {
        producerId,
        name: name.trim(),
        shortName: name.trim().split(' ')[0].toUpperCase(),
        exporterId: ['EXP005'],
        rut: producerId,
        status: 'activo',
        createdAt: serverTimestamp(),
      };

      // Use RUT as the document ID as requested ("ID de Productor el campor RUT")
      await setDoc(doc(firestore, 'producers', producerId), producerData);
      
      toast({
        title: 'Productor creado',
        description: `El productor ${name.trim()} ha sido creado exitosamente.`,
      });
      
      onOpenChange(false);
      setName('');
      setRut('');
      if (onSuccess) onSuccess(producerId);
    } catch (error) {
      console.error('Error creating producer:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el productor. Intente nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Crear Cliente</DialogTitle>
            <DialogDescription>
              Ingrese los datos para crear un nuevo productor asociado a FÑO (EXP005).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rut" className="text-right">
                RUT
              </Label>
              <Input
                id="rut"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-9"
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nombre
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del productor"
                className="col-span-3"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
