'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

interface StockEntry {
  palletCount: number;
  location: string;
}

interface AggregatedStock {
  totalPallets: number;
  entries: StockEntry[];
}

interface ClientStock {
  [materialName: string]: AggregatedStock;
}

interface StockByClient {
  [clientName: string]: ClientStock;
}

export function StockTab() {
  const { data: allLots, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');

  const stockByClient = React.useMemo(() => {
    const stock: StockByClient = {};

    allLots.forEach(lot => {
      // Initialize client if not present
      if (!stock[lot.clientName]) {
        stock[lot.clientName] = {};
      }
      
      const clientStock = stock[lot.clientName];

      lot.items.forEach(item => {
        if (item.palletCount <= 0) return;

        // Initialize material for the client if not present
        if (!clientStock[item.packagingMasterName]) {
          clientStock[item.packagingMasterName] = { totalPallets: 0, entries: [] };
        }

        const materialStock = clientStock[item.packagingMasterName];
        materialStock.totalPallets += item.palletCount;
        
        materialStock.entries.push({
          palletCount: item.palletCount,
          location: item.status === 'Almacenado' && item.storageLocation 
            ? `${item.storageLocation.warehouse} / ${item.storageLocation.aisle}`
            : 'Pendiente de Almacenar',
        });
      });
    });
      
    // Sort clients by name
    return Object.entries(stock).sort((a,b) => a[0].localeCompare(b[0]));
  }, [allLots]);


  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Stock de Embalajes en Bodega</CardTitle>
          <CardDescription>Resumen del stock físico y pendiente, agrupado por cliente y material.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : stockByClient.length > 0 ? (
            stockByClient.map(([clientName, clientStock]) => (
              <div key={clientName} className="space-y-4">
                <h3 className="text-xl font-semibold border-b pb-2">{clientName}</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(clientStock).sort((a,b)=>a[0].localeCompare(b[0])).map(([materialName, stockData]) => (
                    <Card key={materialName}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{materialName}</CardTitle>
                        <CardDescription>Total: <span className="font-bold">{stockData.totalPallets} Pallets</span></CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border max-h-48 overflow-y-auto">
                           <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Ubicación</TableHead>
                                <TableHead className="text-right">Pallets</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stockData.entries.map((entry, index) => (
                                <TableRow key={index}>
                                  <TableCell>{entry.location}</TableCell>
                                  <TableCell className="text-right font-medium">{entry.palletCount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
              <p className="text-muted-foreground">No hay stock registrado.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
