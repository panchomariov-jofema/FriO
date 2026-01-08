'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, PackagingReception } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface FlattenedStockItem {
  key: string;
  clientName: string;
  clientId: string;
  code: string;
  description: string;
  quantity: number;
  location: string;
}

export function StockTab() {
  const { data: allLots, loading: loadingLots } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: clients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const [clientFilter, setClientFilter] = React.useState('');
  const [codeFilter, setCodeFilter] = React.useState('');

  const flattenedStock = React.useMemo(() => {
    const stock: FlattenedStockItem[] = [];
    allLots
      .filter(lot => lot.status === 'Almacenado' || lot.status === 'Parcialmente Almacenado')
      .forEach(lot => {
        lot.items.forEach((item, index) => {
          if (item.status === 'Almacenado' && item.storageLocation) {
            stock.push({
              key: `${lot.id}-${index}`,
              clientName: lot.clientName,
              clientId: lot.clientId,
              code: item.packagingMasterCode,
              description: item.packagingMasterName,
              quantity: item.palletCount,
              location: `${item.storageLocation.warehouse} / ${item.storageLocation.aisle}`,
            });
          }
        });
      });
    return stock.sort((a,b) => a.code.localeCompare(b.code));
  }, [allLots]);
  
  const filteredStock = React.useMemo(() => {
    return flattenedStock.filter(item => {
        const clientMatch = !clientFilter || item.clientId === clientFilter;
        const codeMatch = !codeFilter || item.code.toLowerCase().includes(codeFilter.toLowerCase());
        return clientMatch && codeMatch;
    });
  }, [flattenedStock, clientFilter, codeFilter]);

  const packagingClients = React.useMemo(() => {
    return clients.filter(c => c.type.toLowerCase() === 'embalaje');
  }, [clients]);

  const isLoading = loadingLots || loadingClients;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock de Embalajes en Bodega</CardTitle>
        <CardDescription>Inventario físico de todos los materiales de embalaje almacenados.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 space-y-2">
                <Label htmlFor="client-filter">Filtrar por Cliente</Label>
                <Select value={clientFilter} onValueChange={setClientFilter} disabled={isLoading}>
                    <SelectTrigger id="client-filter">
                        <SelectValue placeholder="Todos los clientes" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">Todos los clientes</SelectItem>
                        {packagingClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex-1 space-y-2">
                 <Label htmlFor="code-filter">Filtrar por Código</Label>
                <Input
                    id="code-filter"
                    placeholder="Buscar por código..."
                    value={codeFilter}
                    onChange={(e) => setCodeFilter(e.target.value)}
                    disabled={isLoading}
                />
            </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredStock.length > 0 ? (
                filteredStock.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell className="font-mono">{item.code}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell>{item.clientName}</TableCell>
                    <TableCell>{item.location}</TableCell>
                    <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No se encontró stock con los filtros seleccionados.
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
