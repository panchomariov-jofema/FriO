'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherClient, PackagingReception, PackagingMaster, PackagingMovementItem } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Trash2 } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// --- Schemas ---
const autoDispatchItemSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio.'),
  name: z.string(),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
});
const autoDispatchSchema = z.object({
  items: z.array(autoDispatchItemSchema).min(1, "Debe agregar al menos un artículo."),
});
type AutoDispatchFormValues = z.infer<typeof autoDispatchSchema>;

// --- Helper Components ---

function AutomaticDispatchTab({ selectedClientId, document, clientMasters, clientStock, onSubmit }: any) {
  const form = useForm<AutoDispatchFormValues>({
    resolver: zodResolver(autoDispatchSchema),
    defaultValues: { items: [{ code: '', name: '', quantity: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const handleCodeBlur = (index: number) => {
    const code = form.getValues(`items.${index}.code`);
    if (!code) return;
    const master = clientMasters.find((m: PackagingMaster) => m.code === code);
    if (master) {
      form.setValue(`items.${index}.name`, master.name);
      form.clearErrors(`items.${index}.code`);
    } else {
      form.setValue(`items.${index}.name`, '');
      form.setError(`items.${index}.code`, { message: 'Inválido' });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit(values, 'automatico'))} className="space-y-4 pt-4">
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-10 gap-4 items-start">
                <FormField
                  control={form.control}
                  name={`items.${index}.code`}
                  render={({ field: itemField }) => (
                    <FormItem className="sm:col-span-3">
                      <FormLabel className={index > 0 ? 'sr-only' : ''}>Código Artículo</FormLabel>
                      <FormControl>
                        <Input 
                            {...itemField}
                            onBlur={() => handleCodeBlur(index)}
                            autoComplete="off"
                            placeholder="Código..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name={`items.${index}.name`}
                  render={({ field: itemField }) => (
                    <FormItem className="sm:col-span-4">
                      <FormLabel className={index > 0 ? 'sr-only' : ''}>Descripción</FormLabel>
                      <FormControl><Input {...itemField} readOnly placeholder="--" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field: itemField }) => (
                        <FormItem className="sm:col-span-3">
                            <FormLabel className={index > 0 ? 'sr-only' : ''}>Cantidad Pallets</FormLabel>
                            <FormControl><Input type="number" {...itemField} value={itemField.value || ''} autoComplete="off" min="1" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-6">
                <Trash2 className="h-4 w-4 text-destructive"/>
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ code: '', name: '', quantity: 0 })}>
          <PlusCircle className="mr-2 h-4 w-4" /> Agregar Producto
        </Button>
      </form>
    </Form>
  );
}

function ManualDispatchTab({ clientStock, dispatchQuantities, handleQuantityChange }: any) {
    const [codeFilter, setCodeFilter] = React.useState('');

    const filteredStock = React.useMemo(() => {
        const filters = codeFilter.split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
        if (filters.length === 0) {
            return clientStock;
        }
        return clientStock.filter((item: any) => 
            filters.some(filter => item.code.toLowerCase().includes(filter))
        );
    }, [clientStock, codeFilter]);

    return (
        <div className="pt-4 space-y-4">
            <div className="flex justify-end">
                 <Input
                    placeholder="Filtrar por código(s)..."
                    value={codeFilter}
                    onChange={(e) => setCodeFilter(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            <div className="rounded-md border max-h-[50vh] overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Artículo</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Lote</TableHead>
                            <TableHead>Ubicación</TableHead>
                            <TableHead>Disponible</TableHead>
                            <TableHead className="w-40">A Despachar</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredStock.length > 0 ? (
                            filteredStock.map((stockItem: any) => (
                                <TableRow key={stockItem.key}>
                                    <TableCell>{stockItem.name}</TableCell>
                                    <TableCell className="font-mono">{stockItem.code}</TableCell>
                                    <TableCell>{stockItem.lote}</TableCell>
                                    <TableCell>{stockItem.location}</TableCell>
                                    <TableCell>{stockItem.available}</TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0"
                                            max={stockItem.available}
                                            value={dispatchQuantities[stockItem.key] || ''}
                                            onChange={e => handleQuantityChange(stockItem.key, stockItem.available, e.target.value)}
                                            placeholder="0"
                                            className="h-8"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    {clientStock.length > 0 ? 'No hay items que coincidan con el filtro.' : 'No hay stock disponible para este cliente.'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}


export function ExitTab() {
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = React.useState<string>('');
  const [document, setDocument] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [dispatchQuantities, setDispatchQuantities] = React.useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = React.useState('automatico');

  const autoDispatchForm = useForm<AutoDispatchFormValues>({
    resolver: zodResolver(autoDispatchSchema),
    defaultValues: { items: [{ code: '', name: '', quantity: 0 }] },
  });
  
  const packagingClients = React.useMemo(() => {
    return (allClients || []).filter(c => c.type.toLowerCase() === 'embalaje' && c.status !== 'inactivo');
  }, [allClients]);

  const clientMasters = React.useMemo(() => {
     if (!selectedClientId || !allPackagingMasters) return [];
     const uniqueMasters = new Map<string, PackagingMaster>();
      allPackagingMasters
        .filter(m => m.clientId === selectedClientId)
        .forEach(m => {
            if (!uniqueMasters.has(m.code)) {
                uniqueMasters.set(m.code, m);
            }
        });
    return Array.from(uniqueMasters.values());
  }, [selectedClientId, allPackagingMasters]);
  
  const clientStock = React.useMemo(() => {
     if (!selectedClientId || !allReceptions) return [];
     return allReceptions
        .filter(r => r.clientId === selectedClientId)
        .flatMap(reception =>
            reception.items.map((item, index) => ({ item, index, reception }))
        )
        .filter(({ item }) => item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation)
        .map(({ item, index, reception }) => ({
            key: `${reception.id}_${index}`,
            receptionId: reception.id,
            itemIndex: index,
            code: item.packagingMasterCode,
            name: item.packagingMasterName,
            lote: item.lote || '-',
            location: `${item.storageLocation!.warehouse} / ${item.storageLocation!.aisle}`,
            available: item.palletCount,
            storedAt: item.storedAt,
        }));
  }, [selectedClientId, allReceptions]);

  const handleClientChange = (value: string) => {
    setSelectedClientId(value);
    setDocument('');
    setDispatchQuantities({});
    autoDispatchForm.reset({ items: [{ code: '', name: '', quantity: 0 }] });
  };
  
  const handleQuantityChange = (key: string, available: number, value: string) => {
    const numValue = parseInt(value, 10);
    if (value === '' || (numValue >= 0 && !isNaN(numValue))) {
        const finalValue = Math.min(numValue, available);
        if (numValue > available) {
             toast({
                title: "Cantidad inválida",
                description: `La cantidad no puede superar los ${available} pallets disponibles.`,
                variant: "destructive",
            });
        }
        setDispatchQuantities(prev => ({ ...prev, [key]: finalValue || 0 }));
    }
  };
  
  const onSubmit = async (values: AutoDispatchFormValues | null, type: 'automatico' | 'manual') => {
    setIsSubmitting(true);
    const itemsByCode = new Map<string, PackagingMovementItem>();

    if (type === 'automatico' && values) {
      for (const requestedItem of values.items) {
          let quantityNeeded = requestedItem.quantity;
          const availableStockForCode = clientStock
              .filter(s => s.code === requestedItem.code)
              .sort((a, b) => ((a.storedAt as any)?.toMillis?.() ?? 0) - ((b.storedAt as any)?.toMillis?.() ?? 0));

          if (!itemsByCode.has(requestedItem.code)) {
              const master = clientMasters.find(m => m.code === requestedItem.code);
              itemsByCode.set(requestedItem.code, {
                  packagingMasterId: master?.id || '',
                  packagingMasterCode: requestedItem.code,
                  packagingMasterName: master?.name || 'Desconocido',
                  palletCount: 0,
                  locations: [],
              });
          }
          const movementItem = itemsByCode.get(requestedItem.code)!;
          
          for (const stockLocation of availableStockForCode) {
              if (quantityNeeded <= 0) break;
              
              const quantityToTake = Math.min(quantityNeeded, stockLocation.available);
              movementItem.palletCount += quantityToTake;
              movementItem.locations!.push({
                  locationKey: stockLocation.key,
                  receptionId: stockLocation.receptionId,
                  itemIndex: stockLocation.itemIndex,
                  palletsToWithdraw: quantityToTake,
                  locationString: stockLocation.location,
                  available: stockLocation.available,
              });
              quantityNeeded -= quantityToTake;
          }
          if (quantityNeeded > 0) {
               toast({ variant: 'destructive', title: 'Stock Insuficiente', description: `Faltan ${quantityNeeded} pallets de ${requestedItem.name} para completar la solicitud.` });
               setIsSubmitting(false);
               return;
          }
      }
    } else if (type === 'manual') {
        const itemsToDispatch = Object.entries(dispatchQuantities).filter(([, qty]) => qty > 0);
        if (itemsToDispatch.length === 0) {
            toast({ variant: 'destructive', title: 'Sin ítems', description: 'Debe ingresar una cantidad.' });
            setIsSubmitting(false);
            return;
        }

        for (const [locationKey, quantity] of itemsToDispatch) {
            if (quantity <= 0) continue;
            const stockItem = clientStock.find(s => s.key === locationKey);
            if (!stockItem) continue;

            if (!itemsByCode.has(stockItem.code)) {
                const master = clientMasters.find(m => m.code === stockItem.code);
                itemsByCode.set(stockItem.code, {
                    packagingMasterId: master?.id || '',
                    packagingMasterCode: stockItem.code,
                    packagingMasterName: stockItem.name,
                    palletCount: 0,
                    locations: [],
                });
            }
            
            const movementItem = itemsByCode.get(stockItem.code)!;
            movementItem.palletCount += quantity;
            movementItem.locations!.push({
                locationKey: stockItem.key,
                receptionId: stockItem.receptionId,
                itemIndex: stockItem.itemIndex,
                palletsToWithdraw: quantity,
                locationString: stockItem.location,
                available: stockItem.available,
            });
        }
    }

    if (itemsByCode.size === 0) {
        toast({ variant: 'destructive', title: 'Sin ítems', description: 'No se seleccionaron artículos para despachar.' });
        setIsSubmitting(false);
        return;
    }

    try {
      const movementData = {
          type: 'salida' as const,
          clientId: selectedClientId,
          document: document || '',
          items: Array.from(itemsByCode.values()),
          status: 'Pendiente de Picking' as const,
          createdAt: serverTimestamp(),
      };
      await addDoc(collection(firestore, 'packagingMovements'), movementData);
      toast({ title: 'Solicitud Creada', description: 'La solicitud está pendiente de picking.' });
      setDispatchQuantities({});
      autoDispatchForm.reset({ items: [{ code: '', name: '', quantity: 0 }] });
      setDocument('');
    } catch (error) {
      console.error("Error creating packaging exit request:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la solicitud.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'packagingMovements', operation: 'create' }));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isLoading = loadingClients || loadingMasters || loadingReceptions;
  const totalSelectedPallets = Object.values(dispatchQuantities).reduce((sum, qty) => sum + (qty || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear Solicitud de Despacho</CardTitle>
        <CardDescription>Seleccione un cliente y elija el método de despacho.</CardDescription>
      </CardHeader>
      <CardContent>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label>Cliente de Embalaje</Label>
              <Select onValueChange={handleClientChange} value={selectedClientId} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder="Seleccione un cliente..." /></SelectTrigger>
                <SelectContent>{packagingClients.map(c => <SelectItem key={c.id} value={c.clientId}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Documento de Salida (Opcional)</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} autoComplete="off" />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="automatico">Despacho Automático (FIFO)</TabsTrigger>
                  <TabsTrigger value="manual">Despacho Manual</TabsTrigger>
              </TabsList>
              <TabsContent value="automatico" className="mt-4">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Añadir productos a despachar</CardTitle></CardHeader>
                    <CardContent>
                       <AutomaticDispatchTab
                            selectedClientId={selectedClientId}
                            document={document}
                            clientMasters={clientMasters}
                            clientStock={clientStock}
                            onSubmit={onSubmit}
                        />
                    </CardContent>
                  </Card>
              </TabsContent>
              <TabsContent value="manual" className="mt-4">
                  <ManualDispatchTab clientStock={clientStock} dispatchQuantities={dispatchQuantities} handleQuantityChange={handleQuantityChange} />
              </TabsContent>
          </Tabs>
          <div className="flex justify-between items-center mt-4">
            <div className="font-semibold text-sm">
                Total a Despachar: {activeTab === 'manual' ? totalSelectedPallets : autoDispatchForm.getValues('items').reduce((sum, i) => sum + (i.quantity || 0), 0)} pallets
            </div>
            <Button 
              onClick={activeTab === 'automatico' ? autoDispatchForm.handleSubmit((values) => onSubmit(values, 'automatico')) : () => onSubmit(null, 'manual')} 
              disabled={isSubmitting || !selectedClientId}
            >
                {isSubmitting ? 'Creando Solicitud...' : 'Crear Solicitud de Despacho'}
            </Button>
          </div>
      </CardContent>
    </Card>
  );
}
