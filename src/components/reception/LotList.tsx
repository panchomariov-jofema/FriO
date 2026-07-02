'use client';

import * as React from 'react';
import { collection, query, where, onSnapshot, Query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '../ui/button';
import { WeightCalculator } from './WeightCalculator';
import { TemperatureForm } from './TemperatureForm';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { EditLotDialog } from './EditLotDialog';
import { safeToMillis, safeFormatQuantity } from '@/lib/utils';
import { Pencil } from 'lucide-react';

interface LotListProps {
  exporterId: string | null;
}

export function LotList({ exporterId }: LotListProps) {
  const firestore = useFirestore();
  const [lots, setLots] = React.useState<ReceptionLot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showOnlyOpen, setShowOnlyOpen] = React.useState(true);
  
  const [isWeightOpen, setWeightOpen] = React.useState(false);
  const [isTempOpen, setTempOpen] = React.useState(false);
  const [isEditOpen, setEditOpen] = React.useState(false);
  const [selectedLot, setSelectedLot] = React.useState<ReceptionLot | null>(null);

  React.useEffect(() => {
    if (!firestore) {
        setLots([]);
        setLoading(false);
        return;
    };

    setLoading(true);
    
    let q: Query;
    const lotsRef = collection(firestore, 'receptionLots');

    if (exporterId) {
      q = query(lotsRef, where('exporterId', '==', exporterId));
    } else {
      q = query(lotsRef);
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionLot))
        .sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
        
      setLots(fetchedLots);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching lots: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, exporterId]);
  
  const handleActionClick = (lot: ReceptionLot) => {
    setSelectedLot(lot);
    if (lot.status === 'Pendiente de Peso') {
      setWeightOpen(true);
    } else if (['Pendiente de Pre-Hidro', 'Pendiente de Post-Hidro'].includes(lot.status)) {
      setTempOpen(true);
    }
  };

  const handleEditClick = (lot: ReceptionLot) => {
    setSelectedLot(lot);
    setEditOpen(true);
  }

  const closeDialogs = () => {
    setWeightOpen(false);
    setTempOpen(false);
    setEditOpen(false);
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

  const filteredLots = showOnlyOpen ? lots.filter(lot => lot.status !== 'Cerrado') : lots;

  const renderCellContent = (lot: ReceptionLot, field: 'totalWeight' | 'preHydroTemp' | 'postHydroTemp') => {
    const status = lot.status;

    if (field === 'totalWeight') {
        if (status === 'Pendiente de Peso') {
            return <Button size="sm" variant="outline" onClick={() => handleActionClick(lot)}>Pesar</Button>;
        }
        return lot.totalWeight ? `${safeFormatQuantity(lot.totalWeight, 2)} kg` : '-';
    }
    
    if (field === 'preHydroTemp') {
        if (status === 'Pendiente de Pre-Hidro') {
            return <Button size="sm" variant="outline" onClick={() => handleActionClick(lot)}>Registrar T°</Button>;
        }
        return lot.preHydroTemp ? `${safeFormatQuantity(lot.preHydroTemp, 1)} °C` : '-';
    }

    if (field === 'postHydroTemp') {
        if (status === 'Pendiente de Post-Hidro') {
            return <Button size="sm" variant="outline" onClick={() => handleActionClick(lot)}>Registrar T°</Button>;
        }
        return lot.postHydroTemp ? `${safeFormatQuantity(lot.postHydroTemp, 1)} °C` : '-';
    }
  }


  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Lotes en Recepción</CardTitle>
              <CardDescription>Lotes activos para la selección actual.</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="show-open" checked={showOnlyOpen} onCheckedChange={(checked) => setShowOnlyOpen(!!checked)} />
              <Label htmlFor="show-open">Mostrar solo lotes abiertos</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">ID Lote</TableHead>
                  <TableHead className="hidden md:table-cell">Variedad</TableHead>
                  <TableHead>Bins</TableHead>
                  <TableHead className="hidden md:table-cell">Totes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Peso Total</TableHead>
                  <TableHead className="hidden md:table-cell">Peso Neto</TableHead>
                  <TableHead>T° Pre</TableHead>
                  <TableHead>T° Post</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredLots.length > 0 ? (
                  filteredLots.map((lot) => {
                     const pesoNeto = (lot.netWeightPerBin && lot.binCount > 0)
                        ? lot.netWeightPerBin * lot.binCount
                        : null;
                    
                    return (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.displayLotId || lot.id}</TableCell>
                      <TableCell className="hidden md:table-cell">{lot.variety}</TableCell>
                      <TableCell>{lot.binCount}</TableCell>
                      <TableCell className="hidden md:table-cell">{lot.toteCount}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge>
                      </TableCell>
                      <TableCell>{renderCellContent(lot, 'totalWeight')}</TableCell>
                      <TableCell className="hidden md:table-cell">{pesoNeto !== null ? `${safeFormatQuantity(pesoNeto, 2)} kg` : '-'}</TableCell>
                      <TableCell>{renderCellContent(lot, 'preHydroTemp')}</TableCell>
                      <TableCell>{renderCellContent(lot, 'postHydroTemp')}</TableCell>
                       <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(lot)}>
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Editar</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                      No se encontraron lotes para esta selección.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
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
            <EditLotDialog
                lot={selectedLot}
                open={isEditOpen}
                onOpenChange={setEditOpen}
                onLotUpdated={closeDialogs}
            />
        </>
      )}

    </>
  );
}
