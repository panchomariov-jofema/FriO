'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { doc, deleteDoc, writeBatch, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value.toDate) {
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

interface EditMovementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: any;
    onSave: () => void;
}

function EditMovementDialog({ open, onOpenChange, item, onSave }: EditMovementDialogProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [document, setDocument] = React.useState('');
    const [dateStr, setDateStr] = React.useState('');
    const [temperature, setTemperature] = React.useState<number | ''>('');
    const [items, setItems] = React.useState<any[]>([]);
    const [isSaving, setIsSaving] = React.useState(false);

    React.useEffect(() => {
        if (open && item && firestore) {
            setDocument(item.document || '');
            const date = item.date?.toDate() || new Date();
            const tzoffset = date.getTimezoneOffset() * 60000;
            setDateStr(new Date(date.getTime() - tzoffset).toISOString().slice(0, 16));
            setTemperature(item.temperature !== undefined ? item.temperature : '');
            
            const colName = item.type === 'entrada' ? 'otherFruitReceptions' : 'otherFruitMovements';
            const docRef = doc(firestore, colName, item.id);
            getDoc(docRef).then(snap => {
                if (snap.exists()) {
                    const data = snap.data();
                    setItems(JSON.parse(JSON.stringify(data.items || [])));
                }
            }).catch(err => {
                console.error("Error fetching doc for edit:", err);
            });
        }
    }, [open, item, firestore]);

    const handleItemChange = (index: number, field: string, value: any) => {
        setItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSave = async () => {
        if (!firestore || !item) return;
        setIsSaving(true);
        try {
            const colName = item.type === 'entrada' ? 'otherFruitReceptions' : 'otherFruitMovements';
            const docRef = doc(firestore, colName, item.id);
            const dateVal = new Date(dateStr);
            const timestampVal = Timestamp.fromDate(dateVal);

            const batch = writeBatch(firestore);

            if (item.type === 'entrada') {
                const updateData: any = {
                    document,
                    createdAt: timestampVal,
                    items,
                    updatedAt: serverTimestamp()
                };
                if (temperature !== '') {
                    updateData.temperature = Number(temperature);
                }
                batch.update(docRef, updateData);
                await batch.commit();
                toast({ title: 'Éxito', description: 'Entrada actualizada correctamente.' });
            } else {
                const currentMovSnap = await getDoc(docRef);
                if (currentMovSnap.exists()) {
                    const currentMovData = currentMovSnap.data() as OtherFruitMovement;
                    const oldLocations = currentMovData.locations || [];
                    const newLocations = [...oldLocations];
                    const receptionUpdates = new Map<string, { ref: any, items: any[] }>();

                    for (let i = 0; i < items.length; i++) {
                        const oldQty = oldLocations[i]?.quantity || 0;
                        const newQty = Number(items[i].quantity);
                        const delta = newQty - oldQty;

                        if (delta !== 0 && oldLocations[i]) {
                            const loc = oldLocations[i];
                            
                            if (!receptionUpdates.has(loc.receptionId)) {
                                const recRef = doc(firestore, 'otherFruitReceptions', loc.receptionId);
                                const recSnap = await getDoc(recRef);
                                if (recSnap.exists()) {
                                    receptionUpdates.set(loc.receptionId, {
                                        ref: recRef,
                                        items: JSON.parse(JSON.stringify((recSnap.data() as OtherFruitReception).items))
                                    });
                                }
                            }

                            const update = receptionUpdates.get(loc.receptionId);
                            if (update) {
                                const itemToUpdate = update.items[loc.itemIndex];
                                if (itemToUpdate) {
                                    if (itemToUpdate.quantity < delta) {
                                        toast({
                                            variant: 'destructive',
                                            title: 'Cantidad Inválida',
                                            description: `No hay suficiente stock en la recepción original para el producto ${items[i].productName}.`
                                        });
                                        setIsSaving(false);
                                        return;
                                    }
                                    itemToUpdate.quantity -= delta;
                                    if (itemToUpdate.quantity === 0) {
                                        itemToUpdate.status = 'Despachado';
                                    } else {
                                        itemToUpdate.status = 'Almacenado';
                                    }
                                }
                            }
                            
                            newLocations[i] = {
                                ...loc,
                                quantity: newQty
                            };
                        }
                    }

                    receptionUpdates.forEach(update => {
                        batch.update(update.ref, { items: update.items, updatedAt: serverTimestamp() });
                    });

                    batch.update(docRef, {
                        document,
                        createdAt: timestampVal,
                        items: items.map((it) => ({
                            productCode: it.productCode,
                            productName: it.productName,
                            quantity: Number(it.quantity),
                            observation: it.observation || '',
                            clientLotId: it.clientLotId || ''
                        })),
                        locations: newLocations
                    });

                    await batch.commit();
                    toast({ title: 'Éxito', description: 'Despacho actualizado y stock sincronizado.' });
                }
            }
            onSave();
            onOpenChange(false);
        } catch (error) {
            console.error("Error updating document:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el registro.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar {item?.type === 'entrada' ? 'Entrada' : 'Salida'} de Fruta</DialogTitle>
                    <DialogDescription>
                        Realice cambios en los metadatos y cantidades. Se sincronizará el stock automáticamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-document">N° Documento</Label>
                            <Input 
                                id="edit-document"
                                value={document}
                                onChange={(e) => setDocument(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-date">Fecha/Hora</Label>
                            <Input 
                                id="edit-date"
                                type="datetime-local"
                                value={dateStr}
                                onChange={(e) => setDateStr(e.target.value)}
                            />
                        </div>
                    </div>

                    {item?.type === 'entrada' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-temp">Temperatura (°C)</Label>
                            <Input 
                                id="edit-temp"
                                type="number"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                        </div>
                    )}

                    <div className="border-t pt-4">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Detalle de Ítems</h4>
                        <div className="space-y-4">
                            {items.map((it, idx) => (
                                <div key={idx} className="p-3 bg-muted/40 rounded-lg border space-y-3">
                                    <div className="flex justify-between items-center text-xs font-bold">
                                        <span>{it.productName} ({it.productCode})</span>
                                        {it.storageLocation && (
                                            <Badge variant="outline" className="text-[10px]">
                                                {it.storageLocation.chamberId} / {it.storageLocation.coordinate}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cantidad ({item?.unit})</Label>
                                            <Input 
                                                type="number"
                                                className="h-8 text-xs"
                                                value={it.quantity}
                                                onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Lote Cliente</Label>
                                            <Input 
                                                className="h-8 text-xs font-mono"
                                                value={it.clientLotId || ''}
                                                onChange={(e) => handleItemChange(idx, 'clientLotId', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Observación</Label>
                                            <Input 
                                                className="h-8 text-xs"
                                                value={it.observation || ''}
                                                onChange={(e) => handleItemChange(idx, 'observation', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={isSaving} className="bg-[#004b8d] hover:bg-[#003a6d]">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function OtherFruitKardexReportPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { data: usersMaster } = useFirestoreCollection<any>('usersMaster');
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    const { toast } = useToast();

    const currentUserMaster = React.useMemo(() => {
        if (!user?.email || !usersMaster) return null;
        const emailUsername = user.email.split('@')[0].toLowerCase();
        return usersMaster.find(u => typeof u.userName === 'string' && u.userName.toLowerCase() === emailUsername) || null;
    }, [user, usersMaster]);

    const isMaestro = currentUserMaster?.profileId === 'MAESTRO' || user?.email === 'francisco.villarreal@outlook.es' || user?.email?.split('@')[0].toLowerCase() === 'francisco';
    
    const kardexData = React.useMemo(() => {
        const allMovements: any[] = [];

        if (receptions) {
            receptions.forEach(reception => {
                const receivedItems = (reception.items || []).filter(item => item && item.status !== 'Pendiente de recibir');
                if (receivedItems.length === 0) return;

                const totalQuantity = receivedItems.reduce((sum, item) => sum + item.quantity, 0);
                const observations = [...new Set(receivedItems.map(i => i.observation).filter(Boolean))].join(', ');

                const productNames = [...new Set(receivedItems.map(i => i.productName))].join(', ');
                const productCodes = [...new Set(receivedItems.map(i => i.productCode))].join(', ');
                const clientLotIds = [...new Set(receivedItems.map(i => i.clientLotId).filter(Boolean))].join(', ');

                allMovements.push({
                    key: `${reception.id}-E`,
                    id: reception.id,
                    date: reception.createdAt,
                    type: 'entrada',
                    clientName: reception.clientName,
                    document: reception.document,
                    documentNumber: reception.documentNumber,
                    temperature: reception.temperature,
                    clientLotId: clientLotIds || '-',
                    productCode: productCodes,
                    productName: productNames,
                    quantity: totalQuantity,
                    unit: reception.unit,
                    observation: observations || '-',
                    userName: reception.userName,
                });
            });
        }

        if (movements) {
            movements.forEach(movement => {
                if (movement.type !== 'salida') return;

                const totalQuantity = movement.items.reduce((sum, item) => sum + item.quantity, 0);
                const observations = [...new Set(movement.items.map(i => i.observation).filter(Boolean))].join(', ');

                const productNames = [...new Set(movement.items.map(i => i.productName))].join(', ');
                const productCodes = [...new Set(movement.items.map(i => i.productCode))].join(', ');
                const clientLotIds = [...new Set(movement.items.map(i => i.clientLotId).filter(Boolean))].join(', ');

                allMovements.push({
                    key: `${movement.id}-S`,
                    id: movement.id,
                    date: movement.createdAt,
                    type: 'salida',
                    clientName: movement.clientName,
                    document: movement.document,
                    documentNumber: '',
                    clientLotId: clientLotIds || '-',
                    productCode: productCodes,
                    productName: productNames,
                    quantity: -totalQuantity,
                    unit: movement.unit,
                    observation: observations || '-',
                    userName: movement.userName,
                });
            });
        }

        return allMovements.sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));
    }, [receptions, movements]);

    const [clientFilter, setClientFilter] = React.useState('all');
    const [productFilter, setProductFilter] = React.useState('');
    
    const filteredData = React.useMemo(() => {
        return kardexData.filter(item => {
            const clientMatch = clientFilter !== 'all' ? item.clientName.toLowerCase().includes(clientFilter.toLowerCase()) : true;
            const productMatch = productFilter ? item.productCode.toLowerCase().includes(productFilter.toLowerCase()) : true;
            return clientMatch && productMatch;
        });
    }, [kardexData, clientFilter, productFilter]);

    const clientOptions = React.useMemo(() => {
        return [...new Set(kardexData.map(item => item.clientName))];
    }, [kardexData]);

    const handleExport = () => {
        const dataToExport = filteredData.map(item => ({
            "Fecha": item.date?.toDate(),
            "Tipo": item.type,
            "Cliente": item.clientName,
            "Documento": item.document,
            "N° Documento": (item as any).documentNumber || '',
            "Temperatura": item.temperature ? `${item.temperature.toFixed(1)}°C` : '',
            "Lote Cliente": item.clientLotId || '',
            "Codigo Producto": item.productCode,
            "Nombre Producto": item.productName,
            "Cantidad": `${item.quantity} ${item.unit}`,
            "Observación": item.observation || '',
            "Usuario": item.userName || '',
        }));
        const headers = ["Fecha", "Tipo", "Cliente", "Documento", "N° Documento", "Temperatura", "Lote Cliente", "Codigo Producto", "Nombre Producto", "Cantidad", "Observación", "Usuario"];
        const csv = convertToCSV(dataToExport, headers);
        downloadCSV(csv, 'kardex_fruta_otros_clientes.csv');
    };

    const [deletingItem, setDeletingItem] = React.useState<any | null>(null);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [editingItem, setEditingItem] = React.useState<any | null>(null);

    const handleDeleteConfirm = async () => {
        if (!firestore || !deletingItem) return;
        setIsDeleting(true);
        try {
            if (deletingItem.type === 'entrada') {
                const recDocRef = doc(firestore, 'otherFruitReceptions', deletingItem.id);
                const recSnap = await getDoc(recDocRef);
                if (recSnap.exists()) {
                    const recData = recSnap.data() as OtherFruitReception;
                    const isAnyItemDispatched = recData.items.some(item => 
                        item.status === 'Despachado' || 
                        (item.status === 'Almacenado' && item.quantity === 0)
                    );
                    
                    if (isAnyItemDispatched) {
                        toast({ 
                            variant: 'destructive', 
                            title: 'Imposible Eliminar', 
                            description: 'Esta entrada ya tiene bins parcialmente o totalmente despachados. Debe eliminar los despachos asociados primero.' 
                        });
                        setIsDeleting(false);
                        setDeletingItem(null);
                        return;
                    }
                }
                await deleteDoc(recDocRef);
                toast({ title: 'Éxito', description: 'Entrada eliminada correctamente.' });
            } else {
                const batch = writeBatch(firestore);
                const movDocRef = doc(firestore, 'otherFruitMovements', deletingItem.id);
                const movSnap = await getDoc(movDocRef);
                if (movSnap.exists()) {
                    const movData = movSnap.data() as OtherFruitMovement;
                    
                    if (movData.locations && movData.locations.length > 0) {
                        const receptionUpdates = new Map<string, { ref: any, items: any[] }>();
                        
                        for (const loc of movData.locations) {
                            if (!receptionUpdates.has(loc.receptionId)) {
                                const recRef = doc(firestore, 'otherFruitReceptions', loc.receptionId);
                                const recSnap = await getDoc(recRef);
                                if (recSnap.exists()) {
                                    receptionUpdates.set(loc.receptionId, {
                                        ref: recRef,
                                        items: JSON.parse(JSON.stringify((recSnap.data() as OtherFruitReception).items))
                                    });
                                }
                            }
                            
                            const update = receptionUpdates.get(loc.receptionId);
                            if (update) {
                                const itemToUpdate = update.items[loc.itemIndex];
                                if (itemToUpdate) {
                                    itemToUpdate.quantity += loc.quantity;
                                    itemToUpdate.status = 'Almacenado';
                                }
                            }
                        }
                        
                        receptionUpdates.forEach(update => {
                            batch.update(update.ref, { items: update.items, updatedAt: serverTimestamp() });
                        });
                        batch.delete(movDocRef);
                        await batch.commit();
                        toast({ title: 'Éxito', description: 'Despacho eliminado y stock devuelto a la cámara.' });
                    } else {
                        batch.delete(movDocRef);
                        await batch.commit();
                        toast({ title: 'Éxito', description: 'Despacho eliminado (el stock no pudo ser revertido automáticamente).' });
                    }
                }
            }
            setDeletingItem(null);
        } catch (error) {
            console.error("Error deleting item:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el registro.' });
        } finally {
            setIsDeleting(false);
        }
    };

    const loading = loadingReceptions || loadingMovements;

    return (
        <div className="space-y-6">
            <ReportHeader
                title="Kardex de Movimientos de Fruta (Clientes)"
                description="Historial detallado de entradas y salidas de fruta de clientes externos."
                onExport={handleExport}
                isExportDisabled={loading || filteredData.length === 0}
            >
                <div className="flex flex-col sm:flex-row gap-2">
                    <Select onValueChange={setClientFilter} value={clientFilter}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por cliente..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los Clientes</SelectItem>
                            {clientOptions.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input 
                        placeholder="Filtrar por código de producto..."
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                    />
                </div>
            </ReportHeader>
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha/Hora</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Temp (°C)</TableHead>
                                    <TableHead>Lote Cliente</TableHead>
                                    <TableHead>Cód. Prod.</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Cantidad</TableHead>
                                    <TableHead>Observación</TableHead>
                                    <TableHead>Usuario</TableHead>
                                    {isMaestro && <TableHead className="text-right">Acciones</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={isMaestro ? 12 : 11}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : filteredData.length > 0 ? (
                                    filteredData.map((item) => (
                                    <TableRow key={item.key}>
                                        <TableCell>{item.date?.toDate()?.toLocaleString() ?? 'Sin fecha'}</TableCell>
                                        <TableCell>
                                            <Badge variant={item.type === 'entrada' ? 'default' : 'secondary'}>
                                                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{item.clientName}</TableCell>
                                        <TableCell>
                                            <div>{item.document}</div>
                                            {(item as any).documentNumber && (
                                                <span className="text-[10px] text-muted-foreground block mt-0.5">Doc: {(item as any).documentNumber}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{item.temperature ? item.temperature.toFixed(1) : '-'}</TableCell>
                                        <TableCell className="font-mono">{item.clientLotId || '-'}</TableCell>
                                        <TableCell>{item.productCode}</TableCell>
                                        <TableCell>{item.productName}</TableCell>
                                        <TableCell className={item.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {item.quantity} {item.unit}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">
                                            {item.observation || '-'}
                                        </TableCell>
                                        <TableCell>{item.userName || 'N/A'}</TableCell>
                                        {isMaestro && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-[#004b8d] hover:bg-[#004b8d]/10"
                                                        onClick={() => setEditingItem(item)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                        onClick={() => setDeletingItem(item)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={isMaestro ? 12 : 11} className="h-24 text-center">No hay movimientos para los filtros seleccionados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <EditMovementDialog 
                open={editingItem !== null}
                onOpenChange={(open) => !open && setEditingItem(null)}
                item={editingItem}
                onSave={() => {}}
            />

            {/* Delete Confirmation Dialog */}
            {deletingItem && (
                <Dialog open={deletingItem !== null} onOpenChange={(open) => !open && setDeletingItem(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                                Confirmar Eliminación
                            </DialogTitle>
                            <DialogDescription>
                                ¿Está seguro que desea eliminar este registro? Esta acción afectará el stock en las cámaras.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
                            <p><strong>Tipo:</strong> {deletingItem.type === 'entrada' ? 'Entrada (Recepción)' : 'Salida (Despacho)'}</p>
                            <p><strong>Cliente:</strong> {deletingItem.clientName}</p>
                            <p><strong>Documento:</strong> {deletingItem.document}</p>
                            <p><strong>Cantidad:</strong> {deletingItem.quantity} {deletingItem.unit}</p>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeletingItem(null)} disabled={isDeleting}>Cancelar</Button>
                            <Button 
                                onClick={handleDeleteConfirm} 
                                disabled={isDeleting}
                                className="bg-destructive hover:bg-destructive/90 text-white"
                            >
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Eliminar Registro
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
