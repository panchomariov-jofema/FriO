'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { differenceInDays, format } from 'date-fns';

function convertToCSV(data: any[], headers: { key: string; label: string }[]) {
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

export default function PermanenceReportPage() {
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    
    const loading = loadingMovements || loadingReceptions;

    const reportData = React.useMemo(() => {
        if (loading) return [];
        
        const receptionMap = new Map(receptions.map(r => [r.id, r]));
        const data: any[] = [];
        
        movements.forEach(movement => {
            if (movement.type === 'salida' && movement.status === 'Completado' && movement.locations) {
                movement.locations.forEach((loc, index) => {
                    const reception = receptionMap.get(loc.receptionId);
                    if (reception) {
                        const fechaRecepcion = reception.createdAt.toDate();
                        const fechaSalida = movement.createdAt.toDate();
                        const diasPermanencia = differenceInDays(fechaSalida, fechaRecepcion);

                        data.push({
                            id: `${movement.id}-${index}`,
                            fechaRecepcion,
                            fechaSalida,
                            cliente: movement.clientName,
                            documento: movement.document,
                            loteCliente: loc.clientLotId,
                            codProducto: loc.productCode,
                            nombreProducto: loc.productName,
                            cantidad: `${loc.quantity} ${loc.unit}`,
                            diasPermanencia: diasPermanencia,
                        });
                    }
                });
            }
        });

        return data.sort((a,b) => b.fechaSalida - a.fechaSalida);

    }, [loading, movements, receptions]);

    const handleExport = () => {
        if (!reportData) return;
        const headers = [
            { key: 'fechaRecepcion', label: 'Fecha de Recepción' },
            { key: 'fechaSalida', label: 'Fecha de Salida' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'documento', label: 'Documento' },
            { key: 'loteCliente', label: 'Lote Cliente' },
            { key: 'codProducto', label: 'Cod Producto' },
            { key: 'nombreProducto', label: 'Nombre Producto' },
            { key: 'cantidad', label: 'Cantidad' },
            { key: 'diasPermanencia', label: 'Días de Permanencia' },
        ];
        
        const dataForExport = reportData.map(item => ({
            ...item,
            fechaRecepcion: format(item.fechaRecepcion, 'yyyy-MM-dd HH:mm'),
            fechaSalida: format(item.fechaSalida, 'yyyy-MM-dd HH:mm'),
        }));
        
        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'reporte_permanencia_stock.csv');
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Permanencia de Stock (Otros Clientes)"
                description="Calcula los días de permanencia del stock de fruta de otros clientes para facturación."
                onExport={handleExport}
                isExportDisabled={loading || reportData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha Recepción</TableHead>
                                    <TableHead>Fecha Salida</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Lote Cliente</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead className="text-right">Días Permanencia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 10 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : reportData && reportData.length > 0 ? (
                                    reportData.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{format(item.fechaRecepcion, 'dd/MM/yyyy HH:mm')}</TableCell>
                                            <TableCell>{format(item.fechaSalida, 'dd/MM/yyyy HH:mm')}</TableCell>
                                            <TableCell>{item.cliente}</TableCell>
                                            <TableCell>{item.documento}</TableCell>
                                            <TableCell>{item.loteCliente || '-'}</TableCell>
                                            <TableCell>{item.nombreProducto}</TableCell>
                                            <TableCell>{item.cantidad}</TableCell>
                                            <TableCell className="text-right font-bold">{item.diasPermanencia}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={8} className="h-24 text-center">No hay movimientos de salida completados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
