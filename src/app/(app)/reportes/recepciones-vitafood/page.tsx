'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, PackagingMovement } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { safeToDate, safeFormatDate } from '@/lib/utils';
import { isVitafood } from '@/lib/clients';
import { cleanFirestoreObject } from '@/lib/vitafood-utils';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
    Search, 
    Edit2, 
    Truck, 
    Package, 
    Warehouse, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    Loader2, 
    FileText 
} from 'lucide-react';

interface VitafoodRow {
    id: string;
    receptionId: string;
    itemIndex: number;
    movementId?: string;
    orderNumber: string;
    receptionDate: Date | null;
    storedDate: Date | null;
    ump: string;
    productCode: string;
    productName: string;
    lote: string;
    quantity: number;
    status: string;
    location: string;
    // Campos editables de despacho
    dispatchDocument: string;
    driverName: string;
    licensePlate: string;
    destination: string;
    dispatchDate: Date | null;
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
    const headerRow = headers.map(h => `"${h.label}"`).join(';');
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

export default function VitafoodReceptionsReportPage() {
    const firestore = useFirestore();
    const { toast } = useToast();

    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: packagingMovements, loading: loadingPkgMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');

    const loading = loadingReceptions || loadingPkgMovements;

    // Filters state
    const [searchTerm, setSearchTerm] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('all');
    const [guideFilter, setGuideFilter] = React.useState('all');

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [editingRow, setEditingRow] = React.useState<VitafoodRow | null>(null);
    const [formGuide, setFormGuide] = React.useState('');
    const [formDriver, setFormDriver] = React.useState('');
    const [formPlate, setFormPlate] = React.useState('');
    const [formDestination, setFormDestination] = React.useState('');
    const [applyToBatch, setApplyToBatch] = React.useState(true);

    // Map UMPs to dispatch movement data from packagingMovements
    const umpDispatchMap = React.useMemo(() => {
        const map = new Map<string, { movementId: string; date: Date; document: string; carrier: string; licensePlate: string; destination: string }>();
        (packagingMovements || []).forEach(pm => {
            if (pm.type === 'salida') {
                const date = pm.createdAt ? safeToDate(pm.createdAt) : null;
                const doc = pm.document || (pm as any).dispatchDocument || '';
                const carrier = pm.carrier || (pm as any).driverName || '';
                const licensePlate = pm.licensePlate || '';
                const destination = pm.destination || '';

                if (pm.rawUmps && Array.isArray(pm.rawUmps)) {
                    pm.rawUmps.forEach(ump => {
                        const clean = String(ump).trim();
                        if (clean && date) {
                            map.set(clean, {
                                movementId: pm.id,
                                date,
                                document: doc,
                                carrier,
                                licensePlate,
                                destination,
                            });
                        }
                    });
                }
            }
        });
        return map;
    }, [packagingMovements]);

    // Build unified Vitafood UMP list
    const vitafoodRows = React.useMemo(() => {
        if (!receptions) return [];

        const rows: VitafoodRow[] = [];

        receptions.forEach(reception => {
            if (!isVitafood(reception.clientName) && !isVitafood(reception.clientId)) {
                return;
            }

            const orderNumber = reception.documentNumber || reception.document || 'S/N';
            const receptionDate = reception.createdAt ? safeToDate(reception.createdAt) : null;

            (reception.items || []).forEach((item, index) => {
                const storedDate = item.storedAt ? safeToDate(item.storedAt) : (item.receivedAt ? safeToDate(item.receivedAt) : null);
                const ump = String(item.palletId || item.containerId || '').trim();
                const location = formatLocation(item.storageLocation);

                // Determine dispatch info (item fields override parent or dispatch movement)
                const dispatchInfo = ump ? umpDispatchMap.get(ump) : undefined;

                const dispatchDocument = (item as any).dispatchDocument 
                    || dispatchInfo?.document 
                    || (reception as any).lastDispatchDocument 
                    || (reception as any).dispatchDocument 
                    || '';

                const driverName = (item as any).driverName 
                    || (item as any).carrier 
                    || dispatchInfo?.carrier 
                    || (reception as any).carrier 
                    || (reception as any).driverName 
                    || '';

                const licensePlate = (item as any).licensePlate 
                    || dispatchInfo?.licensePlate 
                    || (reception as any).licensePlate 
                    || '';

                const destination = (item as any).destination 
                    || dispatchInfo?.destination 
                    || (reception as any).destination 
                    || '';

                const dispatchDate = (item as any).dispatchedAt 
                    ? safeToDate((item as any).dispatchedAt) 
                    : (dispatchInfo?.date || null);

                rows.push({
                    id: `${reception.id}-${index}`,
                    receptionId: reception.id,
                    itemIndex: index,
                    movementId: dispatchInfo?.movementId,
                    orderNumber,
                    receptionDate,
                    storedDate,
                    ump: ump || `PALLET-${index + 1}`,
                    productCode: item.productCode || '—',
                    productName: item.productName || 'Producto Vitafood',
                    lote: item.clientLotId || '—',
                    quantity: item.quantity || 1,
                    status: item.status || 'Pendiente de recibir',
                    location,
                    dispatchDocument,
                    driverName,
                    licensePlate,
                    destination,
                    dispatchDate,
                });
            });
        });

        // Sort descending by reception date
        return rows.sort((a, b) => {
            const timeA = a.receptionDate ? a.receptionDate.getTime() : 0;
            const timeB = b.receptionDate ? b.receptionDate.getTime() : 0;
            return timeB - timeA;
        });
    }, [receptions, umpDispatchMap]);

    // Filter rows
    const filteredRows = React.useMemo(() => {
        return vitafoodRows.filter(row => {
            // Status filter
            if (statusFilter !== 'all' && row.status !== statusFilter) {
                return false;
            }

            // Guide filter
            if (guideFilter === 'with_guide' && !row.dispatchDocument) {
                return false;
            }
            if (guideFilter === 'without_guide' && row.dispatchDocument) {
                return false;
            }

            // Search filter
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchUmp = row.ump.toLowerCase().includes(term);
                const matchOrder = row.orderNumber.toLowerCase().includes(term);
                const matchLote = row.lote.toLowerCase().includes(term);
                const matchCode = row.productCode.toLowerCase().includes(term);
                const matchProd = row.productName.toLowerCase().includes(term);
                const matchLoc = row.location.toLowerCase().includes(term);
                const matchGuide = row.dispatchDocument.toLowerCase().includes(term);
                const matchDriver = row.driverName.toLowerCase().includes(term);
                const matchPlate = row.licensePlate.toLowerCase().includes(term);
                const matchDest = row.destination.toLowerCase().includes(term);

                if (!matchUmp && !matchOrder && !matchLote && !matchCode && !matchProd && !matchLoc && !matchGuide && !matchDriver && !matchPlate && !matchDest) {
                    return false;
                }
            }

            return true;
        });
    }, [vitafoodRows, statusFilter, guideFilter, searchTerm]);

