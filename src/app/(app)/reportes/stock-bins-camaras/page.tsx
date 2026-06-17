'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberLot, OtherFruitReception } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { chambersConfig } from '@/lib/chambers-config';
import { Box, Warehouse, Users, Search } from 'lucide-react';

function convertToCSV(data: any[], headers: { key: string; label: string }[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            const value = row[header.key];
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

export default function StockBinsCamarasPage() {
    const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: otherReceptions, loading: loadingOtherReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');

    const [chamberFilter, setChamberFilter] = React.useState('all');
    const [clientFilter, setClientFilter] = React.useState('all');
    const [searchQuery, setSearchQuery] = React.useState('');

    const loading = loadingChamberLots || loadingOtherReceptions;

    // Unificar los datos de stock físico de las dos fuentes de datos
    const stockData = React.useMemo(() => {
        if (loading) return [];

        const list: Array<{
            id: string;
            name: string;
            quantity: number;
            chamberId: string;
            chamberName: string;
        }> = [];

        // 1. Agregar lotes de cerezas de productores en cámaras
        (chamberLots || []).forEach(lot => {
            if (lot.status === 'Almacenado' && lot.chamberId && lot.coordinate && lot.binCount > 0) {
                list.push({
                    id: `cherry-${lot.id}`,
                    name: lot.producerShortName || 'Sin Productor',
                    quantity: Number(lot.binCount) || 0,
                    chamberId: lot.chamberId,
                    chamberName: chambersConfig[lot.chamberId]?.name || lot.chamberId,
                });
            }
        });

        // 2. Agregar recepciones de otros clientes en cámaras
        (otherReceptions || []).forEach(reception => {
            (reception.items || []).forEach((item, index) => {
                if (item.status === 'Almacenado' && item.storageLocation?.chamberId && item.storageLocation?.coordinate && item.quantity > 0) {
                    list.push({
                        id: `other-${reception.id}-${index}`,
                        name: reception.clientName || 'Sin Cliente',
                        quantity: Number(item.quantity) || 0,
                        chamberId: item.storageLocation.chamberId,
                        chamberName: chambersConfig[item.storageLocation.chamberId]?.name || item.storageLocation.chamberId,
                    });
                }
            });
        });

        return list;
    }, [chamberLots, otherReceptions, loading]);

    // Consolidar cantidades sumando bins por combinación única de (Nombre, Cámara)
    const consolidatedData = React.useMemo(() => {
        const aggregation: Record<string, {
            name: string;
            quantity: number;
            chamberId: string;
            chamberName: string;
        }> = {};

        stockData.forEach(item => {
            const key = `${item.name.toUpperCase()}_${item.chamberId.toUpperCase()}`;
            if (!aggregation[key]) {
                aggregation[key] = {
                    name: item.name,
                    quantity: 0,
                    chamberId: item.chamberId,
                    chamberName: item.chamberName,
                };
            }
            aggregation[key].quantity += item.quantity;
        });

        return Object.values(aggregation).sort((a, b) => 
            a.name.localeCompare(b.name) || a.chamberName.localeCompare(b.chamberName)
        );
    }, [stockData]);

    // Opciones para filtros basadas en los datos consolidados
    const chamberOptions = React.useMemo(() => {
        const ids = [...new Set(consolidatedData.map(item => item.chamberId))];
        return ids.map(id => ({
            id,
            name: chambersConfig[id]?.name || id
        })).sort((a, b) => a.name.localeCompare(b.name));
    }, [consolidatedData]);

    const clientOptions = React.useMemo(() => {
        return [...new Set(consolidatedData.map(item => item.name))].sort();
    }, [consolidatedData]);

    // Filtrar los datos en base a las opciones seleccionadas
    const filteredData = React.useMemo(() => {
        return consolidatedData.filter(item => {
            const matchesChamber = chamberFilter === 'all' || item.chamberId === chamberFilter;
            const matchesClient = clientFilter === 'all' || item.name === clientFilter;
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesChamber && matchesClient && matchesSearch;
        });
    }, [consolidatedData, chamberFilter, clientFilter, searchQuery]);

    // Restablecer filtros si los datos cambian y la selección actual ya no existe
    React.useEffect(() => {
        if (clientFilter !== 'all' && !clientOptions.includes(clientFilter)) {
            setClientFilter('all');
        }
    }, [clientFilter, clientOptions]);

    React.useEffect(() => {
        const chamberIds = chamberOptions.map(o => o.id);
        if (chamberFilter !== 'all' && !chamberIds.includes(chamberFilter)) {
            setChamberFilter('all');
        }
    }, [chamberFilter, chamberOptions]);

    // Métricas del resumen ejecutivo
    const metrics = React.useMemo(() => {
        const totalBins = filteredData.reduce((sum, item) => sum + item.quantity, 0);
        const uniqueClients = new Set(filteredData.map(item => item.name)).size;
        const occupiedChambers = new Set(filteredData.map(item => item.chamberId)).size;
        return { totalBins, uniqueClients, occupiedChambers };
    }, [filteredData]);

    const handleExport = () => {
        const headers = [
            { key: 'name', label: 'Nombre' },
            { key: 'quantity', label: 'Cantidad de Bins' },
            { key: 'chamberName', label: 'Cámara' }
        ];
        const csv = convertToCSV(filteredData, headers);
        downloadCSV(csv, 'stock_bins_en_camaras.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Stock Bins en Cámaras"
                description="Resumen de bins almacenados en cámaras frigoríficas agrupado por Cliente/Productor y Cámara."
                onExport={handleExport}
                isExportDisabled={loading || filteredData.length === 0}
            >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buscador</label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar Cliente/Productor..."
                                className="pl-9 bg-background w-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cliente / Productor</label>
                        <Select onValueChange={setClientFilter} value={clientFilter}>
                            <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Todos" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los dueños</SelectItem>
                                {clientOptions.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cámara</label>
                        <Select onValueChange={setChamberFilter} value={chamberFilter}>
                            <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Todas" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las cámaras</SelectItem>
                                {chamberOptions.map(chamber => <SelectItem key={chamber.id} value={chamber.id}>{chamber.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </ReportHeader>

            {/* Tarjetas de Resumen Ejecutivo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total de Bins</CardTitle>
                        <Box className="h-5 w-5 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{metrics.totalBins} Bins</div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Suma del stock actual filtrado</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Clientes / Productores</CardTitle>
                        <Users className="h-5 w-5 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{metrics.uniqueClients}</div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Con inventario activo en las cámaras</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Cámaras con Ocupación</CardTitle>
                        <Warehouse className="h-5 w-5 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{metrics.occupiedChambers} de 6</div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Cámaras frías con bins almacenados</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="font-bold">Nombre (Cliente / Productor)</TableHead>
                                    <TableHead className="font-bold text-center w-[200px]">Cantidad de Bins</TableHead>
                                    <TableHead className="font-bold w-[300px]">Cámara</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                            <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredData.length > 0 ? (
                                    <>
                                        {filteredData.map((item, idx) => (
                                            <TableRow key={idx} className="hover:bg-muted/10">
                                                <TableCell className="font-medium text-foreground py-3.5">{item.name}</TableCell>
                                                <TableCell className="text-center font-bold text-sm text-primary py-3.5">{item.quantity}</TableCell>
                                                <TableCell className="font-medium text-muted-foreground py-3.5">{item.chamberName}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-muted/50 font-bold hover:bg-muted/50">
                                            <TableCell className="text-right uppercase tracking-wider text-xs font-bold text-muted-foreground">Total General</TableCell>
                                            <TableCell className="text-center text-sm font-extrabold text-foreground">{metrics.totalBins}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground font-normal">Bins distribuidos en {metrics.occupiedChambers} cámaras</TableCell>
                                        </TableRow>
                                    </>
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                                            No se encontraron registros de stock en cámaras que coincidan con los filtros aplicados.
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
