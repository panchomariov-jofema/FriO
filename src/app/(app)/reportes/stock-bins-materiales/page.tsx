'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Exporter, BinMaterial, BinMaterialMovement, ChamberLot, Dispatch } from '@/lib/types';
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
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export default function BinMaterialStockReportPage() {
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: materials, loading: loadingMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');

    const loading = loadingExporters || loadingMovements || loadingChamberLots || loadingDispatches || loadingMaterials;

    const stockData = React.useMemo(() => {
        if (loading) return [];

        const activeExporterIds = new Set(exporters.filter(e => e.status !== 'inactivo').map(e => e.exporterId));
        const exporterMap = new Map(exporters.map(e => [e.exporterId, e.name]));
        const materialMap = new Map(materials.map(m => [m.code, m.name]));

        const aggregation: Record<string, {
            exporterId: string;
            exporterName: string;
            materialCode: string;
            materialName: string;
            quantity: number;
        }> = {};

        const addToAggregation = (expId: string, code: string, name: string, qty: number) => {
            if (!activeExporterIds.has(expId)) return;
            const key = `${expId}_${code}_${name}`;
            if (!aggregation[key]) {
                aggregation[key] = {
                    exporterId: expId,
                    exporterName: exporterMap.get(expId) || expId,
                    materialCode: code,
                    materialName: name,
                    quantity: 0,
                };
            }
            aggregation[key].quantity += qty;
        };

        // 1. Movimientos Manuales de Bins y Materiales
        (movements || []).forEach(mov => {
            const isDirectDispatch = mov.observation === 'Despacho Directo';
            if (isDirectDispatch) return;

            mov.items.forEach(item => {
                const qty = mov.type === 'entrada' ? item.quantity : -item.quantity;
                const currentName = materialMap.get(item.binMaterialCode) || item.binMaterialName;
                addToAggregation(mov.exporterId, item.binMaterialCode, currentName, qty);
            });
        });

        // 2. Bins con Fruta en Cámaras (Entrada al Stock de Planta)
        (chamberLots || []).forEach(lot => {
            if (lot.status === 'Almacenado') {
                addToAggregation(lot.exporterId, 'FRUTA', `Bins con ${lot.variety}`, lot.binCount);
            }
        });

        // 3. Despachos a Packing (Salida del Stock de Planta)
        (dispatches || []).forEach(dispatch => {
            if (dispatch.status === 'Completado') {
                addToAggregation(dispatch.exporterId, 'FRUTA', 'Salida por Despacho', -dispatch.totalBins);
            }
        });

        return Object.values(aggregation)
            .filter(item => item.quantity !== 0)
            .sort((a, b) => a.exporterName.localeCompare(b.exporterName) || a.materialCode.localeCompare(b.materialCode));
    }, [loading, exporters, movements, chamberLots, dispatches, materials]);

    const totalStockQuantity = React.useMemo(() => {
        return stockData.reduce((sum, item) => sum + item.quantity, 0);
    }, [stockData]);

    const handleExport = () => {
        const headers = [
            { key: 'exporterName', label: 'Exportador' },
            { key: 'materialCode', label: 'Código' },
            { key: 'materialName', label: 'Material' },
            { key: 'quantity', label: 'Cantidad' },
        ];
        const csv = convertToCSV(stockData, headers);
        downloadCSV(csv, 'reporte_stock_bins_en_planta.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader 
                title="Stock de Bins y Mat. En Planta"
                description="Inventario actual calculado dinámicamente desde el historial para asegurar precisión total con el Kardex."
                onExport={handleExport}
                isExportDisabled={loading || stockData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Exportador</TableHead>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Material / Detalle</TableHead>
                                    <TableHead className="text-right">Cantidad en Stock</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : stockData.length > 0 ? (
                                    <>
                                        {stockData.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-sm">{item.exporterName}</TableCell>
                                                <TableCell className="font-mono text-xs">{item.materialCode}</TableCell>
                                                <TableCell className="font-medium text-sm">{item.materialName}</TableCell>
                                                <TableCell className="text-right font-bold text-sm">{item.quantity.toLocaleString('es-CL')}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/30 font-bold border-t-2">
                                            <TableCell colSpan={3} className="text-sm font-bold">Total General</TableCell>
                                            <TableCell className="text-right font-black text-sm">{totalStockQuantity.toLocaleString('es-CL')}</TableCell>
                                        </TableRow>
                                    </>
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay datos de stock registrados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
