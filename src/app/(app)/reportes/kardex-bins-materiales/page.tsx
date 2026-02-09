'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialMovement, ChamberLot, Dispatch, Exporter, Producer, ReceptionLot } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Timestamp } from 'firebase/firestore';


function convertToCSV(data: any[], headers: {key: string, label: string}[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
             if (value instanceof Date) {
                value = value.toLocaleString('es-CL');
            } else if (typeof value === 'object' && value !== null && value.toDate) {
                value = value.toDate().toLocaleString('es-CL');
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

interface KardexItem {
    key: string;
    fecha: Timestamp;
    exportador: string;
    productor: string;
    codigoProducto: string;
    nombreProducto: string;
    cantidad: number;
    movimiento: string;
    tipo: 'Entrada' | 'Salida';
    userName?: string;
}


export default function BinMaterialKardexReportPage() {
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    const { data: receptionLots, loading: loadingReceptions } = useFirestoreCollection<ReceptionLot>('receptionLots');

    const loading = loadingMovements || loadingChamberLots || loadingDispatches || loadingExporters || loadingProducers || loadingReceptions;

    const { exporterMap, producerMap, receptionLotMap } = React.useMemo(() => {
        const expMap = new Map((exporters || []).map(e => [e.exporterId, e.name]));
        const prodMap = new Map((producers || []).map(p => [p.producerId, p.name]));
        const recLotMap = new Map((receptionLots || []).map(l => [l.displayLotId, l]));
        return { exporterMap: expMap, producerMap: prodMap, receptionLotMap: recLotMap };
    }, [exporters, producers, receptionLots]);

    const kardexData = React.useMemo(() => {
        if (loading) return [];
        
        const allItems: KardexItem[] = [];

        // 1. Entradas y Salidas de Bins y Materiales
        (movements || []).forEach(mov => {
            const isDirectDispatch = mov.observation === 'Despacho Directo';
            mov.items.forEach((item, index) => {
                allItems.push({
                    key: `mov-${mov.id}-${index}`,
                    fecha: mov.createdAt,
                    exportador: exporterMap.get(mov.exporterId) || mov.exporterId,
                    productor: producerMap.get(mov.producerId) || mov.producerId,
                    codigoProducto: item.binMaterialCode,
                    nombreProducto: item.binMaterialName,
                    cantidad: item.quantity,
                    movimiento: isDirectDispatch ? 'Despacho Directo' : 'Bins y Materiales',
                    tipo: (mov.type === 'entrada' && !isDirectDispatch) ? 'Entrada' : 'Salida',
                    userName: mov.userName,
                });
            });
        });

        // 2. Bins Almacenados en Cámaras (Entrada)
        (chamberLots || []).forEach(lot => {
            if (lot.status === 'Almacenado') {
                allItems.push({
                    key: `chamber-${lot.id}`,
                    fecha: lot.storedAt,
                    exportador: exporterMap.get(lot.exporterId) || lot.exporterId,
                    productor: lot.producerShortName,
                    codigoProducto: 'FRUTA', // Generic code for fruit bins
                    nombreProducto: lot.variety,
                    cantidad: lot.binCount,
                    movimiento: 'Almacenamiento Cámara',
                    tipo: 'Entrada',
                    userName: lot.userName,
                });
            }
        });

        // 3. Despachos (Salida)
        (dispatches || []).forEach(dispatch => {
            if (dispatch.status === 'Completado') {
                dispatch.bins.forEach((bin, index) => {
                    const originalReception = receptionLotMap.get(bin.displayLotId);
                    allItems.push({
                        key: `disp-${dispatch.id}-${index}`,
                        fecha: dispatch.createdAt,
                        exportador: dispatch.exporterName,
                        productor: originalReception ? (producerMap.get(originalReception.producerId) || originalReception.producerId) : 'N/A',
                        codigoProducto: 'FRUTA',
                        nombreProducto: originalReception?.variety || 'Variedad Desconocida',
                        cantidad: bin.binCount,
                        movimiento: 'Despacho',
                        tipo: 'Salida',
                        userName: dispatch.userName,
                    });
                });
            }
        });

        return allItems.sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis());
    }, [loading, movements, chamberLots, dispatches, exporterMap, producerMap, receptionLotMap]);
    

    const handleExport = () => {
        const headers = [
            { key: 'fecha', label: 'Fecha' },
            { key: 'exportador', label: 'Exportador' },
            { key: 'productor', label: 'Productor' },
            { key: 'codigoProducto', label: 'Codigo del Producto' },
            { key: 'nombreProducto', label: 'Nombre del Producto' },
            { key: 'cantidad', label: 'Cantidad' },
            { key: 'movimiento', label: 'Movimiento' },
            { key: 'tipo', label: 'Entrada/Salida' },
            { key: 'userName', label: 'Usuario' },
        ];
        
        const csv = convertToCSV(kardexData, headers);
        downloadCSV(csv, 'kardex_bins_y_materiales.csv');
    };

    const getBadgeVariant = (type: string): 'default' | 'destructive' => {
        switch(type) {
            case 'Entrada':
                return 'default';
            case 'Salida':
                return 'destructive';
            default:
                return 'default';
        }
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Kardex de Movimientos de Bins y Materiales"
                description="Historial de todos los movimientos de bins (fruta y vacíos) y materiales."
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
                                    <TableHead>Exportador</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead>Cód. Producto</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Usuario</TableHead>
                                    <TableHead>Movimiento</TableHead>
                                    <TableHead>Entrada/Salida</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 10 }).map((_, i) => <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : kardexData.length > 0 ? (
                                    kardexData.map(item => (
                                        <TableRow key={item.key}>
                                            <TableCell>{item.fecha?.toDate().toLocaleString()}</TableCell>
                                            <TableCell>{item.exportador}</TableCell>
                                            <TableCell>{item.productor}</TableCell>
                                            <TableCell>{item.codigoProducto}</TableCell>
                                            <TableCell>{item.nombreProducto}</TableCell>
                                            <TableCell className={`font-semibold ${item.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.cantidad}
                                            </TableCell>
                                            <TableCell>{item.userName || 'N/A'}</TableCell>
                                            <TableCell>{item.movimiento}</TableCell>
                                            <TableCell>
                                                <Badge variant={getBadgeVariant(item.tipo)}>
                                                    {item.tipo}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={9} className="h-24 text-center">No hay movimientos registrados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
