'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ReceptionLot, Producer } from '@/lib/types';
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
    const { data: producers } = useFirestoreCollection<Producer>('producers');

    const producerMap = React.useMemo(() => {
        const map = new Map<string, string>();
        (producers || []).forEach(p => {
            if (p.id) map.set(p.id, p.shortName || p.name);
            if (p.producerId) map.set(p.producerId, p.shortName || p.name);
        });
        return map;
    }, [producers]);

     const handleExport = () => {
        if (!receptionLots) return;
        const headers = ['createdAt', 'displayLotId', 'producerName', 'binCount', 'toteCount', 'laminaCount', 'emptyTotes', 'userName'];
        const dataForExport = receptionLots.map(lot => {
            return {
                ...lot,
                producerName: producerMap.get(lot.producerId) || lot.producerId,
                laminaCount: lot.laminaCount ?? lot.binCount ?? 0,
                emptyTotes: lot.emptyTotes ?? 0,
                userName: lot.userName || '',
            };
        });
        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'registro_recepcion_fruta.csv');
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Registro de Recepción (Retorno con Fruta)"
                description="Listado de recepciones de bins, totes y láminas por productor."
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
                                    <TableHead>ID Lote / Guía</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead className="text-right">N° Bins</TableHead>
                                    <TableHead className="text-right">N° Totes</TableHead>
                                    <TableHead className="text-right">N° Láminas</TableHead>
                                    <TableHead className="text-right">Totes Vacíos</TableHead>
                                    <TableHead>Usuario</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : receptionLots && receptionLots.length > 0 ? (
                                    receptionLots.map(lot => {
                                        const laminas = lot.laminaCount !== undefined ? lot.laminaCount : (lot.binCount || 0);
                                        return (
                                        <TableRow key={lot.id}>
                                            <TableCell>{lot.createdAt?.toDate?.()?.toLocaleString('es-CL') ?? 'Sin fecha'}</TableCell>
                                            <TableCell className="font-medium">{lot.displayLotId || lot.document}</TableCell>
                                            <TableCell>{producerMap.get(lot.producerId) || lot.producerId}</TableCell>
                                            <TableCell className="text-right font-semibold">{lot.binCount}</TableCell>
                                            <TableCell className="text-right">{lot.toteCount}</TableCell>
                                            <TableCell className="text-right">{laminas}</TableCell>
                                            <TableCell className="text-right">{lot.emptyTotes || 0}</TableCell>
                                            <TableCell>{lot.userName || 'N/A'}</TableCell>
                                        </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={8} className="h-24 text-center">No hay lotes de recepción.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
