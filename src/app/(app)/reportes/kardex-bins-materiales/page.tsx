'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialMovement, ChamberLot, Dispatch, Exporter, Producer, ReceptionLot, BinMaterial } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Timestamp, collection, doc, writeBatch, query, where, getDocs, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, Info, X, Calendar as CalendarIcon, Pencil } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { parse, format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, safeToMillis, safeToDate, safeFormatDate, safeFormatQuantity, formatLocaleDate, formatLocaleDateString } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const IMPORT_HEADER_MAP: Record<string, string> = {
  'Fecha (DD-MM-YYYY)': 'fecha',
  'Tipo (entrada/salida)': 'tipo',
  'Documento': 'documento',
  'Nombre Conductor': 'driverName',
  'RUT Conductor': 'driverRUT',
  'ID Exportador': 'exporterId',
  'ID Productor': 'producerId',
  'Codigo Material': 'binMaterialCode',
  'Cantidad': 'cantidad'
};
const FRIENDLY_HEADERS = Object.keys(IMPORT_HEADER_MAP);

const editMovementSchema = z.object({
  documento: z.string().min(1, 'Obligatorio'),
  driverName: z.string().optional(),
  cantidad: z.coerce.number().positive('Debe ser mayor a 0'),
  associationType: z.enum(['producer', 'client']),
  producerId: z.string().optional(),
  exporterId: z.string().optional(),
});

function convertToCSV(data: any[], headers: {key: string, label: string}[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
             if (value instanceof Date) {
                value = value.toLocaleString('es-CL');
            } else if (typeof value === 'object' && value !== null) {
                value = safeToDate(value).toLocaleString('es-CL');
            }
            const stringValue = String(value ?? '');
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}

function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.body.appendChild(document.createElement('a'));
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    document.body.removeChild(link);
}

interface KardexItem {
    key: string;
    fecha: Timestamp;
    exportador: string;
    productor: string;
    codigoProducto: string;
    nombreProducto: string;
    cantidad: number;
    movimiento: string;
    tipo: 'Entrada' | 'Salida';
    userName?: string;
    documento?: string;
    driverName?: string;
    driverRUT?: string;
    patente?: string;
    sourceType: 'manual' | 'automatic';
    movementId?: string;
    itemIndex?: number;
}


