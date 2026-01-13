'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialMovement } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
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

export default function BinMaterialKardexReportPage() {
    const { data: movements, loading } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');

    const kardexData = React.useMemo(() => {
        if (!movements) return [];
        return movements.flatMap(mov => 
            mov.items.map((item: any, index: number) => ({
                key: `${mov.id}-${index}`,
                date: mov.createdAt.toDate(),
                type: mov.type,
                document: mov.document,
                producerId: mov.producerId,
                driverName: mov.driverName,
                driverRUT: mov.driverRUT,
                code: item.binMaterialCode,
                name: item.binMaterialName,
                quantity: mov.type === 'entrada' ? item.quantity : -item.quantity,
            }))
        ).sort((a,b) => b.date.getTime() - a.date.getTime());
    }, [movements]);

    const handleExport = () => {
        const headers = ['date', 'type', 'document', 'producerId', 'driverName', 'driverRUT', 'code', 'name', 'quantity'];
        const csv = convertToCSV(kardexData, headers);
        downloadCSV(csv, 'kardex_bins_y_materiales.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Kardex de Movimientos de Bins y Materiales"
                description="Historial de entradas y salidas."
                onExport={handleExport}
                isExportDisabled={loading || kardexData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead>Conductor</TableHead>
                                    <TableHead>RUT</TableHead>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : kardexData.length > 0 ? (
                                    kardexData.map(item => (
                                        <TableRow key={item.key}>
                                            <TableCell>{item.date.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant={item.type === 'entrada' ? 'default' : 'secondary'}>
                                                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{item.document}</TableCell>
                                            <TableCell>{item.producerId}</TableCell>
                                            <TableCell>{item.driverName}</TableCell>
                                            <TableCell>{item.driverRUT}</TableCell>
                                            <TableCell>{item.code}</TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className={item.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                                                {item.quantity}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={9} className="h-24 text-center">No hay movimientos.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

    