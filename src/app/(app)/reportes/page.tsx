'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import type { BinMaterialStock, Exporter } from '@/lib/types';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

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


export default function ReportesPage() {
  return (
    <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="reporte-stock">
                <AccordionTrigger className="text-lg font-semibold">
                    Reporte de Stock de Materiales
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                   <StockReport />
                </AccordionContent>
            </AccordionItem>
            {/* Aquí se pueden agregar futuros reportes */}
        </Accordion>
    </div>
  );
}
