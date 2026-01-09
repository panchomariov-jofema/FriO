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
import type { ChamberLot, Dispatch, Exporter, ProcessingLot, ReceptionLot, BinMaterialStock, OtherFruitReception, Profile, UserMaster } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend, LabelList } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chambersConfig } from '@/lib/chambers-config';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Boxes, PackageCheck, Truck, Warehouse, Archive, ChevronsLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useUser } from '@/firebase';


const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function DashboardPage() {
    const { user } = useUser();
    const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
    const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');

    const [selectedExporterId, setSelectedExporterId] = React.useState<string | null>(null);
    const [fixedExporterId, setFixedExporterId] = React.useState<string | null>(null);
    const [userProfile, setUserProfile] = React.useState<Profile | null>(null);

    const { data: chamberLots, loading: loadingChamber } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: processingLots, loading: loadingProcessing } = useFirestoreCollection<ProcessingLot>('processingLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: receptionLots, loading: loadingReception } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: binMaterialStock, loading: loadingBinStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
    
    React.useEffect(() => {
        if (user && users.length > 0 && profiles.length > 0 && !userProfile) {
            const currentUserMaster = users.find(u => u.userName.toLowerCase() === user.email?.split('@')[0].toLowerCase());
            if (currentUserMaster) {
                const profile = profiles.find(p => p.profileId === currentUserMaster.profileId);
                setUserProfile(profile || null);
            }
        }
    }, [user, users, profiles, userProfile]);

    React.useEffect(() => {
        if (userProfile) {
            const dashboardPermission = userProfile.modulesAccess.find(p => typeof p === 'object' && p.name === 'Dashboard');
            if (dashboardPermission && typeof dashboardPermission === 'object' && 'fixedExporterId' in dashboardPermission) {
                const exporter = exporters.find(e => e.name === dashboardPermission.fixedExporterId);
                if (exporter) {
                    setFixedExporterId(exporter.exporterId);
                    setSelectedExporterId(exporter.exporterId);
                }
            }
        }
    }, [userProfile, exporters]);

    const { 
        totalBinsInStock, 
        pendingStorage,
        inProcess, 
        kilosPorExportador,
        occupancyByChamber,
        latestReceptions,
        totalEmptyBins,
        pendingReceptionBins,
    } = React.useMemo(() => {
        const filteredChamberLots = (chamberLots || []).filter(lot => !selectedExporterId || lot.exporterId === selectedExporterId);
        const filteredReceptionLots = (receptionLots || []).filter(lot => !selectedExporterId || lot.exporterId === selectedExporterId);
        
        const exporterDisplayLotIds = new Set(filteredReceptionLots.map(lot => lot.displayLotId));
        const filteredProcessingLots = (processingLots || []).filter(p => exporterDisplayLotIds.has(p.displayLotId));


        const storedLots = filteredChamberLots.filter(lot => lot.status === 'Almacenado');
        const calculatedTotalBins = storedLots.reduce((sum, lot) => sum + lot.binCount, 0);
        
        const calculatedPendingStorage = filteredChamberLots.filter(lot => lot.status === 'Pendiente por Almacenar').length;
        
        const calculatedInProcess = filteredProcessingLots.filter(p => p.status === 'En Proceso').length;

        const exporterMap = (exporters || []).reduce((acc, e) => {
            acc[e.exporterId] = e.name;
            return acc;
        }, {} as Record<string, string>);
        
        const kilosData = (receptionLots || []).reduce((acc, lot) => {
            const weight = (lot.totalWeight && lot.totalWeight > 0)
                ? (lot.totalWeight - (lot.binCount * 65) + (lot.noTotes || 0))
                : 0;

            if (weight > 0) {
                const exporterName = exporterMap[lot.exporterId] || 'No Asignado';
                 if (!acc[exporterName]) {
                    acc[exporterName] = 0;
                }
                acc[exporterName] += weight;
            }
            return acc;
        }, {} as Record<string, number>);

        const barChartData = Object.entries(kilosData).map(([name, value]) => ({
            name,
            kilos: value,
        }));
        
        const calculatedOccupancy = Object.keys(chambersConfig).map(chamberId => {
            const chamber = chambersConfig[chamberId];
            const totalCapacity = chamber.capacity;

            const binsInChamber = (chamberLots || [])
                .filter(lot => lot.status === 'Almacenado' && lot.chamberId === chamberId)
                .reduce((sum, lot) => sum + lot.binCount, 0);

            const otherFruitInChamber = (otherFruitReceptions || [])
                .flatMap(r => r.items.map(item => ({ ...item, unit: r.unit, chamberId: item.storageLocation?.chamberId })))
                .filter(item => item.status === 'Almacenado' && item.chamberId === chamberId);

            const otherBins = otherFruitInChamber
                .filter(item => item.unit === 'Bins')
                .reduce((sum, item) => sum + item.quantity, 0);

            const otherPallets = otherFruitInChamber
                .filter(item => item.unit === 'Pallets')
                .reduce((sum, item) => sum + item.quantity, 0);
            
            const occupiedEquivalentBins = binsInChamber + otherBins + (otherPallets * 2);

            return {
                name: chamber.name,
                ocupacion: occupiedEquivalentBins, // The value for the bar chart
                total: totalCapacity,
                percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0
            };
        });

        const sortedReceptions = filteredReceptionLots
            .filter(lot => lot.createdAt)
            .sort((a,b) => b.createdAt!.toMillis() - a.createdAt!.toMillis())
            .slice(0, 5);
        
        const specificBinCodes = ['10001', '10011', '10007'];
        let stockForEmptyBins = binMaterialStock || [];
        if (selectedExporterId) {
            stockForEmptyBins = (binMaterialStock || []).filter(s => s.exporterId === selectedExporterId);
        }

        const calculatedEmptyBins = stockForEmptyBins
            .filter(s => specificBinCodes.includes(s.binMaterialCode))
            .reduce((sum, s) => sum + s.quantity, 0);

        const calculatedPendingReceptionBins = filteredReceptionLots
            .filter(lot => lot.status !== 'Cerrado')
            .reduce((sum, lot) => sum + lot.binCount, 0);


        return {
            totalBinsInStock: calculatedTotalBins,
            pendingStorage: calculatedPendingStorage,
            inProcess: calculatedInProcess,
            kilosPorExportador: barChartData,
            occupancyByChamber: calculatedOccupancy,
            latestReceptions: sortedReceptions,
            totalEmptyBins: calculatedEmptyBins,
            pendingReceptionBins: calculatedPendingReceptionBins,
        };

    }, [chamberLots, otherFruitReceptions, processingLots, dispatches, exporters, receptionLots, binMaterialStock, selectedExporterId]);

    const loading = loadingChamber || loadingOtherFruit || loadingProcessing || loadingDispatches || loadingExporters || loadingReception || loadingBinStock || loadingUsers || loadingProfiles;

    const kpiCards = [
        { title: "Total Bins en Cámara (Fruta)", value: totalBinsInStock, icon: Warehouse },
        { title: "Total Bins Vacíos (Stock)", value: totalEmptyBins, icon: Archive },
        { title: "Bins Pendientes en Recepción", value: pendingReceptionBins, icon: ChevronsLeft },
        { title: "Lotes en Proceso (Hidro)", value: inProcess, icon: Boxes },
        { title: "Pend. por Almacenar en Camara", value: pendingStorage, icon: PackageCheck },
    ];

    const chartConfig: ChartConfig = {
        kilos: {
            label: "Kilos Netos",
            color: "hsl(var(--chart-1))",
        },
    };


    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                         <div className="flex-1">
                            <h2 className="text-2xl font-bold tracking-tight">Dashboard Ejecutivo</h2>
                            <p className="text-muted-foreground">
                                Vista general de los indicadores clave de la operación.
                            </p>
                        </div>
                        {!fixedExporterId && (
                        <div className="w-full sm:w-auto sm:min-w-[200px]">
                            <Label htmlFor="exporter-filter">Filtrar por Exportador</Label>
                            <Select
                                value={selectedExporterId ?? 'all'}
                                onValueChange={(value) => setSelectedExporterId(value === 'all' ? null : value)}
                                disabled={loadingExporters}
                            >
                                <SelectTrigger id="exporter-filter">
                                    <SelectValue placeholder="Seleccione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Ver Todos</SelectItem>
                                    {exporters.map(e => (
                                        <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        )}
                    </div>
                </CardContent>
            </Card>

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

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Kilos Netos Recepcionados por Exportador</CardTitle>
                        <CardDescription>Total de kilos netos ingresados a la planta por cada cliente.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                             <div className="flex justify-center items-center h-[250px]">
                                <Skeleton className="h-48 w-full" />
                            </div>
                        ) : kilosPorExportador.length > 0 ? (
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                           <BarChart data={kilosPorExportador} layout="vertical" margin={{ right: 80, left: 20 }}>
                                <XAxis type="number" dataKey="kilos" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="kilos" layout="vertical" radius={5} fill="var(--color-kilos)">
                                    <LabelList 
                                        dataKey="kilos" 
                                        position="right" 
                                        offset={8} 
                                        className="fill-foreground font-semibold"
                                        formatter={(value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                        ) : (
                             <div className="flex justify-center items-center h-[250px]">
                                <p className="text-muted-foreground">No hay datos de recepción para mostrar.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Ocupación por Cámara</CardTitle>
                        <CardDescription>Porcentaje de capacidad de bins equivalentes utilizada en cada cámara.</CardDescription>
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
                        <ChartContainer config={{ ocupacion: { label: 'Bins Equivalentes', color: "hsl(var(--chart-2))" } }} className="h-[250px] w-full">
                           <BarChart data={occupancyByChamber} layout="vertical" margin={{ left: 20, right: 80 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} />
                                <ChartTooltip 
                                    formatter={(value, name, props) => {
                                        const { payload } = props;
                                        return [`${value} / ${payload.total} Bins`, name];
                                    }}
                                    content={<ChartTooltipContent />} 
                                />
                                <Bar dataKey="ocupacion" layout="vertical" radius={5} fill="hsl(var(--chart-2))">
                                    <LabelList 
                                        dataKey="percentage" 
                                        position="right" 
                                        offset={8} 
                                        className="fill-foreground font-semibold"
                                        formatter={(value: number) => `${value.toFixed(1)}%`}
                                    />
                                </Bar>
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
                                    <TableHead>Fecha y Hora</TableHead>
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
                                            <TableCell>{lot.createdAt?.toDate().toLocaleString()}</TableCell>
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
