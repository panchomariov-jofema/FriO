'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, runTransaction, serverTimestamp, getDocs, doc } from 'firebase/firestore';
import type { BinMaterialMovement, Producer, BusinessEntity, DTEGuiaDespacho, ChamberLot, Dispatch, Exporter } from '@/lib/types';
import { useBinMaterialsByExporter } from '@/hooks/use-bin-materials-by-exporter';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Textarea } from '../ui/textarea';

const movementItemSchema = z.object({
  binMaterialId: z.string(),
  binMaterialCode: z.string(),
  binMaterialName: z.string(),
  quantity: z.coerce.number().min(0, 'La cantidad no puede ser negativa.'),
});

const movementSchema = z.object({
  document: z.string().min(1, 'El número de documento es obligatorio.'),
  driverName: z.string().optional(),
  driverRUT: z.string().optional(),
  patente_vehiculo: z.string().optional(),
  observaciones: z.string().optional(),
  items: z.array(movementItemSchema),
});

type MovementFormValues = z.infer<typeof movementSchema>;

interface ExitsTabProps {
  exporterId: string;
  exporterName: string | null;
  producerId: string;
}

// Rules for automatic calculation
const calculationRules: Record<string, { binCode: string; related: Record<string, number> }> = {
    'SUBSOLE': { binCode: '10001', related: { '10002': 24, '10003': 1 } },
    'MEYER': { binCode: '10007', related: { '10008': 24, '10009': 1 } },
    'BLOSSOM': { binCode: '10011', related: { '10012': 24, '10013': 1 } }
};


