'use client';

import * as React from 'react';
import { DateRange } from "react-day-picker"
import { addDays, format } from "date-fns"
import { Calendar as CalendarIcon, Thermometer } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useCollection, useMemoFirebase, useUser, useFirestore } from '@/firebase';
import type { ChamberLot, Dispatch, Exporter, ProcessingLot, ReceptionLot, BinMaterialStock, OtherFruitReception, Profile, UserMaster, HidrocoolerLot, OtherClient, ChamberTemperature, OtherFruitMovement, Producer, BinMaterial, BinMaterialMovement } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend, LabelList } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chambersConfig } from '@/lib/chambers-config';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Boxes, PackageCheck, Truck, Warehouse, Archive, ChevronsLeft, Waves, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn, safeToDate, safeToMillis, safeStringCompare, safeFormatDate, safeFormatQuantity, formatLocaleDate, formatLocaleDateString } from "@/lib/utils"
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';


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
            } else if (typeof value === 'object' && value !== null) {
                value = safeToDate(value).toLocaleString();
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


function FallCreekExecutiveView({ dashboardData, clientName }: { dashboardData: any, clientName: string }) {
    const { summaryData, charts, dispatchReportData } = dashboardData;

    const handleExport = () => {
         const headers = [
            { key: 'dispatchDate', label: 'Fecha Despacho' },
            { key: 'document', label: 'Documento' },
            { key: 'clientLotIds', label: 'Lotes Cliente' },
            { key: 'productNames', label: 'Productos' },
            { key: 'totalQuantity', label: 'Cantidad Total' },
        ];
        
        const csvData = dispatchReportData.map((d: any) => ({
            ...d,
            totalQuantity: `${d.totalQuantity} ${d.unit}`
        }));
        
        const csv = convertToCSV(csvData, headers);
        downloadCSV(csv, `reporte_despachos_fall_creek_${new Date().toISOString().split('T')[0]}.csv`);
    };

    if (summaryData.length === 0 && dispatchReportData.length === 0) {
        return (
             <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle className="text-lg font-bold text-[#004b8d]">Resumen Ejecutivo: {clientName}</CardTitle>
                        <CardDescription>Resumen de lotes de cliente almacenados en cámara.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="h-48 flex items-center justify-center">
                    <p className="text-muted-foreground">No se encontraron datos para {clientName}.</p>
                </CardContent>
             </Card>
        )
    }
    
    const productChartConfig: ChartConfig = {
        quantity: { label: "Cantidad", color: "#7aba28" },
    };
    const occupancyChartConfig: ChartConfig = {
        ocupacion: { label: "Bins Equivalentes", color: "#004b8d" },
    };

    return (
        <div className="space-y-6">
            <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-[#004b8d]">Resumen de Stock por Cámara y Variedad</CardTitle>
                    <CardDescription>Consolidado del stock de fruta almacenado en frío.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-72">
                        <div className="rounded-xl border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead className="font-bold text-xs uppercase">Cámara</TableHead>
                                        <TableHead className="font-bold text-xs uppercase">Variedad</TableHead>
                                        <TableHead className="font-bold text-xs uppercase">Cantidad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summaryData && summaryData.length > 0 ? summaryData.map((item: any) => (
                                        <TableRow key={item.id} className="hover:bg-muted/30">
                                            <TableCell className="text-xs font-semibold">{item.chamber}</TableCell>
                                            <TableCell className="text-xs">{item.productName}</TableCell>
                                            <TableCell className="text-xs font-medium">{item.quantity} {item.unit}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-xs text-muted-foreground">No hay stock en cámara.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-[#004b8d]">Cantidad por Producto</CardTitle>
                        <CardDescription>Total de Bins/Pallets por cada tipo de producto en stock.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={productChartConfig} className="h-[250px] w-full">
                           <BarChart data={charts.quantityByProduct} layout="vertical" margin={{ right: 80, left: 20 }}>
                                <defs>
                                    <linearGradient id="productGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#7aba28" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#7aba28" stopOpacity={0.85} />
                                    </linearGradient>
                                </defs>
                                <XAxis type="number" dataKey="quantity" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} className="text-[10px] font-semibold text-muted-foreground" />
                                <ChartTooltip content={<ChartTooltipContent className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-md rounded-xl" />} />
                                <Bar dataKey="quantity" layout="vertical" radius={[0, 6, 6, 0]} fill="url(#productGradient)">
                                    <LabelList 
                                        dataKey="quantity" 
                                        position="right" 
                                        offset={8} 
                                        className="fill-foreground font-bold text-xs"
                                        formatter={(value: number) => `${value.toLocaleString('es-CL')} Unid.`}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-[#004b8d]">Ocupación por Cámara</CardTitle>
                        <CardDescription>Capacidad utilizada en cada cámara para {clientName}.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={occupancyChartConfig} className="h-[250px] w-full">
                           <BarChart data={charts.occupancyByChamber} layout="vertical" margin={{ left: 20, right: 120 }}>
                                <defs>
                                    <linearGradient id="chamberGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#004b8d" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#004b8d" stopOpacity={0.85} />
                                    </linearGradient>
                                </defs>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} className="text-[10px] font-semibold text-muted-foreground" />
                                <ChartTooltip formatter={(value, name) => [`${value} Bins Equiv.`, name]} content={<ChartTooltipContent className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-md rounded-xl" />} />
                                <Bar dataKey="ocupacion" layout="vertical" radius={[0, 6, 6, 0]} fill="url(#chamberGradient)">
                                     <LabelList
                                        dataKey="percentage"
                                        position="right"
                                        offset={8}
                                        className="fill-foreground font-bold text-xs"
                                        formatter={(value: number) => `${value.toFixed(1)}%`}
                                    />
                                    <LabelList 
                                        dataKey="ocupacion"
                                        position="insideLeft"
                                        offset={8}
                                        className="fill-white font-bold text-[9px]"
                                        formatter={(value: number) => value > 0 ? `${value.toLocaleString('es-CL')}` : ''}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <div>
                        <CardTitle className="text-lg font-bold text-[#004b8d]">Reporte de Despachos</CardTitle>
                        <CardDescription>Historial de salidas de fruta realizadas para el cliente.</CardDescription>
                    </div>
                     <Button onClick={handleExport} variant="outline" size="sm" disabled={dispatchReportData.length === 0} className="border-2 rounded-xl">
                        <Download className="mr-2 h-4 w-4" />
                        Exportar
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-xl border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/40">
                                <TableRow>
                                    <TableHead className="font-bold text-xs uppercase">Fecha Despacho</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">Documento</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">Lotes Cliente</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">Productos</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">Cantidad Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dispatchReportData && dispatchReportData.length > 0 ? (
                                    dispatchReportData.map((dispatch: any) => (
                                     <TableRow key={dispatch.id} className="hover:bg-muted/30">
                                         <TableCell className="text-xs">{formatLocaleDate(dispatch.dispatchDate)}</TableCell>
                                         <TableCell className="font-mono text-xs font-semibold">{dispatch.document}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{dispatch.clientLotIds}</TableCell>
                                        <TableCell className="text-xs">{dispatch.productNames}</TableCell>
                                        <TableCell className="text-xs font-semibold text-[#004b8d]">{dispatch.totalQuantity} {dispatch.unit}</TableCell>
                                     </TableRow>
                                ))) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">No hay despachos registrados para este cliente.</TableCell>
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

export default function DashboardPage() {
    const { user } = useUser();
    const firestore = useFirestore();

    const [selectedClient, setSelectedClient] = React.useState<{ value: string; label: string; id: string; type: 'exporter' | 'otherclient'; name: string } | null>(null);
    const [fixedExporterId, setFixedExporterId] = React.useState<string | null>(null);
    const [userProfile, setUserProfile] = React.useState<Profile | null>(null);
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
        from: addDays(new Date(), -7),
        to: new Date(),
    });
    const [latestTemperatures, setLatestTemperatures] = React.useState<Record<string, ChamberTemperature | null>>({});
    const [isCherrySectionOpen, setIsCherrySectionOpen] = React.useState(false);

    const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
    const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
    const { data: allExporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: otherClients, loading: loadingOtherClients } = useFirestoreCollection<OtherClient>('otherClients');
    const { data: binMaterialStock, loading: loadingBinStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    const { data: binMaterialMovements, loading: loadingBinMaterialMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: binMaterials, loading: loadingBinMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');
    
    const exporters = React.useMemo(() => allExporters.filter(e => e.status !== 'inactivo'), [allExporters]);

    // Optimized Queries
    const baseQueryDeps = [firestore, dateRange];

    const createDateFilteredQuery = (collectionName: string, dateField: string) => {
        return useMemoFirebase(() => {
            if (!firestore) return null;
            const collRef = collection(firestore, collectionName);
            if (!dateRange?.from) return query(collRef);
            const toDate = dateRange.to ? addDays(dateRange.to, 1) : addDays(new Date(), 1);
            return query(collRef, where(dateField, '>=', dateRange.from), where(dateField, '<', toDate));
        }, baseQueryDeps);
    };

    const chamberLotsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        // Chamber lots use storedAt for date filtering, but also need all stored lots for occupancy
        const collRef = collection(firestore, 'chamberLots');
        if (!dateRange?.from) return query(collRef);
        const toDate = dateRange.to ? addDays(dateRange.to, 1) : addDays(new Date(), 1);
        // This is a compromise: we filter by `storedAt` for some calcs, but for now we fetch a wider range.
        return query(collRef);
    }, [firestore]);


    const { data: chamberLots, isLoading: loadingChamber } = useCollection<ChamberLot>(chamberLotsQuery);
    const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: otherFruitMovements, isLoading: loadingOtherFruitMovements } = useCollection<OtherFruitMovement>(createDateFilteredQuery('otherFruitMovements', 'createdAt'));
    const { data: processingLots, isLoading: loadingProcessing } = useCollection<ProcessingLot>(createDateFilteredQuery('processingLots', 'createdAt'));
    const { data: dispatches, isLoading: loadingDispatches } = useCollection<Dispatch>(createDateFilteredQuery('dispatches', 'createdAt'));
    const { data: receptionLots, isLoading: loadingReception } = useCollection<ReceptionLot>(createDateFilteredQuery('receptionLots', 'createdAt'));
    const { data: hidrocoolerLots, isLoading: loadingHidroLots } = useCollection<HidrocoolerLot>(createDateFilteredQuery('hidrocoolerLots', 'receptionDate'));
    
    React.useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'chamberTemperatures'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const temps = snapshot.docs.map(doc => ({...doc.data(), id: doc.id} as ChamberTemperature));
            
            const newLatestTemps = temps.reduce((acc, temp) => {
                if (!acc[temp.chamberId] || safeToMillis(temp.timestamp) > safeToMillis(acc[temp.chamberId]!.timestamp)) {
                    acc[temp.chamberId] = temp;
                }
                return acc;
            }, {} as Record<string, ChamberTemperature>);

            setLatestTemperatures(newLatestTemps);
        });
        return () => unsubscribe();
    }, [firestore]);


    const filterOptions = React.useMemo(() => {
        const allowedClientNames = ['SUBSOLE', 'MEYER', 'BLOSSOM', 'FALL CREEK', 'OLMUE'];

        const exporterOptions = (exporters || [])
            .filter(e => allowedClientNames.includes(e.name))
            .map(e => ({
                value: `exporter_${e.id}`,
                label: e.name,
                name: e.name,
                id: e.exporterId,
                type: 'exporter' as const
            }));

        const clientOptions = (otherClients || [])
            .filter(c => c.type === 'fruta' && allowedClientNames.includes(c.name) && c.status !== 'inactivo')
            .map(c => ({
                value: `otherclient_${c.id}`,
                label: c.name,
                name: c.name,
                id: c.clientId,
                type: 'otherclient' as const
            }));

        return [...exporterOptions, ...clientOptions].sort((a, b) => safeStringCompare(a.label, b.label));
    }, [exporters, otherClients]);
    
    React.useEffect(() => {
        const emailLocalPart = user?.email ? user.email.split('@')[0].toLowerCase() : null;
        if (emailLocalPart && users.length > 0 && profiles.length > 0 && !userProfile) {
          const currentUserMaster = users.find(
            (u) =>
              typeof u.userName === 'string' &&
              u.userName.toLowerCase() === emailLocalPart
          ) ?? null;
        
          if (currentUserMaster) {
            const profile = profiles.find(
              (p) => p.profileId === currentUserMaster.profileId
            ) ?? null;
            setUserProfile(profile || null);
          }
        }
    }, [user, users, profiles, userProfile]);

    React.useEffect(() => {
        if (userProfile) {
            const dashboardPermission = userProfile.modulesAccess.find(p => typeof p === 'object' && p.name === 'Dashboard');
            if (dashboardPermission && typeof dashboardPermission === 'object' && 'fixedExporterId' in dashboardPermission) {
                const exporter = (exporters || []).find(e => e.name === (dashboardPermission as any).fixedExporterId);
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
        let finalChamberLots = chamberLots || [];
        let finalOtherFruitReceptions = otherFruitReceptions || [];
        let finalProcessingLots = processingLots || [];
        let finalHidrocoolerLots = hidrocoolerLots || [];

        if (selectedClient) {
            if (selectedClient.type === 'exporter') {
                finalChamberLots = (chamberLots || []).filter(lot => lot.exporterId === selectedClient.id);
                finalProcessingLots = (processingLots || []).filter(lot => lot.exporterId === selectedClient.id);
                finalHidrocoolerLots = (hidrocoolerLots || []).filter(lot => lot.exporterId === selectedClient.id);
                finalOtherFruitReceptions = [];
            } else if (selectedClient.type === 'otherclient') {
                finalOtherFruitReceptions = (otherFruitReceptions || []).filter(r => r.clientId === selectedClient.id);
                finalChamberLots = [];
                finalProcessingLots = [];
                finalHidrocoolerLots = [];
            }
        }
        
        const producerFruitBinsInStock = finalChamberLots
            .filter(lot => lot.status === 'Almacenado')
            .reduce((sum, lot) => sum + lot.binCount, 0);

        const otherFruitInStock = finalOtherFruitReceptions
            .flatMap(r => (r.items || []).map(item => ({ ...item, unit: r.unit })))
            .filter(item => item && item.status === 'Almacenado' && item.quantity > 0);

        const otherFruitBins = otherFruitInStock
            .filter(item => item.unit === 'Bins')
            .reduce((sum, item) => sum + item.quantity, 0);
            
        const otherFruitPallets = otherFruitInStock
            .filter(item => item.unit === 'Pallets')
            .reduce((sum, item) => sum + item.quantity, 0);
        
        const calculatedTotalBinsInStock = producerFruitBinsInStock + otherFruitBins + otherFruitPallets;

        const producerPendingStorage = finalChamberLots
            .filter(lot => lot.status === 'Pendiente por Almacenar')
            .reduce((sum, lot) => sum + lot.binCount, 0);
        
        const otherFruitPendingStorage = finalOtherFruitReceptions
            .filter(r => r.status === 'Pendiente de almacenar' || r.status === 'Parcialmente Almacenado')
            .flatMap(r => (r.items || []).map(item => ({...item, unit: r.unit})))
            .filter(item => item && item.status === 'Pendiente de almacenar')
            .reduce((sum, item) => {
                if (item.unit === 'Bins') {
                    return sum + item.quantity;
                } else if (item.unit === 'Pallets') {
                    return sum + (item.quantity * 2);
                }
                return sum;
            }, 0);

        const calculatedPendingStorage = producerPendingStorage + otherFruitPendingStorage;
        
        const calculatedInProcess = finalProcessingLots
            .filter(p => p.status === 'En Proceso')
            .reduce((sum, lot) => sum + lot.binCount, 0);

        const calculatedPendingHidroBins = finalHidrocoolerLots
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

            const binsInChamber = (chamberLots || [])
                .filter(lot => 
                    lot.status === 'Almacenado' && 
                    lot.chamberId === chamberId &&
                    (!selectedClient || (selectedClient.type === 'exporter' && lot.exporterId === selectedClient.id))
                )
                .reduce((sum, lot) => sum + lot.binCount, 0);
            
            const otherFruitInChamberItems = (selectedClient && selectedClient.type === 'exporter') 
                ? []
                : (otherFruitReceptions || [])
                    .filter(r => !selectedClient || (selectedClient.type === 'otherclient' && r.clientId === selectedClient.id))
                    .flatMap(r => (r.items || []).map(item => ({ ...item, unit: r.unit })))
                    .filter(item => item && item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId);
            
            const otherBins = otherFruitInChamberItems
                .filter(item => item.unit === 'Bins')
                .reduce((sum, item) => sum + item.quantity, 0);

            const otherPallets = otherFruitInChamberItems
                .filter(item => item.unit === 'Pallets')
                .reduce((sum, item) => sum + item.quantity, 0);
            
            const occupiedEquivalentBins = binsInChamber + otherBins + otherPallets;

            return {
                name: chamber.name,
                ocupacion: occupiedEquivalentBins,
                total: totalCapacity,
                percentage: totalCapacity > 0 ? (occupiedEquivalentBins / totalCapacity) * 100 : 0,
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
            if (!isDateInRange(safeToDate(lot.storedAt))) return;
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
            .sort((a,b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt))
            .slice(0, 5);
        
        return {
            totalBinsInStock: calculatedTotalBinsInStock,
            pendingStorage: calculatedPendingStorage,
            inProcess: calculatedInProcess,
            kilosPorExportador: barChartData,
            occupancyByChamber: calculatedOccupancy,
            latestReceptions: sortedReceptions,
            totalEmptyBins: calculatedEmptyBins,
            pendingHidroBins: calculatedPendingHidroBins,
        };

    }, [chamberLots, otherFruitReceptions, processingLots, exporters, receptionLots, binMaterialStock, hidrocoolerLots, selectedClient, dateRange]);


    const fallCreekDashboardData = React.useMemo(() => {
        if (selectedClient?.name !== 'FALL CREEK' || !otherFruitReceptions) {
            return null;
        }
        
        const clientReceptions = (otherFruitReceptions || []).filter(r => r.clientId === selectedClient.id);

        const summaryItems = clientReceptions.flatMap(reception => 
            (reception.items || [])
                .filter(item => item && item.status === 'Almacenado' && item.storageLocation?.chamberId && item.quantity > 0)
                .map((item, index) => ({
                    productName: item.productName || 'Variedad N/A',
                    quantity: item.quantity,
                    unit: reception.unit,
                    chamber: chambersConfig[item.storageLocation!.chamberId]?.name || item.storageLocation!.chamberId,
                }))
        );

        const groupedSummary = summaryItems.reduce((acc, item) => {
            const key = `${item.chamber}-${item.productName}-${item.unit}`;
            
            if (!acc[key]) {
                acc[key] = {
                    id: key,
                    chamber: item.chamber,
                    productName: item.productName,
                    quantity: 0,
                    unit: item.unit,
                };
            }
            
            acc[key].quantity += item.quantity;
            
            return acc;
        }, {} as Record<string, { id: string, chamber: string, productName: string, quantity: number, unit: string }>);

        const summaryTableData = Object.values(groupedSummary)
            .sort((a, b) => a.chamber.localeCompare(b.chamber) || a.productName.localeCompare(b.productName));


        const quantityByProduct: Record<string, {name: string, quantity: number, unit: 'Bins' | 'Pallets'}> = {};
        const occupancyByChamber: Record<string, { name: string; ocupacion: number; total: number; percentage: number; }> = {};


        clientReceptions.forEach(reception => {
            (reception.items || []).forEach(item => {
                const equivalentBins = item.quantity;
                if (item.status === 'Almacenado' && item.quantity > 0) {
                    if (!quantityByProduct[item.productName]) {
                        quantityByProduct[item.productName] = { name: item.productName, quantity: 0, unit: reception.unit };
                    }
                    quantityByProduct[item.productName].quantity += item.quantity;

                    if (item.storageLocation?.chamberId) {
                        const chamberId = item.storageLocation.chamberId;
                        if (!occupancyByChamber[chamberId]) {
                            const chamberConfig = chambersConfig[chamberId];
                            occupancyByChamber[chamberId] = { 
                                name: chamberConfig?.name || chamberId, 
                                ocupacion: 0,
                                total: chamberConfig?.capacity || 0,
                                percentage: 0,
                            };
                        }
                        occupancyByChamber[chamberId].ocupacion += equivalentBins;
                    }

                }
            });
        });

        Object.keys(occupancyByChamber).forEach(chamberId => {
            const chamber = occupancyByChamber[chamberId];
            chamber.percentage = chamber.total > 0 ? (chamber.ocupacion / chamber.total) * 100 : 0;
        });

        const dispatchReportData = (otherFruitMovements || [])
            .filter(m => m.clientId === selectedClient.id && m.type === 'salida')
            .map(movement => {
                const totalQuantity = movement.items.reduce((sum, item) => sum + item.quantity, 0);
                const productNames = [...new Set(movement.items.map(i => i.productName))].join(', ');
                const clientLotIds = [...new Set(movement.items.map(i => i.clientLotId).filter(Boolean))].join(', ');

                return {
                    id: movement.id,
                    dispatchDate: movement.createdAt,
                    document: movement.document,
                    clientLotIds: clientLotIds,
                    productNames: productNames,
                    totalQuantity: totalQuantity,
                    unit: movement.unit,
                };
            })
            .sort((a,b) => safeToMillis(b.dispatchDate) - safeToMillis(a.dispatchDate));


        return {
            summaryData: summaryTableData,
            charts: {
                quantityByProduct: Object.values(quantityByProduct),
                occupancyByChamber: Object.values(occupancyByChamber),
            },
            dispatchReportData,
        };
    }, [selectedClient, otherFruitReceptions, otherFruitMovements]);


    const emptyBinsStockInPlant = React.useMemo(() => {
        if (loadingBinMaterialMovements || loadingBinMaterials) return 0;
        
        const fnoBinMaterialCodes = new Set(
            (binMaterials || [])
                .filter(m => m.exporterId === 'EXP005' && m.type === 'BINS')
                .map(m => m.code)
        );

        let stock = 0;
        (binMaterialMovements || []).forEach(mov => {
            if (mov.exporterId !== 'EXP005') return;
            if (mov.observation === 'Despacho Directo') return;
            
            mov.items.forEach(item => {
                if (fnoBinMaterialCodes.has(item.binMaterialCode)) {
                    const qty = mov.type === 'entrada' ? item.quantity : -item.quantity;
                    stock += qty;
                }
            });
        });
        return stock;
    }, [binMaterials, binMaterialMovements, loadingBinMaterialMovements, loadingBinMaterials]);

    const leasedBinsData = React.useMemo(() => {
        if (loadingBinMaterialMovements || loadingBinMaterials || loadingProducers) return [];

        const fnoBinMaterialCodes = new Set(
            (binMaterials || [])
                .filter(m => m.exporterId === 'EXP005' && m.type === 'BINS')
                .map(m => m.code)
        );

        const producerMap = (producers || []).reduce((acc, p) => {
            if (p.producerId) {
                acc[p.producerId.trim()] = p.shortName || p.name;
            }
            return acc;
        }, {} as Record<string, string>);

        const leasedBalances: Record<string, { id: string; producerId: string; producerName: string; rut: string; quantity: number }> = {};

        (binMaterialMovements || []).forEach(mov => {
            if (mov.exporterId !== 'EXP005') return;
            if (mov.observation === 'Despacho Directo') return;
            if (!mov.producerId || mov.producerId.trim() === 'SISTEMA') return;

            const cleanProducerId = mov.producerId.trim();

            mov.items.forEach(item => {
                if (fnoBinMaterialCodes.has(item.binMaterialCode)) {
                    const qty = mov.type === 'salida' ? item.quantity : -item.quantity;
                    
                    if (!leasedBalances[cleanProducerId]) {
                        const producerObj = (producers || []).find(p => p.producerId && p.producerId.trim() === cleanProducerId);
                        leasedBalances[cleanProducerId] = {
                            id: cleanProducerId,
                            producerId: cleanProducerId,
                            producerName: producerMap[cleanProducerId] || cleanProducerId,
                            rut: producerObj?.rut ? producerObj.rut.trim() : cleanProducerId,
                            quantity: 0
                        };
                    }
                    leasedBalances[cleanProducerId].quantity += qty;
                }
            });
        });

        return Object.values(leasedBalances)
            .filter(item => item.quantity > 0)
            .sort((a, b) => b.quantity - a.quantity);
    }, [binMaterials, binMaterialMovements, producers, loadingBinMaterialMovements, loadingBinMaterials, loadingProducers]);

    const totalLeasedBins = React.useMemo(() => {
        return leasedBinsData.reduce((sum, item) => sum + item.quantity, 0);
    }, [leasedBinsData]);

    const loading = loadingChamber || loadingOtherFruit || loadingProcessing || loadingDispatches || loadingExporters || loadingReception || loadingBinStock || loadingUsers || loadingProfiles || loadingHidroLots || loadingOtherClients || loadingOtherFruitMovements || loadingProducers || loadingBinMaterialMovements || loadingBinMaterials;

    const activeKpiCards = [
        { 
            title: "Total Bins en Cámara (Fruta)", 
            value: totalBinsInStock, 
            icon: Warehouse,
            borderColor: "border-l-4 border-l-green-600",
            iconBg: "bg-green-600/10 text-green-600" 
        },
        { 
            title: "Bins Vacíos en Planta (Arriendo)", 
            value: emptyBinsStockInPlant, 
            icon: Archive,
            borderColor: "border-l-4 border-l-amber-500",
            iconBg: "bg-amber-500/10 text-amber-600"
        },
        { 
            title: "Total Bins en Arriendo", 
            value: totalLeasedBins, 
            icon: Truck,
            borderColor: "border-l-4 border-l-[#004b8d]",
            iconBg: "bg-[#004b8d]/10 text-[#004b8d]"
        },
    ];

    const cherryKpiCards = [
        { 
            title: "Bins Pend. de Hidro", 
            value: pendingHidroBins, 
            icon: Waves,
            borderColor: "border-l-4 border-l-sky-500",
            iconBg: "bg-sky-500/10 text-sky-600"
        },
        { 
            title: "Bins en Proceso (Hidro)", 
            value: inProcess, 
            icon: Boxes,
            borderColor: "border-l-4 border-l-emerald-500",
            iconBg: "bg-emerald-500/10 text-emerald-600"
        },
        { 
            title: "Pend. por Almacenar en Cámara", 
            value: pendingStorage, 
            icon: PackageCheck,
            borderColor: "border-l-4 border-l-purple-500",
            iconBg: "bg-purple-500/10 text-purple-600"
        },
        { 
            title: "Bins Vacíos (Stock Cereza)", 
            value: totalEmptyBins, 
            icon: Archive,
            borderColor: "border-l-4 border-l-zinc-400",
            iconBg: "bg-zinc-400/10 text-zinc-600"
        },
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
                                    {dateRange?.from && !isNaN(safeToDate(dateRange.from).getTime()) ? (
                                    dateRange.to && !isNaN(safeToDate(dateRange.to).getTime()) ? (
                                        <>
                                        {safeFormatDate(dateRange.from, "LLL dd, y")} -{" "}
                                        {safeFormatDate(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        safeFormatDate(dateRange.from, "LLL dd, y")
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

    if (selectedClient?.name === 'FALL CREEK' && fallCreekDashboardData) {
        return (
             <div className="space-y-6">
                {renderDashboardHeader()}
                <FallCreekExecutiveView dashboardData={fallCreekDashboardData} clientName={selectedClient.name} />
             </div>
        )
    }

    return (
        <div className="space-y-6">
            {renderDashboardHeader()}

            {/* SECCIÓN 1: GESTIÓN DE ARRIENDOS (FÑO) */}
            {(!selectedClient || selectedClient.id === 'EXP005') && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                        <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">Gestión de Arriendos de Bins (FÑO)</h3>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        {/* Bins para Arriendo KPIs */}
                        <div className="md:col-span-1 flex flex-col gap-4">
                            {activeKpiCards.slice(1).map(kpi => (
                                <Card key={kpi.title} className={cn("bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg hover:scale-[1.02] relative overflow-hidden group flex-1 flex flex-col justify-center", kpi.borderColor)}>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{kpi.title}</CardTitle>
                                        <div className={cn("p-2 rounded-xl transition-all duration-300 group-hover:scale-110", kpi.iconBg)}>
                                            <kpi.icon className="h-4 w-4" />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        {loading ? (
                                            <Skeleton className="h-8 w-1/2" />
                                        ) : (
                                            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#004b8d] dark:text-[#5fa2dd]">
                                                {kpi.value.toLocaleString('es-CL')}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Detalle de Arrendatarios */}
                        <Card className="md:col-span-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold text-[#004b8d]">Detalle de Bins Arrendados por Arrendatario</CardTitle>
                                <CardDescription>Consolidado de bins vacíos de arriendo en posesión externa de los clientes.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[180px]">
                                    <div className="rounded-xl border overflow-hidden">
                                        <Table>
                                            <TableHeader className="bg-muted/40">
                                                <TableRow>
                                                    <TableHead className="font-bold text-xs uppercase">Cliente / Arrendatario</TableHead>
                                                    <TableHead className="font-bold text-xs uppercase">RUT</TableHead>
                                                    <TableHead className="font-bold text-xs uppercase text-right">Bins Arrendados</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {loading ? (
                                                    Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={3}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                                ) : leasedBinsData.length > 0 ? (
                                                    leasedBinsData.map(item => (
                                                        <TableRow key={item.id} className="hover:bg-muted/30">
                                                            <TableCell className="text-xs font-semibold">{item.producerName}</TableCell>
                                                            <TableCell className="text-xs font-mono text-muted-foreground">{item.rut}</TableCell>
                                                            <TableCell className="text-xs font-bold text-[#004b8d] text-right">{item.quantity.toLocaleString('es-CL')}</TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="h-24 text-center text-xs text-muted-foreground">No hay arriendos de bins activos en este momento.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* SECCIÓN 2: CONTROL DE FRUTA EN PLANTA */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">Control de Fruta y Temperaturas en Planta</h3>
                </div>

                <div className="grid gap-6 md:grid-cols-4">
                    {/* KPI Total Bins en Cámara (Fruta) */}
                    <div className="md:col-span-1 h-full">
                        {activeKpiCards.slice(0, 1).map(kpi => (
                            <Card key={kpi.title} className={cn("bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg hover:scale-[1.02] relative overflow-hidden group h-full flex flex-col justify-center", kpi.borderColor)}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{kpi.title}</CardTitle>
                                    <div className={cn("p-2 rounded-xl transition-all duration-300 group-hover:scale-110", kpi.iconBg)}>
                                        <kpi.icon className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-2">
                                    {loading ? (
                                        <Skeleton className="h-8 w-1/2" />
                                    ) : (
                                        <div className="text-3xl md:text-4xl font-extrabold tracking-tight text-green-600 dark:text-green-400">
                                            {kpi.value.toLocaleString('es-CL')}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Chambers Grid */}
                    <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {Object.values(chambersConfig).map(chamber => {
                            const latestTemp = latestTemperatures[chamber.id];
                            const temp = latestTemp?.temperature;
                            const hasTemp = temp !== undefined && temp !== null;
                            
                            let dotColor = "bg-zinc-300 dark:bg-zinc-700";
                            let dotPing = "bg-zinc-300 dark:bg-zinc-700";
                            let tempClass = "text-muted-foreground";

                            if (hasTemp) {
                                if (temp <= 4.0) {
                                    dotColor = "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]";
                                    dotPing = "bg-sky-400";
                                    tempClass = "text-[#004b8d] dark:text-sky-400";
                                } else if (temp <= 8.0) {
                                    dotColor = "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
                                    dotPing = "bg-amber-400";
                                    tempClass = "text-amber-600 dark:text-amber-400";
                                } else {
                                    dotColor = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
                                    dotPing = "bg-red-400";
                                    tempClass = "text-red-600 dark:text-red-400";
                                }
                            }

                            return (
                                <Card key={chamber.id} className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{chamber.name}</CardTitle>
                                        <div className="relative flex h-2 w-2">
                                            {hasTemp && (
                                                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", dotPing)}></span>
                                            )}
                                            <span className={cn("relative inline-flex rounded-full h-2 w-2", dotColor)}></span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        {loading ? (
                                            <Skeleton className="h-8 w-3/4" />
                                        ) : (
                                            <div className="flex flex-col">
                                                <span className={cn("text-base font-extrabold tracking-tight", tempClass)}>
                                                    {hasTemp ? `${temp.toFixed(1)}°C` : '--.-°C'}
                                                </span>
                                                <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                                                    Hum: {latestTemp && latestTemp.humidity !== undefined ? `${latestTemp.humidity}%` : '--%'}
                                                </span>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* SECCIÓN 3: PROCESO CEREZAS (FUERA DE TEMPORADA) */}
            <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300">
                <button
                    onClick={() => setIsCherrySectionOpen(!isCherrySectionOpen)}
                    className="w-full flex items-center justify-between p-4 font-bold text-xs text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
                >
                    <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-[#004b8d]" />
                        <span>Proceso Cerezas (Fuera de Temporada)</span>
                    </div>
                    {isCherrySectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {isCherrySectionOpen && (
                    <CardContent className="pb-4 pt-0 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-2">
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 pt-4">
                            {cherryKpiCards.map(kpi => (
                                <Card key={kpi.title} className={cn("bg-white/40 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm rounded-xl transition-all duration-300 hover:shadow-md relative overflow-hidden group", kpi.borderColor)}>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                                        <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.title}</CardTitle>
                                        <div className={cn("p-1.5 rounded-lg transition-all duration-300 group-hover:scale-110", kpi.iconBg)}>
                                            <kpi.icon className="h-3 w-3" />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-1">
                                        {loading ? (
                                            <Skeleton className="h-6 w-1/2" />
                                        ) : (
                                            <div className="text-lg font-extrabold tracking-tight text-zinc-600 dark:text-zinc-400">
                                                {kpi.value.toLocaleString('es-CL')}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </CardContent>
                )}
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-[#004b8d]">Kilos Netos Recepcionados por Exportador</CardTitle>
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
                                <defs>
                                    <linearGradient id="kilosGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#7aba28" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#7aba28" stopOpacity={0.85} />
                                    </linearGradient>
                                </defs>
                                <XAxis type="number" dataKey="kilos" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} className="text-[10px] font-semibold text-muted-foreground" />
                                <ChartTooltip content={<ChartTooltipContent className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-md rounded-xl" />} />
                                <Bar dataKey="kilos" layout="vertical" radius={[0, 6, 6, 0]} fill="url(#kilosGradient)">
                                    <LabelList 
                                        dataKey="kilos" 
                                        position="right" 
                                        offset={8} 
                                        className="fill-foreground font-bold text-xs"
                                        formatter={(value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 0 })} Kg.`}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                        ) : (
                             <div className="flex justify-center items-center h-[250px]">
                                <p className="text-muted-foreground text-sm">No hay datos de recepción para mostrar.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-[#004b8d]">Ocupación por Cámara</CardTitle>
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
                           <BarChart data={occupancyByChamber} layout="vertical" margin={{ left: 20, right: 120 }}>
                                <defs>
                                    <linearGradient id="generalOccupancyGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#004b8d" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#004b8d" stopOpacity={0.85} />
                                    </linearGradient>
                                </defs>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} className="text-[10px] font-semibold text-muted-foreground" />
                                <ChartTooltip 
                                    formatter={(value, name, props) => {
                                        const { payload } = props;
                                        if (!payload) return [`${value}`, name];
                                        return [`${value} / ${payload.total} Bins`, name];
                                    }}
                                    content={<ChartTooltipContent className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-md rounded-xl" />} 
                                />
                                <Bar dataKey="ocupacion" layout="vertical" radius={[0, 6, 6, 0]} fill="url(#generalOccupancyGradient)">
                                     <LabelList
                                        dataKey="percentage"
                                        position="right"
                                        offset={8}
                                        className="fill-foreground font-bold text-xs"
                                        formatter={(value: number) => `${value.toFixed(1)}%`}
                                    />
                                    <LabelList 
                                        dataKey="ocupacion"
                                        position="insideLeft"
                                        offset={8}
                                        className="fill-white font-bold text-[9px]"
                                        formatter={(value: number) => value > 0 ? `${value.toLocaleString('es-CL')} BINS` : ''}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
            
             <Card className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-md rounded-2xl transition-all duration-300 hover:shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-[#004b8d]">Últimos Lotes Ingresados (Recepción)</CardTitle>
                    <CardDescription>Resumen de los ingresos de fruta más recientes a la planta.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="md:hidden space-y-3">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
                        ) : (latestReceptions || []).length > 0 ? (
                            latestReceptions.map(lot => (
                                <Card key={lot.id} className="p-4 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm rounded-xl">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-sm font-bold">{lot.displayLotId}</CardTitle>
                                            <CardDescription className="text-xs">{lot.producerId} / {lot.variety}</CardDescription>
                                        </div>
                                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full">{lot.status}</Badge>
                                    </div>
                                    <div className="mt-3 text-xs grid grid-cols-2 gap-x-4 text-muted-foreground">
                                         <p><strong>Fecha:</strong> {formatLocaleDate(lot.createdAt)}</p>
                                        <p><strong>Bins:</strong> {lot.binCount}</p>
                                    </div>
                                </Card>
                            ))
                        ) : (
                            <div className="h-24 text-center flex items-center justify-center text-xs text-muted-foreground">
                                <p>No hay registros de recepción recientes.</p>
                            </div>
                        )}
                    </div>
                    <div className="hidden md:block rounded-xl border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/40">
                                <TableRow>
                                    <TableHead className="font-bold text-xs uppercase">Fecha y Hora</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">ID Lote</TableHead>
                                    <TableHead className="hidden sm:table-cell font-bold text-xs uppercase">Productor</TableHead>
                                    <TableHead className="hidden md:table-cell font-bold text-xs uppercase">Variedad</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">N° Bins</TableHead>
                                    <TableHead className="font-bold text-xs uppercase">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : latestReceptions.length > 0 ? (
                                    latestReceptions.map(lot => (
                                        <TableRow key={lot.id} className="hover:bg-muted/30">
                                             <TableCell className="text-xs">{formatLocaleDate(lot.createdAt)}</TableCell>
                                             <TableCell className="font-mono text-xs font-semibold">{lot.displayLotId}</TableCell>
                                            <TableCell className="hidden sm:table-cell text-xs">{lot.producerId}</TableCell>
                                            <TableCell className="hidden md:table-cell text-xs">{lot.variety}</TableCell>
                                            <TableCell className="text-xs font-semibold">{lot.binCount}</TableCell>
                                            <TableCell><Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full">{lot.status}</Badge></TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
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