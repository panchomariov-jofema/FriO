'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { chambersConfig } from '@/lib/chambers-config';

function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value.toDate) {
                value = value.toDate().toLocaleString();
            }
            const stringValue = String(value ?? '');
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}

function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export default function OtherFruitStockReportPage() {
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const [clientFilter, setClientFilter] = React.useState('all');
    const [productFilter, setProductFilter] = React.useState('all');
    const [chamberFilter, setChamberFilter] = React.useState('all');

    const stockData = React.useMemo(() => {
        if (!receptions) return [];
        return receptions.flatMap(reception => 
            (reception.items || [])
                .filter(item => item && item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation)
                .map((item, index) => ({
                    id: `${reception.id}-${index}`,
                    clientName: reception.clientName,
                    document: reception.document,
                    clientLotId: item.clientLotId || '-',
                    productCode: item.productCode,
                    productName: item.productName,
                    unit: reception.unit,
                    quantity: item.quantity,
                    chamberId: item.storageLocation!.chamberId,
                    coordinate: item.storageLocation!.coordinate,
                    chamberName: chambersConfig[item.storageLocation!.chamberId]?.name || item.storageLocation!.chamberId,
                    receptionDate: reception.createdAt,
                }))
        );
    }, [receptions]);
    
    const filteredData = React.useMemo(() => {
        return stockData.filter(item => {
            const clientMatch = clientFilter !== 'all' ? item.clientName === clientFilter : true;
            const productMatch = productFilter !== 'all' ? item.productName === productFilter : true;
            const chamberMatch = chamberFilter !== 'all' ? item.chamberName === chamberFilter : true;
            return clientMatch && productMatch && chamberMatch;
        });
    }, [stockData, clientFilter, productFilter, chamberFilter]);
    
    const clientOptions = React.useMemo(() => {
        const filtered = stockData.filter(item => {
            const productMatch = productFilter !== 'all' ? item.productName === productFilter : true;
            const chamberMatch = chamberFilter !== 'all' ? item.chamberName === chamberFilter : true;
            return productMatch && chamberMatch;
        });
        return [...new Set(filtered.map(item => item.clientName))].sort();
    }, [stockData, productFilter, chamberFilter]);

    const productOptions = React.useMemo(() => {
        const filtered = stockData.filter(item => {
            const clientMatch = clientFilter !== 'all' ? item.clientName === clientFilter : true;
            const chamberMatch = chamberFilter !== 'all' ? item.chamberName === chamberFilter : true;
            return clientMatch && chamberMatch;
        });
        return [...new Set(filtered.map(item => item.productName))].sort();
    }, [stockData, clientFilter, chamberFilter]);

    const chamberOptions = React.useMemo(() => {
        const filtered = stockData.filter(item => {
            const clientMatch = clientFilter !== 'all' ? item.clientName === clientFilter : true;
            const productMatch = productFilter !== 'all' ? item.productName === productFilter : true;
            return clientMatch && productMatch;
        });
        return [...new Set(filtered.map(item => item.chamberName))].sort();
    }, [stockData, clientFilter, productFilter]);

    React.useEffect(() => {
        if (clientFilter !== 'all' && !clientOptions.includes(clientFilter)) {
            setClientFilter('all');
        }
    }, [clientFilter, clientOptions]);

    React.useEffect(() => {
        if (productFilter !== 'all' && !productOptions.includes(productFilter)) {
            setProductFilter('all');
        }
    }, [productFilter, productOptions]);

    React.useEffect(() => {
        if (chamberFilter !== 'all' && !chamberOptions.includes(chamberFilter)) {
            setChamberFilter('all');
        }
    }, [chamberFilter, chamberOptions]);

    const totals = React.useMemo(() => {
        let binsTotal = 0;
        let palletsTotal = 0;
        filteredData.forEach(item => {
            const qty = Number(item.quantity) || 0;
            if (item.unit?.toLowerCase().includes('pallet')) {
                palletsTotal += qty;
            } else {
                binsTotal += qty;
            }
        });
        return { binsTotal, palletsTotal };
    }, [filteredData]);

    const handleExport = () => {
        const headers = ["Fecha Recepción", "Cliente", "Documento Entrada", "Lote", "Codigo Producto", "Nombre Producto", "Cámara", "Ubicación", "Cantidad", "Unidad"];
        const dataToExport = filteredData.map(item => ({
            "Fecha Recepción": item.receptionDate?.toDate(),
            "Cliente": item.clientName,
            "Documento Entrada": item.document,
            "Lote": item.clientLotId,
            "Codigo Producto": item.productCode,
            "Nombre Producto": item.productName,
            "Cámara": item.chamberName,
            "Ubicación": item.coordinate,
            "Cantidad": item.quantity,
            "Unidad": item.unit,
        }));
        const csv = convertToCSV(dataToExport, headers);
        downloadCSV(csv, 'reporte_stock_por_ubicacion_otros_clientes.csv');
    };
    
    return (
        <div className="space-y-6">
             <ReportHeader
                title="Reporte Stock por Ubicación Clientes"
                description="Inventario de fruta de clientes externos detallado por ubicación."
                onExport={handleExport}
                isExportDisabled={loadingReceptions || filteredData.length === 0}
            >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cliente</label>
                        <Select onValueChange={setClientFilter} value={clientFilter}>
                            <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Todos los Clientes" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los Clientes</SelectItem>
                                {clientOptions.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Producto</label>
                        <Select onValueChange={setProductFilter} value={productFilter}>
                            <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Todos los Productos" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los Productos</SelectItem>
                                {productOptions.map(product => <SelectItem key={product} value={product}>{product}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cámara</label>
                        <Select onValueChange={setChamberFilter} value={chamberFilter}>
                            <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Todas las Cámaras" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las Cámaras</SelectItem>
                                {chamberOptions.map(chamber => <SelectItem key={chamber} value={chamber}>{chamber}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </ReportHeader>

            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha Recepción</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Doc. Entrada</TableHead>
                                    <TableHead>Lote</TableHead>
                                    <TableHead>Cód. Producto</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cámara</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Unidad</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingReceptions ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : filteredData.length > 0 ? (
                                    <>
                                        {filteredData.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.receptionDate?.toDate()?.toLocaleDateString() ?? 'Sin fecha'}</TableCell>
                                                <TableCell>{item.clientName}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.document}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.clientLotId}</TableCell>
                                                <TableCell>{item.productCode}</TableCell>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell className="font-medium">{item.chamberName}</TableCell>
                                                <TableCell className="font-mono">{item.coordinate}</TableCell>
                                                <TableCell className="font-semibold">{item.quantity}</TableCell>
                                                <TableCell>{item.unit}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                                            <TableCell colSpan={8} className="text-right font-bold text-muted-foreground uppercase tracking-wider text-xs">Total</TableCell>
                                            {(() => {
                                                const uniqueUnits = [...new Set(filteredData.map(item => item.unit))].filter(Boolean);
                                                if (uniqueUnits.length === 1) {
                                                    const unit = uniqueUnits[0];
                                                    const totalQty = filteredData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                                                    return (
                                                        <>
                                                            <TableCell className="font-bold text-foreground text-sm">{totalQty}</TableCell>
                                                            <TableCell className="font-bold text-foreground text-sm">{unit}</TableCell>
                                                        </>
                                                    );
                                                } else {
                                                    const parts = [];
                                                    if (totals.binsTotal > 0) parts.push(`${totals.binsTotal} Bins`);
                                                    if (totals.palletsTotal > 0) parts.push(`${totals.palletsTotal} Pallets`);
                                                    const totalText = parts.length > 0 ? parts.join(' / ') : '0';
                                                    return (
                                                        <TableCell colSpan={2} className="font-bold text-foreground text-sm">
                                                            {totalText}
                                                        </TableCell>
                                                    );
                                                }
                                            })()}
                                        </TableRow>
                                    </>
                                ) : (
                                    <TableRow><TableCell colSpan={10} className="h-24 text-center">No hay datos de stock para los filtros seleccionados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}