export default function BinMaterialKardexReportPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const isAuthorized = user?.email === 'francisco.villarreal@outlook.es' || user?.email === 'jlog@frio.cl';
    const isAdmin = user?.email === 'francisco.villarreal@outlook.es';

    // Filters State
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
    const [docFilter, setDocFilter] = React.useState('');
    const [expFilter, setExpFilter] = React.useState('');
    const [prodFilter, setProdFilter] = React.useState('');
    const [nameFilter, setNameFilter] = React.useState('');
    const [userFilter, setUserFilter] = React.useState('');
    const [movFilter, setMovFilter] = React.useState('');
    const [typeFilter, setTypeFilter] = React.useState<'all' | 'Entrada' | 'Salida'>('all');
    const [driverFilter, setDriverFilter] = React.useState('');

    // Actions State
    const [itemToEdit, setItemToEdit] = React.useState<KardexItem | null>(null);
    const [itemToDelete, setItemToDelete] = React.useState<KardexItem | null>(null);
    const [isSubmittingAction, setIsSubmittingAction] = React.useState(false);

    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    const { data: receptionLots, loading: loadingReceptions } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: allMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');

    const editForm = useForm<z.infer<typeof editMovementSchema>>({
        resolver: zodResolver(editMovementSchema),
    });
    const watchAssociationType = editForm.watch('associationType');

    React.useEffect(() => {
        if (itemToEdit) {
            const movSnap = (movements || []).find(m => m.id === itemToEdit.movementId);
            const hasProducer = !!movSnap?.producerId;
            const hasExporter = !!movSnap?.exporterId;
            const associationType = (hasExporter && !hasProducer) ? 'client' : 'producer';
            
            editForm.reset({
                documento: itemToEdit.documento || '',
                driverName: itemToEdit.driverName || '',
                cantidad: itemToEdit.cantidad,
                associationType: associationType,
                producerId: movSnap?.producerId || '',
                exporterId: movSnap?.exporterId || '',
            });
        }
    }, [itemToEdit, editForm, movements]);

    const loading = loadingMovements || loadingChamberLots || loadingDispatches || loadingExporters || loadingProducers || loadingReceptions;

    const { exporterMap, producerMap, receptionLotMap, materialMasterMap } = React.useMemo(() => {
        const expMap = new Map((exporters || []).map(e => [e.exporterId, e.name]));
        const prodMap = new Map((producers || []).map(p => [p.producerId, p.shortName]));
        const recLotMap = new Map((receptionLots || []).map(l => [l.displayLotId, l]));
        const matMasterMap = new Map((allMaterials || []).map(m => [m.code, m.name]));
        return { exporterMap: expMap, producerMap: prodMap, receptionLotMap: recLotMap, materialMasterMap: matMasterMap };
    }, [exporters, producers, receptionLots, allMaterials]);

    const formatUserName = (name?: string) => {
        if (!name) return 'N/A';
        if (name === 'francisco.villarreal@outlook.es') return 'ADMINISTRADOR';
        return name;
    };

    const rawKardexData = React.useMemo(() => {
        if (loading) return [];
        
        const allItems: KardexItem[] = [];

        const getCorrectedTimestamp = (ts: Timestamp) => {
            if (!ts) return ts;
            const d = safeToDate(ts);
            if (d.getFullYear() === 2026 && d.getMonth() === 3 && d.getDate() === 27) {
                const hours = d.getHours();
                const minutes = d.getMinutes();
                const timeValue = hours * 100 + minutes;
                if (timeValue >= 859 && timeValue <= 904) {
                    return Timestamp.fromDate(new Date(2026, 3, 24, 18, 0, 0));
                }
            }
            return ts;
        };

        (movements || []).forEach(mov => {
            const correctedDate = getCorrectedTimestamp(mov.createdAt);
            const isDirectDispatch = mov.observation === 'Despacho Directo';
            const typeLabel = (mov.type === 'entrada' && !isDirectDispatch) ? 'Entrada' : 'Salida';
            
            mov.items.forEach((item, index) => {
                let currentProductorName = producerMap.get(mov.producerId) || mov.producerId;
                
                if (mov.document === 'SALDO-INICIAL-2028' && item.binMaterialCode === '10017') {
                    currentProductorName = 'PALOGIX';
                }

                const currentMaterialName = materialMasterMap.get(item.binMaterialCode) || item.binMaterialName;

                allItems.push({
                    key: `${mov.id}_${index}`,
                    fecha: correctedDate,
                    exportador: exporterMap.get(mov.exporterId) || mov.exporterId,
                    productor: currentProductorName,
                    codigoProducto: item.binMaterialCode,
                    nombreProducto: currentMaterialName,
                    cantidad: item.quantity,
                    movimiento: mov.observation || (isDirectDispatch ? 'Despacho Directo' : 'Bins y Materiales'),
                    tipo: typeLabel as 'Entrada' | 'Salida',
                    userName: formatUserName(mov.userName),
                    documento: mov.document,
                    driverName: mov.driverName || '',
                    driverRUT: mov.driverRUT || '',
                    patente: (mov as any).patente_vehiculo || '',
                    sourceType: 'manual',
                    movementId: mov.id,
                    itemIndex: index,
                });
            });
        });

        (chamberLots || []).forEach(lot => {
            if (lot.status === 'Almacenado') {
                allItems.push({
                    key: `chamber-${lot.id}`,
                    fecha: getCorrectedTimestamp(lot.storedAt),
                    exportador: exporterMap.get(lot.exporterId) || lot.exporterId,
                    productor: lot.producerShortName,
                    codigoProducto: 'FRUTA',
                    nombreProducto: `Bins con ${lot.variety}`,
                    cantidad: lot.binCount,
                    movimiento: 'Almacenamiento Cámara',
                    tipo: 'Entrada',
                    userName: formatUserName(lot.userName),
                    documento: lot.displayLotId,
                    sourceType: 'automatic',
                });
            }
        });

        (dispatches || []).forEach(dispatch => {
            if (dispatch.status === 'Completado') {
                dispatch.bins.forEach((bin, index) => {
                    const originalReception = receptionLotMap.get(bin.displayLotId);
                    allItems.push({
                        key: `disp-${dispatch.id}-${index}`,
                        fecha: getCorrectedTimestamp(dispatch.createdAt),
                        exportador: dispatch.exporterName,
                        productor: originalReception ? (producerMap.get(originalReception.producerId) || originalReception.producerId) : 'N/A',
                        codigoProducto: 'FRUTA',
                        nombreProducto: `Salida ${originalReception?.variety || 'Fruta'}`,
                        cantidad: bin.binCount,
                        movimiento: 'Despacho a Packing',
                        tipo: 'Salida',
                        userName: formatUserName(dispatch.userName),
                        documento: bin.displayLotId,
                        sourceType: 'automatic',
                    });
                });
            }
        });

        return allItems.sort((a, b) => safeToMillis(b.fecha) - safeToMillis(a.fecha));
    }, [loading, movements, chamberLots, dispatches, exporterMap, producerMap, receptionLotMap, materialMasterMap]);

    const filteredKardexData = React.useMemo(() => {
        return rawKardexData.filter(item => {
            if (dateRange?.from) {
                const itemDate = safeToDate(item.fecha);
                const start = startOfDay(dateRange.from);
                const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
                if (!isWithinInterval(itemDate, { start, end })) return false;
            }

            if (docFilter && !item.documento?.toLowerCase().includes(docFilter.toLowerCase())) return false;
            if (expFilter && !item.exportador.toLowerCase().includes(expFilter.toLowerCase())) return false;
            if (prodFilter && !item.productor.toLowerCase().includes(prodFilter.toLowerCase())) return false;
            if (nameFilter && !item.nombreProducto.toLowerCase().includes(nameFilter.toLowerCase())) return false;
            if (userFilter && !item.userName?.toLowerCase().includes(userFilter.toLowerCase())) return false;
            if (movFilter && !item.movimiento.toLowerCase().includes(movFilter.toLowerCase())) return false;
            if (driverFilter && !item.driverName?.toLowerCase().includes(driverFilter.toLowerCase())) return false;
            if (typeFilter !== 'all' && item.tipo !== typeFilter) return false;

            return true;
        });
    }, [rawKardexData, dateRange, docFilter, expFilter, prodFilter, nameFilter, userFilter, movFilter, driverFilter, typeFilter]);
    

    const handleExport = () => {
        const headers = [
            { key: 'fecha', label: 'Fecha' },
            { key: 'documento', label: 'Documento' },
            { key: 'exportador', label: 'Exportador' },
            { key: 'productor', label: 'Productor' },
            { key: 'driverName', label: 'Nombre Conductor' },
            { key: 'driverRUT', label: 'RUT Conductor' },
            { key: 'patente', label: 'Patente' },
            { key: 'codigoProducto', label: 'Codigo del Producto' },
            { key: 'nombreProducto', label: 'Nombre del Producto' },
            { key: 'cantidad', label: 'Cantidad' },
            { key: 'movimiento', label: 'Movimiento' },
            { key: 'tipo', label: 'Entrada/Salida' },
            { key: 'userName', label: 'Usuario' },
        ];
        const csv = convertToCSV(filteredKardexData, headers);
        downloadCSV(csv, 'kardex_bins_y_materiales_detallado.csv');
    };

    const handleDownloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8," + FRIENDLY_HEADERS.join(',');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "plantilla_historico_kardex.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !firestore) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length <= 1) {
                toast({ title: 'Error', description: 'El archivo está vacío.', variant: 'destructive' });
                return;
            }

            const firstLine = lines[0];
            const delimiter = firstLine.includes(';') ? ';' : ',';

            const fileHeaders = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));
            if (!FRIENDLY_HEADERS.every(h => fileHeaders.includes(h))) {
                toast({ 
                  title: 'Formato inválido', 
                  description: `Las cabeceras no coinciden. Se espera: ${FRIENDLY_HEADERS.join(', ')}`, 
                  variant: 'destructive' 
                });
                return;
            }

            const materialMap = new Map(allMaterials.map(m => [`${m.code}_${m.exporterId}`, m]));
            const errors: string[] = [];
            let processed = 0;

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(delimiter).map(v => v.trim().replace(/"/g, ''));
                const rowData: Record<string, string> = {};
                
                fileHeaders.forEach((h, idx) => {
                    const internalKey = IMPORT_HEADER_MAP[h];
                    if (internalKey) {
                        rowData[internalKey] = values[idx];
                    }
                });

                const { fecha, tipo, documento, driverName, driverRUT, exporterId, producerId, binMaterialCode, cantidad } = rowData;
                const qty = parseInt(cantidad, 10);
                const type = tipo?.toLowerCase() as 'entrada' | 'salida';

                if (isNaN(qty)) {
                  errors.push(`Línea ${i + 1}: Cantidad no es un número.`);
                  continue;
                }

                const material = materialMap.get(`${binMaterialCode}_${exporterId}`);
                if (!material) {
                    errors.push(`Línea ${i + 1}: Material ${binMaterialCode} no existe para exportador ${exporterId}.`);
                    continue;
                }

                let parsedDate = parse(fecha, 'dd-MM-yyyy HH:mm', new Date());
                if (isNaN(parsedDate.getTime())) {
                    parsedDate = parse(fecha, 'dd-MM-yyyy', new Date());
                }

                if (isNaN(parsedDate.getTime())) {
                    errors.push(`Línea ${i + 1}: Fecha inválida (${fecha}).`);
                    continue;
                }

                const batch = writeBatch(firestore);

                const movementRef = doc(collection(firestore, 'binMaterialMovements'));
                batch.set(movementRef, {
                    type,
                    document: documento || '',
                    driverName: driverName || '',
                    driverRUT: driverRUT || '',
                    exporterId,
                    producerId,
                    items: [{
                        binMaterialId: material.id,
                        binMaterialCode: material.code,
                        binMaterialName: material.name,
                        quantity: qty
                    }],
                    createdAt: Timestamp.fromDate(parsedDate),
                    userName: user?.email || 'Sistema (Importación)',
                    userId: user?.uid,
                    observation: 'Carga Histórica / Saldo Inicial'
                });
                
                await batch.commit();
                processed++;
            }

            if (processed > 0) {
                toast({ title: 'Éxito', description: `${processed} registros cargados correctamente.` });
            }
            if (errors.length > 0) {
                toast({ 
                  title: 'Importación con advertencias', 
                  description: <div className="max-h-40 overflow-y-auto">{errors.map((e, idx) => <p key={idx}>{e}</p>)}</div>, 
                  variant: 'destructive',
                  duration: 8000
                });
            }
        };
        reader.readAsText(file);
    };

    const handleClearMovements = async () => {
        if (!firestore) return;
        try {
            const batch = writeBatch(firestore);
            const movementsSnap = await getDocs(collection(firestore, 'binMaterialMovements'));
            movementsSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
            toast({ title: 'Éxito', description: 'Todo el historial de movimientos ha sido eliminado.' });
        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'No se pudieron eliminar los registros.', variant: 'destructive' });
        }
    };

    const handleDeleteItem = async () => {
        if (!itemToDelete?.movementId || !firestore) return;
        setIsSubmittingAction(true);
        try {
            const movementRef = doc(firestore, 'binMaterialMovements', itemToDelete.movementId);
            const movSnap = (movements || []).find(m => m.id === itemToDelete.movementId);
            
            if (!movSnap) throw new Error('No se encontró el movimiento.');

            // Si el movimiento tiene solo un ítem, eliminamos el documento completo.
            // Si tiene varios, actualizamos el array eliminando solo ese índice.
            if (movSnap.items.length === 1) {
                await deleteDoc(movementRef);
            } else {
                const newItems = [...movSnap.items];
                newItems.splice(itemToDelete.itemIndex!, 1);
                await updateDoc(movementRef, { items: newItems });
            }

            toast({ title: 'Eliminado', description: 'El registro ha sido removido correctamente.' });
            setItemToDelete(null);
        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'No se pudo eliminar el registro.', variant: 'destructive' });
        } finally {
            setIsSubmittingAction(false);
        }
    };

    const handleUpdateItem = async (values: z.infer<typeof editMovementSchema>) => {
        if (!itemToEdit?.movementId || !firestore) return;
        setIsSubmittingAction(true);
        try {
            const movementRef = doc(firestore, 'binMaterialMovements', itemToEdit.movementId);
            const movSnap = (movements || []).find(m => m.id === itemToEdit.movementId);
            
            if (!movSnap) throw new Error('No se encontró el movimiento.');

            const newItems = [...movSnap.items];
            newItems[itemToEdit.itemIndex!] = {
                ...newItems[itemToEdit.itemIndex!],
                quantity: values.cantidad,
            };

            const updateData: any = {
                document: values.documento,
                driverName: values.driverName,
                items: newItems,
            };

            if (values.associationType === 'producer') {
                updateData.producerId = values.producerId || '';
                updateData.exporterId = '';
            } else {
                updateData.exporterId = values.exporterId || '';
                updateData.producerId = '';
            }

            await updateDoc(movementRef, updateData);

            toast({ title: 'Actualizado', description: 'El registro ha sido modificado correctamente.' });
            setItemToEdit(null);
        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'No se pudo actualizar el registro.', variant: 'destructive' });
        } finally {
            setIsSubmittingAction(false);
        }
    };

    const getBadgeVariant = (type: string): 'default' | 'destructive' => {
        return type === 'Entrada' ? 'default' : 'destructive';
    };

    const clearFilters = () => {
        setDateRange(undefined);
        setDocFilter('');
        setExpFilter('');
        setProdFilter('');
        setNameFilter('');
        setUserFilter('');
        setMovFilter('');
        setDriverFilter('');
        setTypeFilter('all');
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Kardex de Movimientos de Bins y Materiales"
                description="Historial consolidado de movimientos, ingresos a cámara y despachos."
                onExport={handleExport}
                isExportDisabled={loading || filteredKardexData.length === 0}
            >
                {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                            <Upload className="mr-2 h-4 w-4" />
                            Importar Histórico
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={loading}>
                            <Download className="mr-2 h-4 w-4" />
                            Descargar Plantilla
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={loading}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Limpiar Historial
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Está seguro de eliminar TODOS los movimientos registrados?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción eliminará permanentemente todos los registros del Kardex (manuales, importados, ingresos a cámara y despachos). Esta acción no se puede deshacer.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearMovements} className="bg-destructive hover:bg-destructive/90">
                                        Sí, Eliminar Todo el Historial
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileImport} />
                    </div>
                )}
            </ReportHeader>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-4 flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Rango de Fecha</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !dateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from && !isNaN(safeToDate(dateRange.from).getTime()) ? (
                                            dateRange.to && !isNaN(safeToDate(dateRange.to).getTime()) ? (
                                                <>{safeFormatDate(dateRange.from, "dd/MM/yy")} - {safeFormatDate(dateRange.to, "dd/MM/yy")}</>
                                            ) : (
                                                safeFormatDate(dateRange.from, "dd/MM/yy")
                                            )
                                        ) : (
                                            <span>Desde - Hasta</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10">
                            <X className="mr-2 h-4 w-4" /> Limpiar Filtros
                        </Button>
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="min-w-[120px]">Fecha</TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>Documento</span>
                                            <Input className="h-7 text-xs" placeholder="Buscar..." value={docFilter} onChange={e => setDocFilter(e.target.value)} />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>Exportador</span>
                                            <Input className="h-7 text-xs" placeholder="Filtrar..." value={expFilter} onChange={e => setExpFilter(e.target.value)} />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>Productor</span>
                                            <Input className="h-7 text-xs" placeholder="Filtrar..." value={prodFilter} onChange={e => setProdFilter(e.target.value)} />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>Conductor</span>
                                            <Input className="h-7 text-xs" placeholder="Filtrar..." value={driverFilter} onChange={e => setDriverFilter(e.target.value)} />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>Producto</span>
                                            <Input className="h-7 text-xs" placeholder="Filtro..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} />
                                        </div>
                                    </TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>Usuario</span>
                                            <Input className="h-7 text-xs" placeholder="Filtro..." value={userFilter} onChange={e => setUserFilter(e.target.value)} />
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="space-y-1">
                                            <span>E/S</span>
                                            <Select value={typeFilter} onValueChange={(val: any) => setTypeFilter(val)}>
                                                <SelectTrigger className="h-7 text-xs w-[100px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos</SelectItem>
                                                    <SelectItem value="Entrada">Entrada</SelectItem>
                                                    <SelectItem value="Salida">Salida</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </TableHead>
                                    {isAuthorized && <TableHead className="text-right">Acciones</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 10 }).map((_, i) => <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : filteredKardexData.length > 0 ? (
                                    filteredKardexData.map(item => (
                                        <TableRow key={item.key}>
                                            <TableCell className="text-xs">{formatLocaleDate(item.fecha, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                                            <TableCell className="font-mono text-xs">{item.documento || '-'}</TableCell>
                                            <TableCell className="text-xs">{item.exportador}</TableCell>
                                            <TableCell className="text-xs">{item.productor}</TableCell>
                                            <TableCell className="text-xs">{item.driverName || '-'}</TableCell>
                                            <TableCell className="text-xs">{item.nombreProducto}</TableCell>
                                            <TableCell className={`font-semibold text-xs ${item.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.cantidad}
                                            </TableCell>
                                            <TableCell className="text-xs">{item.userName || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge variant={getBadgeVariant(item.tipo)} className="text-[10px] px-1.5 h-4">
                                                    {item.tipo}
                                                </Badge>
                                            </TableCell>
                                            {isAuthorized && (
                                                <TableCell className="text-right">
                                                    {item.sourceType === 'manual' && (
                                                        <div className="flex justify-end gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setItemToEdit(item)}>
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setItemToDelete(item)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={10} className="h-24 text-center">No hay registros coincidentes.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!itemToEdit} onOpenChange={(open) => !open && setItemToEdit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Movimiento</DialogTitle>
                        <DialogDescription>
                            Corrija los datos del movimiento manual. Los cambios afectarán los saldos en tiempo real.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleUpdateItem)} className="space-y-4">
                            <FormField
                                control={editForm.control}
                                name="documento"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>N° Documento</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="associationType"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Asociar Movimiento a</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                value={field.value}
                                                className="flex flex-row space-x-4"
                                            >
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                        <RadioGroupItem value="producer" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal cursor-pointer">
                                                        Productor
                                                    </FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                        <RadioGroupItem value="client" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal cursor-pointer">
                                                        Cliente
                                                    </FormLabel>
                                                </FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {watchAssociationType === 'producer' && (
                                <FormField
                                    control={editForm.control}
                                    name="producerId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Productor</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccione un productor" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {(() => {
                                                        const uniqueProdsMap = new Map<string, typeof producers[0]>();
                                                        (producers || []).forEach(p => {
                                                            if (!uniqueProdsMap.has(p.producerId) || p.status !== 'inactivo') {
                                                                uniqueProdsMap.set(p.producerId, p);
                                                            }
                                                        });
                                                        const currentProd = (producers || []).find(p => p.producerId === field.value);
                                                        if (field.value && currentProd && !uniqueProdsMap.has(field.value)) {
                                                            uniqueProdsMap.set(field.value, currentProd);
                                                        }
                                                        return Array.from(uniqueProdsMap.values())
                                                            .filter(p => p && p.producerId && (p.status !== 'inactivo' || p.producerId === field.value))
                                                            .map((prod) => (
                                                                <SelectItem key={prod.id || prod.producerId} value={prod.producerId}>
                                                                    {prod.shortName || 'Sin Nombre'} ({prod.producerId})
                                                                </SelectItem>
                                                            ));
                                                    })()}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {watchAssociationType === 'client' && (
                                <FormField
                                    control={editForm.control}
                                    name="exporterId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Cliente</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccione un cliente" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {(() => {
                                                        const uniqueExportersMap = new Map<string, typeof exporters[0]>();
                                                        (exporters || []).forEach(e => {
                                                            uniqueExportersMap.set(e.exporterId, e);
                                                        });
                                                        const currentExp = (exporters || []).find(e => e.exporterId === field.value);
                                                        if (field.value && currentExp && !uniqueExportersMap.has(field.value)) {
                                                            uniqueExportersMap.set(field.value, currentExp);
                                                        }
                                                        return Array.from(uniqueExportersMap.values())
                                                            .map((exp) => (
                                                                <SelectItem key={exp.id || exp.exporterId} value={exp.exporterId}>
                                                                    {exp.name || 'Sin Nombre'} ({exp.exporterId})
                                                                </SelectItem>
                                                            ));
                                                    })()}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <FormField
                                control={editForm.control}
                                name="driverName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre Conductor</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="cantidad"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cantidad ({itemToEdit?.nombreProducto})</FormLabel>
                                        <FormControl><Input type="number" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                                <Button type="submit" disabled={isSubmittingAction}>
                                    {isSubmittingAction ? 'Guardando...' : 'Guardar Cambios'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Alert */}
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está seguro de eliminar este registro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción es irreversible y ajustará el stock disponible en todos los reportes y módulos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive hover:bg-destructive/90" disabled={isSubmittingAction}>
                            {isSubmittingAction ? 'Eliminando...' : 'Sí, Eliminar Registro'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
