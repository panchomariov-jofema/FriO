'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function CamarasPage() {
  const { data: chamberLots, loading } = useFirestoreCollection<ChamberLot>('chamberLots');

  const sortedLots = React.useMemo(() => {
    if (!chamberLots) return [];
    return chamberLots.sort((a, b) => {
        if (!a.storedAt) return 1;
        if (!b.storedAt) return -1;
        return b.storedAt.toMillis() - a.storedAt.toMillis();
    });
  }, [chamberLots]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulo de Cámaras</CardTitle>
        <CardDescription>Lotes almacenados en las cámaras de frío.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Lote</TableHead>
                <TableHead>Productor</TableHead>
                <TableHead>Cámara</TableHead>
                <TableHead>N° Bins</TableHead>
                <TableHead>Fecha Almacenamiento</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : sortedLots.length > 0 ? (
                sortedLots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                    <TableCell>{lot.producerShortName}</TableCell>
                    <TableCell>{lot.chamberId}</TableCell>
                    <TableCell>{lot.binCount}</TableCell>
                    <TableCell>
                      {lot.storedAt ? format(lot.storedAt.toDate(), 'dd/MM/yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell><Badge>{lot.status}</Badge></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No hay lotes en las cámaras.
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
