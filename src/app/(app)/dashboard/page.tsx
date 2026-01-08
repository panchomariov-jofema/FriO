'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, Dispatch, Exporter, ProcessingLot, ReceptionLot, BinMaterialStock, BinMaterial } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, BarChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chambersConfig } from '@/lib/chambers-config';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Boxes, PackageCheck, Truck, Warehouse, Archive } from 'lucide-react';


const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function DashboardPage() {
    const { data: chamberLots, loading: loadingChamber } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: processingLots, loading: loadingProcessing } = useFirestoreCollection<ProcessingLot>('processingLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: receptionLots, loading: loadingReception } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: binMaterials, loading: loadingBinMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');
    const { data: binMaterialStock, loading: loadingBinStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
    
    const { 
        totalBinsInStock, 
        pendingStorage, 
        pendingDispatch, 
        inProcess, 
        stockByExporter, 
        occupancyByChamber,
        latestReceptions,
        totalEmptyBins,
    } = React.useMemo(() => {
        const storedLots = (chamberLots || []).filter(lot => lot.status === 'Almacenado');
        const calculatedTotalBins = storedLots.reduce((sum, lot) => sum + lot.binCount, 0);
        
        const calculatedPendingStorage = (chamberLots || []).filter(lot => lot.status === 'Pendiente por Almacenar').length;
        
        const calculatedPendingDispatch = (dispatches || []).filter(d => d.status === 'Pendiente de Salida').length;
        
        const calculatedInProcess = (processingLots || []).filter(p => p.status === 'En Proceso').length;

        const exporterMap = (exporters || []).reduce((acc, e) => {
            acc[e.exporterId] = e.name;
            return acc;
        }, {} as Record<string, string>);

        const calculatedStockByExporter = storedLots.reduce((acc, lot) => {
            const exporterName = exporterMap[lot.exporterId] || 'No Asignado';
            if (!acc[exporterName]) {
                acc[exporterName] = 0;
            }
            acc[exporterName] += lot.binCount;
            return acc;
        }, {} as Record<string, number>);

        const pieChartData = Object.entries(calculatedStockByExporter).map(([name, value]) => ({
            name,
            value,
        }));
        
        const calculatedOccupancy = Object.keys(chambersConfig).map(chamberId => {
            const chamber = chambersConfig[chamberId];
            const binsInChamber = storedLots
                .filter(lot => lot.chamberId === chamberId)
                .reduce((sum, lot) => sum + lot.binCount, 0);
            return {
                name: chamber.name,
                ocupacion: binsInChamber,
                total: chamber.capacity,
                percentage: (binsInChamber / chamber.capacity) * 100
            };
        });

        const sortedReceptions = (receptionLots || [])
            .filter(lot => lot.createdAt)
            .sort((a,b) => b.createdAt!.toMillis() - a.createdAt!.toMillis())
            .slice(0, 5);

        const binMaterialIds = (binMaterials || [])
            .filter(m => m.type === 'bin')
            .map(m => m.id);
        
        const calculatedEmptyBins = (binMaterialStock || [])
            .filter(s => binMaterialIds.includes(s.binMaterialId))
            .reduce((sum, s) => sum + s.quantity, 0);


        return {
            totalBinsInStock: calculatedTotalBins,
            pendingStorage: calculatedPendingStorage,
            pendingDispatch: calculatedPendingDispatch,
            inProcess: calculatedInProcess,
            stockByExporter: pieChartData,
            occupancyByChamber: calculatedOccupancy,
            latestReceptions: sortedReceptions,
            totalEmptyBins: calculatedEmptyBins,
        };

    }, [chamberLots, processingLots, dispatches, exporters, receptionLots, binMaterials, binMaterialStock]);

    const loading = loadingChamber || loadingProcessing || loadingDispatches || loadingExporters || loadingReception || loadingBinMaterials || loadingBinStock;

    const kpiCards = [
        { title: "Total Bins en Cámara (Fruta)", value: totalBinsInStock, icon: Warehouse },
        { title: "Total Bins Vacíos (Stock)", value: totalEmptyBins, icon: Archive },
        { title: "Lotes en Proceso (Hidro)", value: inProcess, icon: Boxes },
        { title: "Pendientes por Almacenar", value: pendingStorage, icon: PackageCheck },
        { title: "Despachos Pendientes", value: pendingDispatch, icon: Truck }
    ];

    const chartConfig: ChartConfig = React.useMemo(() => {
        const config: ChartConfig = {};
        stockByExporter.forEach((item, index) => {
            config[item.name] = {
                label: item.name,
                color: CHART_COLORS[index % CHART_COLORS.length],
            };
        });
        return config;
    }, [stockByExporter]);


    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {kpiCards.map(kpi => (
                    <Card key={kpi.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                            <kpi.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <Skeleton className="h-8 w-1/2" />
                            ) : (
                                <div className="text-4xl font-bold">{kpi.value}</div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Distribución de Stock por Cliente (Fruta)</CardTitle>
                        <CardDescription>Bins con fruta almacenados por cliente exportador.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                             <div className="flex justify-center items-center h-[250px]">
                                <Skeleton className="h-48 w-48 rounded-full" />
                            </div>
                        ) : stockByExporter.length > 0 ? (
                        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
                            <PieChart>
                                <ChartTooltip content={<ChartTooltipContent nameKey="value" hideLabel />} />
                                <Pie data={stockByExporter} dataKey="value" nameKey="name" innerRadius={60}>
                                     {stockByExporter.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ChartContainer>
                        ) : (
                             <div className="flex justify-center items-center h-[250px]">
                                <p className="text-muted-foreground">No hay stock para mostrar.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Ocupación por Cámara</CardTitle>
                        <CardDescription>Capacidad utilizada en cada cámara.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {loading ? (
                            <div className="h-[250px] w-full p-4 space-y-4">
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                            </div>
                        ) : (
                        <ChartContainer config={{ ocupacion: { label: 'Ocupación', color: "hsl(var(--chart-1))" } }} className="h-[250px] w-full">
                           <BarChart data={occupancyByChamber} layout="vertical" margin={{ left: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="ocupacion" layout="vertical" radius={5} />
                            </BarChart>
                        </ChartContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
            
             <Card>
                <CardHeader>
                    <CardTitle>Últimos Lotes Ingresados (Recepción)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>ID Lote</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead>Variedad</TableHead>
                                    <TableHead>N° Bins</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : latestReceptions.length > 0 ? (
                                    latestReceptions.map(lot => (
                                        <TableRow key={lot.id}>
                                            <TableCell>{lot.createdAt?.toDate().toLocaleDateString()}</TableCell>
                                            <TableCell className="font-mono">{lot.displayLotId}</TableCell>
                                            <TableCell>{lot.producerId}</TableCell>
                                            <TableCell>{lot.variety}</TableCell>
                                            <TableCell>{lot.binCount}</TableCell>
                                            <TableCell><Badge variant="secondary">{lot.status}</Badge></TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No hay registros de recepción recientes.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
    