'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';


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

export default function OtherFruitKardexReportPage() {
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    
    const kardexData = React.useMemo(() => {
        const allMovements: any[] = [];

        if (receptions) {
            receptions.forEach(reception => {
                const totalQuantity = reception.items.reduce((sum, item) => sum + item.quantity, 0);
                const totalWeight = reception.items.reduce((sum, item) => sum + (item.weight || 0), 0);

                const productNames = [...new Set(reception.items.map(i => i.productName))].join(', ');
                const productCodes = [...new Set(reception.items.map(i => i.productCode))].join(', ');
                const clientLotIds = [...new Set(reception.items.map(i => i.clientLotId).filter(Boolean))].join(', ');

                allMovements.push({
                    key: `${reception.id}-E`,
                    date: reception.createdAt,
                    type: 'entrada',
                    clientName: reception.clientName,
                    document: reception.document,
                    temperature: reception.temperature,
                    clientLotId: clientLotIds || '-',
                    productCode: productCodes,
                    productName: productNames,
                    quantity: totalQuantity,
                    unit: reception.unit,
                    weight: totalWeight > 0 ? totalWeight : undefined,
                    userName: reception.userName,
                });
            });
        }

        if (movements) {
            movements.forEach(movement => {
                if (movement.type !== 'salida') return;

                const totalQuantity = movement.items.reduce((sum, item) => sum + item.quantity, 0);
                const totalWeight = movement.items.reduce((sum, item) => sum + (item.weight || 0), 0);

                const productNames = [...new Set(movement.items.map(i => i.productName))].join(', ');
                const productCodes = [...new Set(movement.items.map(i => i.productCode))].join(', ');
                const clientLotIds = [...new Set(movement.items.map(i => i.clientLotId).filter(Boolean))].join(', ');

                allMovements.push({
                    key: `${movement.id}-S`,
                    date: movement.createdAt,
                    type: 'salida',
                    clientName: movement.clientName,
                    document: movement.document,
                    clientLotId: clientLotIds || '-',
                    productCode: productCodes,
                    productName: productNames,
                    quantity: -totalQuantity,
                    unit: movement.unit,
                    weight: totalWeight > 0 ? -totalWeight : undefined,
                    userName: movement.userName,
                });
            });
        }

        return allMovements.sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));
    }, [receptions, movements]);

    const [clientFilter, setClientFilter] = React.useState('all');
    const [productFilter, setProductFilter] = React.useState('');
    
     const filteredData = React.useMemo(() => {
        return kardexData.filter(item => {
            const clientMatch = clientFilter !== 'all' ? item.clientName.toLowerCase().includes(clientFilter.toLowerCase()) : true;
            const productMatch = productFilter ? item.productCode.toLowerCase().includes(productFilter.toLowerCase()) : true;
            return clientMatch && productMatch;
        });
    }, [kardexData, clientFilter, productFilter]);

    const clientOptions = React.useMemo(() => {
        return [...new Set(kardexData.map(item => item.clientName))];
    }, [kardexData]);


    const handleExport = () => {
        const dataToExport = filteredData.map(item => ({
            "Fecha": item.date?.toDate(),
            "Tipo": item.type,
            "Cliente": item.clientName,
            "Documento": item.document,
            "Temperatura": item.temperature ? `${item.temperature.toFixed(1)}°C` : '',
            "Lote Cliente": item.clientLotId || '',
            "Codigo Producto": item.productCode,
            "Nombre Producto": item.productName,
            "Cantidad": `${item.quantity} ${item.unit}`,
            "Peso (kg)": item.weight ? item.weight.toFixed(2) : '0.00',
            "Usuario": item.userName || '',
        }));
        const headers = ["Fecha", "Tipo", "Cliente", "Documento", "Temperatura", "Lote Cliente", "Codigo Producto", "Nombre Producto", "Cantidad", "Peso (kg)", "Usuario"];
        const csv = convertToCSV(dataToExport, headers);
        downloadCSV(csv, 'kardex_fruta_otros_clientes.csv');
    };

    const loading = loadingReceptions || loadingMovements;

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Kardex de Movimientos de Fruta (Otros Clientes)"
                description="Historial de entradas y salidas de fruta de clientes externos."
                onExport={handleExport}
                isExportDisabled={loading || filteredData.length === 0}
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
                                    <TableHead>Fecha/Hora</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Temp (°C)</TableHead>
                                    <TableHead>Lote Cliente</TableHead>
                                    <TableHead>Cód. Prod.</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Peso (kg)</TableHead>
                                    <TableHead>Usuario</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : filteredData.length > 0 ? (
                                    filteredData.map((item) => (
                                    <TableRow key={item.key}>
                                        <TableCell>{item.date?.toDate().toLocaleString() ?? 'N/A'}</TableCell>
                                        <TableCell>
                                            <Badge variant={item.type === 'entrada' ? 'default' : 'secondary'}>
                                                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{item.clientName}</TableCell>
                                        <TableCell>{item.document}</TableCell>
                                        <TableCell>{item.temperature ? item.temperature.toFixed(1) : '-'}</TableCell>
                                        <TableCell className="font-mono">{item.clientLotId || '-'}</TableCell>
                                        <TableCell>{item.productCode}</TableCell>
                                        <TableCell>{item.productName}</TableCell>
                                        <TableCell className={item.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {item.quantity} {item.unit}
                                        </TableCell>
                                        <TableCell className={item.weight > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {item.weight ? `${item.weight.toFixed(2)} kg` : '-'}
                                        </TableCell>
                                        <TableCell>{item.userName || 'N/A'}</TableCell>
                                    </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={11} className="h-24 text-center">No hay movimientos para los filtros seleccionados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
