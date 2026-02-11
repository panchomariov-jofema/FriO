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
import type { ChamberLot, Dispatch, Exporter, ProcessingLot, ReceptionLot, BinMaterialStock, OtherFruitReception, Profile, UserMaster, HidrocoolerLot, OtherClient, ChamberTemperature, OtherFruitMovement } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend, LabelList } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { chambersConfig } from '@/lib/chambers-config';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Boxes, PackageCheck, Truck, Warehouse, Archive, ChevronsLeft, Waves, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
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
             <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle>Resumen Ejecutivo: {clientName}</CardTitle>
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
        quantity: { label: "Cantidad", color: "hsl(var(--chart-1))" },
    };
    const occupancyChartConfig: ChartConfig = {
        ocupacion: { label: "Bins Equivalentes", color: "hsl(var(--chart-2))" },
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Resumen de Stock en Cámara</CardTitle>
                    <CardDescription>Detalle de lotes del cliente actualmente almacenados.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-72">
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha Recepción</TableHead>
                                        <TableHead>Lote</TableHead>
                                        <TableHead>Cantidad</TableHead>
                                        <TableHead>Cámara</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summaryData && summaryData.length > 0 ? summaryData.map((item: any) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.receptionDate?.toDate().toLocaleDateString('es-CL')}</TableCell>
                                            <TableCell className="font-mono">{item.lot}</TableCell>
                                            <TableCell>{item.quantity} {item.unit}</TableCell>
                                            <TableCell>{item.chamber}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">No hay stock en cámara.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Cantidad por Producto</CardTitle>
                        <CardDescription>Total de Bins/Pallets por cada tipo de producto en stock.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={productChartConfig} className="h-[250px] w-full">
                           <BarChart data={charts.quantityByProduct} layout="vertical" margin={{ right: 80, left: 20 }}>
                                <XAxis type="number" dataKey="quantity" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="quantity" layout="vertical" radius={5} fill="var(--color-quantity)">
                                    <LabelList 
                                        dataKey="quantity" 
                                        position="right" 
                                        offset={8} 
                                        className="fill-foreground font-semibold"
                                        formatter={(value: number) => value.toLocaleString('es-CL')}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Ocupación por Cámara</CardTitle>
                        <CardDescription>Capacidad utilizada en cada cámara para {clientName}.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={occupancyChartConfig} className="h-[250px] w-full">
                           <BarChart data={charts.occupancyByChamber} layout="vertical" margin={{ left: 20, right: 120 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} />
                                <ChartTooltip formatter={(value, name, props) => [`${value} Bins Equiv.`, name]} content={<ChartTooltipContent />} />
                                <Bar dataKey="ocupacion" layout="vertical" radius={5} fill="var(--color-ocupacion)">
                                     <LabelList
                                        dataKey="percentage"
                                        position="right"
                                        offset={8}
                                        className="fill-foreground font-semibold"
                                        formatter={(value: number) => `${value.toFixed(1)}%`}
                                    />
                                    <LabelList 
                                        dataKey="ocupacion"
                                        position="insideLeft"
                                        offset={8}
                                        className="fill-primary-foreground font-bold"
                                        formatter={(value: number) => value > 0 ? `${value.toLocaleString('es-CL')}` : ''}
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                        <CardTitle>Reporte de Despachos</CardTitle>
                    </div>
                     <Button onClick={handleExport} variant="outline" size="sm" disabled={dispatchReportData.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Exportar
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha Despacho</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Lotes Cliente</TableHead>
                                    <TableHead>Productos</TableHead>
                                    <TableHead>Cantidad Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dispatchReportData && dispatchReportData.length > 0 ? (
                                    dispatchReportData.map((dispatch: any) => (
                                    <TableRow key={dispatch.id}>
                                        <TableCell>{dispatch.dispatchDate?.toDate().toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="font-mono">{dispatch.document}</TableCell>
                                        <TableCell className="font-mono">{dispatch.clientLotIds}</TableCell>
                                        <TableCell>{dispatch.productNames}</TableCell>
                                        <TableCell className="font-semibold">{dispatch.totalQuantity} {dispatch.unit}</TableCell>
                                    </TableRow>
                                ))) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">No hay despachos registrados para este cliente.</TableCell>
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

    const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
    const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: otherClients, loading: loadingOtherClients } = useFirestoreCollection<OtherClient>('otherClients');
    const { data: binMaterialStock, loading: loadingBinStock } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');
    
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
        // This is a compromise: we filter by `storedAt` for some calcs, but still need all stored lots for total occupancy.
        // A better approach might be a separate query for occupancy, but for now we fetch a wider range.
        return query(collRef);
    }, [firestore]);


    const { data: chamberLots, loading: loadingChamber } = useCollection<ChamberLot>(chamberLotsQuery);
    const { data: otherFruitReceptions, loading: loadingOtherFruit } = useCollection<OtherFruitReception>(createDateFilteredQuery('otherFruitReceptions', 'createdAt'));
    const { data: otherFruitMovements, loading: loadingOtherFruitMovements } = useCollection<OtherFruitMovement>(createDateFilteredQuery('otherFruitMovements', 'createdAt'));
    const { data: processingLots, loading: loadingProcessing } = useCollection<ProcessingLot>(createDateFilteredQuery('processingLots', 'createdAt'));
    const { data: dispatches, loading: loadingDispatches } = useCollection<Dispatch>(createDateFilteredQuery('dispatches', 'createdAt'));
    const { data: receptionLots, loading: loadingReception } = useCollection<ReceptionLot>(createDateFilteredQuery('receptionLots', 'createdAt'));
    const { data: hidrocoolerLots, loading: loadingHidroLots } = useCollection<HidrocoolerLot>(createDateFilteredQuery('hidrocoolerLots', 'receptionDate'));
    
    React.useEffect(() => {
        if (!firestore) return;
        const q = query(collection(firestore, 'chamberTemperatures'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const temps = snapshot.docs.map(doc => ({...doc.data(), id: doc.id} as ChamberTemperature));
            
            const newLatestTemps = temps.reduce((acc, temp) => {
                if (!acc[temp.chamberId] || (temp.timestamp?.toMillis() ?? 0) > (acc[temp.chamberId]!.timestamp?.toMillis() ?? 0)) {
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

        return [...exporterOptions, ...clientOptions].sort((a, b) => a.label.localeCompare(b.label));
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
            .flatMap(r => r.items.map(item => ({ ...item, unit: r.unit })))
            .filter(item => item.status === 'Almacenado' && item.quantity > 0);

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
            .flatMap(r => r.items.map(item => ({...item, unit: r.unit})))
            .filter(item => item.status === 'Pendiente de almacenar')
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
                    .flatMap(r => r.items.map(item => ({ ...item, unit: r.unit })))
                    .filter(item => item.status === 'Almacenado' && item.storageLocation?.chamberId === chamberId);
            
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
            reception.items
                .filter(item => item.status === 'Almacenado' && item.storageLocation?.chamberId && item.quantity > 0)
                .map((item, index) => ({
                    receptionDate: reception.createdAt,
                    lot: item.clientLotId || reception.displayLotId || 'N/A',
                    quantity: item.quantity,
                    unit: reception.unit,
                    chamber: chambersConfig[item.storageLocation!.chamberId]?.name || item.storageLocation!.chamberId,
                }))
        );

        const groupedSummary = summaryItems.reduce((acc, item) => {
            const dateString = item.receptionDate?.toDate().toLocaleDateString('es-CL');
            const key = `${dateString}-${item.lot}-${item.chamber}`;
            
            if (!acc[key]) {
                acc[key] = {
                    id: key,
                    receptionDate: item.receptionDate,
                    lot: item.lot,
                    quantity: 0,
                    unit: item.unit,
                    chamber: item.chamber,
                };
            }
            
            acc[key].quantity += item.quantity;
            
            return acc;
        }, {} as Record<string, { id: string, receptionDate: any, lot: string, quantity: number, unit: string, chamber: string }>);

        const summaryTableData = Object.values(groupedSummary)
            .sort((a, b) => (b.receptionDate?.toMillis() ?? 0) - (a.receptionDate?.toMillis() ?? 0));


        const quantityByProduct: Record<string, {name: string, quantity: number, unit: 'Bins' | 'Pallets'}> = {};
        const occupancyByChamber: Record<string, { name: string; ocupacion: number; total: number; percentage: number; }> = {};


        clientReceptions.forEach(reception => {
            reception.items.forEach(item => {
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
            .sort((a,b) => b.dispatchDate.toMillis() - a.dispatchDate.toMillis());


        return {
            summaryData: summaryTableData,
            charts: {
                quantityByProduct: Object.values(quantityByProduct),
                occupancyByChamber: Object.values(occupancyByChamber),
            },
            dispatchReportData,
        };
    }, [selectedClient, otherFruitReceptions, otherFruitMovements]);


    const loading = loadingChamber || loadingOtherFruit || loadingProcessing || loadingDispatches || loadingExporters || loadingReception || loadingBinStock || loadingUsers || loadingProfiles || loadingHidroLots || loadingOtherClients || loadingOtherFruitMovements;

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

            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
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
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Object.values(chambersConfig).map(chamber => {
                    const latestTemp = latestTemperatures[chamber.id];
                    return (
                        <Card key={chamber.id}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{chamber.name}</CardTitle>
                                <Thermometer className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <Skeleton className="h-8 w-3/4" />
                                ) : (
                                    <div className="text-xl font-bold">
                                        {latestTemp ? `${latestTemp.temperature.toFixed(1)}°C` : '--.-°C'}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
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
                           <BarChart data={occupancyByChamber} layout="vertical" margin={{ left: 20, right: 120 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={80} />
                                <ChartTooltip 
                                    formatter={(value, name, props) => {
                                        const { payload } = props;
                                        if (!payload) return [`${value}`, name];
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
                                    <LabelList 
                                        dataKey="ocupacion"
                                        position="insideLeft"
                                        offset={8}
                                        className="fill-primary-foreground font-bold"
                                        formatter={(value: number) => value > 0 ? `${value.toLocaleString('es-CL')} BINS` : ''}
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
                    <div className="md:hidden space-y-3">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
                        ) : (latestReceptions || []).length > 0 ? (
                            latestReceptions.map(lot => (
                                <Card key={lot.id} className="p-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg">{lot.displayLotId}</CardTitle>
                                            <CardDescription>{lot.producerId} / {lot.variety}</CardDescription>
                                        </div>
                                        <Badge variant="secondary">{lot.status}</Badge>
                                    </div>
                                    <div className="mt-2 text-sm grid grid-cols-2 gap-x-4">
                                        <p><strong>Fecha:</strong> {lot.createdAt?.toDate().toLocaleString()}</p>
                                        <p><strong>Bins:</strong> {lot.binCount}</p>
                                    </div>
                                </Card>
                            ))
                        ) : (
                            <div className="h-24 text-center flex items-center justify-center">
                                <p>No hay registros de recepción recientes.</p>
                            </div>
                        )}
                    </div>
                    <div className="hidden md:block rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha y Hora</TableHead>
                                    <TableHead>ID Lote</TableHead>
                                    <TableHead className="hidden sm:table-cell">Productor</TableHead>
                                    <TableHead className="hidden md:table-cell">Variedad</TableHead>
                                    <TableHead>N° Bins</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : (latestReceptions || []).length > 0 ? (
                                    latestReceptions.map(lot => (
                                        <TableRow key={lot.id}>
                                            <TableCell>{lot.createdAt?.toDate().toLocaleString()}</TableCell>
                                            <TableCell className="font-mono">{lot.displayLotId}</TableCell>
                                            <TableCell className="hidden sm:table-cell">{lot.producerId}</TableCell>
                                            <TableCell className="hidden md:table-cell">{lot.variety}</TableCell>
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
