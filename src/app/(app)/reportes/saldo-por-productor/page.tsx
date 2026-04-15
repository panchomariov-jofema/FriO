'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialMovement, Exporter, Producer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';

function convertToCSV(data: any[], headers: {key: string, label: string}[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
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

export default function ProducerBalanceReportPage() {
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');

    const loading = loadingMovements || loadingExporters || loadingProducers;

    const balanceData = React.useMemo(() => {
        if (loading) return [];

        const exporterMap = new Map((exporters || []).map(e => [e.exporterId, e.name]));
        const producerMap = new Map((producers || []).map(p => [p.producerId, p.shortName]));

        const aggregation: Record<string, {
            exporterName: string;
            producerName: string;
            materialName: string;
            materialCode: string;
            entradas: number;
            salidas: number;
        }> = {};

        (movements || []).forEach(mov => {
            const expName = exporterMap.get(mov.exporterId) || mov.exporterId;
            const prodName = producerMap.get(mov.producerId) || mov.producerId;

            mov.items.forEach(item => {
                const key = `${mov.exporterId}_${mov.producerId}_${item.binMaterialId}`;
                if (!aggregation[key]) {
                    aggregation[key] = {
                        exporterName: expName,
                        producerName: prodName,
                        materialName: item.binMaterialName,
                        materialCode: item.binMaterialCode,
                        entradas: 0,
                        salidas: 0,
                    };
                }

                if (mov.type === 'entrada') {
                    aggregation[key].entradas += item.quantity;
                } else if (mov.type === 'salida') {
                    aggregation[key].salidas += item.quantity;
                }
            });
        });

        return Object.values(aggregation)
            .map(item => ({
                ...item,
                saldo: item.salidas - item.entradas
            }))
            .filter(item => item.entradas !== 0 || item.salidas !== 0)
            .sort((a, b) => a.exporterName.localeCompare(b.exporterName) || a.producerName.localeCompare(b.producerName));
    }, [loading, movements, exporters, producers]);

    const handleExport = () => {
        const headers = [
            { key: 'exporterName', label: 'Exportador' },
            { key: 'producerName', label: 'Productor' },
            { key: 'materialCode', label: 'Cód. Material' },
            { key: 'materialName', label: 'Material' },
            { key: 'entradas', label: 'Total Entradas' },
            { key: 'salidas', label: 'Total Salidas' },
            { key: 'saldo', label: 'Saldo en Productor' },
        ];
        const csv = convertToCSV(balanceData, headers);
        downloadCSV(csv, 'saldo_por_productor.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Saldo por Exp/Productor"
                description="Consolidado de materiales entregados y devueltos por productor (Basado en módulo Bins y Materiales)."
                onExport={handleExport}
                isExportDisabled={loading || balanceData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Exportador</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead>Cód. Material</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead className="text-right">Entradas</TableHead>
                                    <TableHead className="text-right">Salidas</TableHead>
                                    <TableHead className="text-right font-bold">Saldo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 10 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : balanceData.length > 0 ? (
                                    balanceData.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{item.exporterName}</TableCell>
                                            <TableCell>{item.producerName}</TableCell>
                                            <TableCell className="font-mono text-xs">{item.materialCode}</TableCell>
                                            <TableCell>{item.materialName}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{item.entradas}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{item.salidas}</TableCell>
                                            <TableCell className={`text-right font-bold ${item.saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                                {item.saldo}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay movimientos registrados para consolidar saldos.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
