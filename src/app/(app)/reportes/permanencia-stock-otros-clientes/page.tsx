'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception, OtherClient, PackagingMovement } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { differenceInDays } from 'date-fns';
import { safeToDate, safeFormatDate } from '@/lib/utils';
import { isVitafood } from '@/lib/clients';
import { Search, Warehouse, Package, Truck, Clock } from 'lucide-react';

interface PermanenceRow {
    id: string;
    palletId: string;
    cliente: string;
    clientId?: string;
    estado: 'Almacenado' | 'Despachado';
    ubicacion: string;
    documentoEntrada: string;
    documentoSalida: string;
    loteCliente: string;
    codProducto: string;
    nombreProducto: string;
    cantidad: string;
    fechaRecepcion: Date | null;
    fechaSalida: Date | null;
    diasPermanencia: number;
    isCurrentlyStored: boolean;
}

function formatLocation(loc: any): string {
    if (!loc) return '—';
    if (loc.warehouse && loc.aisle) {
        return `${loc.warehouse} / ${loc.aisle}`;
    }
    if (loc.chamberId && loc.coordinate) {
        return `${loc.chamberId} - ${loc.coordinate}`;
    }
    if (loc.coordinate) {
        return String(loc.coordinate);
    }
    if (loc.warehouse) {
        return String(loc.warehouse);
    }
    if (loc.chamberId) {
        return String(loc.chamberId);
    }
    return '—';
}

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
    const { data: packagingMovements, loading: loadingPkgMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');
    const { data: clients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');

    const [selectedClient, setSelectedClient] = React.useState<string>('all');
    const [selectedStatus, setSelectedStatus] = React.useState<string>('all');
    const [searchTerm, setSearchTerm] = React.useState<string>('');

    const loading = loadingMovements || loadingReceptions || loadingPkgMovements || loadingClients;

    // Map UMPs to dispatch movement data (for Vitafood outputs)
    const umpDispatchMap = React.useMemo(() => {
        const map = new Map<string, { date: Date; document: string }>();
        (packagingMovements || []).forEach(pm => {
            if (pm.type === 'salida') {
                const date = pm.createdAt ? safeToDate(pm.createdAt) : null;
                const doc = pm.document || (pm as any).dispatchDocument || 'S/N';
                if (pm.rawUmps && Array.isArray(pm.rawUmps)) {
                    pm.rawUmps.forEach(ump => {
                        const clean = String(ump).trim();
                        if (clean && date) {
                            map.set(clean, { date, document: doc });
                        }
                    });
                }
            }
        });
        return map;
    }, [packagingMovements]);

    // Build unified permanence dataset
    const reportData = React.useMemo(() => {
        if (loading) return [];

        const data: PermanenceRow[] = [];
        const now = new Date();
        const receptionMap = new Map((receptions || []).map(r => [r.id, r]));

        // 1. Process items from otherFruitReceptions (Vitafood UMPs and client pallets/bins)
        (receptions || []).forEach(reception => {
            const clientName = reception.clientName || 'Cliente';
            const clientId = reception.clientId;
            const docEntrada = reception.documentNumber || reception.document || 'S/N';
            const isVita = isVitafood(clientName) || isVitafood(clientId);

            (reception.items || []).forEach((item, index) => {
                // Ignore items that never reached warehouse storage
                if (item.status === 'No Recepcionado' || item.status === 'Pendiente de recibir') {
                    return;
                }

                const fechaIngreso = safeToDate(item.storedAt || item.receivedAt || reception.createdAt);
                if (isNaN(fechaIngreso.getTime())) return;

                const palletId = String(item.palletId || item.containerId || '').trim();
                const ubicacion = formatLocation(item.storageLocation);

                if (item.status === 'Despachado') {
                    // Item dispatched
                    let fechaSalida: Date;
                    let docSalida = (reception as any).lastDispatchDocument || (reception as any).dispatchDocument || 'S/N';

                    if (isVita && palletId && umpDispatchMap.has(palletId)) {
                        const dispatchInfo = umpDispatchMap.get(palletId)!;
                        fechaSalida = dispatchInfo.date;
                        if (dispatchInfo.document) docSalida = dispatchInfo.document;
                    } else {
                        fechaSalida = safeToDate((item as any).dispatchedAt || (reception as any).updatedAt || item.storedAt || reception.createdAt);
                    }

                    if (isNaN(fechaSalida.getTime())) {
                        fechaSalida = now;
                    }

                    const diasPermanencia = Math.max(0, differenceInDays(fechaSalida, fechaIngreso));

                    data.push({
                        id: `${reception.id}-${index}-despachado`,
                        palletId: palletId || `ITEM-${index + 1}`,
                        cliente: clientName,
                        clientId,
                        estado: 'Despachado',
                        ubicacion,
                        documentoEntrada: docEntrada,
                        documentoSalida: docSalida,
                        loteCliente: item.clientLotId || '—',
                        codProducto: item.productCode || '—',
                        nombreProducto: item.productName || 'Producto',
                        cantidad: `${item.quantity || 1} ${reception.unit || (isVita ? 'Pallet' : 'Unid.')}`,
                        fechaRecepcion: fechaIngreso,
                        fechaSalida,
                        diasPermanencia,
                        isCurrentlyStored: false,
                    });
                } else if (item.status === 'Almacenado' || item.status === 'Pendiente de almacenar' || item.status === 'Recibido') {
                    // Currently stored in facilities
                    const diasPermanencia = Math.max(0, differenceInDays(now, fechaIngreso));

                    data.push({
                        id: `${reception.id}-${index}-almacenado`,
                        palletId: palletId || `ITEM-${index + 1}`,
                        cliente: clientName,
                        clientId,
                        estado: 'Almacenado',
                        ubicacion,
                        documentoEntrada: docEntrada,
                        documentoSalida: '—',
                        loteCliente: item.clientLotId || '—',
                        codProducto: item.productCode || '—',
                        nombreProducto: item.productName || 'Producto',
                        cantidad: `${item.quantity || 1} ${reception.unit || (isVita ? 'Pallet' : 'Unid.')}`,
                        fechaRecepcion: fechaIngreso,
                        fechaSalida: now,
                        diasPermanencia,
                        isCurrentlyStored: true,
                    });
                }
            });
        });

        // 2. Process dispatched movements from otherFruitMovements (for other commercial clients)
        (movements || []).forEach(movement => {
            if (movement.type === 'salida' && movement.status === 'Completado' && movement.locations) {
                // If movement belongs to Vitafood, skip to avoid double counting with UMP dispatch map
                if (isVitafood(movement.clientName) || isVitafood((movement as any).clientId)) {
                    return;
                }

                movement.locations.forEach((loc, index) => {
                    const reception = receptionMap.get(loc.receptionId);
                    const fechaRecepcion = safeToDate(reception?.createdAt || (reception as any)?.storedAt);
                    const fechaSalida = safeToDate(movement.createdAt || (movement as any).dispatchDate);

                    if (!isNaN(fechaRecepcion.getTime()) && !isNaN(fechaSalida.getTime())) {
                        const diasPermanencia = Math.max(0, differenceInDays(fechaSalida, fechaRecepcion));

                        data.push({
                            id: `mov-${movement.id}-${index}`,
                            palletId: (loc as any).palletId || (loc as any).containerId || '—',
                            cliente: movement.clientName || reception?.clientName || 'Cliente',
                            clientId: (movement as any).clientId || reception?.clientId,
                            estado: 'Despachado',
                            ubicacion: formatLocation(loc.location),
                            documentoEntrada: reception?.documentNumber || reception?.document || 'S/N',
                            documentoSalida: movement.document || 'S/N',
                            loteCliente: loc.clientLotId || '—',
                            codProducto: loc.productCode || '—',
                            nombreProducto: loc.productName || 'Producto',
                            cantidad: `${loc.quantity} ${loc.unit || 'Bins'}`,
                            fechaRecepcion,
                            fechaSalida,
                            diasPermanencia,
                            isCurrentlyStored: false,
                        });
                    }
                });
            }
        });

        // Sort descending by permanence days (longest stay first)
        return data.sort((a, b) => b.diasPermanencia - a.diasPermanencia);
    }, [loading, movements, receptions, umpDispatchMap]);

    // Unique non-Vitafood client names for selector
    const clientOptions = React.useMemo(() => {
        const names = new Set<string>();

        (clients || []).forEach(c => {
            if (c.name && !isVitafood(c)) {
                names.add(c.name.trim());
            }
        });

        reportData.forEach(row => {
            if (row.cliente && !isVitafood(row.cliente)) {
                names.add(row.cliente.trim());
            }
        });

        return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
    }, [clients, reportData]);

    // Filtered data based on client, status, and search
    const filteredData = React.useMemo(() => {
        return reportData.filter(item => {
            // Client Filter
            if (selectedClient === 'VITAFOOD') {
                if (!isVitafood(item.cliente) && !isVitafood(item.clientId)) {
                    return false;
                }
            } else if (selectedClient !== 'all') {
                if (item.cliente.toUpperCase().trim() !== selectedClient.toUpperCase().trim()) {
                    return false;
                }
            }

            // Status Filter
            if (selectedStatus !== 'all' && item.estado !== selectedStatus) {
                return false;
            }

            // Text search
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchUmp = item.palletId.toLowerCase().includes(term);
                const matchDocEntrada = item.documentoEntrada.toLowerCase().includes(term);
                const matchDocSalida = item.documentoSalida.toLowerCase().includes(term);
                const matchLote = item.loteCliente.toLowerCase().includes(term);
                const matchCode = item.codProducto.toLowerCase().includes(term);
                const matchProd = item.nombreProducto.toLowerCase().includes(term);
                const matchUbic = item.ubicacion.toLowerCase().includes(term);
                const matchCli = item.cliente.toLowerCase().includes(term);

                if (!matchUmp && !matchDocEntrada && !matchDocSalida && !matchLote && !matchCode && !matchProd && !matchUbic && !matchCli) {
                    return false;
                }
            }

            return true;
        });
    }, [reportData, selectedClient, selectedStatus, searchTerm]);

    // Summary KPIs
    const kpis = React.useMemo(() => {
        const total = filteredData.length;
        const stored = filteredData.filter(r => r.estado === 'Almacenado').length;
        const dispatched = filteredData.filter(r => r.estado === 'Despachado').length;
        const totalDays = filteredData.reduce((sum, r) => sum + r.diasPermanencia, 0);
        const avgDays = total > 0 ? Math.round(totalDays / total) : 0;
        const maxDays = total > 0 ? Math.max(...filteredData.map(r => r.diasPermanencia)) : 0;

        return { total, stored, dispatched, avgDays, maxDays };
    }, [filteredData]);

    const handleExport = () => {
        if (!filteredData || filteredData.length === 0) return;
        const headers = [
            { key: 'palletId', label: 'Pallet / UMP' },
            { key: 'cliente', label: 'Cliente' },
            { key: 'estado', label: 'Estado' },
            { key: 'ubicacion', label: 'Ubicación' },
            { key: 'fechaRecepcionStr', label: 'Fecha Ingreso / Almacenamiento' },
            { key: 'fechaSalidaStr', label: 'Fecha Salida / Corte' },
            { key: 'diasPermanencia', label: 'Días de Permanencia (Arriendo)' },
            { key: 'documentoEntrada', label: 'Documento Entrada' },
            { key: 'documentoSalida', label: 'Documento Salida' },
            { key: 'loteCliente', label: 'Lote Cliente' },
            { key: 'codProducto', label: 'Cód. Producto' },
            { key: 'nombreProducto', label: 'Producto' },
            { key: 'cantidad', label: 'Cantidad' },
        ];

        const dataForExport = filteredData.map(item => ({
            ...item,
            fechaRecepcionStr: item.fechaRecepcion ? safeFormatDate(item.fechaRecepcion, 'yyyy-MM-dd HH:mm') : '',
            fechaSalidaStr: item.fechaSalida 
                ? (item.isCurrentlyStored ? `${safeFormatDate(item.fechaSalida, 'yyyy-MM-dd')} (Corte Actual)` : safeFormatDate(item.fechaSalida, 'yyyy-MM-dd HH:mm')) 
                : '',
        }));

        const csv = convertToCSV(dataForExport, headers);
        const clientSuffix = selectedClient === 'VITAFOOD' ? 'vitafood' : (selectedClient !== 'all' ? selectedClient.replace(/\s+/g, '_').toLowerCase() : 'todos');
        downloadCSV(csv, `reporte_permanencia_${clientSuffix}_${safeFormatDate(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Permanencia de Pallets y Stock (Arriendo)"
                description="Cálculo de los días que cada Pallet, UMP o contenedor permanece almacenado en las dependencias para cobro de arriendo y control de estadía."
                onExport={handleExport}
                isExportDisabled={loading || filteredData.length === 0}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border shadow-sm">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Total Ítems</p>
                                <p className="text-2xl font-bold mt-1">{loading ? '...' : kpis.total}</p>
                            </div>
                            <Package className="h-8 w-8 text-blue-500 opacity-80" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Almacenados (Activos)</p>
                                <p className="text-2xl font-bold text-emerald-600 mt-1">{loading ? '...' : kpis.stored}</p>
                            </div>
                            <Warehouse className="h-8 w-8 text-emerald-500 opacity-80" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Despachados</p>
                                <p className="text-2xl font-bold text-slate-600 mt-1">{loading ? '...' : kpis.dispatched}</p>
                            </div>
                            <Truck className="h-8 w-8 text-slate-500 opacity-80" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Promedio Días</p>
                                <p className="text-2xl font-bold text-indigo-600 mt-1">
                                    {loading ? '...' : `${kpis.avgDays} d`}
                                </p>
                            </div>
                            <Clock className="h-8 w-8 text-indigo-500 opacity-80" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters Bar */}
            <Card>
                <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por UMP, pallet, guía, lote, producto..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>

                        {/* Client / Provider Selector */}
                        <div className="w-full sm:w-[240px]">
                            <Select value={selectedClient} onValueChange={setSelectedClient}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Filtrar por Cliente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los Clientes</SelectItem>
                                    <SelectItem value="VITAFOOD" className="font-bold text-blue-600">
                                        Vitafood (Proveedor)
                                    </SelectItem>
                                    {clientOptions.map(name => (
                                        <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status Selector */}
                        <div className="w-full sm:w-[200px]">
                            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Estado de permanencia" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los estados</SelectItem>
                                    <SelectItem value="Almacenado">Actualmente Almacenados</SelectItem>
                                    <SelectItem value="Despachado">Despachados / Salidas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Pallet / UMP</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Fecha Ingreso</TableHead>
                                    <TableHead>Fecha Salida / Corte</TableHead>
                                    <TableHead>Doc. Entrada</TableHead>
                                    <TableHead>Doc. Salida</TableHead>
                                    <TableHead>Lote</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead className="text-right font-bold">Días Permanencia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={12}><Skeleton className="h-6 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredData && filteredData.length > 0 ? (
                                    filteredData.map(item => (
                                        <TableRow key={item.id} className="hover:bg-muted/50">
                                            <TableCell className="font-mono font-medium text-xs">
                                                {item.palletId}
                                            </TableCell>
                                            <TableCell>
                                                {isVitafood(item.cliente) ? (
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                        Vitafood
                                                    </Badge>
                                                ) : (
                                                    item.cliente
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {item.isCurrentlyStored ? (
                                                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px]">
                                                        Almacenado
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="text-[11px]">
                                                        Despachado
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{item.ubicacion}</TableCell>
                                            <TableCell className="text-xs">
                                                {safeFormatDate(item.fechaRecepcion, 'dd/MM/yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {item.isCurrentlyStored ? (
                                                    <span className="text-emerald-700 font-medium">
                                                        {safeFormatDate(item.fechaSalida, 'dd/MM/yyyy')} (Hoy)
                                                    </span>
                                                ) : (
                                                    safeFormatDate(item.fechaSalida, 'dd/MM/yyyy HH:mm')
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs">{item.documentoEntrada}</TableCell>
                                            <TableCell className="text-xs">{item.documentoSalida}</TableCell>
                                            <TableCell className="text-xs font-mono">{item.loteCliente}</TableCell>
                                            <TableCell className="text-xs max-w-[180px] truncate" title={item.nombreProducto}>
                                                {item.nombreProducto}
                                            </TableCell>
                                            <TableCell className="text-xs">{item.cantidad}</TableCell>
                                            <TableCell className="text-right font-bold text-sm">
                                                <span className={`inline-block px-2 py-0.5 rounded ${
                                                    item.diasPermanencia > 30 
                                                        ? 'bg-rose-100 text-rose-800' 
                                                        : item.diasPermanencia > 15 
                                                        ? 'bg-amber-100 text-amber-800' 
                                                        : 'bg-slate-100 text-slate-800'
                                                }`}>
                                                    {item.diasPermanencia} {item.diasPermanencia === 1 ? 'día' : 'días'}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={12} className="h-28 text-center text-muted-foreground">
                                            No se encontraron registros de permanencia para el filtro seleccionado.
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

