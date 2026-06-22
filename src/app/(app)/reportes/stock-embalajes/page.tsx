'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';

function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value.toDate) { // Firebase Timestamp
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

export default function PackagingStockReportPage() {
    const { data, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');

    const flattenedData = React.useMemo(() => {
        if (!data) return [];
        return data.flatMap(reception => 
            (reception.items || [])
                .filter(item => item && item.status === 'Almacenado')
                .map(item => ({
                    id: `${reception.id}-${item.packagingMasterCode}`,
                    clientName: reception.clientName,
                    document: reception.document,
                    code: item.packagingMasterCode,
                    name: item.packagingMasterName,
                    pallets: item.palletCount,
                    location: `${item.storageLocation?.warehouse || ''} / ${item.storageLocation?.aisle || ''}`,
                    storedAt: item.storedAt,
                }))
        );
    }, [data]);

    const handleExport = () => {
        const headers = ['clientName', 'document', 'code', 'name', 'pallets', 'location', 'storedAt'];
        const csv = convertToCSV(flattenedData, headers);
        downloadCSV(csv, 'reporte_stock_embalajes.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Stock de Embalajes"
                description="Inventario de pallets de embalaje almacenados."
                onExport={handleExport}
                isExportDisabled={loading || flattenedData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Cód. Artículo</TableHead>
                                    <TableHead>Artículo</TableHead>
                                    <TableHead>Cant. Pallets</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : flattenedData.length > 0 ? (
                                    flattenedData.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.clientName}</TableCell>
                                            <TableCell>{item.code}</TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell>{item.pallets}</TableCell>
                                            <TableCell>{item.location}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay stock de embalajes.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
