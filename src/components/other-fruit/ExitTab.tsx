'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { addDoc, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';

interface SelectedItem {
  receptionId: string;
  itemIndex: number;
  productName: string;
  productCode: string;
  quantity: number;
  unit: 'Bins' | 'Pallets';
  clientLotId?: string;
  coordinate: string;
}

interface AggregatedLot {
  displayLotId: string;
  unit: 'Bins' | 'Pallets';
  totalQuantity: number;
  locations: {
    receptionId: string;
    itemIndex: number;
    coordinate: string;
    quantity: number;
    productName: string;
    productCode: string;
    clientLotId?: string;
  }[];
}

export function OtherFruitExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [document, setDocument] = React.useState('');
  const [selectedItems, setSelectedItems] = React.useState<Record<string, SelectedItem>>({});
  const [isDispatching, setIsDispatching] = React.useState(false);

  const fruitClients = React.useMemo(() => (allClients || []).filter(c => c.type.toUpperCase() === 'FRUTA'), [allClients]);
  const loading = loadingClients || loadingReceptions;

  const aggregatedStockByLot = React.useMemo(() => {
    if (!selectedClientId || !allReceptions) return [];

    const lotMap = new Map<string, AggregatedLot>();

    allReceptions.forEach(reception => {
      if (reception.clientId !== selectedClientId) return;

      reception.items.forEach((item, index) => {
        if (item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation?.coordinate && reception.displayLotId) {
          if (!lotMap.has(reception.displayLotId)) {
            lotMap.set(reception.displayLotId, {
              displayLotId: reception.displayLotId,
              unit: reception.unit,
              totalQuantity: 0,
              locations: [],
            });
          }

          const lot = lotMap.get(reception.displayLotId)!;
          lot.totalQuantity += item.quantity;
          lot.locations.push({
            receptionId: reception.id,
            itemIndex: index,
            coordinate: item.storageLocation.coordinate,
            quantity: item.quantity,
            productName: item.productName,
            productCode: item.productCode,
            clientLotId: item.clientLotId,
          });
        }
      });
    });
    return Array.from(lotMap.values()).filter(lot => lot.totalQuantity > 0);
  }, [selectedClientId, allReceptions]);
  
  const handleSelect = (item: AggregatedLot['locations'][0], isSelected: boolean) => {
    const key = `${item.receptionId}-${item.itemIndex}`;
    setSelectedItems(prev => {
        const newSelection = {...prev};
        if (isSelected) {
            newSelection[key] = {
                receptionId: item.receptionId,
                itemIndex: item.itemIndex,
                productName: item.productName,
                productCode: item.productCode,
                quantity: item.quantity,
                unit: aggregatedStockByLot.find(l => l.locations.some(loc => loc.receptionId === item.receptionId))?.unit || 'Bins',
                clientLotId: item.clientLotId,
                coordinate: item.coordinate
            };
        } else {
            delete newSelection[key];
        }
        return newSelection;
    });
  };

  const handleSelectAllForLot = (lot: AggregatedLot, isSelected: boolean) => {
    setSelectedItems(prev => {
        const newSelection = { ...prev };
        lot.locations.forEach(loc => {
            const key = `${loc.receptionId}-${loc.itemIndex}`;
            if (isSelected) {
                newSelection[key] = {
                    receptionId: loc.receptionId,
                    itemIndex: loc.itemIndex,
                    productName: loc.productName,
                    productCode: loc.productCode,
                    quantity: loc.quantity,
                    unit: lot.unit,
                    clientLotId: loc.clientLotId,
                    coordinate: loc.coordinate
                };
            } else {
                delete newSelection[key];
            }
        });
        return newSelection;
    });
  };

  const handleDispatch = async () => {
     if (Object.keys(selectedItems).length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos una ubicación para despachar.' });
      return;
    }
    
    const client = fruitClients.find(c => c.clientId === selectedClientId);
    if (!client) {
      toast({ variant: 'destructive', title: 'Error', description: 'Cliente no encontrado.' });
      return;
    }

    setIsDispatching(true);

    try {
        const batch = writeBatch(firestore);
        const receptionUpdates = new Map<string, OtherFruitReceptionItem[]>();
        
        Object.values(selectedItems).forEach(item => {
             if (!receptionUpdates.has(item.receptionId)) {
                const originalReception = allReceptions.find(r => r.id === item.receptionId);
                if (originalReception) {
                    receptionUpdates.set(item.receptionId, JSON.parse(JSON.stringify(originalReception.items)));
                }
            }
            
            const updatedItems = receptionUpdates.get(item.receptionId);
            if (updatedItems) {
                const itemToUpdate = updatedItems[item.itemIndex];
                if (itemToUpdate) {
                    itemToUpdate.quantity = 0; // Set to 0 as we are dispatching the whole coordinate item
                }
            }
        });

        receptionUpdates.forEach((items, receptionId) => {
            const receptionRef = doc(firestore, 'otherFruitReceptions', receptionId);
            batch.update(receptionRef, { items, updatedAt: serverTimestamp() });
        });

        const movementRef = doc(collection(firestore, 'otherFruitMovements'));
        batch.set(movementRef, {
            type: 'salida',
            clientId: client.clientId,
            clientName: client.name,
            unit: client.unit,
            document: document || `SALIDA-${Date.now()}`,
            items: Object.values(selectedItems).map(item => ({
                productCode: item.productCode,
                productName: item.productName,
                quantity: item.quantity,
                clientLotId: item.clientLotId,
            })),
            createdAt: serverTimestamp(),
        });
        
        await batch.commit();
        toast({ title: 'Éxito', description: 'Despacho registrado y stock actualizado.' });
        setSelectedItems({});
        setDocument('');

    } catch (error) {
         console.error("Error creating fruit dispatch:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar el despacho.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'otherFruitMovements or otherFruitReceptions',
            operation: 'write'
        }));
    } finally {
        setIsDispatching(false);
    }
  }
  
  const totalSelectedQuantity = React.useMemo(() => {
    return Object.values(selectedItems).reduce((sum, item) => sum + item.quantity, 0);
  }, [selectedItems]);


  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Salida de Fruta (Otros Clientes)</CardTitle>
        <CardDescription>
          Seleccione un cliente para ver su stock disponible. Expanda cada lote para seleccionar las coordenadas a despachar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Cliente</Label>
              <Select value={selectedClientId} onValueChange={(val) => {setSelectedClientId(val); setSelectedItems({});}} disabled={loading}>
                <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                <SelectContent>
                  {fruitClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Documento de Salida (Opcional)</Label>
              <Input placeholder="Ej: Vale de consumo, Guía..." value={document} onChange={(e) => setDocument(e.target.value)} disabled={!selectedClientId} />
            </div>
        </div>

        {selectedClientId && (
            loadingReceptions ? <Skeleton className="h-24 w-full" />
            : (
            <>
            <Accordion type="multiple" className="w-full">
                {aggregatedStockByLot.map(lot => {
                    const isAllSelectedForLot = lot.locations.length > 0 && lot.locations.every(loc => selectedItems[`${loc.receptionId}-${loc.itemIndex}`]);
                    const isSomeSelectedForLot = lot.locations.some(loc => selectedItems[`${loc.receptionId}-${loc.itemIndex}`]);

                    return (
                        <AccordionItem value={lot.displayLotId} key={lot.displayLotId}>
                            <AccordionTrigger>
                                <div className="flex justify-between w-full pr-4">
                                    <span className="font-mono">{lot.displayLotId}</span>
                                    <span className="font-semibold">{lot.totalQuantity} {lot.unit}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={isAllSelectedForLot ? true : isSomeSelectedForLot ? 'indeterminate' : false}
                                                onCheckedChange={(checked) => handleSelectAllForLot(lot, !!checked)}
                                                aria-label="Seleccionar todo en este lote"
                                            />
                                        </TableHead>
                                        <TableHead>Coordenada</TableHead>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Lote Cliente</TableHead>
                                        <TableHead>Cantidad</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lot.locations.map(loc => {
                                        const key = `${loc.receptionId}-${loc.itemIndex}`;
                                        return (
                                            <TableRow key={key}>
                                                <TableCell>
                                                    <Checkbox 
                                                        checked={!!selectedItems[key]}
                                                        onCheckedChange={(checked) => handleSelect(loc, !!checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono">{loc.coordinate}</TableCell>
                                                <TableCell>{loc.productName}</TableCell>
                                                <TableCell className="font-mono">{loc.clientLotId || '-'}</TableCell>
                                                <TableCell>{loc.quantity}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
             {aggregatedStockByLot.length === 0 && (
                <div className="text-center p-8 border-dashed border rounded-md text-sm text-muted-foreground">
                    No hay stock disponible para este cliente.
                </div>
            )}

            {Object.keys(selectedItems).length > 0 && (
                 <div className="flex justify-between items-center pt-4">
                    <div className="text-sm font-medium">
                        Total seleccionado: {totalSelectedQuantity} {Object.values(selectedItems)[0].unit}
                    </div>
                    <Button onClick={handleDispatch} disabled={isDispatching}>
                        {isDispatching ? "Despachando..." : "Confirmar Despacho"}
                    </Button>
                </div>
            )}
            </>
            )
        )}
      </CardContent>
    </Card>
  );
}
