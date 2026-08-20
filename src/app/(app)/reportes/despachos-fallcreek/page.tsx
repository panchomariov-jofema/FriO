'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Check, Edit2, X, Save, FileSpreadsheet } from 'lucide-react';

function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value?.toDate) { // Firebase Timestamp
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

export default function FallCreekDispatchReportPage() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');

    // Local states for editing document numbers
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [savingId, setSavingId] = React.useState<string | null>(null);

    // Filter dispatches for Fall Creek that are type 'salida' and status 'Completado'
    const fallCreekDispatches = React.useMemo(() => {
        return (movements || [])
            .filter(m => 
                (m.clientId === '76361536-7' || m.clientName?.toUpperCase() === 'FALL CREEK') &&
                m.type === 'salida' &&
                m.status === 'Completado'
            )
            .map(m => {
                // Get all variety names from items
                const varieties = (m.items || []).map(item => item.productName);
                const uniqueVarieties = Array.from(new Set(varieties));

                // Calculate total quantity of bins
                const totalBins = (m.items || []).reduce((sum, item) => sum + item.quantity, 0);

                return {
                    ...m,
                    varieties: uniqueVarieties,
                    totalBins
                };
            })
            // Sort by createdAt descending
            .sort((a, b) => {
                const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0) : 0;
                const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0) : 0;
                return dateB - dateA;
            });
    }, [movements]);

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

    const handleExport = () => {
        if (fallCreekDispatches.length === 0) return;
        
        const headers = ['createdAt', 'destinationClientName', 'totalBins', 'varieties', 'document', 'userName'];
        const dataForExport = fallCreekDispatches.map(m => {
            const dateStr = m.createdAt ? (m.createdAt.toDate ? m.createdAt.toDate().toLocaleString() : '') : '';
            return {
                createdAt: dateStr,
                destinationClientName: m.destinationClientName || 'N/A',
                totalBins: m.totalBins,
                varieties: m.varieties.join(', '),
                document: m.document || 'Sin documento',
                userName: m.userName || 'N/A'
            };
        });

        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'reporte_despachos_fall_creek.csv');
    };

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Reporte de Despachos Fall Creek"
                description="Listado de despachos confirmados con opción de ingresar/modificar documento de traslado."
                onExport={handleExport}
                isExportDisabled={loadingMovements || fallCreekDispatches.length === 0}
            />

            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">Fecha</TableHead>
                                    <TableHead>Destinatario (SubCliente)</TableHead>
                                    <TableHead>Variedad(es)</TableHead>
                                    <TableHead className="text-center w-24">Bins</TableHead>
                                    <TableHead className="w-[280px]">Documento de Despacho</TableHead>
                                    <TableHead className="w-[120px]">Usuario</TableHead>
                                    <TableHead className="text-center w-28">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingMovements ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={7}>
                                                <Skeleton className="h-5 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : fallCreekDispatches && fallCreekDispatches.length > 0 ? (
                                    fallCreekDispatches.map(dispatch => {
                                        const isEditing = editingId === dispatch.id;
                                        const isSaving = savingId === dispatch.id;

                                        return (
                                            <TableRow key={dispatch.id}>
                                                <TableCell className="font-medium whitespace-nowrap">
                                                    {dispatch.createdAt?.toDate ? dispatch.createdAt.toDate().toLocaleString() : 'Sin fecha'}
                                                </TableCell>
                                                <TableCell className="font-semibold text-zinc-700">
                                                    {dispatch.destinationClientName || 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {dispatch.varieties.map((v, i) => (
                                                            <Badge key={i} variant="secondary" className="text-[10px] font-normal px-1.5 py-0.5">
                                                                {v}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-sm text-[#004b8d]">
                                                    {dispatch.totalBins} Bins
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-1.5 w-full">
                                                            <Input
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                placeholder="N° Documento"
                                                                className="h-8 text-xs font-mono w-40"
                                                                disabled={isSaving}
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
                                                        <div className="flex items-center justify-between group max-w-[240px]">
                                                            <span className="font-mono text-sm">
                                                                {dispatch.document ? (
                                                                    <Badge variant="default" className="font-mono text-xs bg-muted text-zinc-700 hover:bg-muted border select-all">
                                                                        {dispatch.document}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground italic text-xs">Sin especificar (Opcional)</span>
                                                                )}
                                                            </span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-100"
                                                                onClick={() => handleStartEdit(dispatch.id, dispatch.document || '')}
                                                            >
                                                                <Edit2 className="h-3 w-3 text-[#004b8d]" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={dispatch.userName}>
                                                    {dispatch.userName || 'N/A'}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="default" className="bg-[#7aba28] hover:bg-[#7aba28] text-white font-bold text-[10px]">
                                                        Pickeado
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                            No hay despachos confirmados de Fall Creek.
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
