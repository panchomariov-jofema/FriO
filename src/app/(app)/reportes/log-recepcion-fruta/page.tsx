'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ReceptionLot } from '@/lib/types';
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

export default function ReceptionLogReportPage() {
    const { data: receptionLots, loading } = useFirestoreCollection<ReceptionLot>('receptionLots');

     const handleExport = () => {
        if (!receptionLots) return;
        const headers = ['createdAt', 'displayLotId', 'producerId', 'variety', 'binCount', 'status', 'totalWeight', 'pesoNeto', 'userName'];
        const dataForExport = receptionLots.map(lot => {
            const pesoNeto = (lot.netWeightPerBin && lot.binCount > 0)
                ? lot.netWeightPerBin * lot.binCount
                : null;
            return {
                ...lot,
                pesoNeto: pesoNeto !== null ? pesoNeto.toFixed(2) : '',
                userName: lot.userName || '',
            };
        });
        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'registro_recepcion_fruta.csv');
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Registro de Recepción de Fruta"
                description="Listado de todos los lotes ingresados."
                onExport={handleExport}
                isExportDisabled={loading || !receptionLots || receptionLots.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha Ingreso</TableHead>
                                    <TableHead>ID Lote</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead>Variedad</TableHead>
                                    <TableHead>N° Bins</TableHead>
                                    <TableHead>Peso Total (kg)</TableHead>
                                    <TableHead>Peso Neto (kg)</TableHead>
                                    <TableHead>Usuario</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : receptionLots && receptionLots.length > 0 ? (
                                    receptionLots.map(lot => {
                                        const pesoNeto = (lot.netWeightPerBin && lot.binCount > 0)
                                            ? lot.netWeightPerBin * lot.binCount
                                            : null;

                                        return (
                                        <TableRow key={lot.id}>
                                            <TableCell>{lot.createdAt?.toDate()?.toLocaleString() ?? 'Sin fecha'}</TableCell>
                                            <TableCell>{lot.displayLotId}</TableCell>
                                            <TableCell>{lot.producerId}</TableCell>
                                            <TableCell>{lot.variety}</TableCell>
                                            <TableCell>{lot.binCount}</TableCell>
                                            <TableCell>{lot.totalWeight?.toFixed(2)}</TableCell>
                                            <TableCell>{pesoNeto !== null ? pesoNeto.toFixed(2) : '-'}</TableCell>
                                            <TableCell>{lot.userName || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge variant={lot.status === 'Cerrado' ? 'default' : 'secondary'}>{lot.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={9} className="h-24 text-center">No hay lotes de recepción.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
