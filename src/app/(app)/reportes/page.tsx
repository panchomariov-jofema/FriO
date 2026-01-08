'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import type { BinMaterialStock, Exporter, BinMaterialMovement, Producer, ReceptionLot } from '@/lib/types';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function StockReport() {
    const firestore = useFirestore();
    const [stock, setStock] = React.useState<BinMaterialStock[]>([]);
    const [loading, setLoading] = React.useState(true);
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');

    const exporterMap = React.useMemo(() => {
        return exporters.reduce((acc, exporter) => {
        acc[exporter.exporterId] = exporter.name;
        return acc;
        }, {} as Record<string, string>);
    }, [exporters]);

    React.useEffect(() => {
        if (!firestore) return;

        setLoading(true);
        const stockQuery = query(collection(firestore, 'binMaterialStock'));

        const unsubscribe = onSnapshot(stockQuery, (snapshot) => {
        const stockData: BinMaterialStock[] = [];
        snapshot.forEach(doc => {
            stockData.push({ id: doc.id, ...doc.data() } as BinMaterialStock);
        });
        setStock(stockData.sort((a, b) => a.binMaterialName.localeCompare(b.binMaterialName)));
        setLoading(false);
        }, (error) => {
        console.error('Error fetching stock:', error);
        setLoading(false);
        });

        return () => unsubscribe();
    }, [firestore]);

    const isLoading = loading || loadingExporters;

    const handleExportCSV = () => {
        const headers = ['Código', 'Nombre del Material', 'Exportador', 'Cantidad en Stock'];
        const csvRows = [headers.join(',')];

        stock.forEach(item => {
            const row = [
                `"${item.binMaterialCode}"`,
                `"${item.binMaterialName}"`,
                `"${exporterMap[item.exporterId] || item.exporterId}"`,
                item.quantity
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "reporte_stock_materiales.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Reporte de Stock de Materiales</CardTitle>
                    <CardDescription>
                        Muestra los saldos actuales de todos los bins y materiales para todos los exportadores.
                    </CardDescription>
                </div>
                <Button onClick={handleExportCSV} disabled={isLoading || stock.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar a CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre del Material</TableHead>
                        <TableHead>Exportador</TableHead>
                        <TableHead className="text-right">Cantidad en Stock</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {isLoading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell colSpan={4}><Skeleton className="h-4 w-full" /></TableCell>
                        </TableRow>
                        ))
                    ) : stock.length > 0 ? (
                        stock.map(item => (
                        <TableRow key={item.id}>
                            <TableCell className="font-mono">{item.binMaterialCode}</TableCell>
                            <TableCell className="font-medium">{item.binMaterialName}</TableCell>
                            <TableCell>{exporterMap[item.exporterId] || item.exporterId}</TableCell>
                            <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center">
                            No hay stock registrado.
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

function KardexReport() {
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');

    const exporterMap = React.useMemo(() => exporters.reduce((acc, e) => ({ ...acc, [e.exporterId]: e.name }), {} as Record<string, string>), [exporters]);
    const producerMap = React.useMemo(() => producers.reduce((acc, p) => ({ ...acc, [p.producerId]: p.shortName }), {} as Record<string, string>), [producers]);

    const flattenedData = React.useMemo(() => {
        if (!movements) return [];
        return movements
            .flatMap(movement => 
                movement.items.map(item => ({
                    ...movement,
                    ...item,
                    movementId: movement.id, // Keep a unique key for the row
                }))
            )
            .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    }, [movements]);

    const isLoading = loadingMovements || loadingExporters || loadingProducers;

    const handleExportCSV = () => {
        const headers = ['Fecha', 'Hora', 'Tipo', 'Documento', 'Exportador', 'Productor', 'Código', 'Producto', 'Cantidad'];
        const csvRows = [headers.join(',')];

        flattenedData.forEach(item => {
            const date = item.createdAt.toDate();
            const row = [
                `"${date.toLocaleDateString()}"`,
                `"${date.toLocaleTimeString()}"`,
                `"${item.type === 'entrada' ? 'Entrada' : 'Salida'}"`,
                `"${item.document}"`,
                `"${exporterMap[item.exporterId] || item.exporterId}"`,
                `"${producerMap[item.producerId] || item.producerId}"`,
                `"${item.binMaterialCode}"`,
                `"${item.binMaterialName}"`,
                item.quantity
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "reporte_kardex_movimientos.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Kardex de Movimientos</CardTitle>
                    <CardDescription>
                        Historial de todos los movimientos de entrada y salida de materiales.
                    </CardDescription>
                </div>
                <Button onClick={handleExportCSV} disabled={isLoading || flattenedData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar a CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Fecha / Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Exportador</TableHead>
                        <TableHead>Productor</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {isLoading ? (
                        Array.from({ length: 15 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell>
                        </TableRow>
                        ))
                    ) : flattenedData.length > 0 ? (
                        flattenedData.map((item, index) => (
                        <TableRow key={`${item.movementId}-${index}`}>
                            <TableCell>{item.createdAt.toDate().toLocaleString()}</TableCell>
                            <TableCell>
                                <Badge variant={item.type === 'entrada' ? 'default' : 'secondary'}>
                                    {item.type === 'entrada' ? 'Entrada' : 'Salida'}
                                </Badge>
                            </TableCell>
                            <TableCell>{exporterMap[item.exporterId] || item.exporterId}</TableCell>
                            <TableCell>{producerMap[item.producerId] || item.producerId}</TableCell>
                            <TableCell className="font-mono">{item.binMaterialCode}</TableCell>
                            <TableCell className="font-medium">{item.binMaterialName}</TableCell>
                            <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                            No hay movimientos registrados.
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

function ReceptionReport() {
    const { data: receptionLots, loading: loadingLots } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');

    const exporterMap = React.useMemo(() => exporters.reduce((acc, e) => ({ ...acc, [e.exporterId]: e.name }), {} as Record<string, string>), [exporters]);
    const producerMap = React.useMemo(() => producers.reduce((acc, p) => ({ ...acc, [p.producerId]: p.shortName }), {} as Record<string, string>), [producers]);

    const sortedData = React.useMemo(() => {
        if (!receptionLots) return [];
        return [...receptionLots].sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
    }, [receptionLots]);

    const isLoading = loadingLots || loadingExporters || loadingProducers;

    const handleExportCSV = () => {
        const headers = ['Fecha', 'Exportador', 'Productor', 'Cantidad de Bins', 'Cantidad de Totes', 'Totes Vacios', 'Variedad', 'Kilos (Peso Total)', 'T° Pre-Hidro', 'T° Post-Hidro', 'Status'];
        const csvRows = [headers.join(',')];

        sortedData.forEach(lot => {
            const date = lot.createdAt ? lot.createdAt.toDate().toLocaleDateString() : 'N/A';
            const row = [
                `"${date}"`,
                `"${exporterMap[lot.exporterId] || lot.exporterId}"`,
                `"${producerMap[lot.producerId] || lot.producerId}"`,
                lot.binCount,
                lot.toteCount,
                lot.emptyTotes || 0,
                `"${lot.variety}"`,
                lot.totalWeight || 0,
                lot.preHydroTemp || '',
                lot.postHydroTemp || '',
                `"${lot.status}"`
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "reporte_recepcion.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Registro de Recepción</CardTitle>
                    <CardDescription>
                        Historial de todos los lotes ingresados en el módulo de recepción.
                    </CardDescription>
                </div>
                <Button onClick={handleExportCSV} disabled={isLoading || sortedData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar a CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Exportador</TableHead>
                                <TableHead>Productor</TableHead>
                                <TableHead>Bins</TableHead>
                                <TableHead>Totes</TableHead>
                                <TableHead>Totes Vacíos</TableHead>
                                <TableHead>Variedad</TableHead>
                                <TableHead>Kilos</TableHead>
                                <TableHead>T° Pre</TableHead>
                                <TableHead>T° Post</TableHead>
                                <TableHead>Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 15 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={11}><Skeleton className="h-4 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : sortedData.length > 0 ? (
                                sortedData.map((lot) => (
                                    <TableRow key={lot.id}>
                                        <TableCell>{lot.createdAt ? lot.createdAt.toDate().toLocaleDateString() : 'N/A'}</TableCell>
                                        <TableCell>{exporterMap[lot.exporterId] || lot.exporterId}</TableCell>
                                        <TableCell>{producerMap[lot.producerId] || lot.producerId}</TableCell>
                                        <TableCell>{lot.binCount}</TableCell>
                                        <TableCell>{lot.toteCount}</TableCell>
                                        <TableCell>{lot.emptyTotes || 0}</TableCell>
                                        <TableCell>{lot.variety}</TableCell>
                                        <TableCell>{lot.totalWeight?.toFixed(2) ?? '-'}</TableCell>
                                        <TableCell>{lot.preHydroTemp?.toFixed(1) ?? '-'}</TableCell>
                                        <TableCell>{lot.postHydroTemp?.toFixed(1) ?? '-'}</TableCell>
                                        <TableCell><Badge variant="secondary">{lot.status}</Badge></TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={11} className="h-24 text-center">
                                        No hay lotes de recepción registrados.
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


export default function ReportesPage() {
  return (
    <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full" defaultValue='reporte-stock'>
            <AccordionItem value="reporte-stock">
                <AccordionTrigger className="text-lg font-semibold">
                    Reporte de Stock de Materiales
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                   <StockReport />
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="kardex-movimientos">
                <AccordionTrigger className="text-lg font-semibold">
                    Kardex de Movimientos de Materiales
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                   <KardexReport />
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="registro-recepcion">
                <AccordionTrigger className="text-lg font-semibold">
                    Registro de Recepción
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                   <ReceptionReport />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </div>
  );
}