    // KPI Summary
    const kpis = React.useMemo(() => {
        const total = vitafoodRows.length;
        const stored = vitafoodRows.filter(r => r.status === 'Almacenado').length;
        const dispatched = vitafoodRows.filter(r => r.status === 'Despachado').length;
        const pendingGuide = vitafoodRows.filter(r => r.status === 'Despachado' && !r.dispatchDocument.trim()).length;

        return { total, stored, dispatched, pendingGuide };
    }, [vitafoodRows]);

    // Open Edit Modal
    const handleOpenEdit = (row: VitafoodRow) => {
        setEditingRow(row);
        setFormGuide(row.dispatchDocument || '');
        setFormDriver(row.driverName || '');
        setFormPlate(row.licensePlate || '');
        setFormDestination(row.destination || '');
        setApplyToBatch(true);
        setIsEditModalOpen(true);
    };

    // Save Edit Modal
    const handleSaveEdit = async () => {
        if (!firestore || !editingRow) return;

        setIsSaving(true);
        try {
            const currentRec = receptions?.find(r => r.id === editingRow.receptionId);
            if (!currentRec) {
                throw new Error('Recepción no encontrada.');
            }

            const recRef = doc(firestore, 'otherFruitReceptions', editingRow.receptionId);
            const currentItems = [...(currentRec.items || [])];

            const guideTrim = formGuide.trim();
            const driverTrim = formDriver.trim();
            const plateTrim = formPlate.trim().toUpperCase();
            const destTrim = formDestination.trim();

            if (applyToBatch) {
                // Apply to all items of this reception or that share the same initial dispatch document
                const targetDoc = editingRow.dispatchDocument;
                currentItems.forEach((item, idx) => {
                    const itemDoc = (item as any).dispatchDocument || (currentRec as any).lastDispatchDocument || '';
                    if (idx === editingRow.itemIndex || (targetDoc && itemDoc === targetDoc) || item.status === 'Despachado') {
                        currentItems[idx] = {
                            ...item,
                            dispatchDocument: guideTrim,
                            driverName: driverTrim,
                            carrier: driverTrim,
                            licensePlate: plateTrim,
                            destination: destTrim,
                        } as any;
                    }
                });
            } else {
                // Apply only to this specific UMP
                if (currentItems[editingRow.itemIndex]) {
                    currentItems[editingRow.itemIndex] = {
                        ...currentItems[editingRow.itemIndex],
                        dispatchDocument: guideTrim,
                        driverName: driverTrim,
                        carrier: driverTrim,
                        licensePlate: plateTrim,
                        destination: destTrim,
                    } as any;
                }
            }

            // Update otherFruitReceptions
            await updateDoc(recRef, cleanFirestoreObject({
                items: currentItems,
                lastDispatchDocument: guideTrim || (currentRec as any).lastDispatchDocument || '',
                dispatchDocument: guideTrim || (currentRec as any).dispatchDocument || '',
                carrier: driverTrim || (currentRec as any).carrier || '',
                driverName: driverTrim || (currentRec as any).driverName || '',
                licensePlate: plateTrim || (currentRec as any).licensePlate || '',
                destination: destTrim || (currentRec as any).destination || '',
                updatedAt: serverTimestamp(),
            }));

            // If there's an associated packagingMovement document, update it too
            if (editingRow.movementId) {
                const movRef = doc(firestore, 'packagingMovements', editingRow.movementId);
                await updateDoc(movRef, cleanFirestoreObject({
                    document: guideTrim || undefined,
                    dispatchDocument: guideTrim || undefined,
                    carrier: driverTrim || undefined,
                    driverName: driverTrim || undefined,
                    licensePlate: plateTrim || undefined,
                    destination: destTrim || undefined,
                    updatedAt: serverTimestamp(),
                }));
            }

            toast({
                title: 'Datos actualizados con éxito',
                description: `Se guardaron los datos de despacho para el UMP ${editingRow.ump}.`,
            });

            setIsEditModalOpen(false);
            setEditingRow(null);
        } catch (error: any) {
            console.error('Error al guardar datos de despacho:', error);
            toast({
                title: 'Error al guardar',
                description: error.message || 'No se pudieron actualizar los datos de despacho.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Export CSV
    const handleExport = () => {
        if (!filteredRows || filteredRows.length === 0) return;

        const headers = [
            { key: 'receptionDateStr', label: 'Fecha Recepción' },
            { key: 'storedDateStr', label: 'Fecha Almacenamiento' },
            { key: 'orderNumber', label: 'N° Orden / Entrada' },
            { key: 'ump', label: 'UMP' },
            { key: 'productCode', label: 'Cód. Producto' },
            { key: 'productName', label: 'Descripción' },
            { key: 'lote', label: 'Lote' },
            { key: 'quantity', label: 'Cant. Pallets' },
            { key: 'status', label: 'Estado' },
            { key: 'location', label: 'Ubicación' },
            { key: 'dispatchDocument', label: 'N° Guía Despacho' },
            { key: 'driverName', label: 'Nombre Chofer' },
            { key: 'licensePlate', label: 'Patente' },
            { key: 'destination', label: 'Destino' },
        ];

        const dataForExport = filteredRows.map(row => ({
            ...row,
            receptionDateStr: row.receptionDate ? safeFormatDate(row.receptionDate, 'yyyy-MM-dd HH:mm') : '',
            storedDateStr: row.storedDate ? safeFormatDate(row.storedDate, 'yyyy-MM-dd HH:mm') : '',
        }));

        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, `reporte_recepciones_vitafoods_${safeFormatDate(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Reporte de Recepciones Vitafoods"
                description="Listado exhaustivo de todos los pallets y UMPs recepcionados de Vitafoods. Permite auditar fechas, ubicaciones y editar los datos de despacho (N° Guía, Chofer, Patente y Destino)."
                onExport={handleExport}
                isExportDisabled={loading || filteredRows.length === 0}
            />

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border shadow-sm">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Total UMPs</p>
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
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Almacenados (Stock)</p>
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
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Despachos sin Guía</p>
                                <p className="text-2xl font-bold text-amber-600 mt-1">{loading ? '...' : kpis.pendingGuide}</p>
                            </div>
                            <AlertCircle className="h-8 w-8 text-amber-500 opacity-80" />
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
                                placeholder="Buscar por UMP, descripción, código, lote, guía, chofer, patente, destino..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="w-full sm:w-[200px]">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los Estados</SelectItem>
                                    <SelectItem value="Almacenado">Almacenado (Stock)</SelectItem>
                                    <SelectItem value="Despachado">Despachado</SelectItem>
                                    <SelectItem value="Pendiente de almacenar">Pendiente almacenar</SelectItem>
                                    <SelectItem value="No Recepcionado">No Recepcionado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Guide Status Filter */}
                        <div className="w-full sm:w-[200px]">
                            <Select value={guideFilter} onValueChange={setGuideFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Filtro Guía" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las guías</SelectItem>
                                    <SelectItem value="with_guide">Con N° de Guía</SelectItem>
                                    <SelectItem value="without_guide">Sin N° de Guía</SelectItem>
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
                                    <TableHead>Fecha Recep.</TableHead>
                                    <TableHead>Fecha Almac.</TableHead>
                                    <TableHead>UMP</TableHead>
                                    <TableHead>Cód. Material</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Lote</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="bg-blue-50/50">N° Guía</TableHead>
                                    <TableHead className="bg-blue-50/50">Chofer</TableHead>
                                    <TableHead className="bg-blue-50/50">Patente</TableHead>
                                    <TableHead className="bg-blue-50/50">Destino</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={13}><Skeleton className="h-6 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredRows && filteredRows.length > 0 ? (
                                    filteredRows.map(row => (
                                        <TableRow key={row.id} className="hover:bg-muted/50">
                                            <TableCell className="text-xs whitespace-nowrap">
                                                {safeFormatDate(row.receptionDate, 'dd/MM/yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">
                                                {safeFormatDate(row.storedDate, 'dd/MM/yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell className="font-mono font-bold text-xs text-blue-700 whitespace-nowrap">
                                                {row.ump}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{row.productCode}</TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate" title={row.productName}>
                                                {row.productName}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{row.lote}</TableCell>
                                            <TableCell className="text-xs font-mono">{row.location}</TableCell>
                                            <TableCell>
                                                {row.status === 'Almacenado' ? (
                                                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px]">
                                                        Almacenado
                                                    </Badge>
                                                ) : row.status === 'Despachado' ? (
                                                    <Badge variant="secondary" className="text-[11px]">
                                                        Despachado
                                                    </Badge>
                                                ) : row.status === 'No Recepcionado' ? (
                                                    <Badge variant="destructive" className="text-[11px]">
                                                        No Rec.
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[11px]">
                                                        {row.status}
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            {/* Editable Dispatch Fields */}
                                            <TableCell className="bg-blue-50/30 text-xs font-medium">
                                                {row.dispatchDocument ? (
                                                    <span className="font-mono text-blue-900">{row.dispatchDocument}</span>
                                                ) : (
                                                    <span className="text-muted-foreground italic text-[11px]">Sin Guía</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="bg-blue-50/30 text-xs">
                                                {row.driverName || <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="bg-blue-50/30 text-xs font-mono uppercase">
                                                {row.licensePlate || <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="bg-blue-50/30 text-xs max-w-[140px] truncate" title={row.destination}>
                                                {row.destination || <span className="text-muted-foreground">—</span>}
                                            </TableCell>

                                            {/* Action Button */}
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 px-2 text-xs flex items-center gap-1 hover:bg-blue-50 hover:text-blue-700"
                                                    onClick={() => handleOpenEdit(row)}
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                    Editar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={13} className="h-28 text-center text-muted-foreground">
                                            No se encontraron recepciones de Vitafoods para el filtro seleccionado.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Edit Dispatch Details Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Truck className="h-5 w-5 text-blue-600" />
                            Editar Datos de Despacho
                        </DialogTitle>
                        <DialogDescription>
                            Complete o modifique la información de transporte y entrega para este pallet de Vitafoods.
                        </DialogDescription>
                    </DialogHeader>

                    {editingRow && (
                        <div className="space-y-4 py-2">
                            {/* Summary Box */}
                            <div className="bg-muted/50 p-3 rounded-lg border text-xs space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">UMP:</span>
                                    <span className="font-mono font-bold text-blue-700">{editingRow.ump}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Producto:</span>
                                    <span className="font-medium truncate max-w-[260px]">{editingRow.productName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Lote:</span>
                                    <span className="font-mono">{editingRow.lote}</span>
                                </div>
                            </div>

                            {/* Inputs */}
                            <div className="space-y-3">
                                <div>
                                    <Label htmlFor="guideNum" className="text-xs font-semibold">
                                        Número de Guía de Despacho *
                                    </Label>
                                    <Input
                                        id="guideNum"
                                        placeholder="Ej: 145892"
                                        value={formGuide}
                                        onChange={(e) => setFormGuide(e.target.value)}
                                        className="h-9 mt-1 text-sm font-mono"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="driver" className="text-xs font-semibold">
                                        Nombre de Chofer / Transportista
                                    </Label>
                                    <Input
                                        id="driver"
                                        placeholder="Ej: Carlos Silva"
                                        value={formDriver}
                                        onChange={(e) => setFormDriver(e.target.value)}
                                        className="h-9 mt-1 text-sm"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="plate" className="text-xs font-semibold">
                                        Patente del Camión
                                    </Label>
                                    <Input
                                        id="plate"
                                        placeholder="Ej: LP-89-21"
                                        value={formPlate}
                                        onChange={(e) => setFormPlate(e.target.value)}
                                        className="h-9 mt-1 text-sm uppercase font-mono"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="destination" className="text-xs font-semibold">
                                        Destino
                                    </Label>
                                    <Input
                                        id="destination"
                                        placeholder="Ej: Vitafoods Planta San Fernando"
                                        value={formDestination}
                                        onChange={(e) => setFormDestination(e.target.value)}
                                        className="h-9 mt-1 text-sm"
                                    />
                                </div>

                                <div className="flex items-center space-x-2 pt-2 border-t">
                                    <Checkbox
                                        id="applyBatch"
                                        checked={applyToBatch}
                                        onCheckedChange={(checked) => setApplyToBatch(Boolean(checked))}
                                    />
                                    <label
                                        htmlFor="applyBatch"
                                        className="text-xs text-muted-foreground cursor-pointer leading-tight"
                                    >
                                        Actualizar también todos los UMPs de este mismo lote/despacho en la recepción.
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsEditModalOpen(false)}
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                'Guardar Cambios'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
