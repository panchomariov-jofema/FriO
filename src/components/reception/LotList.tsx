'use client';

import * as React from 'react';
import { collection, query, where, orderBy, onSnapshot, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface LotListProps {
  exporterId: string;
  producerId: string;
  selectedLot: ReceptionLot | null;
  onSelectLot: (lot: ReceptionLot) => void;
}

export function LotList({ exporterId, producerId, selectedLot, onSelectLot }: LotListProps) {
  const firestore = useFirestore();
  const [lots, setLots] = React.useState<ReceptionLot[]>([]);
  const [loading, setLoading] = React.useState(true);

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
    <Card>
      <CardHeader>
        <CardTitle>Lotes en Recepción</CardTitle>
        <CardDescription>Lotes registrados para el productor seleccionado. Seleccione un lote para continuar.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Lote</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Variedad</TableHead>
                <TableHead>Bins</TableHead>
                <TableHead>Totes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Peso Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : lots.length > 0 ? (
                lots.map((lot) => (
                  <TableRow
                    key={lot.id}
                    onClick={() => onSelectLot(lot)}
                    className={cn(
                      "cursor-pointer",
                      selectedLot?.id === lot.id && "bg-muted/50"
                    )}
                  >
                    <TableCell className="font-medium truncate" style={{maxWidth: '100px'}} title={lot.id}>{lot.id}</TableCell>
                    <TableCell>{lot.document}</TableCell>
                    <TableCell>{lot.variety}</TableCell>
                    <TableCell>{lot.binCount}</TableCell>
                    <TableCell>{lot.toteCount}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge>
                    </TableCell>
                    <TableCell>{lot.totalWeight ? `${lot.totalWeight} kg` : '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No se encontraron lotes para esta selección.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
