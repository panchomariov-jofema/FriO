'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { HidrocoolerLot } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function HidrocoolerPage() {
  const { data: lots, loading } = useFirestoreCollection<HidrocoolerLot>('hidrocoolerLots');

  const sortedLots = React.useMemo(() => {
    if (!lots) return [];
    return lots.sort((a, b) => {
        if (!b.createdAt) return -1;
        if (!a.createdAt) return 1;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
    });
  }, [lots]);

  const getStatusVariant = (status: HidrocoolerLot['status']) => {
    switch (status) {
      case 'Pendiente de Pre-Hidro':
        return 'secondary';
      case 'En Proceso':
        return 'outline';
      case 'Finalizado':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulo de Hidrocooler</CardTitle>
        <CardDescription>Lotes que han ingresado al proceso de enfriamiento.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Lote</TableHead>
                <TableHead>Productor</TableHead>
                <TableHead>Cantidad de Bins</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedLots.length > 0 ? (
                sortedLots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.displayLotId}</TableCell>
                    <TableCell>{lot.producerShortName}</TableCell>
                    <TableCell>{lot.binCount}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(lot.status)}>{lot.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No hay lotes en el hidrocooler.
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
