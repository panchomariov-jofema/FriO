'use client';

import * as React from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '../ui/button';
import { LotCreationForm } from './LotCreationForm';
import { WeightCalculator } from './WeightCalculator';
import { TemperatureForm } from './TemperatureForm';

interface LotListProps {
  exporterId: string;
  producerId: string;
}

export function LotList({ exporterId, producerId }: LotListProps) {
  const firestore = useFirestore();
  const [lots, setLots] = React.useState<ReceptionLot[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  const [isCreateOpen, setCreateOpen] = React.useState(false);
  const [isWeightOpen, setWeightOpen] = React.useState(false);
  const [isTempOpen, setTempOpen] = React.useState(false);
  const [selectedLot, setSelectedLot] = React.useState<ReceptionLot | null>(null);

  React.useEffect(() => {
    if (!firestore || !producerId) {
        setLots([]);
        setLoading(false);
        return;
    };

    setLoading(true);
    const lotsRef = collection(firestore, 'receptionLots');
    const q = query(
      lotsRef,
      where('producerId', '==', producerId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionLot))
        .filter(lot => lot.exporterId === exporterId)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        
      setLots(fetchedLots);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching lots: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, exporterId, producerId]);
  
  const handleActionClick = (lot: ReceptionLot) => {
    setSelectedLot(lot);
    if (lot.status === 'Pendiente de Peso') {
      setWeightOpen(true);
    } else if (['Pendiente de Pre-Hidro', 'Pendiente de Post-Hidro'].includes(lot.status)) {
      setTempOpen(true);
    }
  };

  const closeDialogs = () => {
    setWeightOpen(false);
    setTempOpen(false);
    setSelectedLot(null);
  }

  const getStatusVariant = (status: ReceptionLot['status']) => {
    switch (status) {
      case 'Pendiente de Peso': return 'destructive';
      case 'Pendiente de Pre-Hidro': return 'secondary';
      case 'Pendiente de Post-Hidro': return 'outline';
      case 'Cerrado': return 'default';
      default: return 'default';
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>Lotes en Recepción</CardTitle>
                <CardDescription>Lotes registrados para el productor seleccionado.</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}>Crear Nuevo Lote</Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">ID Lote</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Variedad</TableHead>
                  <TableHead>Bins</TableHead>
                  <TableHead>Totes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Peso Total</TableHead>
                  <TableHead className="w-[120px] text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : lots.length > 0 ? (
                  lots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium truncate" style={{maxWidth: '120px'}} title={lot.id}>{lot.id}</TableCell>
                      <TableCell>{lot.document}</TableCell>
                      <TableCell>{lot.variety}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell>{lot.toteCount}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge>
                      </TableCell>
                      <TableCell>{lot.totalWeight ? `${lot.totalWeight.toFixed(2)} kg` : '-'}</TableCell>
                      <TableCell className="text-right">
                        {lot.status !== 'Cerrado' && (
                          <Button size="sm" onClick={() => handleActionClick(lot)}>
                            {lot.status === 'Pendiente de Peso' ? 'Pesar' : 'Temp'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      No se encontraron lotes para esta selección.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <LotCreationForm 
        exporterId={exporterId} 
        producerId={producerId} 
        open={isCreateOpen} 
        onOpenChange={setCreateOpen} 
        onLotCreated={()=>{}}
      />
      
      {selectedLot && (
        <>
            <WeightCalculator 
                lot={selectedLot} 
                open={isWeightOpen}
                onOpenChange={setWeightOpen}
                onWeightSaved={closeDialogs}
            />
            <TemperatureForm 
                lot={selectedLot}
                open={isTempOpen}
                onOpenChange={setTempOpen}
                onTempSaved={closeDialogs}
            />
        </>
      )}

    </>
  );
}
