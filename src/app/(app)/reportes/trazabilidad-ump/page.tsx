'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, OtherClient } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { safeToDate, safeFormatDate } from '@/lib/utils';
import { Search, Filter, CheckCircle2, Ban, Clock, Package, Warehouse } from 'lucide-react';

interface UmpTraceRow {
    receptionId: string;
    itemIndex: number;
    clientName: string;
    document: string;
    ump: string;
    productCode: string;
    productName: string;
    lote: string;
    quantity: number;
    status: string;
    location: string;
    creationDate: Date | null;
    creationUser: string;
    eventDate: Date | null;
    eventUser: string;
}

function convertToCSV(data: any[], headers: { key: string; label: string }[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
            if (value instanceof Date) {
                value = safeFormatDate(value, 'yyyy-MM-dd HH:mm:ss');
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

export default function UmpTraceabilityReportPage() {
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: clients } = useFirestoreCollection<OtherClient>('otherClients');

    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedClient, setSelectedClient] = React.useState<string>('all');
    const [selectedStatus, setSelectedStatus] = React.useState<string>('all');

    // Flatten all UMPs / items from otherFruitReceptions
    const allRows: UmpTraceRow[] = React.useMemo(() => {
        if (!receptions) return [];

        const rows: UmpTraceRow[] = [];

        receptions.forEach(reception => {
            const clientName = reception.clientName || 'Cliente';
            const document = reception.documentNumber || reception.document || 'S/N';
            const creationDate = reception.createdAt ? safeToDate(reception.createdAt) : null;
            const creationUser = reception.userName || 'Sistema';

            (reception.items || []).forEach((item, index) => {
                const loc = item.storageLocation as any;
                let locDisplay = '—';
                if (loc) {
                    if (loc.warehouse && loc.aisle) {
                        locDisplay = `${loc.warehouse} / ${loc.aisle}`;
                    } else if (loc.chamberId && loc.coordinate) {
                        locDisplay = `${loc.chamberId} - ${loc.coordinate}`;
                    } else if (loc.coordinate) {
                        locDisplay = loc.coordinate;
                    }
                }

                // Relevant timestamp & user for item lifecycle
                let eventDate: Date | null = null;
                let eventUser = '—';

                if (item.status === 'No Recepcionado') {
                    eventDate = item.notReceivedAt ? safeToDate(item.notReceivedAt) : creationDate;
                    eventUser = item.notReceivedByUserName || reception.userName || 'Operador';
                } else if (item.status === 'Almacenado') {
                    eventDate = item.storedAt ? safeToDate(item.storedAt) : (item.receivedAt ? safeToDate(item.receivedAt) : creationDate);
                    eventUser = item.storedByUserName || item.receivedByUserName || reception.userName || 'Operador';
                } else if (item.status === 'Pendiente de almacenar' || item.status === 'Recibido') {
                    eventDate = item.receivedAt ? safeToDate(item.receivedAt) : creationDate;
                    eventUser = item.receivedByUserName || reception.userName || 'Operador';
                } else {
                    eventDate = creationDate;
                    eventUser = creationUser;
                }

                rows.push({
                    receptionId: reception.id,
                    itemIndex: index,
                    clientName,
                    document,
                    ump: String(item.palletId || item.containerId || `ITEM-${index + 1}`).trim(),
                    productCode: item.productCode || '—',
                    productName: item.productName || 'Producto',
                    lote: item.clientLotId || '—',
                    quantity: item.quantity || 0,
                    status: item.status || 'Pendiente de recibir',
                    location: locDisplay,
                    creationDate,
                    creationUser,
                    eventDate,
                    eventUser,
                });
            });
        });

        return rows.sort((a, b) => {
            const timeA = a.creationDate ? a.creationDate.getTime() : 0;
            const timeB = b.creationDate ? b.creationDate.getTime() : 0;
            return timeB - timeA;
        });
    }, [receptions]);

    // Client filter list
    const clientOptions = React.useMemo(() => {
        const set = new Set(allRows.map(r => r.clientName));
        return Array.from(set).sort();
    }, [allRows]);

    // Filtered rows
    const filteredRows = React.useMemo(() => {
        return allRows.filter(row => {
            if (selectedClient !== 'all' && row.clientName !== selectedClient) {
                return false;
            }
            if (selectedStatus !== 'all' && row.status !== selectedStatus) {
                return false;
            }
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchUmp = row.ump.toLowerCase().includes(term);
                const matchDoc = row.document.toLowerCase().includes(term);
                const matchLote = row.lote.toLowerCase().includes(term);
                const matchCode = row.productCode.toLowerCase().includes(term);
                const matchProd = row.productName.toLowerCase().includes(term);
                const matchUser = row.eventUser.toLowerCase().includes(term) || row.creationUser.toLowerCase().includes(term);
                if (!matchUmp && !matchDoc && !matchLote && !matchCode && !matchProd && !matchUser) {
                    return false;
                }
            }
            return true;
        });
    }, [allRows, selectedClient, selectedStatus, searchTerm]);

    // Summary KPIs
    const kpis = React.useMemo(() => {
        const total = filteredRows.length;
        const stored = filteredRows.filter(r => r.status === 'Almacenado').length;
        const pendingStore = filteredRows.filter(r => r.status === 'Pendiente de almacenar' || r.status === 'Recibido').length;
        const notReceived = filteredRows.filter(r => r.status === 'No Recepcionado').length;
        const pendingReceive = filteredRows.filter(r => r.status === 'Pendiente de recibir').length;
        return { total, stored, pendingStore, notReceived, pendingReceive };
    }, [filteredRows]);

    const handleExport = () => {
        const headers = [
            { key: 'creationDate', label: 'Fecha Declarada' },
            { key: 'clientName', label: 'Cliente' },
            { key: 'document', label: 'N° Guía / Factura' },
            { key: 'ump', label: 'UMP (Pallet)' },
            { key: 'productCode', label: 'Cód. Producto' },
            { key: 'productName', label: 'Descripción' },
            { key: 'lote', label: 'Lote' },
            { key: 'quantity', label: 'Cantidad UN' },
            { key: 'status', label: 'Estado' },
            { key: 'location', label: 'Ubicación' },
            { key: 'eventDate', label: 'Fecha Últ. Evento' },
            { key: 'eventUser', label: 'Usuario Responsable' },
            { key: 'creationUser', label: 'Usuario Creación' },
        ];
        const csv = convertToCSV(filteredRows, headers);
        downloadCSV(csv, `reporte_trazabilidad_ump_${safeFormatDate(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Trazabilidad Total de Pallets UMP"
                description="Auditoría completa de recepciones: pallets recepcionados, almacenados y no recepcionados con fecha, usuario, lote y guía."
                onExport={handleExport}
                isExportDisabled={loadingReceptions || filteredRows.length === 0}
            />

            {/* Quick KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="bg-card">
                    <CardContent className="p-3.5 text-center">
                        <span className="text-[11px] font-bold uppercase text-muted-foreground block">Total Auditado</span>
                        <span className="text-2xl font-black text-foreground">{kpis.total}</span>
                    </CardContent>
                </Card>
                <Card className="bg-emerald-500/10 border-emerald-500/30">
                    <CardContent className="p-3.5 text-center">
                        <span className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">Almacenados</span>
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{kpis.stored}</span>
                    </CardContent>
                </Card>
                <Card className="bg-blue-500/10 border-blue-500/30">
                    <CardContent className="p-3.5 text-center">
                        <span className="text-[11px] font-bold uppercase text-blue-600 dark:text-blue-400 block">Por Almacenar</span>
                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{kpis.pendingStore}</span>
                    </CardContent>
                </Card>
                <Card className="bg-rose-500/10 border-rose-500/30">
                    <CardContent className="p-3.5 text-center">
                        <span className="text-[11px] font-bold uppercase text-rose-600 dark:text-rose-400 block">No Recepcionados</span>
                        <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{kpis.notReceived}</span>
                    </CardContent>
                </Card>
                <Card className="bg-amber-500/10 border-amber-500/30">
                    <CardContent className="p-3.5 text-center">
                        <span className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400 block">Por Pistolear</span>
                        <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{kpis.pendingReceive}</span>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por UMP, Guía, Lote, Material o Usuario..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 font-medium"
                            />
                        </div>
                        <div>
                            <Select value={selectedClient} onValueChange={setSelectedClient}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Filtrar por Cliente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los Clientes</SelectItem>
                                    {clientOptions.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Filtrar por Estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los Estados</SelectItem>
                                    <SelectItem value="Almacenado">Almacenado</SelectItem>
                                    <SelectItem value="Pendiente de almacenar">Por Almacenar</SelectItem>
                                    <SelectItem value="No Recepcionado">No Recepcionado (Faltante)</SelectItem>
                                    <SelectItem value="Pendiente de recibir">Por Pistolear</SelectItem>
                                    <SelectItem value="Despachado">Despachado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Data Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-12 text-center">#</TableHead>
                                    <TableHead>Fecha Ingreso</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Guía / Doc</TableHead>
                                    <TableHead>UMP (Pallet)</TableHead>
                                    <TableHead>Cód. Material</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Lote</TableHead>
                                    <TableHead className="text-right">Cantidad</TableHead>
                                    <TableHead className="text-center">Estado</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Fecha Evento</TableHead>
                                    <TableHead>Usuario</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingReceptions ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={13}>
                                                <Skeleton className="h-6 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredRows.length > 0 ? (
                                    filteredRows.map((row, index) => {
                                        const isNotReceived = row.status === 'No Recepcionado';
                                        const isStored = row.status === 'Almacenado';
                                        const isPendingStore = row.status === 'Pendiente de almacenar' || row.status === 'Recibido';
                                        const isPendingReceive = row.status === 'Pendiente de recibir';

                                        return (
                                            <TableRow 
                                                key={`${row.receptionId}-${row.itemIndex}`}
                                                className={isNotReceived ? "bg-rose-50/20 dark:bg-rose-950/10" : undefined}
                                            >
                                                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                                    {index + 1}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap font-mono text-xs">
                                                    {row.creationDate ? safeFormatDate(row.creationDate, 'dd/MM/yyyy HH:mm') : '—'}
                                                </TableCell>
                                                <TableCell className="font-semibold text-xs whitespace-nowrap">
                                                    {row.clientName}
                                                </TableCell>
                                                <TableCell className="font-mono font-bold text-xs whitespace-nowrap">
                                                    {row.document}
                                                </TableCell>
                                                <TableCell className="font-mono font-black text-xs whitespace-nowrap">
                                                    <span className={isNotReceived ? "line-through text-muted-foreground" : "text-primary"}>
                                                        {row.ump}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {row.productCode}
                                                </TableCell>
                                                <TableCell className="text-xs max-w-[220px] truncate" title={row.productName}>
                                                    {row.productName}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs whitespace-nowrap">
                                                    {row.lote}
                                                </TableCell>
                                                <TableCell className="text-right font-black text-xs">
                                                    {row.quantity} UN
                                                </TableCell>
                                                <TableCell className="text-center whitespace-nowrap">
                                                    {isStored && (
                                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                                                            Almacenado
                                                        </Badge>
                                                    )}
                                                    {isPendingStore && (
                                                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30 font-bold">
                                                            Por Almacenar
                                                        </Badge>
                                                    )}
                                                    {isNotReceived && (
                                                        <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30 font-bold">
                                                            No Recepcionado
                                                        </Badge>
                                                    )}
                                                    {isPendingReceive && (
                                                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold">
                                                            Por Pistolear
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs whitespace-nowrap">
                                                    {row.location}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                                    {row.eventDate ? safeFormatDate(row.eventDate, 'dd/MM/yyyy HH:mm') : '—'}
                                                </TableCell>
                                                <TableCell className="text-xs font-medium whitespace-nowrap">
                                                    {row.eventUser}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={13} className="h-28 text-center text-muted-foreground text-sm">
                                            No se encontraron registros de pallets UMP con los filtros seleccionados.
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
