'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialMovement, ChamberLot, Dispatch, Exporter, Producer, ReceptionLot, BinMaterial } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Timestamp, collection, doc, writeBatch, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { parse } from 'date-fns';
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

const IMPORT_HEADERS = ['fecha', 'tipo', 'documento', 'driverName', 'driverRUT', 'exporterId', 'producerId', 'binMaterialCode', 'cantidad'];

function convertToCSV(data: any[], headers: {key: string, label: string}[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
             if (value instanceof Date) {
                value = value.toLocaleString('es-CL');
            } else if (typeof value === 'object' && value !== null && (value as any).toDate) {
                value = (value as any).toDate().toLocaleString('es-CL');
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
}


export default function BinMaterialKardexReportPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
    const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
    const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
    const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
    const { data: producers, loading: loadingProducers } = useFirestoreCollection<Producer>('producers');
    const { data: receptionLots, loading: loadingReceptions } = useFirestoreCollection<ReceptionLot>('receptionLots');
    const { data: allMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');

    const loading = loadingMovements || loadingChamberLots || loadingDispatches || loadingExporters || loadingProducers || loadingReceptions;

    const { exporterMap, producerMap, receptionLotMap } = React.useMemo(() => {
        const expMap = new Map((exporters || []).map(e => [e.exporterId, e.name]));
        const prodMap = new Map((producers || []).map(p => [p.producerId, p.shortName]));
        const recLotMap = new Map((receptionLots || []).map(l => [l.displayLotId, l]));
        return { exporterMap: expMap, producerMap: prodMap, receptionLotMap: recLotMap };
    }, [exporters, producers, receptionLots]);

    const kardexData = React.useMemo(() => {
        if (loading) return [];
        
        const allItems: KardexItem[] = [];

        // 1. Entradas y Salidas de Bins y Materiales
        (movements || []).forEach(mov => {
            const isDirectDispatch = mov.observation === 'Despacho Directo';
            mov.items.forEach((item, index) => {
                allItems.push({
                    key: `mov-${mov.id}-${index}`,
                    fecha: mov.createdAt,
                    exportador: exporterMap.get(mov.exporterId) || mov.exporterId,
                    productor: producerMap.get(mov.producerId) || mov.producerId,
                    codigoProducto: item.binMaterialCode,
                    nombreProducto: item.binMaterialName,
                    cantidad: item.quantity,
                    movimiento: isDirectDispatch ? 'Despacho Directo' : 'Bins y Materiales',
                    tipo: (mov.type === 'entrada' && !isDirectDispatch) ? 'Entrada' : 'Salida',
                    userName: mov.userName,
                });
            });
        });

        // 2. Bins Almacenados en Cámaras (Entrada)
        (chamberLots || []).forEach(lot => {
            if (lot.status === 'Almacenado') {
                allItems.push({
                    key: `chamber-${lot.id}`,
                    fecha: lot.storedAt,
                    exportador: exporterMap.get(lot.exporterId) || lot.exporterId,
                    productor: lot.producerShortName,
                    codigoProducto: 'FRUTA',
                    nombreProducto: lot.variety,
                    cantidad: lot.binCount,
                    movimiento: 'Almacenamiento Cámara',
                    tipo: 'Entrada',
                    userName: lot.userName,
                });
            }
        });

        // 3. Despachos (Salida)
        (dispatches || []).forEach(dispatch => {
            if (dispatch.status === 'Completado') {
                dispatch.bins.forEach((bin, index) => {
                    const originalReception = receptionLotMap.get(bin.displayLotId);
                    allItems.push({
                        key: `disp-${dispatch.id}-${index}`,
                        fecha: dispatch.createdAt,
                        exportador: dispatch.exporterName,
                        productor: originalReception ? (producerMap.get(originalReception.producerId) || originalReception.producerId) : 'N/A',
                        codigoProducto: 'FRUTA',
                        nombreProducto: originalReception?.variety || 'Variedad Desconocida',
                        cantidad: bin.binCount,
                        movimiento: 'Despacho',
                        tipo: 'Salida',
                        userName: dispatch.userName,
                    });
                });
            }
        });

        return allItems.sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis());
    }, [loading, movements, chamberLots, dispatches, exporterMap, producerMap, receptionLotMap]);
    

    const handleExport = () => {
        const headers = [
            { key: 'fecha', label: 'Fecha' },
            { key: 'exportador', label: 'Exportador' },
            { key: 'productor', label: 'Productor' },
            { key: 'codigoProducto', label: 'Codigo del Producto' },
            { key: 'nombreProducto', label: 'Nombre del Producto' },
            { key: 'cantidad', label: 'Cantidad' },
            { key: 'movimiento', label: 'Movimiento' },
            { key: 'tipo', label: 'Entrada/Salida' },
            { key: 'userName', label: 'Usuario' },
        ];
        
        const csv = convertToCSV(kardexData, headers);
        downloadCSV(csv, 'kardex_bins_y_materiales.csv');
    };

    const handleDownloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8," + IMPORT_HEADERS.join(',');
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
            const lines = text.split('\n').filter(line => line.trim() !== '');
            if (lines.length <= 1) {
                toast({ title: 'Error', description: 'El archivo está vacío.', variant: 'destructive' });
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim());
            if (!IMPORT_HEADERS.every(h => headers.includes(h))) {
                toast({ title: 'Formato inválido', description: 'Las cabeceras no coinciden.', variant: 'destructive' });
                return;
            }

            const materialMap = new Map(allMaterials.map(m => [`${m.code}_${m.exporterId}`, m]));
            const errors: string[] = [];
            let processed = 0;

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx]]));

                const { fecha, tipo, documento, driverName, driverRUT, exporterId, producerId, binMaterialCode, cantidad } = row;
                const qty = parseInt(cantidad, 10);
                const type = tipo.toLowerCase() as 'entrada' | 'salida';

                const material = materialMap.get(`${binMaterialCode}_${exporterId}`);
                if (!material) {
                    errors.push(`Línea ${i + 1}: Material ${binMaterialCode} no existe para exportador ${exporterId}`);
                    continue;
                }

                let parsedDate = parse(fecha, 'yyyy-MM-dd HH:mm', new Date());
                if (isNaN(parsedDate.getTime())) {
                    errors.push(`Línea ${i + 1}: Fecha inválida. Use YYYY-MM-DD HH:mm`);
                    continue;
                }

                const batch = writeBatch(firestore);

                // 1. Create movement
                const movementRef = doc(collection(firestore, 'binMaterialMovements'));
                batch.set(movementRef, {
                    type,
                    document: documento,
                    driverName,
                    driverRUT,
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
                    observation: 'Carga Histórica'
                });

                // 2. Update stock
                const stockQuery = query(
                    collection(firestore, 'binMaterialStock'),
                    where('exporterId', '==', exporterId),
                    where('binMaterialId', '==', material.id)
                );
                const stockSnap = await getDocs(stockQuery);
                const adjustment = type === 'entrada' ? qty : -qty;

                if (stockSnap.empty) {
                    const newStockRef = doc(collection(firestore, 'binMaterialStock'));
                    batch.set(newStockRef, {
                        binMaterialId: material.id,
                        binMaterialCode: material.code,
                        binMaterialName: material.name,
                        exporterId,
                        quantity: adjustment,
                        lastUpdatedAt: serverTimestamp()
                    });
                } else {
                    const stockDoc = stockSnap.docs[0];
                    const currentQty = stockDoc.data().quantity || 0;
                    batch.update(stockDoc.ref, {
                        quantity: currentQty + adjustment,
                        lastUpdatedAt: serverTimestamp()
                    });
                }
                
                await batch.commit();
                processed++;
            }

            if (processed > 0) {
                toast({ title: 'Éxito', description: `${processed} movimientos cargados y stock actualizado.` });
            }
            if (errors.length > 0) {
                toast({ title: 'Errores', description: `Se saltaron ${errors.length} líneas por errores.`, variant: 'destructive' });
            }
        };
        reader.readAsText(file);
    };

    const handleClearMovements = async () => {
        if (!firestore) return;
        try {
            const collectionsToClear = ['binMaterialMovements', 'chamberLots', 'dispatches'];
            let totalDeleted = 0;

            for (const collName of collectionsToClear) {
                const collRef = collection(firestore, collName);
                const snap = await getDocs(collRef);
                
                if (!snap.empty) {
                    const docs = snap.docs;
                    const chunks = [];
                    for (let i = 0; i < docs.length; i += 500) {
                      chunks.push(docs.slice(i, i + 500));
                    }

                    for (const chunk of chunks) {
                      const batch = writeBatch(firestore);
                      chunk.forEach((d) => {
                        batch.delete(d.ref);
                        totalDeleted++;
                      });
                      await batch.commit();
                    }
                }
            }

            if (totalDeleted === 0) {
                toast({ title: 'Sin registros', description: 'No hay datos en el Kardex para eliminar.' });
            } else {
                toast({ title: 'Éxito', description: `Se han eliminado ${totalDeleted} registros para reiniciar el Kardex por completo.` });
            }
        } catch (e) {
            console.error(e);
            toast({ title: 'Error', description: 'No se pudieron eliminar los registros.', variant: 'destructive' });
        }
    };

    const getBadgeVariant = (type: string): 'default' | 'destructive' => {
        switch(type) {
            case 'Entrada':
                return 'default';
            case 'Salida':
                return 'destructive';
            default:
                return 'default';
        }
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Kardex de Movimientos de Bins y Materiales"
                description="Historial de todos los movimientos de bins (fruta y vacíos) y materiales."
                onExport={handleExport}
                isExportDisabled={loading || kardexData.length === 0}
            >
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                        <Upload className="mr-2 h-4 w-4" />
                        Importar Histórico
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                        <Download className="mr-2 h-4 w-4" />
                        Plantilla Histórica
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
                                <AlertDialogTitle>¿Está seguro de eliminar TODO el historial?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción eliminará permanentemente todos los registros del reporte, incluyendo movimientos de materiales, ingresos a cámara y despachos de fruta.
                                    Úselo solo para reiniciar el sistema por completo.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleClearMovements} className="bg-destructive hover:bg-destructive/90">
                                    Sí, Eliminar Todo
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileImport} />
                </div>
            </ReportHeader>
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Exportador</TableHead>
                                    <TableHead>Productor</TableHead>
                                    <TableHead>Cód. Producto</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Usuario</TableHead>
                                    <TableHead>Movimiento</TableHead>
                                    <TableHead>Entrada/Salida</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 10 }).map((_, i) => <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : kardexData.length > 0 ? (
                                    kardexData.map(item => (
                                        <TableRow key={item.key}>
                                            <TableCell>{item.fecha?.toDate().toLocaleString()}</TableCell>
                                            <TableCell>{item.exportador}</TableCell>
                                            <TableCell>{item.productor}</TableCell>
                                            <TableCell>{item.codigoProducto}</TableCell>
                                            <TableCell>{item.nombreProducto}</TableCell>
                                            <TableCell className={`font-semibold ${item.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.cantidad}
                                            </TableCell>
                                            <TableCell>{item.userName || 'N/A'}</TableCell>
                                            <TableCell>{item.movimiento}</TableCell>
                                            <TableCell>
                                                <Badge variant={getBadgeVariant(item.tipo)}>
                                                    {item.tipo}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={9} className="h-24 text-center">No hay movimientos registrados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
