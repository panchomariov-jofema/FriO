'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import type { BinMaterialStock, Exporter, BinMaterialMovement, Producer, ReceptionLot, ProcessingLot, ChamberLot, Dispatch } from '@/lib/types';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Download, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

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

interface TraceabilityEvent {
    timestamp: Timestamp;
    module: 'Recepción' | 'Hidrocooler' | 'Cámara' | 'Despacho';
    event: string;
    details: string;
}

function LotTraceabilityReport() {
    const { data: receptionLots, loading: l1 } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: processingLots, loading: l2 } = useFirestoreCollection<ProcessingLot>('processingLots');
    const { data: chamberLots, loading: l3 } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: dispatches, loading: l4 } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: exporters, loading: l5 } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: l6 } = useFirestoreCollection<Producer>('producers');
    const isLoading = l1 || l2 || l3 || l4 || l5 || l6;

    const exporterMap = React.useMemo(() => exporters.reduce((acc, e) => ({ ...acc, [e.exporterId]: e.name }), {} as Record<string, string>), [exporters]);
    const producerMap = React.useMemo(() => producers.reduce((acc, p) => ({ ...acc, [p.producerId]: p.name }), {} as Record<string, string>), [producers]);

    const traceabilityData = React.useMemo(() => {
        const lotEvents: Record<string, { events: TraceabilityEvent[], lotInfo: any }> = {};

        receptionLots.forEach(lot => {
            if (!lot.displayLotId) return;
            if (!lotEvents[lot.displayLotId]) {
                lotEvents[lot.displayLotId] = {
                    events: [],
                    lotInfo: {
                        exporter: exporterMap[lot.exporterId] || lot.exporterId,
                        producer: producerMap[lot.producerId] || lot.producerId,
                        variety: lot.variety,
                        initialBins: lot.binCount
                    }
                };
            }
            if (lot.createdAt) {
                lotEvents[lot.displayLotId].events.push({
                    timestamp: lot.createdAt,
                    module: 'Recepción',
                    event: 'Lote Creado',
                    details: `${lot.binCount} bins, ${lot.toteCount} totes. Documento: ${lot.document}`
                });
            }
        });

        processingLots.forEach(lot => {
            if (!lotEvents[lot.displayLotId]) return; // Should not happen if data is consistent
            lotEvents[lot.displayLotId].events.push({
                timestamp: lot.createdAt,
                module: 'Hidrocooler',
                event: `Inicio Proceso (${lot.status})`,
                details: `${lot.binCount} bins en ${lot.hidrocooler}`
            });
        });

        chamberLots.forEach(lot => {
            if (!lotEvents[lot.displayLotId]) return;
            lotEvents[lot.displayLotId].events.push({
                timestamp: lot.storedAt,
                module: 'Cámara',
                event: `Movimiento a Cámara (${lot.status})`,
                details: `${lot.binCount} bins a ${lot.chamberId || 'N/A'} en coord. ${lot.coordinate || 'N/A'}`
            });
        });

        dispatches.forEach(dispatch => {
            dispatch.bins.forEach(bin => {
                if (!lotEvents[bin.displayLotId]) return;
                lotEvents[bin.displayLotId].events.push({
                    timestamp: dispatch.createdAt,
                    module: 'Despacho',
                    event: `Despacho (${dispatch.status})`,
                    details: `${bin.binCount} bins para ${dispatch.exporterName}`
                });
            });
        });

        // Sort events within each lot
        Object.values(lotEvents).forEach(item => {
            item.events.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        });
        
        return Object.entries(lotEvents).sort(([idA], [idB]) => idA.localeCompare(idB));

    }, [receptionLots, processingLots, chamberLots, dispatches, exporterMap, producerMap]);
    
    const handleExportCSV = () => {
        const headers = ['ID Lote', 'Exportador', 'Productor', 'Variedad', 'Fecha/Hora Evento', 'Módulo', 'Evento', 'Detalles'];
        const csvRows = [headers.join(',')];

        traceabilityData.forEach(([displayLotId, data]) => {
            data.events.forEach(event => {
                const date = event.timestamp.toDate();
                const row = [
                    `"${displayLotId}"`,
                    `"${data.lotInfo.exporter}"`,
                    `"${data.lotInfo.producer}"`,
                    `"${data.lotInfo.variety}"`,
                    `"${date.toLocaleString()}"`,
                    `"${event.module}"`,
                    `"${event.event}"`,
                    `"${event.details}"`,
                ];
                csvRows.push(row.join(','));
            });
        });
        
        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "reporte_trazabilidad_lotes.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                 <div>
                    <CardTitle>Trazabilidad de Lotes</CardTitle>
                    <CardDescription>
                        Sigue el historial completo de cada lote a través de los módulos de la aplicación.
                    </CardDescription>
                </div>
                <Button onClick={handleExportCSV} disabled={isLoading || traceabilityData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar a CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border max-h-[800px] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead>ID Lote</TableHead>
                                <TableHead>Exportador</TableHead>
                                <TableHead>Productor</TableHead>
                                <TableHead>Variedad</TableHead>
                                <TableHead>Fecha Primer Registro</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : traceabilityData.length > 0 ? (
                                traceabilityData.map(([displayLotId, data]) => (
                                    <Collapsible asChild key={displayLotId}>
                                        <>
                                            <TableRow>
                                                <TableCell>
                                                    <CollapsibleTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                </TableCell>
                                                <TableCell className="font-medium">{displayLotId}</TableCell>
                                                <TableCell>{data.lotInfo.exporter}</TableCell>
                                                <TableCell>{data.lotInfo.producer}</TableCell>
                                                <TableCell>{data.lotInfo.variety}</TableCell>
                                                <TableCell>{data.events[0]?.timestamp.toDate().toLocaleDateString()}</TableCell>
                                            </TableRow>
                                            <CollapsibleContent asChild>
                                                <tr className="bg-muted/50 hover:bg-muted/50">
                                                    <TableCell colSpan={6} className="p-0">
                                                        <div className="p-4">
                                                            <h4 className="font-semibold mb-2">Detalle de Eventos del Lote:</h4>
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Fecha / Hora</TableHead>
                                                                        <TableHead>Módulo</TableHead>
                                                                        <TableHead>Evento</TableHead>
                                                                        <TableHead>Detalles</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {data.events.map((event, index) => (
                                                                        <TableRow key={index}>
                                                                            <TableCell>{event.timestamp.toDate().toLocaleString()}</TableCell>
                                                                            <TableCell><Badge variant="outline">{event.module}</Badge></TableCell>
                                                                            <TableCell>{event.event}</TableCell>
                                                                            <TableCell>{event.details}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </TableCell>
                                                </tr>
                                            </CollapsibleContent>
                                        </>
                                    </Collapsible>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        No hay datos de trazabilidad para mostrar.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
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
            <AccordionItem value="trazabilidad-lotes">
                <AccordionTrigger className="text-lg font-semibold">
                    Trazabilidad de Lotes
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                   <LotTraceabilityReport />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </div>
  );
}
