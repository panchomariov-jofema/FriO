'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, PackagingReceptionItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface StockEntry extends PackagingReceptionItem {
  receptionId: string;
  itemIndex: number;
}

interface AggregatedStock {
  total: number;
  pending: number;
  storedEntries: StockEntry[];
}

export function StockTab() {
  const { data: allLots, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');

  const stockByMaterial = React.useMemo(() => {
    const stock: Record<string, AggregatedStock> = {};

    allLots.forEach(lot => {
      lot.items.forEach((item, index) => {
        if (!stock[item.packagingMasterName]) {
          stock[item.packagingMasterName] = { total: 0, pending: 0, storedEntries: [] };
        }
        
        const currentMaterial = stock[item.packagingMasterName];
        currentMaterial.total += item.palletCount;

        const stockEntry: StockEntry = {
          ...item,
          receptionId: lot.id,
          itemIndex: index,
        };

        if (item.status === 'Almacenado' && item.storageLocation) {
          currentMaterial.storedEntries.push(stockEntry);
        } else if (item.status === 'Pendiente de almacenar') {
          currentMaterial.pending += item.palletCount;
        }
      });
    });
      
    return Object.entries(stock).sort((a,b) => a[0].localeCompare(b[0]));
  }, [allLots]);


  return (
    <>
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
                          <TableHead>Cant. Pallets</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.pending > 0 && (
                            <TableRow>
                                <TableCell className="font-semibold text-secondary-foreground">Pendiente de Almacenar</TableCell>
                                <TableCell className="font-semibold">{data.pending}</TableCell>
                            </TableRow>
                        )}
                        {data.storedEntries.sort((a,b) => `${a.storageLocation?.warehouse}-${a.storageLocation?.aisle}`.localeCompare(`${b.storageLocation?.warehouse}-${b.storageLocation?.aisle}`)).map((entry) => (
                           <TableRow key={`${entry.receptionId}-${entry.itemIndex}`}>
                                <TableCell>{entry.storageLocation?.warehouse} / {entry.storageLocation?.aisle}</TableCell>
                                <TableCell>{entry.palletCount}</TableCell>
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
    </>
  );
}
