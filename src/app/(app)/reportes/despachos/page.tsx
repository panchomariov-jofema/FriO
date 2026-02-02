'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Dispatch, Producer, ReceptionLot } from '@/lib/types';
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
            } else if (typeof value === 'object' && value !== null && value?.toDate) {
                value = value.toDate().toLocaleString();
            } else if (Array.isArray(value)) {
                value = value.join(', ');
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

export default function DispatchReportPage() {
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: receptionLots, loading: loadingReceptions } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    
    const loading = loadingDispatches || loadingReceptions || loadingProducers;

    const producerMap = React.useMemo(() => {
        return (producers || []).reduce((acc, producer) => {
            acc[producer.producerId] = producer.shortName;
            return acc;
        }, {} as Record<string, string>);
    }, [producers]);
    
    const receptionLotMap = React.useMemo(() => {
        return (receptionLots || []).reduce((acc, lot) => {
            acc[lot.displayLotId] = lot;
            return acc;
        }, {} as Record<string, ReceptionLot>);
    }, [receptionLots]);

    const reportData = React.useMemo(() => {
        return (dispatches || []).map(dispatch => {
            const producersInDispatch = new Set<string>();
            const varietiesInDispatch = new Set<string>();

            dispatch.bins.forEach(bin => {
                const receptionLot = receptionLotMap[bin.displayLotId];
                if (receptionLot) {
                    producersInDispatch.add(producerMap[receptionLot.producerId] || receptionLot.producerId);
                    varietiesInDispatch.add(receptionLot.variety);
                }
            });

            return {
                ...dispatch,
                producers: Array.from(producersInDispatch),
                varieties: Array.from(varietiesInDispatch),
            }
        });
    }, [dispatches, receptionLotMap, producerMap]);


     const handleExport = () => {
        if (!reportData) return;
        const headers = ['createdAt', 'exporterName', 'totalBins', 'totalNetWeight', 'producers', 'varieties', 'status'];
        const dataForExport = reportData.map(dispatch => ({
            ...dispatch,
            totalNetWeight: dispatch.totalNetWeight ? dispatch.totalNetWeight.toFixed(2) : '0.00',
        }));
        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'reporte_packing.csv');
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Reporte de Packing"
                description="Listado de todos los packings creados."
                onExport={handleExport}
                isExportDisabled={loading || reportData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Productor(es)</TableHead>
                                    <TableHead>Variedad(es)</TableHead>
                                    <TableHead>Total Bins</TableHead>
                                    <TableHead>Peso Neto Total</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : reportData && reportData.length > 0 ? (
                                    reportData.map(dispatch => (
                                        <TableRow key={dispatch.id}>
                                            <TableCell>{dispatch.createdAt?.toDate().toLocaleString()}</TableCell>
                                            <TableCell>{dispatch.exporterName}</TableCell>
                                            <TableCell>{dispatch.producers.join(', ')}</TableCell>
                                            <TableCell>{dispatch.varieties.join(', ')}</TableCell>
                                            <TableCell>{dispatch.totalBins}</TableCell>
                                            <TableCell>{dispatch.totalNetWeight ? `${dispatch.totalNetWeight.toFixed(2)} kg` : '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={dispatch.status === 'Completado' ? 'default' : 'secondary'}>{dispatch.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay despachos.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
