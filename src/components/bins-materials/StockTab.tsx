'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import type { BinMaterialStock, Exporter } from '@/lib/types';
import { collection, onSnapshot, query, where, Query, getDocs, writeBatch } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Button } from '../ui/button';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface StockTabProps {
  exporterId: string | null;
}

export function StockTab({ exporterId }: StockTabProps) {
  const firestore = useFirestore();
  const [stock, setStock] = React.useState<BinMaterialStock[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { toast } = useToast();

  const exporterMap = React.useMemo(() => {
    return exporters.reduce((acc, exporter) => {
      acc[exporter.exporterId] = exporter.name;
      return acc;
    }, {} as Record<string, string>);
  }, [exporters]);

  React.useEffect(() => {
    if (!firestore) return;

    setLoading(true);
    let stockQuery: Query;
    
    const stockRef = collection(firestore, 'binMaterialStock');
    if (exporterId) {
        stockQuery = query(stockRef, where('exporterId', '==', exporterId));
    } else {
        stockQuery = query(stockRef);
    }

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

  const handleClearStock = async () => {
    if (!firestore) return;

    try {
      const stockRef = collection(firestore, 'binMaterialStock');
      const querySnapshot = await getDocs(stockRef);
      
      if (querySnapshot.empty) {
        toast({ title: 'Sin Stock', description: 'No hay registros de stock para eliminar.' });
        return;
      }

      const batch = writeBatch(firestore);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      toast({ title: 'Éxito', description: 'Todo el stock de bins y materiales ha sido eliminado para la nueva temporada.' });
    } catch (e: any) {
      console.error("Error al limpiar el stock: ", e);
      toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al limpiar el stock.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialStock',
          operation: 'delete'
      }));
    }
  };

  const isLoading = loading || loadingExporters;

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Stock Actual</CardTitle>
          <CardDescription>
            {exporterId 
              ? 'Saldos de bins y materiales para el exportador seleccionado.'
              : 'Saldos de bins y materiales para todos los exportadores.'
            }
          </CardDescription>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Limpiar Stock General
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Está seguro de limpiar TODO el stock?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará permanentemente todos los registros de stock de bins y materiales (de todos los exportadores). Use esta opción solo para iniciar una nueva temporada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearStock} className="bg-destructive hover:bg-destructive/90">
                Sí, Limpiar Todo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent>
        {/* Mobile View */}
        <div className="sm:hidden space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : stock.length > 0 ? (
            stock.map(item => (
              <div key={item.id} className="border p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-semibold">{item.binMaterialName}</p>
                  <p className="text-sm text-muted-foreground">
                    {exporterId ? `Código: ${item.binMaterialCode}` : exporterMap[item.exporterId] || item.exporterId}
                  </p>
                </div>
                <p className="text-2xl font-bold">{item.quantity}</p>
              </div>
            ))
          ) : (
             <div className="text-center p-8 border-dashed border rounded-md text-sm text-muted-foreground">
                No hay stock registrado para esta selección.
             </div>
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden sm:block rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre del Material</TableHead>
                {!exporterId && <TableHead>Exportador</TableHead>}
                <TableHead className="text-right">Cantidad en Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={exporterId ? 3 : 4}><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : stock.length > 0 ? (
                stock.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.binMaterialCode}</TableCell>
                    <TableCell className="font-medium">{item.binMaterialName}</TableCell>
                    {!exporterId && <TableCell>{exporterMap[item.exporterId] || item.exporterId}</TableCell>}
                    <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={exporterId ? 3 : 4} className="h-24 text-center">
                    {exporterId ? 'No hay stock para el exportador seleccionado.' : 'No hay stock registrado.'}
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
