'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialStock, Exporter } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';

// Helper to convert array of objects to CSV
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
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
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

export default function BinMaterialStockReportPage() {
    const { data: allStock, loading: loadingStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
    const { data: allExporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');

    const loading = loadingStock || loadingExporters;

    const filteredData = React.useMemo(() => {
        if (loading) return [];
        const activeExporterIds = new Set(allExporters.filter(e => e.status !== 'inactivo').map(e => e.exporterId));
        return allStock.filter(item => activeExporterIds.has(item.exporterId));
    }, [allStock, allExporters, loading]);

    const handleExport = () => {
        const headers = ['binMaterialCode', 'binMaterialName', 'quantity', 'exporterId'];
        const csv = convertToCSV(filteredData, headers);
        downloadCSV(csv, 'reporte_stock_bins.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader 
                title="Stock de Bins y Materiales"
                description="Inventario actual de todos los bins y materiales."
                onExport={handleExport}
                isExportDisabled={loading || !filteredData || filteredData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Exportador</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : filteredData && filteredData.length > 0 ? (
                                    filteredData.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.binMaterialCode}</TableCell>
                                            <TableCell>{item.binMaterialName}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.exporterId}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay datos de stock para entidades activas.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}