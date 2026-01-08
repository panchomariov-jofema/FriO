'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function StockTab() {
  const { data: allLots, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');

  const stockByMaterial = React.useMemo(() => {
    const stock: Record<string, { total: number; locations: Record<string, number>, pending: number }> = {};

    allLots
      .forEach(lot => {
        lot.items.forEach(item => {
          if (!stock[item.packagingMasterName]) {
            stock[item.packagingMasterName] = { total: 0, locations: {}, pending: 0 };
          }
          
          if (item.status === 'Almacenado' && item.storageLocation) {
            stock[item.packagingMasterName].total += item.palletCount;
            const locationKey = `${item.storageLocation.warehouse} / ${item.storageLocation.aisle}`;
            stock[item.packagingMasterName].locations[locationKey] = (stock[item.packagingMasterName].locations[locationKey] || 0) + item.palletCount;
          } else if (item.status === 'Pendiente de almacenar') {
            stock[item.packagingMasterName].pending += item.palletCount;
            stock[item.packagingMasterName].total += item.palletCount;
          }
        });
      });
      
    return Object.entries(stock).sort((a,b) => a[0].localeCompare(b[0]));
  }, [allLots]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock de Embalajes en Bodega</CardTitle>
        <CardDescription>Resumen del total de pallets por material, incluyendo stock físico y pendientes de almacenar.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : stockByMaterial.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {stockByMaterial.map(([materialName, data]) => (
              <AccordionItem value={materialName} key={materialName}>
                <AccordionTrigger>
                  <div className="flex w-full items-center justify-between pr-4">
                    <span className="text-base font-semibold">{materialName}</span>
                    <span className="font-mono font-bold text-lg">{data.total} Pallets</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-2 bg-muted/50 rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ubicación</TableHead>
                          <TableHead className="text-right">Cantidad de Pallets</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.pending > 0 && (
                            <TableRow>
                                <TableCell className="font-semibold text-secondary-foreground">Pendiente de Almacenar</TableCell>
                                <TableCell className="text-right font-semibold">{data.pending}</TableCell>
                            </TableRow>
                        )}
                        {Object.entries(data.locations).sort().map(([location, count]) => (
                          <TableRow key={location}>
                            <TableCell>{location}</TableCell>
                            <TableCell className="text-right font-medium">{count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
            <p className="text-muted-foreground">No hay stock registrado.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
