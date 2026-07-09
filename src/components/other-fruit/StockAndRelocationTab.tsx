'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { chambersConfig } from '@/lib/chambers-config';
import { Search, ScanLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { useToast } from '@/hooks/use-toast';

interface StoredOtherFruitItem {
    id: string; // receptionId + itemIndex
    receptionId: string;
    itemIndex: number;
    clientName: string;
    productName: string;
    quantity: number;
    unit: 'Bins' | 'Pallets';
    location: {
        chamberId: string;
        coordinate: string;
    };
    palletId?: string;
    clientLotId?: string;
    document?: string;
    storedAt?: any;
}

export function StockAndRelocationTab({ clientId: fixedClientId }: { clientId?: string }) {
  const { data: allReceptions, loading } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const { toast } = useToast();

  const storedItems = React.useMemo(() => {
    const filteredReceptions = (allReceptions || []).filter(r => !fixedClientId || r.clientId === fixedClientId);
    return filteredReceptions
        .flatMap((reception) => 
            (reception.items || [])
                .map((item, index) => ({ item, index, reception }))
                .filter(({ item }) => item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate)
                .map(({ item, index, reception }) => ({
                    id: `${reception.id}-${index}`,
                    receptionId: reception.id,
                    itemIndex: index,
                    clientName: reception.clientName,
                    productName: item.productName,
                    quantity: item.quantity,
                    unit: reception.unit,
                    location: item.storageLocation!,
                    palletId: item.palletId,
                    clientLotId: item.clientLotId,
                    document: reception.document,
                    storedAt: item.storedAt || reception.createdAt,
                } as StoredOtherFruitItem))
        )
        .sort((a,b) => a.location.chamberId.localeCompare(b.location.chamberId) || a.location.coordinate.localeCompare(b.location.coordinate));
  }, [allReceptions, fixedClientId]);

  const filteredItems = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return storedItems;
    return storedItems.filter(item => {
        const palletIdStr = String(item.palletId || '').toLowerCase();
        const docStr = String(item.document || '').toLowerCase();
        const lotStr = String(item.clientLotId || '').toLowerCase();
        const clientStr = String(item.clientName || '').toLowerCase();
        const prodStr = String(item.productName || '').toLowerCase();
        const chamberStr = String(chambersConfig[item.location.chamberId]?.name || item.location.chamberId).toLowerCase();
        const coordStr = String(item.location.coordinate || '').toLowerCase();

        return palletIdStr.includes(q) ||
               docStr.includes(q) ||
               lotStr.includes(q) ||
               clientStr.includes(q) ||
               prodStr.includes(q) ||
               chamberStr.includes(q) ||
               coordStr.includes(q);
    });
  }, [storedItems, searchQuery]);

  const handleScan = (scannedCode: string) => {
    const cleanCode = scannedCode.trim();
    if (!cleanCode) return;

    setSearchQuery(cleanCode);

    const foundItem = storedItems.find(item => 
      String(item.palletId || '').toLowerCase().trim() === cleanCode.toLowerCase()
    );

    if (foundItem) {
      toast({
        title: 'Ubicación Encontrada',
        description: `El bin/pallet ${cleanCode} está en ${chambersConfig[foundItem.location.chamberId]?.name || foundItem.location.chamberId} - Coordenada ${foundItem.location.coordinate}.`,
      });
    } else {
      // Try a fuzzy match in case the scanned code is part of the palletId or clientLotId
      const fuzzyItem = storedItems.find(item => 
        String(item.palletId || '').toLowerCase().includes(cleanCode.toLowerCase()) ||
        String(item.clientLotId || '').toLowerCase().includes(cleanCode.toLowerCase())
      );

      if (fuzzyItem) {
        toast({
          title: 'Ubicación Encontrada (Coincidencia)',
          description: `El código ${cleanCode} coincide con ${fuzzyItem.palletId} en ${chambersConfig[fuzzyItem.location.chamberId]?.name || fuzzyItem.location.chamberId} - Coordenada ${fuzzyItem.location.coordinate}.`,
        });
      } else {
        toast({
          title: 'Sin Coincidencia',
          description: `No se encontró stock activo en cámara para el código escaneado: ${cleanCode}.`,
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <>
      <Card className="border-t-4 border-t-[#004b8d]">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-[#004b8d] flex items-center gap-2">
              <Search className="h-5 w-5 text-[#7aba28]" />
              Consulta de Stock de Socios Comerciales
            </CardTitle>
            <CardDescription>
              Consulte la ubicación, Pallet ID, documento y estado de los pallets almacenados en las cámaras.
            </CardDescription>
          </div>
          <div className="flex gap-2 w-full md:w-auto items-center">
            <Button
              variant="outline"
              className="border-[#7aba28]/30 hover:bg-[#7aba28]/10 hover:text-[#7aba28] h-10 gap-2 text-[#7aba28] font-semibold"
              onClick={() => setScannerOpen(true)}
            >
              <ScanLine className="h-5 w-5" />
              <span>Scanear QR</span>
            </Button>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar Pallet ID, Documento, Lote, Variedad..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 border-[#004b8d]/20 h-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase">Fecha Almacenamiento</TableHead>
                  {!fixedClientId && <TableHead className="font-bold text-xs uppercase">Cliente</TableHead>}
                  <TableHead className="font-bold text-xs uppercase">Pallet Log (Documento)</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Pallet ID</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Lote Cliente</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Variedad</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Cámara</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Ubicación</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={fixedClientId ? 8 : 9}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredItems.length > 0 ? (
                  filteredItems.map((item) => {
                    const storedDate = item.storedAt?.toDate 
                        ? item.storedAt.toDate().toLocaleDateString() 
                        : (item.storedAt ? new Date(item.storedAt).toLocaleDateString() : 'Sin fecha');
                    
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs">{storedDate}</TableCell>
                        {!fixedClientId && <TableCell className="text-xs font-semibold">{item.clientName}</TableCell>}
                        <TableCell className="font-mono text-xs">{item.document || '-'}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">{item.palletId || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{item.clientLotId || '-'}</TableCell>
                        <TableCell className="text-xs">{item.productName}</TableCell>
                        <TableCell className="text-xs">{chambersConfig[item.location.chamberId]?.name || item.location.chamberId}</TableCell>
                        <TableCell className="font-mono font-bold text-[#004b8d] text-xs">{item.location.coordinate}</TableCell>
                        <TableCell className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{item.quantity} {item.unit}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={fixedClientId ? 8 : 9} className="h-24 text-center text-xs text-muted-foreground">
                      No se encontraron registros de stock con los criterios ingresados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
        title="Consultar Ubicación de Bin / Pallet"
        description="Escanee el código QR o código de barras para localizar el bin en las cámaras frigoríficas."
      />
    </>
  );
}
