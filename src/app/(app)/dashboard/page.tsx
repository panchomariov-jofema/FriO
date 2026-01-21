'use client';

import * as React from 'react';
import { DateRange } from "react-day-picker"
import { addDays, format } from "date-fns"
import { Calendar as CalendarIcon, ChevronsRight, Download } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, Dispatch, Exporter, ProcessingLot, ReceptionLot, BinMaterialStock, OtherFruitReception, Profile, UserMaster, HidrocoolerLot, OtherClient } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend, LabelList } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chambersConfig } from '@/lib/chambers-config';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Boxes, PackageCheck, Truck, Warehouse, Archive, ChevronsLeft, Waves } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useUser } from '@/firebase';
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"


const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];


// Helper to convert array of objects to CSV
function convertToCSV(data: any[], headers: {key: string, label: string}[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
             if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value?.toDate) {
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


function FallCreekExecutiveView({ data, clientName }: { data: any[], clientName: string }) {
    const handleExport = () => {
        const headers = [
            { key: 'receptionDate', label: 'Fecha Recepción' },
            { key: 'clientLotId', label: 'Lote Cliente' },
            { key: 'productName', label: 'Producto' },
            { key: 'totalQuantity', label: 'Cantidad Total' },
            { key: 'unit', label: 'Unidad' },
        ];
        
        const csv = convertToCSV(data, headers);
        downloadCSV(csv, `resumen_fall_creek_${new Date().toISOString().split('T')[0]}.csv`);
    };

    if (data.length === 0) {
        return (
             <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle>Resumen Ejecutivo: {clientName}</CardTitle>
                        <CardDescription>Resumen de lotes de cliente almacenados en cámara.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="h-48 flex items-center justify-center">
                    <p className="text-muted-foreground">No se encontraron lotes de cliente almacenados para {clientName}.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle>Resumen Ejecutivo: {clientName}</CardTitle>
                        <CardDescription>Resumen de lotes de cliente almacenados en cámara.</CardDescription>
                    </div>
                     <Button onClick={handleExport} variant="outline" size="sm" disabled={data.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Exportar
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha Recepción</TableHead>
                                    <TableHead>Lote Cliente</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map(lot => (
                                    <TableRow key={lot.clientLotId}>
                                        <TableCell>{lot.receptionDate?.toDate().toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="font-mono">{lot.clientLotId}</TableCell>
                                        <TableCell>{lot.productName}</TableCell>
                                        <TableCell className="font-semibold">{lot.totalQuantity} {lot.unit}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function DashboardPage() {
    const { user } = useUser();
    const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
    const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');

    const [selectedClient, setSelectedClient] = React.useState<{ value: string; label: string; id: string; type: 'exporter' | 'otherclient'; name: string } | null>(null);
    const [fixedExporterId, setFixedExporterId] = React.useState<string | null>(null);
    const [userProfile, setUserProfile] = React.useState<Profile | null>(null);
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
        from: addDays(new Date(), -7),
        to: new Date(),
    });

    const { data: chamberLots, loading: loadingChamber } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: processingLots, loading: loadingProcessing } = useFirestoreCollection<ProcessingLot>('processingLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: receptionLots, loading: loadingReception } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: otherClients, loading: loadingOtherClients } = useFirestoreCollection<OtherClient>('otherClients');
    const { data: binMaterialStock, loading: loadingBinStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
    const { data: hidrocoolerLots, loading: loadingHidroLots } = useFirestoreCollection<HidrocoolerLot>('hidrocoolerLots');

    const filterOptions = React.useMemo(() => {
        const exporterOptions = (exporters || []).map(e => ({
            value: `exporter_${e.id}`,
            label: e.name,
            name: e.name,
            id: e.exporterId,
            type: 'exporter' as const
        }));

        const clientOptions = (otherClients || [])
            .filter(c => c.type === 'fruta')
            .map(c => ({
                value: `otherclient_${c.id}`,
                label: c.name,
                name: c.name,
                id: c.clientId,
                type: 'otherclient' as const
            }));

        return [...exporterOptions, ...clientOptions].sort((a, b) => a.label.localeCompare(b.label));
    }, [exporters, otherClients]);
    
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
                const exporter = exporters.find(e => e.name === (dashboardPermission as any).fixedExporterId);
                if (exporter) {
                    setFixedExporterId(exporter.exporterId);
                    setSelectedClient({
                        value: `exporter_${exporter.id}`,
                        label: exporter.name,
                        name: exporter.name,
                        id: exporter.exporterId,
                        type: 'exporter' as const
                    });
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
        pendingHidroBins,
    } = React.useMemo(() => {
        
        const allChamberLotsForKPI = (chamberLots || []);
        const calculatedTotalBins = allChamberLotsForKPI
            .filter(lot => lot.status === 'Almacenado')
            .reduce((sum, lot) => sum + lot.binCount, 0);
        
        const calculatedPendingStorage = allChamberLotsForKPI
            .filter(lot => lot.status === 'Pendiente por Almacenar')
            .reduce((sum, lot) => sum + lot.binCount, 0);
        
        const calculatedInProcess = (processingLots || [])
            .filter(p => p.status === 'En Proceso')
            .reduce((sum, lot) => sum + lot.binCount, 0);

        const calculatedPendingHidroBins = (hidrocoolerLots || [])
            .filter(lot => lot.status === 'Pendiente de Pre-Hidro')
            .reduce((sum, lot) => sum + lot.binCount, 0);

        let stockForEmptyBins = (binMaterialStock || []);
        if (selectedClient && selectedClient.type === 'exporter') {
            stockForEmptyBins = stockForEmptyBins.filter(s => s.exporterId === selectedClient.id);
        } else if (selectedClient) {
             stockForEmptyBins = [];
        }

        const specificBinCodes = ['10001', '10011', '10007'];
        const calculatedEmptyBins = stockForEmptyBins
            .filter(s => specificBinCodes.includes(s.binMaterialCode))
            .reduce((sum, s) => sum + s.quantity, 0);
        
        const calculatedOccupancy = Object.keys(chambersConfig).map(chamberId => {
            const chamber = chambersConfig[chamberId];
            const totalCapacity = chamber.capacity;

            const binsInChamber = allChamberLotsForKPI
                .filter(lot => lot.status === 'Almacenado' && lot.chamberId === chamberId)
                .reduce((sum, lot) => sum + lot.binCount, 0);

            const otherFruitInChamber = (otherFruitReceptions || [])
                .flatMap(r => r.items.map(item => ({ ...item, unit: r.unit, chamberId: item.storageLocation?.chamberId })))
                .filter(item => item.status === 'Almacenado' && item.chamberId === chamberId);

            const otherBins = otherFruitInChamber.filter(item => item.unit === 'Bins').reduce((sum, item) => sum + item.quantity, 0);
            const otherPallets = otherFruitInChamber.filter(item => item.unit === 'Pallets').reduce((sum, item) => sum + item.quantity, 0);
            const occupiedEquivalentBins = binsInChamber + otherBins + (otherPallets * 2);

            return {
                name: chamber.name,
                ocupacion: occupiedEquivalentBins,
                total: totalCapacity,
                percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0
            };
        });

        const isDateInRange = (date: Date | null | undefined): boolean => {
            if (!date) return false;
            if (!dateRange?.from) return true; // No start date, include all
            const toDate = dateRange.to ? addDays(dateRange.to, 1) : addDays(new Date(), 1);
            return date >= dateRange.from && date < toDate;
        };

        const exporterMap = (exporters || []).reduce((acc, e) => {
            acc[e.exporterId] = e.name;
            return acc;
        }, {} as Record<string, string>);

        const kilosData: Record<string, number> = {};
        const isExporterSelected = selectedClient && selectedClient.type === 'exporter';
        const isOtherClientSelected = selectedClient && selectedClient.type === 'otherclient';

        (receptionLots || []).forEach(lot => {
            if (isOtherClientSelected) return;
            if (!isDateInRange(lot.createdAt?.toDate())) return;
            if (isExporterSelected && lot.exporterId !== selectedClient.id) return;

            const weight = lot.netWeightPerBin && lot.netWeightPerBin > 0 
                ? lot.netWeightPerBin * lot.binCount
                : 0;

            if (weight > 0) {
                const exporterName = exporterMap[lot.exporterId] || 'No Asignado';
                kilosData[exporterName] = (kilosData[exporterName] || 0) + weight;
            }
        });

        (chamberLots || []).forEach(lot => {
            if (isOtherClientSelected) return;
            if (lot.hidrocooler !== 'EXTERNO') return; 
            if (!isDateInRange(lot.storedAt?.toDate())) return;
            if (isExporterSelected && lot.exporterId !== selectedClient.id) return;

            const weight = (lot.netWeightPerBin || 0) * lot.binCount;
            if (weight > 0) {
                const exporterName = exporterMap[lot.exporterId] || 'No Asignado';
                kilosData[exporterName] = (kilosData[exporterName] || 0) + weight;
            }
        });
        
        const barChartData = Object.entries(kilosData).map(([name, value]) => ({
            name,
            kilos: value,
        }));
        
        const sortedReceptions = (receptionLots || [])
            .sort((a,b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
            .slice(0, 5);
        
        return {
            totalBinsInStock: calculatedTotalBins,
            pendingStorage: calculatedPendingStorage,
            inProcess: calculatedInProcess,
            kilosPorExportador: barChartData,
            occupancyByChamber: calculatedOccupancy,
            latestReceptions: sortedReceptions,
            totalEmptyBins: calculatedEmptyBins,
            pendingHidroBins: calculatedPendingHidroBins,
        };

    }, [chamberLots, otherFruitReceptions, processingLots, exporters, receptionLots, binMaterialStock, hidrocoolerLots, selectedClient, dateRange]);


    const fallCreekData = React.useMemo(() => {
        if (selectedClient?.name !== 'FALL CREEK' || !otherFruitReceptions) {
            return null;
        }
        
        const clientReceptions = otherFruitReceptions.filter(r => r.clientId === selectedClient.id);
        
        const lots = new Map<string, {
            productName: string,
            unit: 'Bins' | 'Pallets',
            totalQuantity: number,
            locations: { coordinate: string, quantity: number }[],
            receptionDate: any,
        }>();
        
        clientReceptions.forEach(reception => {
            reception.items.forEach(item => {
                if (item.status === 'Almacenado' && item.clientLotId && item.quantity > 0) {
                    if (!lots.has(item.clientLotId)) {
                        lots.set(item.clientLotId, {
                            productName: item.productName,
                            unit: reception.unit,
                            totalQuantity: 0,
                            locations: [],
                            receptionDate: reception.createdAt,
                        });
                    }
                    const lotSummary = lots.get(item.clientLotId)!;
                    lotSummary.totalQuantity += item.quantity;
                    if(item.storageLocation?.coordinate && item.storageLocation?.chamberId) {
                        lotSummary.locations.push({
                            coordinate: `${item.storageLocation.chamberId}/${item.storageLocation.coordinate}`,
                            quantity: item.quantity
                        });
                    }
                }
            });
        });
        
        return Array.from(lots.entries()).map(([clientLotId, summary]) => ({
            clientLotId,
            ...summary
        }));

    }, [selectedClient, otherFruitReceptions]);


    const loading = loadingChamber || loadingOtherFruit || loadingProcessing || loadingDispatches || loadingExporters || loadingReception || loadingBinStock || loadingUsers || loadingProfiles || loadingHidroLots || loadingOtherClients;

    const kpiCards = [
        { title: "Total Bins en Cámara (Fruta)", value: totalBinsInStock, icon: Warehouse },
        { title: "Total Bins Vacíos (Stock)", value: totalEmptyBins, icon: Archive },
        { title: "Bins Pend. de Hidro", value: pendingHidroBins, icon: Waves },
        { title: "Bins en Proceso (Hidro)", value: inProcess, icon: Boxes },
        { title: "Pend. por Almacenar en Camara", value: pendingStorage, icon: PackageCheck },
    ];

    const kpiChartConfig: ChartConfig = {
        kilos: {
            label: "Kilos Netos",
            color: "hsl(var(--chart-1))",
        },
    };
    
    const occupancyChartConfig: ChartConfig = {
        ocupacion: {
            label: "Bins Equivalentes",
            color: "hsl(var(--chart-2))",
        },
    };

    const renderDashboardHeader = () => (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div className="flex-1">
                        <h2 className="text-2xl font-bold tracking-tight">Dashboard Ejecutivo</h2>
                        <p className="text-muted-foreground">
                            Vista general de los indicadores clave de la operación.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <div className="w-full sm:w-auto sm:min-w-[200px]">
                            <Label htmlFor="date-range-picker">Filtrar por Fecha</Label>
                                <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    id="date-range-picker"
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                        {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                    ) : (
                                    <span>Seleccione un rango</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                    showWeekNumber
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        {!fixedExporterId && (
                        <div className="w-full sm:w-auto sm:min-w-[200px]">
                            <Label htmlFor="client-filter">Filtrar por Cliente</Label>
                            <Select
                                value={selectedClient?.value ?? 'all'}
                                onValueChange={(value) => {
                                    if (value === 'all') {
                                        setSelectedClient(null);
                                    } else {
                                        const client = filterOptions.find(o => o.value === value) || null;
                                        setSelectedClient(client);
                                    }
                                }}
                                disabled={loadingExporters || loadingOtherClients}
                            >
                                <SelectTrigger id="client-filter">
                                    <SelectValue placeholder="Seleccione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Ver Todos</SelectItem>
                                    {filterOptions.map(e => (
                                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    if (selectedClient?.name === 'FALL CREEK' && fallCreekData) {
        return (
             <div className="space-y-6">
                {renderDashboardHeader()}
                <FallCreekExecutiveView data={fallCreekData} clientName={selectedClient.name} />
             </div>
        )
    }

    return (
        <div className="space-y-6">
            {renderDashboardHeader()}

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
                                <div className="text-4xl font-bold">{kpi.value.toLocaleString('es-CL')}</div>
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
                        <ChartContainer config={kpiChartConfig} className="h-[250px] w-full">
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
                        <ChartContainer config={occupancyChartConfig} className="h-[250px] w-full">
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
                                <Bar dataKey="ocupacion" layout="vertical" radius={5} fill="var(--color-ocupacion)">
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
