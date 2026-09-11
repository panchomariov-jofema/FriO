'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
    Check, 
    Edit2, 
    X, 
    QrCode, 
    Search, 
    ChevronDown, 
    ChevronRight, 
    Copy, 
    Download, 
    Package, 
    Layers, 
    Building2,
    Calendar,
    FileText,
    CheckCircle2
} from 'lucide-react';
import QRCode from 'qrcode';

interface DispatchedBinDetail {
    id: string;
    movementId: string;
    containerId: string;
    palletId: string;
    productName: string;
    productCode: string;
    clientLotId: string;
    plantsPerBin: number;
    chamberId: string;
    coordinate: string;
    receptionDocument: string;
    receptionDate?: any;
    storedAt?: any;
    dispatchDate?: any;
    dispatchDocument: string;
    destinationClientName: string;
    destinationClientRUT: string;
    userName: string;
}

function convertToCSV(data: any[], headers: { key: string; label: string }[]) {
    const headerRow = headers.map(h => `"${h.label}"`).join(';');
    const rows = data.map(row => 
        headers.map(h => {
            let value = row[h.key];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value?.toDate) {
                value = value.toDate().toLocaleString();
            } else if (Array.isArray(value)) {
                value = value.join(', ');
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

function QRPreviewModal({ code, open, onOpenChange }: { code: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const { toast } = useToast();

    React.useEffect(() => {
        if (open && code && canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, code, {
                width: 240,
                margin: 2,
                color: {
                    dark: '#004b8d',
                    light: '#ffffff'
                }
            }, (error) => {
                if (error) console.error("Error generating QR code:", error);
            });
        }
    }, [open, code]);

    const handleCopy = () => {
        if (!code) return;
        navigator.clipboard.writeText(code);
        toast({
            title: "Copiado",
            description: `Código ${code} copiado al portapapeles.`
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xs sm:max-w-sm text-center">
                <DialogHeader>
                    <DialogTitle className="text-center font-bold text-lg text-[#004b8d]">
                        Código QR de Bin
                    </DialogTitle>
                    <DialogDescription className="text-center text-xs">
                        Identificador único del contenedor de Fall Creek
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center justify-center py-4">
                    <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200 inline-block">
                        <canvas ref={canvasRef} className="rounded" />
                    </div>
                    <div className="mt-4 flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        <span className="font-mono font-bold text-sm text-slate-800">{code}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-600 hover:text-[#004b8d]" onClick={handleCopy}>
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function FallCreekDispatchReportPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');

    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedTab, setSelectedTab] = React.useState<'dispatches' | 'bins'>('dispatches');
    const [expandedDispatchIds, setExpandedDispatchIds] = React.useState<Set<string>>(new Set());

    // QR Preview modal
    const [previewQrCode, setPreviewQrCode] = React.useState<string | null>(null);
    const [isQrModalOpen, setIsQrModalOpen] = React.useState(false);

    // Editing document numbers
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [savingId, setSavingId] = React.useState<string | null>(null);

    // Map receptions for ultra fast resolution of bin data
    const receptionsMap = React.useMemo(() => {
        const map: Record<string, OtherFruitReception> = {};
        (receptions || []).forEach(r => {
            if (r.id) map[r.id] = r;
        });
        return map;
    }, [receptions]);

    // Process dispatches and resolve each individual bin with its QR and location
    const fallCreekDispatches = React.useMemo(() => {
        return (movements || [])
            .filter(m => 
                (m.clientId === '76361536-7' || m.clientName?.toUpperCase() === 'FALL CREEK') &&
                m.type === 'salida' &&
                m.status === 'Completado'
            )
            .map(m => {
                const varieties = (m.items || []).map(item => item.productName);
                const uniqueVarieties = Array.from(new Set(varieties));
                const totalBins = (m.items || []).reduce((sum, item) => sum + item.quantity, 0);

                // Build detailed bin list for this dispatch
                const binsDetail: DispatchedBinDetail[] = [];
                (m.locations || []).forEach((loc, locIdx) => {
                    const rec = receptionsMap[loc.receptionId];
                    const recItem = rec?.items?.[loc.itemIndex];

                    const containerId = recItem?.containerId || `BIN-FC-${String(loc.itemIndex + 1).padStart(4, '0')}`;
                    const palletId = recItem?.palletId || 'Loose';
                    const productName = loc.productName || recItem?.productName || 'Sekoya';
                    const productCode = loc.productCode || recItem?.productCode || '';
                    const clientLotId = loc.clientLotId || recItem?.clientLotId || 'N/A';
                    const plantsPerBin = recItem?.plantsPerBin || recItem?.totalPlants || 150;
                    const chamberId = loc.location?.chamberId || recItem?.storageLocation?.chamberId || 'CAMARA-5';
                    const coordinate = loc.location?.coordinate || recItem?.storageLocation?.coordinate || '-';
                    const receptionDocument = rec?.documentNumber || rec?.document || 'N/A';

                    binsDetail.push({
                        id: `${m.id}_${locIdx}_${containerId}`,
                        movementId: m.id,
                        containerId,
                        palletId,
                        productName,
                        productCode,
                        clientLotId,
                        plantsPerBin,
                        chamberId,
                        coordinate,
                        receptionDocument,
                        receptionDate: rec?.createdAt,
                        storedAt: recItem?.storedAt,
                        dispatchDate: m.createdAt,
                        dispatchDocument: m.document || '',
                        destinationClientName: m.destinationClientName || 'N/A',
                        destinationClientRUT: m.destinationClientRUT || '',
                        userName: m.userName || 'N/A'
                    });
                });

                return {
                    ...m,
                    varieties: uniqueVarieties,
                    totalBins: totalBins || binsDetail.length,
                    binsDetail
                };
            })
            .sort((a, b) => {
                const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0) : 0;
                const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0) : 0;
                return dateB - dateA;
            });
    }, [movements, receptionsMap]);

    // Flat list of all dispatched bins
    const allDispatchedBins = React.useMemo(() => {
        return fallCreekDispatches.flatMap(d => d.binsDetail);
    }, [fallCreekDispatches]);

    // Filtered dispatches based on search query
    const filteredDispatches = React.useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        if (!query) return fallCreekDispatches;

        return fallCreekDispatches.filter(d => {
            const matchDoc = (d.document || '').toLowerCase().includes(query);
            const matchDest = (d.destinationClientName || '').toLowerCase().includes(query);
            const matchRut = (d.destinationClientRUT || '').toLowerCase().includes(query);
            const matchUser = (d.userName || '').toLowerCase().includes(query);
            const matchVarieties = d.varieties.some(v => v.toLowerCase().includes(query));
            const matchBins = d.binsDetail.some(b => 
                b.containerId.toLowerCase().includes(query) ||
                b.palletId.toLowerCase().includes(query) ||
                b.clientLotId.toLowerCase().includes(query) ||
                b.chamberId.toLowerCase().includes(query) ||
                b.coordinate.toLowerCase().includes(query) ||
                b.receptionDocument.toLowerCase().includes(query)
            );

            return matchDoc || matchDest || matchRut || matchUser || matchVarieties || matchBins;
        });
    }, [fallCreekDispatches, searchTerm]);

    // Filtered flat bins based on search query
    const filteredBins = React.useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        if (!query) return allDispatchedBins;

        return allDispatchedBins.filter(b => 
            b.containerId.toLowerCase().includes(query) ||
            b.palletId.toLowerCase().includes(query) ||
            b.productName.toLowerCase().includes(query) ||
            b.clientLotId.toLowerCase().includes(query) ||
            b.chamberId.toLowerCase().includes(query) ||
            b.coordinate.toLowerCase().includes(query) ||
            b.dispatchDocument.toLowerCase().includes(query) ||
            b.destinationClientName.toLowerCase().includes(query) ||
            b.receptionDocument.toLowerCase().includes(query) ||
            b.userName.toLowerCase().includes(query)
        );
    }, [allDispatchedBins, searchTerm]);

    const toggleExpandDispatch = (id: string) => {
        setExpandedDispatchIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleOpenQRModal = (code: string) => {
        setPreviewQrCode(code);
        setIsQrModalOpen(true);
    };

    const handleCopyText = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "Copiado",
            description: `${label} (${text}) copiado al portapapeles.`
        });
    };

    const handleStartEdit = (id: string, docNum: string) => {
        setEditingId(id);
        setEditValue(docNum || '');
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditValue('');
    };

    const handleSaveDocument = async (id: string) => {
        if (!firestore) return;
        setSavingId(id);
        try {
            const movementRef = doc(firestore, 'otherFruitMovements', id);
            await updateDoc(movementRef, {
                document: editValue.trim()
            });

            toast({
                title: 'Éxito',
                description: 'El número de documento de despacho ha sido actualizado.'
            });
            handleCancelEdit();
        } catch (error) {
            console.error('Error updating dispatch document number:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo guardar el número de documento.'
            });
        } finally {
            setSavingId(null);
        }
    };

    const handleExportSummaryCSV = () => {
        if (fallCreekDispatches.length === 0) return;
        
        const headers = [
            { key: 'createdAt', label: 'Fecha Despacho' },
            { key: 'destinationClientName', label: 'Destinatario' },
            { key: 'destinationClientRUT', label: 'RUT Destinatario' },
            { key: 'totalBins', label: 'Total Bins' },
            { key: 'varieties', label: 'Variedades' },
            { key: 'document', label: 'N° Documento Despacho' },
            { key: 'userName', label: 'Usuario Operador' }
        ];

        const dataForExport = fallCreekDispatches.map(m => {
            const dateStr = m.createdAt ? (m.createdAt.toDate ? m.createdAt.toDate().toLocaleString() : '') : '';
            return {
                createdAt: dateStr,
                destinationClientName: m.destinationClientName || 'N/A',
                destinationClientRUT: m.destinationClientRUT || 'N/A',
                totalBins: m.totalBins,
                varieties: m.varieties.join(', '),
                document: m.document || 'Sin documento',
                userName: m.userName || 'N/A'
            };
        });

        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'reporte_despachos_fall_creek_resumen.csv');
    };

    const handleExportDetailedBinsCSV = () => {
        if (allDispatchedBins.length === 0) return;

        const headers = [
            { key: 'containerId', label: 'QR Bin' },
            { key: 'palletId', label: 'Pallet ID' },
            { key: 'productName', label: 'Variedad' },
            { key: 'productCode', label: 'Código Producto' },
            { key: 'clientLotId', label: 'Lote Cliente' },
            { key: 'plantsPerBin', label: 'Plantas por Bin' },
            { key: 'chamberId', label: 'Cámara Origen' },
            { key: 'coordinate', label: 'Coordenada Origen' },
            { key: 'dispatchDocument', label: 'N° Guía Despacho' },
            { key: 'destinationClientName', label: 'Destinatario' },
            { key: 'destinationClientRUT', label: 'RUT Destinatario' },
            { key: 'dispatchDate', label: 'Fecha y Hora Despacho' },
            { key: 'receptionDocument', label: 'Guía Recepción Origen' },
            { key: 'userName', label: 'Operador' }
        ];

        const dataForExport = allDispatchedBins.map(b => {
            const dateStr = b.dispatchDate ? (b.dispatchDate.toDate ? b.dispatchDate.toDate().toLocaleString() : '') : '';
            return {
                ...b,
                dispatchDate: dateStr
            };
        });

        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'reporte_bins_despachados_fall_creek_detalle_qr.csv');
    };

    const isLoading = loadingMovements || loadingReceptions;

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Reporte de Despachos Fall Creek"
                description="Trazabilidad completa a nivel de Bins individuales, Códigos QR, Pallets y Guías de Despacho."
                onExport={handleExportDetailedBinsCSV}
                isExportDisabled={isLoading || allDispatchedBins.length === 0}
            >
                <Button 
                    variant="outline" 
                    onClick={handleExportSummaryCSV} 
                    disabled={isLoading || fallCreekDispatches.length === 0}
                    className="w-full sm:w-auto"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Resumen CSV
                </Button>
            </ReportHeader>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-blue-50/60 to-white border-blue-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Despachos Completados</p>
                            <p className="text-2xl font-black text-[#004b8d] mt-1">{fallCreekDispatches.length}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Operaciones registradas</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-[#004b8d]">
                            <Building2 className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50/60 to-white border-emerald-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Bins Despachados</p>
                            <p className="text-2xl font-black text-emerald-700 mt-1">{allDispatchedBins.length}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Con trazabilidad QR unitaria</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                            <QrCode className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50/60 to-white border-amber-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Total Plantas Entregadas</p>
                            <p className="text-2xl font-black text-amber-700 mt-1">
                                {(allDispatchedBins.reduce((sum, b) => sum + (b.plantsPerBin || 150), 0)).toLocaleString('es-CL')}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Plantas Sekoya despachadas</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                            <Package className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter and Search Bar */}
            <Card>
                <CardContent className="pt-5 pb-5">
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full sm:max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por QR (ej: BIN-FC-1338), Pallet, Guía, Variedad, Destinatario..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 text-sm"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="w-full sm:w-auto">
                            <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                                <TabsTrigger value="dispatches" className="flex items-center gap-1.5 text-xs">
                                    <Layers className="h-3.5 w-3.5" />
                                    Por Despacho ({filteredDispatches.length})
                                </TabsTrigger>
                                <TabsTrigger value="bins" className="flex items-center gap-1.5 text-xs">
                                    <QrCode className="h-3.5 w-3.5" />
                                    Detalle Bins / QR ({filteredBins.length})
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardContent>
            </Card>

            {/* Tab: By Dispatch (with Expandable Rows) */}
            {selectedTab === 'dispatches' && (
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-zinc-900">Historial de Despachos Fall Creek</CardTitle>
                                <CardDescription className="text-xs">
                                    Haz clic en cualquier fila o en el ícono de desplegar para ver los códigos QR y pallets de cada bin.
                                </CardDescription>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs"
                                onClick={() => {
                                    if (expandedDispatchIds.size === filteredDispatches.length) {
                                        setExpandedDispatchIds(new Set());
                                    } else {
                                        setExpandedDispatchIds(new Set(filteredDispatches.map(d => d.id)));
                                    }
                                }}
                            >
                                {expandedDispatchIds.size === filteredDispatches.length ? 'Contraer Todos' : 'Expandir Todos'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/80">
                                        <TableHead className="w-10"></TableHead>
                                        <TableHead className="w-[170px]">Fecha Despacho</TableHead>
                                        <TableHead>Destinatario (SubCliente)</TableHead>
                                        <TableHead>Variedad(es)</TableHead>
                                        <TableHead className="text-center w-28">Bins Despachados</TableHead>
                                        <TableHead className="w-[240px]">Guía / Documento</TableHead>
                                        <TableHead className="w-[120px]">Usuario</TableHead>
                                        <TableHead className="text-center w-24">Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={8}>
                                                    <Skeleton className="h-6 w-full" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredDispatches && filteredDispatches.length > 0 ? (
                                        filteredDispatches.map(dispatch => {
                                            const isExpanded = expandedDispatchIds.has(dispatch.id);
                                            const isEditing = editingId === dispatch.id;
                                            const isSaving = savingId === dispatch.id;

                                            return (
                                                <React.Fragment key={dispatch.id}>
                                                    <TableRow 
                                                        className={`transition-colors cursor-pointer hover:bg-blue-50/30 ${isExpanded ? 'bg-blue-50/40 border-b-0' : ''}`}
                                                        onClick={(e) => {
                                                            if ((e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('button')) return;
                                                            toggleExpandDispatch(dispatch.id);
                                                        }}
                                                    >
                                                        <TableCell className="text-center p-2">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 text-slate-500 hover:text-[#004b8d]"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleExpandDispatch(dispatch.id);
                                                                }}
                                                            >
                                                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                            </Button>
                                                        </TableCell>
                                                        <TableCell className="font-medium whitespace-nowrap text-xs text-slate-700">
                                                            {dispatch.createdAt?.toDate ? dispatch.createdAt.toDate().toLocaleString('es-CL') : 'Sin fecha'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-semibold text-zinc-800 text-sm">
                                                                {dispatch.destinationClientName || 'N/A'}
                                                            </div>
                                                            {dispatch.destinationClientRUT && (
                                                                <span className="text-[11px] text-muted-foreground font-mono">
                                                                    RUT: {dispatch.destinationClientRUT}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {dispatch.varieties.map((v, i) => (
                                                                    <Badge key={i} variant="secondary" className="text-[10px] font-normal px-1.5 py-0.5 bg-blue-50 text-blue-800 border-blue-200">
                                                                        {v}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge className="bg-[#004b8d] hover:bg-[#004b8d] text-white font-bold text-xs px-2.5 py-0.5">
                                                                {dispatch.totalBins} Bins
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {isEditing ? (
                                                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                                                    <Input
                                                                        value={editValue}
                                                                        onChange={(e) => setEditValue(e.target.value)}
                                                                        placeholder="N° Documento"
                                                                        className="h-8 text-xs font-mono w-36"
                                                                        disabled={isSaving}
                                                                        autoFocus
                                                                    />
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-8 w-8 p-0 text-green-600 border-green-600/20 hover:bg-green-50"
                                                                        onClick={() => handleSaveDocument(dispatch.id)}
                                                                        disabled={isSaving}
                                                                    >
                                                                        <Check className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-8 w-8 p-0 text-red-500 border-red-500/20 hover:bg-red-50"
                                                                        onClick={handleCancelEdit}
                                                                        disabled={isSaving}
                                                                    >
                                                                        <X className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-between group max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                                                                    <span className="font-mono text-sm">
                                                                        {dispatch.document ? (
                                                                            <Badge variant="outline" className="font-mono text-xs bg-slate-100 text-slate-800 border-slate-300 font-bold select-all">
                                                                                Guía N° {dispatch.document}
                                                                            </Badge>
                                                                        ) : (
                                                                            <span className="text-muted-foreground italic text-xs">Sin N° Guía</span>
                                                                        )}
                                                                    </span>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-100"
                                                                        onClick={() => handleStartEdit(dispatch.id, dispatch.document || '')}
                                                                        title="Editar número de documento"
                                                                    >
                                                                        <Edit2 className="h-3.5 w-3.5 text-[#004b8d]" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={dispatch.userName}>
                                                            {dispatch.userName || 'N/A'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="default" className="bg-[#7aba28] hover:bg-[#7aba28] text-white font-bold text-[10px]">
                                                                Completado
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>

                                                    {isExpanded && (
                                                        <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                                                            <TableCell colSpan={8} className="p-0 pl-10 pr-4 pb-4 pt-1">
                                                                <div className="rounded-lg border border-blue-200/80 bg-white p-4 shadow-sm">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <QrCode className="h-4 w-4 text-[#004b8d]" />
                                                                            <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                                                                                Detalle de Bins y Códigos QR ({dispatch.binsDetail.length} bins despachados)
                                                                            </span>
                                                                        </div>
                                                                        <span className="text-[11px] text-muted-foreground">
                                                                            Haz clic en el código QR para ampliarlo o copiarlo
                                                                        </span>
                                                                    </div>

                                                                    <div className="rounded border overflow-x-auto">
                                                                        <Table>
                                                                            <TableHeader>
                                                                                <TableRow className="bg-slate-100/80 text-[11px]">
                                                                                    <TableHead className="w-12 text-center">#</TableHead>
                                                                                    <TableHead className="w-[180px]">Código QR / Bin</TableHead>
                                                                                    <TableHead className="w-[140px]">Pallet ID</TableHead>
                                                                                    <TableHead>Variedad / Producto</TableHead>
                                                                                    <TableHead>Lote Cliente</TableHead>
                                                                                    <TableHead className="text-center w-24">Plantas</TableHead>
                                                                                    <TableHead className="w-[130px]">Origen Cámara</TableHead>
                                                                                    <TableHead className="w-[110px]">Guía Recep.</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {dispatch.binsDetail.map((bin, bIdx) => (
                                                                                    <TableRow key={bin.id} className="hover:bg-blue-50/40 text-xs">
                                                                                        <TableCell className="text-center font-mono text-muted-foreground text-[11px]">
                                                                                            {bIdx + 1}
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                            <button
                                                                                                onClick={() => handleOpenQRModal(bin.containerId)}
                                                                                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 border border-blue-200 text-blue-900 font-mono font-bold hover:bg-blue-100 hover:border-blue-300 transition-colors group"
                                                                                                title="Ver y ampliar Código QR"
                                                                                            >
                                                                                                <QrCode className="h-3.5 w-3.5 text-[#004b8d]" />
                                                                                                <span>{bin.containerId}</span>
                                                                                            </button>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                            <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                                                                                                {bin.palletId}
                                                                                            </span>
                                                                                        </TableCell>
                                                                                        <TableCell className="font-medium text-zinc-900">
                                                                                            {bin.productName}
                                                                                        </TableCell>
                                                                                        <TableCell className="font-mono text-[11px] text-slate-600">
                                                                                            {bin.clientLotId}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-center font-semibold text-zinc-800">
                                                                                            {bin.plantsPerBin}
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                            <Badge variant="outline" className="text-[10px] font-medium bg-zinc-50 border-zinc-300 text-zinc-700">
                                                                                                {bin.chamberId} • {bin.coordinate}
                                                                                            </Badge>
                                                                                        </TableCell>
                                                                                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                                                                                            {bin.receptionDocument}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                                                {searchTerm ? 'No se encontraron despachos que coincidan con la búsqueda.' : 'No hay despachos confirmados de Fall Creek.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tab: Detailed Flat List of all Dispatched Bins */}
            {selectedTab === 'bins' && (
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-zinc-900">Registro Individual de Bins Despachados (QR)</CardTitle>
                                <CardDescription className="text-xs">
                                    Listado plano de cada contenedor con su código QR, pallet, lote, cámara de origen y guía de despacho.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="text-xs bg-slate-100 border-slate-300 font-bold">
                                {filteredBins.length} Bins encontrados
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/80 text-xs">
                                        <TableHead className="w-12 text-center">#</TableHead>
                                        <TableHead className="w-[170px]">Código QR / Bin</TableHead>
                                        <TableHead className="w-[140px]">Pallet ID</TableHead>
                                        <TableHead>Variedad / Producto</TableHead>
                                        <TableHead className="w-[150px]">Lote Cliente</TableHead>
                                        <TableHead className="text-center w-20">Plantas</TableHead>
                                        <TableHead className="w-[140px]">Origen Cámara</TableHead>
                                        <TableHead className="w-[140px]">Guía Despacho</TableHead>
                                        <TableHead>Destinatario</TableHead>
                                        <TableHead className="w-[160px]">Fecha Despacho</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 8 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={10}>
                                                    <Skeleton className="h-6 w-full" />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredBins && filteredBins.length > 0 ? (
                                        filteredBins.map((bin, idx) => (
                                            <TableRow key={bin.id} className="hover:bg-blue-50/30 text-xs">
                                                <TableCell className="text-center font-mono text-muted-foreground text-[11px]">
                                                    {idx + 1}
                                                </TableCell>
                                                <TableCell>
                                                    <button
                                                        onClick={() => handleOpenQRModal(bin.containerId)}
                                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 border border-blue-200 text-blue-900 font-mono font-bold hover:bg-blue-100 hover:border-blue-300 transition-colors group"
                                                        title="Ver y ampliar Código QR"
                                                    >
                                                        <QrCode className="h-3.5 w-3.5 text-[#004b8d]" />
                                                        <span>{bin.containerId}</span>
                                                    </button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                                                        {bin.palletId}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-semibold text-zinc-800">
                                                    {bin.productName}
                                                </TableCell>
                                                <TableCell className="font-mono text-[11px] text-slate-600">
                                                    {bin.clientLotId}
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-zinc-800">
                                                    {bin.plantsPerBin}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px] font-medium bg-zinc-50 border-zinc-300 text-zinc-700">
                                                        {bin.chamberId} • {bin.coordinate}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {bin.dispatchDocument ? (
                                                        <Badge variant="outline" className="font-mono text-[11px] bg-slate-100 text-slate-800 border-slate-300 font-bold">
                                                            Guía N° {bin.dispatchDocument}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground italic text-[11px]">Sin Guía</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-zinc-800 truncate max-w-[180px]" title={bin.destinationClientName}>
                                                        {bin.destinationClientName}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-slate-600 whitespace-nowrap text-[11px]">
                                                    {bin.dispatchDate?.toDate ? bin.dispatchDate.toDate().toLocaleString('es-CL') : 'Sin fecha'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                                                {searchTerm ? 'No se encontraron bins que coincidan con el término de búsqueda.' : 'No hay registros de bins despachados.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Modal for QR Preview */}
            <QRPreviewModal
                code={previewQrCode}
                open={isQrModalOpen}
                onOpenChange={setIsQrModalOpen}
            />
        </div>
    );
}
