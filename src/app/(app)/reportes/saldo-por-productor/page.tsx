'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialMovement, Exporter, Producer, BinMaterial } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';

function convertToCSV(data: any[], headers: {key: string; label: string}[]) {
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
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export default function ProducerBalanceReportPage() {
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: allExporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: allProducers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    const { data: allMaterials, loading: loadingMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');

    const loading = loadingMovements || loadingExporters || loadingProducers || loadingMaterials;

    const balanceData = React.useMemo(() => {
        if (loading) return [];

        const activeExporters = allExporters.filter(e => e.status !== 'inactivo');
        const activeExporterIds = new Set(activeExporters.map(e => e.exporterId));
        const activeProducers = allProducers.filter(p => p.status !== 'inactivo');
        const activeProducerIds = new Set(activeProducers.map(p => p.producerId));

        const exporterMap = new Map(activeExporters.map(e => [e.exporterId, e.name]));
        const producerMap = new Map(activeProducers.map(p => [p.producerId, p.shortName]));
        const materialMap = new Map(allMaterials.map(m => [m.id, m]));

        const aggregation: Record<string, {
            exporterName: string;
            producerName: string;
            materialName: string;
            materialCode: string;
            materialType: string;
            entradas: number;
            salidas: number;
        }> = {};

        (movements || []).forEach(mov => {
            if (!activeExporterIds.has(mov.exporterId)) return;

            mov.items.forEach(item => {
                let effectiveProducerId = mov.producerId;
                let effectiveProducerName = producerMap.get(mov.producerId) || mov.producerId;
                let isException = false;

                // Lógica de excepción para PALOGIC - Se identifica por el documento y código de producto
                if (mov.document === 'SALDO-INICIAL-2028' && item.binMaterialCode === '10017') {
                    effectiveProducerId = 'PALOGIC_EXC'; // ID virtual para agrupar esta excepción
                    effectiveProducerName = 'PALOGIC';
                    isException = true;
                }

                // Si no es la excepción y el productor no es activo, ignorar para este reporte
                if (!isException && !activeProducerIds.has(mov.producerId)) return;

                const expName = exporterMap.get(mov.exporterId) || mov.exporterId;
                const key = `${mov.exporterId}_${effectiveProducerId}_${item.binMaterialId}`;
                
                if (!aggregation[key]) {
                    const m = materialMap.get(item.binMaterialId);
                    aggregation[key] = {
                        exporterName: expName,
                        producerName: effectiveProducerName,
                        materialName: item.binMaterialName,
                        materialCode: item.binMaterialCode,
                        materialType: m?.type || 'material',
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
    }, [loading, movements, allExporters, allProducers, allMaterials]);

    const groupedBalance = React.useMemo(() => {
        const groups: Record<string, {
            exporterName: string;
            producerName: string;
            items: typeof balanceData;
            summary: string;
        }> = {};

        balanceData.forEach(item => {
            const groupKey = `${item.exporterName}_${item.producerName}`;
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    exporterName: item.exporterName,
                    producerName: item.producerName,
                    items: [],
                    summary: '',
                };
            }
            groups[groupKey].items.push(item);
        });

        return Object.values(groups).map(group => {
            const totalsByType: Record<string, number> = {};
            group.items.forEach(item => {
                const typeLabel = item.materialType === 'bin' ? 'Bins' : 'Materiales';
                totalsByType[typeLabel] = (totalsByType[typeLabel] || 0) + item.saldo;
            });
            
            const summaryParts = Object.entries(totalsByType).map(([label, total]) => `${total} ${label}`);
            group.summary = summaryParts.join(', ');
            
            return group;
        }).sort((a, b) => a.exporterName.localeCompare(b.exporterName) || a.producerName.localeCompare(b.producerName));
    }, [balanceData]);

    const globalTotals = React.useMemo(() => {
        return balanceData.reduce((acc, item) => {
            acc.entradas += item.entradas;
            acc.salidas += item.salidas;
            acc.saldo += item.saldo;
            return acc;
        }, { entradas: 0, salidas: 0, saldo: 0 });
    }, [balanceData]);

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
                title="Saldo de Bins y Mat. Entregados"
                description="Consolidado de materiales entregados y devueltos por productor (Basado en módulo Bins y Materiales)."
                onExport={handleExport}
                isExportDisabled={loading || balanceData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="space-y-2">
                             <Skeleton className="h-12 w-full" />
                             <Skeleton className="h-12 w-full" />
                             <Skeleton className="h-12 w-full" />
                        </div>
                    ) : groupedBalance.length > 0 ? (
                        <div className="space-y-4">
                            <Accordion type="multiple" className="w-full">
                                {groupedBalance.map((group, idx) => (
                                    <AccordionItem key={idx} value={`item-${idx}`} className="border-b last:border-b-0">
                                        <AccordionTrigger className="hover:no-underline py-4 px-4">
                                            <div className="flex justify-between w-full pr-4 text-left">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-1">
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Exportador</p>
                                                        <p className="text-sm font-medium">{group.exporterName}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Productor</p>
                                                        <p className="text-sm font-bold text-primary">{group.producerName}</p>
                                                    </div>
                                                </div>
                                                <div className="hidden sm:flex items-center gap-2">
                                                    <Badge variant="outline" className="font-bold text-primary border-primary/20 bg-primary/5">
                                                        {group.summary}
                                                    </Badge>
                                                    <Badge variant="secondary" className="font-mono">
                                                        {group.items.length} {group.items.length === 1 ? 'Producto' : 'Productos'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="bg-muted/20 px-0 pb-4">
                                            <div className="rounded-md border mx-4 mt-2 overflow-hidden bg-background">
                                                <Table>
                                                    <TableHeader className="bg-muted/50">
                                                        <TableRow>
                                                            <TableHead className="h-10 text-xs">Cód. Material</TableHead>
                                                            <TableHead className="h-10 text-xs">Material</TableHead>
                                                            <TableHead className="h-10 text-xs text-right">Entradas</TableHead>
                                                            <TableHead className="h-10 text-xs text-right">Salidas</TableHead>
                                                            <TableHead className="h-10 text-xs text-right font-bold">Saldo</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {group.items.map((item, i) => (
                                                            <TableRow key={i} className="hover:bg-transparent">
                                                                <TableCell className="py-2 font-mono text-xs">{item.materialCode}</TableCell>
                                                                <TableCell className="py-2 text-xs">{item.materialName}</TableCell>
                                                                <TableCell className="py-2 text-right text-xs text-muted-foreground">{item.entradas}</TableCell>
                                                                <TableCell className="py-2 text-right text-xs text-muted-foreground">{item.salidas}</TableCell>
                                                                <TableCell className={`py-2 text-right text-xs font-bold ${item.saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                                                    {item.saldo}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>

                            <div className="border rounded-md bg-muted/40 p-4 mt-8">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-lg font-bold text-foreground">TOTAL GENERAL</h4>
                                    <div className="grid grid-cols-3 gap-8 text-right">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Entradas</p>
                                            <p className="text-xl font-bold">{globalTotals.entradas.toLocaleString('es-CL')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Salidas</p>
                                            <p className="text-xl font-bold">{globalTotals.salidas.toLocaleString('es-CL')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Saldo Global</p>
                                            <p className={`text-xl font-black ${globalTotals.saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                                {globalTotals.saldo.toLocaleString('es-CL')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-24 flex items-center justify-center border rounded-md border-dashed">
                             <p className="text-muted-foreground">No hay movimientos registrados para consolidar saldos.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
