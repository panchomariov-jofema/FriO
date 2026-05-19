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
    const [productFilter, setProductFilter] = React.useState('');

    const stockData = React.useMemo(() => {
        if (!receptions) return [];
        return receptions.flatMap(reception => 
            reception.items
                .filter(item => item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation)
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
            const clientMatch = clientFilter !== 'all' ? item.clientName.toLowerCase().includes(clientFilter.toLowerCase()) : true;
            const productMatch = productFilter ? item.productCode.toLowerCase().includes(productFilter.toLowerCase()) : true;
            return clientMatch && productMatch;
        });
    }, [stockData, clientFilter, productFilter]);
    
    const clientOptions = React.useMemo(() => {
        return [...new Set(stockData.map(item => item.clientName))];
    }, [stockData]);

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
                title="Reporte Stock por Ubicacion (Clientes)"
                description="Inventario de fruta de clientes externos detallado por ubicación."
                onExport={handleExport}
                isExportDisabled={loadingReceptions || filteredData.length === 0}
            >
                <div className="flex flex-col sm:flex-row gap-2">
                    <Select onValueChange={setClientFilter} value={clientFilter}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por cliente..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los Clientes</SelectItem>
                            {clientOptions.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input 
                        placeholder="Filtrar por código de producto..."
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                    />
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
                                    filteredData.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.receptionDate?.toDate().toLocaleDateString()}</TableCell>
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
                                    ))
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