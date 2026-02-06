'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import type { ChamberLot, Exporter, Packing, Variety } from '@/lib/types';
import { chambersConfig } from '@/lib/chambers-config';
import { usePackingsByExporter } from '@/hooks/use-packings-by-exporter';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { Skeleton } from '../ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { writeBatch, doc, collection, serverTimestamp, addDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Input } from '../ui/input';

const varieties: Variety[] = ['SANTINA', 'LAPINS', 'REGINA', 'KORDIA', 'SKEENA', 'SWEETHEART', 'SYLVIA', 'SUNBURST'];


interface ManualDispatchTabProps {
    exporters: Exporter[];
    loadingExporters: boolean;
    chamberLots: ChamberLot[];
    loadingChamberLots: boolean;
}

export function ManualDispatchTab({ exporters, loadingExporters, chamberLots, loadingChamberLots }: ManualDispatchTabProps) {
    const form = useForm({
        defaultValues: {
            exporterId: '',
            chamberId: '',
            variety: '',
            packingId: '',
        }
    });

    const [selectedLots, setSelectedLots] = React.useState<Record<string, ChamberLot>>({});
    const [quantities, setQuantities] = React.useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();

    const selectedExporterId = form.watch('exporterId');
    const { data: packings, loading: loadingPackings } = usePackingsByExporter(selectedExporterId);

    const filteredLots = React.useMemo(() => {
        const { exporterId, chamberId, variety } = form.getValues();
        return (chamberLots || [])
            .filter(lot =>
                lot.status === 'Almacenado' &&
                (!exporterId || lot.exporterId === exporterId) &&
                (!chamberId || lot.chamberId === chamberId) &&
                (!variety || lot.variety === variety)
            )
            .sort((a, b) => {
                if (!a.receptionDate) return 1;
                if (!b.receptionDate) return -1;
                return a.receptionDate.toMillis() - b.receptionDate.toMillis();
            }); // FIFO Sort
    }, [chamberLots, form.watch()]);

    const handleSelectLot = (lot: ChamberLot, isSelected: boolean) => {
        setSelectedLots(prev => {
            const newSelection = { ...prev };
            if (isSelected) {
                newSelection[lot.id] = lot;
            } else {
                delete newSelection[lot.id];
            }
            return newSelection;
        });

        // Also manage the quantities for editing
        setQuantities(prev => {
            const newQuantities = { ...prev };
            if (isSelected) {
                newQuantities[lot.id] = lot.binCount; // Initialize with full amount
            } else {
                delete newQuantities[lot.id];
            }
            return newQuantities;
        });
    };
    
    const handleQuantityChange = (lotId: string, max: number, value: string) => {
        const numValue = parseInt(value, 10);

        if (value === '' || (numValue >= 0 && !isNaN(numValue))) {
             if (numValue > max) {
                toast({
                    title: "Cantidad inválida",
                    description: `La cantidad no puede superar los ${max} bins disponibles.`,
                    variant: "destructive",
                });
                setQuantities(prev => ({ ...prev, [lotId]: max }));
            } else {
                setQuantities(prev => ({ ...prev, [lotId]: numValue || 0 }));
            }
        }
    };
    
    const handleCreateDispatch = async () => {
        const lotsToDispatch = Object.values(selectedLots);
        if (lotsToDispatch.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos un lote.' });
            return;
        }

        const { packingId } = form.getValues();
        const firstLot = lotsToDispatch[0];
        const mainExporterId = firstLot.exporterId;

        if (!lotsToDispatch.every(lot => lot.exporterId === mainExporterId)) {
            toast({ variant: 'destructive', title: 'Error de consistencia', description: 'Todos los lotes seleccionados deben pertenecer al mismo exportador.' });
            return;
        }
        
        const selectedExporter = exporters.find(e => e.exporterId === mainExporterId);
         if (!selectedExporter) {
            toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado para los lotes seleccionados.' });
            return;
        }


        setIsSubmitting(true);

        try {
            const batch = writeBatch(firestore);
            
            let totalBins = 0;
            let totalNetWeight = 0;

            for (const lot of lotsToDispatch) {
                const quantity = quantities[lot.id];
                if (quantity > 0) {
                     totalBins += quantity;
                    if (lot.netWeightPerBin) {
                        totalNetWeight += quantity * lot.netWeightPerBin;
                    }
                }
            }

            if (totalBins <= 0) {
                toast({ variant: 'destructive', title: 'Error', description: 'La cantidad total a despachar debe ser mayor a 0.' });
                setIsSubmitting(false);
                return;
            }

            const binsToDispatch = lotsToDispatch
                .filter(lot => quantities[lot.id] > 0)
                .map(lot => ({
                    chamberLotId: lot.id,
                    displayLotId: lot.displayLotId,
                    chamberId: lot.chamberId!,
                    coordinate: lot.coordinate!,
                    binCount: quantities[lot.id], // Use the edited quantity
                }));

            const dispatchData = {
                exporterId: selectedExporter.exporterId,
                exporterName: selectedExporter.name,
                packingId: packingId || null,
                totalBins: totalBins,
                totalNetWeight: totalNetWeight,
                status: 'Pendiente de Picking' as const,
                createdAt: serverTimestamp(),
                bins: binsToDispatch,
            };
            
            const dispatchRef = doc(collection(firestore, 'dispatches'));
            batch.set(dispatchRef, dispatchData);

            await batch.commit();
            
            toast({ title: 'Éxito', description: `Solicitud de despacho creada con ${totalBins} bins.` });
            setSelectedLots({});
            setQuantities({});
            form.reset();

        } catch (error: any) {
            console.error("Error creating manual dispatch request:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al crear la solicitud.' });
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'dispatches', operation: 'create' }));
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const { totalSelectedBins, totalSelectedNetWeight } = React.useMemo(() => {
        const lots = Object.values(selectedLots);
        const bins = lots.reduce((sum, lot) => sum + (quantities[lot.id] || 0), 0);
        const weight = lots.reduce((sum, lot) => sum + ((quantities[lot.id] || 0) * (lot.netWeightPerBin || 0)), 0);
        return { totalSelectedBins: bins, totalSelectedNetWeight: weight };
    }, [selectedLots, quantities]);


    return (
        <Card>
            <CardHeader>
                <CardTitle>Crear Solicitud de Despacho Manual</CardTitle>
                <CardDescription>
                    Filtre y seleccione los lotes específicos que desea incluir en la solicitud de despacho.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <Form {...form}>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <FormField control={form.control} name="exporterId" render={({ field }) => (
                            <FormItem><FormLabel>Exportador</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={loadingExporters}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger></FormControl>
                                <SelectContent>{exporters?.map(e => <SelectItem key={e.id} value={e.exporterId}>{e.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="chamberId" render={({ field }) => (
                            <FormItem><FormLabel>Cámara</FormLabel><Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger></FormControl>
                                <SelectContent>{Object.values(chambersConfig).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="variety" render={({ field }) => (
                             <FormItem><FormLabel>Variedad</FormLabel><Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger></FormControl>
                                <SelectContent>{varieties.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                            </Select><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="packingId" render={({ field }) => (
                            <FormItem><FormLabel>Packing</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedExporterId || loadingPackings}>
                                <FormControl><SelectTrigger><SelectValue placeholder={!selectedExporterId ? 'Seleccione exportador' : 'Opcional...'} /></SelectTrigger></FormControl>
                                <SelectContent>{packings?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage /></FormItem>
                        )} />
                    </div>
                </Form>

                <div className="rounded-md border max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"><Checkbox
                                    checked={filteredLots.length > 0 && Object.keys(selectedLots).length === filteredLots.length}
                                    onCheckedChange={(checked) => {
                                        const newSelection: Record<string, ChamberLot> = {};
                                        if (checked) {
                                            filteredLots.forEach(lot => newSelection[lot.id] = lot);
                                        }
                                        setSelectedLots(newSelection);
                                    }}
                                /></TableHead>
                                <TableHead>Lote</TableHead>
                                <TableHead>Cámara</TableHead>
                                <TableHead>Coord.</TableHead>
                                <TableHead className="w-24">Bins</TableHead>
                                <TableHead className="hidden md:table-cell">Peso Neto/Bin</TableHead>
                                <TableHead className="hidden md:table-cell">Productor</TableHead>
                                <TableHead className="hidden md:table-cell">Variedad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingChamberLots ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="w-full h-4" /></TableCell></TableRow>)
                            ) : filteredLots.length > 0 ? (
                                filteredLots.map(lot => (
                                    <TableRow key={lot.id} data-state={selectedLots[lot.id] ? 'selected' : ''}>
                                        <TableCell>
                                            <Checkbox
                                                checked={!!selectedLots[lot.id]}
                                                onCheckedChange={(checked) => handleSelectLot(lot, !!checked)}
                                            />
                                        </TableCell>
                                        <TableCell>{lot.displayLotId}</TableCell>
                                        <TableCell>{lot.chamberId}</TableCell>
                                        <TableCell>{lot.coordinate}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                className="h-8 w-20"
                                                value={quantities[lot.id] ?? lot.binCount}
                                                onChange={(e) => handleQuantityChange(lot.id, lot.binCount, e.target.value)}
                                                disabled={!selectedLots[lot.id]}
                                                min={0}
                                                max={lot.binCount}
                                            />
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">{lot.netWeightPerBin ? `${lot.netWeightPerBin.toFixed(2)} kg` : '-'}</TableCell>
                                        <TableCell className="hidden md:table-cell">{lot.producerShortName}</TableCell>
                                        <TableCell className="hidden md:table-cell">{lot.variety}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={8} className="h-24 text-center">No se encontraron lotes con los filtros seleccionados.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                 <div className="flex justify-between items-center pt-4">
                    <div className="text-sm font-medium">
                        {Object.keys(selectedLots).length} lote(s) seleccionados ({totalSelectedBins} bins). 
                        <span className="font-semibold"> Peso Neto Total: {totalSelectedNetWeight.toFixed(2)} kg</span>
                    </div>
                    <Button onClick={handleCreateDispatch} disabled={isSubmitting || Object.keys(selectedLots).length === 0}>
                        {isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Despacho'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