export function ExitsTab({ exporterId, exporterName, producerId }: ExitsTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const { materials, loading: loadingMaterials } = useBinMaterialsByExporter(exporterId);
  const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
  const { data: businessEntities, loading: loadingEntities } = useFirestoreCollection<BusinessEntity>('businessEntities');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', driverName: '', driverRUT: '', patente_vehiculo: '', observaciones: '', items: [] },
  });

  // Unique suggestions for Typeahead
  const suggestions = React.useMemo(() => {
    const names = new Set<string>();
    const ruts = new Set<string>();
    const plates = new Set<string>();
    
    (movements || []).forEach(m => {
        if (m.driverName) names.add(m.driverName);
        if (m.driverRUT) ruts.add(m.driverRUT);
        if ((m as any).patente_vehiculo) plates.add((m as any).patente_vehiculo);
    });

    return {
        names: Array.from(names).sort(),
        ruts: Array.from(ruts).sort(),
        plates: Array.from(plates).sort(),
    };
  }, [movements]);

  const getMultiplierLabel = (itemCode: string): string => {
    if (!exporterName) return '';
    const rules = calculationRules[exporterName];
    if (!rules) return '';
    const multiplier = rules.related[itemCode];
    if (multiplier !== undefined) {
        return ` (x${multiplier})`;
    }
    return '';
  };

  // --- Dynamic Stock Calculation Logic ---
  const dynamicStock = React.useMemo(() => {
    if (loadingExporters || loadingMovements || loadingChamberLots || loadingDispatches || loadingMaterials) {
        return new Map<string, number>();
    }

    const stockMap = new Map<string, number>();
    const activeExporterIds = new Set(exporters.filter(e => e.status !== 'inactivo').map(e => e.exporterId));
    
    if (!activeExporterIds.has(exporterId)) return stockMap;

    // 1. Manual Movements from Kardex
    (movements || []).forEach(mov => {
        if (mov.exporterId !== exporterId || mov.observation === 'Despacho Directo') return;
        mov.items.forEach(item => {
            const current = stockMap.get(item.binMaterialCode) || 0;
            const qty = mov.type === 'entrada' ? item.quantity : -item.quantity;
            stockMap.set(item.binMaterialCode, current + qty);
        });
    });

    // 2. Fruit Bins in Chambers (In-stock in plant)
    (chamberLots || []).forEach(lot => {
        if (lot.exporterId === exporterId && lot.status === 'Almacenado') {
            const current = stockMap.get('FRUTA') || 0;
            stockMap.set('FRUTA', current + lot.binCount);
        }
    });

    // 3. Dispatches to Packing (Out-stock from plant)
    (dispatches || []).forEach(dispatch => {
        if (dispatch.exporterId === exporterId && dispatch.status === 'Completado') {
            const current = stockMap.get('FRUTA') || 0;
            stockMap.set('FRUTA', current - dispatch.totalBins);
        }
    });

    return stockMap;
  }, [movements, chamberLots, dispatches, exporters, exporterId, loadingExporters, loadingMovements, loadingChamberLots, loadingDispatches, loadingMaterials]);

  const getStockForMaterial = React.useCallback((binMaterialCode: string) => {
    return dynamicStock.get(binMaterialCode) || 0;
  }, [dynamicStock]);


  // Effect for automatic quantity calculation
  React.useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (!name || !name.startsWith('items.') || !name.endsWith('.quantity')) {
        return;
      }
      
      if (!exporterName) return;
      const rules = calculationRules[exporterName];
      if (!rules) return;

      const allItems = value.items;
      if (!allItems || allItems.length === 0) return;

      const changedIndexMatch = name.match(/items\.(\d+)\.quantity/);
      if (!changedIndexMatch) return;
      
      const changedIndex = parseInt(changedIndexMatch[1], 10);
      const changedItem = allItems[changedIndex];

      if (changedItem && changedItem.binMaterialCode === rules.binCode) {
        const pivotQty = Number(changedItem.quantity);
        
        if (isNaN(pivotQty)) return;

        Object.entries(rules.related).forEach(([relatedCode, multiplier]) => {
          const relatedItemIndex = allItems.findIndex(item => item.binMaterialCode === relatedCode);

          if (relatedItemIndex !== -1) {
            const newVal = pivotQty * multiplier;
            if (Number(form.getValues(`items.${relatedItemIndex}.quantity`)) !== newVal) {
              form.setValue(`items.${relatedItemIndex}.quantity`, newVal, { shouldValidate: true });
            }
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form, exporterName]);


  React.useEffect(() => {
    if (materials.length > 0) {
      form.reset({
        document: '',
        driverName: '',
        driverRUT: '',
        patente_vehiculo: '',
        observaciones: '',
        items: materials.map(m => ({
          binMaterialId: m.id,
          binMaterialCode: m.code,
          binMaterialName: m.name,
          quantity: 0,
        })),
      });
    }
  }, [materials, form]);

  const onSubmit = async (values: MovementFormValues) => {
    if (!firestore || !businessEntities) return;

    if (businessEntities.length === 0) {
        toast({ variant: 'destructive', title: 'Error de Configuración', description: 'Debe registrar al menos una entidad en "Datos Matriz" para emitir documentos.' });
        return;
    }

    const itemsToProcess = values.items.filter(item => item.quantity > 0);

    if (itemsToProcess.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin ítems',
        description: 'Debe ingresar una cantidad para al menos un material.',
      });
      return;
    }

    for (const item of itemsToProcess) {
        const availableStock = getStockForMaterial(item.binMaterialCode);
        if (item.quantity > availableStock) {
            toast({
                variant: 'destructive',
                title: 'Error de Stock',
                description: `No hay suficiente stock para "${item.binMaterialName}". Disponible: ${availableStock}, Solicitado: ${item.quantity}.`
            });
            return;
        }
    }
    
    const producerQuery = query(collection(firestore, 'producers'), where('producerId', '==', producerId));
    const producerQuerySnap = await getDocs(producerQuery);

    if (producerQuerySnap.empty) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se encontraron los datos del productor.' });
        return;
    }
    const producerData = producerQuerySnap.docs[0].data() as Producer;

    try {
      await runTransaction(firestore, async (transaction) => {
        // Create BinMaterialMovement
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        const movementData = {
          type: 'salida' as const,
          document: values.document,
          driverName: values.driverName || '',
          driverRUT: values.driverRUT || '',
          patente_vehiculo: values.patente_vehiculo || '',
          exporterId,
          producerId,
          items: itemsToProcess,
          createdAt: serverTimestamp(),
          userId: user?.uid,
          userName: user?.email,
        };
        transaction.set(movementRef, movementData);
        
        // Create pending DTE document
        const emisorData = businessEntities[0];
        const pendingDocRef = doc(collection(firestore, 'documentosPendientes'));
        const dteData: Omit<DTEGuiaDespacho, 'id' | 'createdAt'> = {
            idDoc: {
                tipoDTE: 52,
                folio: parseInt(values.document, 10) || 0,
                fchEmis: new Date().toISOString().split('T')[0],
            },
            emisor: {
                RUTEmisor: emisorData.rut,
                RznSocEmisor: emisorData.razonSocial,
                GiroEmis: emisorData.giro,
                Acteco: parseInt(emisorData.actividadComercial, 10) || undefined,
                DirOrigen: emisorData.direccion,
                CmnaOrigen: emisorData.comuna,
            },
            receptor: {
                RUTRecep: producerData.rut || 'N/A',
                RznSocRecep: producerData.name,
                GiroRecep: producerData.giro || 'N/A',
                DirRecep: producerData.direccion || 'N/A',
                CmnaRecep: producerData.comuna || 'N/A',
                CiudadRecep: producerData.ciudad || 'N/A',
            },
            transporte: {
                Patente: values.patente_vehiculo || '',
                DirDest: producerData.direccion || 'N/A',
                CmnaDest: producerData.comuna || 'N/A',
                CiudadDest: producerData.ciudad || 'N/A'
            },
            totales: {
                MntNeto: 0,
                MntExe: 0,
                IVA: 0,
                MntTotal: 0,
            },
            detalle: itemsToProcess.map((item, index) => ({
                NroLinDet: index + 1,
                NmbItem: item.binMaterialName,
                QtyItem: item.quantity,
                UnmdItem: 'unid',
                PrcItem: 0,
                MontoItem: 0,
            })),
            estado: 'PENDIENTE',
            sourceMovementId: movementRef.id,
        };
        transaction.set(pendingDocRef, { ...dteData, createdAt: serverTimestamp() });
      });

      toast({ title: 'Éxito', description: 'Salida registrada correctamente.' });
      const resetItems = materials.map(m => ({
        binMaterialId: m.id,
        binMaterialCode: m.code,
        binMaterialName: m.name,
        quantity: 0
      }));
      form.reset({ document: '', driverName: '', driverRUT: '', patente_vehiculo: '', observaciones: '', items: resetItems });

    } catch (error: any) {
      console.error('Error processing exit:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo procesar la salida.' });
       errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements or documentosPendientes',
          operation: 'write'
      }));
    }
  };
  
  const isLoading = loadingMaterials || loadingMovements || loadingEntities || loadingChamberLots || loadingDispatches || loadingExporters;
  const formItems = form.getValues('items');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Salida</CardTitle>
        <CardDescription>Ingrese las cantidades de los materiales que salen del inventario.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField
                control={form.control}
                name="document"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>N° Documento</FormLabel>
                    <FormControl><Input {...field} autoComplete="off" placeholder="Ej: 1234" /></FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                 <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Conductor (Opcional)</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <Input {...field} autoComplete="off" list="exit-driver-names" />
                            <datalist id="exit-driver-names">
                                {suggestions.names.map(name => <option key={name} value={name} />)}
                            </datalist>
                        </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="driverRUT"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rut Conductor (Opcional)</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <Input {...field} autoComplete="off" inputMode="numeric" list="exit-driver-ruts" />
                            <datalist id="exit-driver-ruts">
                                {suggestions.ruts.map(rut => <option key={rut} value={rut} />)}
                            </datalist>
                        </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="patente_vehiculo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patente Vehículo (Opcional)</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <Input {...field} value={field.value || ''} autoComplete="off" list="exit-vehicle-plates" />
                            <datalist id="exit-vehicle-plates">
                                {suggestions.plates.map(plate => <option key={plate} value={plate} />)}
                            </datalist>
                        </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="observaciones"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
                <FormLabel>Materiales</FormLabel>
                {/* Mobile View */}
                <div className="sm:hidden space-y-3">
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : formItems.map((item, index) => (
                    <div key={item.binMaterialId} className="border p-4 rounded-lg">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">
                                {item.binMaterialName}
                                <span className="text-muted-foreground text-sm font-normal">{getMultiplierLabel(item.binMaterialCode)}</span>
                            </FormLabel>
                            <FormControl>
                                <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" min="0" placeholder="Cantidad a retirar" className="h-12 text-lg" />
                            </FormControl>
                             <p className="text-sm text-muted-foreground pt-1">
                                Stock disponible: {getStockForMaterial(item.binMaterialCode)}
                             </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>

                {/* Desktop View */}
                 <div className="hidden sm:block rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="w-[240px]">Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                        <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : formItems.map((item, index) => (
                                <TableRow key={item.binMaterialId}>
                                    <TableCell className="font-medium">
                                        {item.binMaterialName}
                                        <span className="text-muted-foreground text-sm font-normal">{getMultiplierLabel(item.binMaterialCode)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantity`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input type="number" {...field} value={field.value ?? ''} autoComplete="off" min="0" />
                                                    </FormControl>
                                                     <p className="text-xs text-muted-foreground pt-1">
                                                        Stock: {getStockForMaterial(item.binMaterialCode)}
                                                     </p>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting || isLoading}>
                {form.formState.isSubmitting ? 'Registrando...' : 'Registrar Salida'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
