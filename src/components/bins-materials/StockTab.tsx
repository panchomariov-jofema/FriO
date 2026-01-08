'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import type { BinMaterialStock } from '@/lib/types';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

interface StockTabProps {
  exporterId: string;
}

export function StockTab({ exporterId }: StockTabProps) {
  const firestore = useFirestore();
  const [stock, setStock] = React.useState<BinMaterialStock[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!firestore || !exporterId) return;

    setLoading(true);
    const stockQuery = query(
      collection(firestore, 'binMaterialStock'),
      where('exporterId', '==', exporterId)
    );

    const unsubscribe = onSnapshot(stockQuery, (snapshot) => {
      const stockData: BinMaterialStock[] = [];
      snapshot.forEach(doc => {
        stockData.push({ id: doc.id, ...doc.data() } as BinMaterialStock);
      });
      setStock(stockData.sort((a,b) => a.binMaterialName.localeCompare(b.binMaterialName)));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching stock:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, exporterId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Actual</CardTitle>
        <CardDescription>Saldos de bins y materiales para el exportador seleccionado.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre del Material</TableHead>
                <TableHead className="text-right">Cantidad en Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : stock.length > 0 ? (
                stock.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.binMaterialCode}</TableCell>
                    <TableCell className="font-medium">{item.binMaterialName}</TableCell>
                    <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">No hay stock para el exportador seleccionado.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
    