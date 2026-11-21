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
import { useBinMaterialsByExporter } from '@/hooks/use-bin-materials-by-exporter';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { BinMaterialMovement } from '@/lib/types';
import { usePackingsByExporter } from '@/hooks/use-packings-by-exporter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { isBinMaterialItem } from '@/lib/bins-rental-utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

const movementItemSchema = z.object({
  binMaterialId: z.string(),
  binMaterialCode: z.string(),
  binMaterialName: z.string(),
  quantity: z.coerce.number().min(0, 'La cantidad no puede ser negativa.'),
});

const movementSchema = z.object({
  document: z.string().min(1, 'El documento es obligatorio.'),
  driverName: z.string().optional(),
  driverRUT: z.string().optional(),
  packingId: z.string().optional(),
  items: z.array(movementItemSchema),
});

type MovementFormValues = z.infer<typeof movementSchema>;

interface EntriesTabProps {
  exporterId: string;
  exporterName: string | null;
  producerId: string;
  isDirectDispatch: boolean;
}

// Rules for automatic calculation
const calculationRules: Record<string, { binCode: string; related: Record<string, number> }> = {
    'SUBSOLE': { binCode: '10001', related: { '10002': 24, '10003': 1 } },
    'MEYER': { binCode: '10007', related: { '10008': 24, '10009': 1 } },
    'BLOSSOM': { binCode: '10011', related: { '10012': 24, '10013': 1 } }
};

export function EntriesTab({ exporterId, exporterName, producerId, isDirectDispatch }: EntriesTabProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { materials, loading: loadingMaterials } = useBinMaterialsByExporter(exporterId);
  const { data: packings, loading: loadingPackings } = usePackingsByExporter(exporterId);
  const { data: allMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');

  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { document: '', driverName: '', driverRUT: '', packingId: undefined, items: [] },
  });

  // Unique suggestions for Typeahead
  const suggestions = React.useMemo(() => {
    const names = new Set<string>();
    const ruts = new Set<string>();
    
    (allMovements || []).forEach(m => {
        if (m.driverName) names.add(m.driverName);
        if (m.driverRUT) ruts.add(m.driverRUT);
    });

    return {
        names: Array.from(names).sort(),
        ruts: Array.from(ruts).sort(),
    };
  }, [allMovements]);

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

  React.useEffect(() => {
    if (materials.length > 0) {
      form.reset({
        document: form.getValues('document'),
        driverName: form.getValues('driverName'),
        driverRUT: form.getValues('driverRUT'),
        packingId: undefined,
        items: materials.map(m => ({
          binMaterialId: m.id,
          binMaterialCode: m.code,
          binMaterialName: m.name,
          quantity: 0,
        })),
      });
    }
  }, [materials, form]);

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

      if (changedItem && (changedItem.binMaterialCode === rules.binCode || isBinMaterialItem(changedItem))) {
        const totalBinsQty = allItems.reduce((sum, item) => {
          if (!item) return sum;
          if (item.binMaterialCode === rules.binCode || isBinMaterialItem(item)) {
            const q = Number(item.quantity);
            return sum + (isNaN(q) ? 0 : q);
          }
          return sum;
        }, 0);

        Object.entries(rules.related).forEach(([relatedCode, multiplier]) => {
          const relatedItemIndex = allItems.findIndex(item => item && item.binMaterialCode === relatedCode);

          if (relatedItemIndex !== -1) {
            const newVal = totalBinsQty * multiplier;
            if (Number(form.getValues(`items.${relatedItemIndex}.quantity`)) !== newVal) {
              form.setValue(`items.${relatedItemIndex}.quantity`, newVal, { shouldValidate: true });
            }
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form, exporterName]);

  const onSubmit = async (values: MovementFormValues) => {
    if (!firestore) return;

    const itemsToProcess = values.items.filter(item => item.quantity > 0);

    if (itemsToProcess.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin ítems',
        description: 'Debe ingresar una cantidad para al menos un material.',
      });
      return;
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        const finalExporterId = exporterId === 'EXP004' ? 'EXP005' : exporterId;
        const movementData: Partial<BinMaterialMovement> & { createdAt: any, type: 'entrada', items: any[] } = {
          type: 'entrada' as const,
          document: values.document,
          driverName: values.driverName || '',
          driverRUT: values.driverRUT || '',
          packingId: values.packingId || null,
          exporterId: finalExporterId,
          producerId,
          items: itemsToProcess,
          createdAt: serverTimestamp() as any,
          userId: user?.uid,
          userName: user?.email || undefined,
        };

        if (isDirectDispatch) {
            movementData.observation = 'Despacho Directo';
        }
        
        transaction.set(movementRef, movementData);
      });

      const successDescription = isDirectDispatch 
        ? 'Movimiento de despacho directo registrado.'
        : 'Entrada registrada correctamente.';

      toast({ title: 'Éxito', description: successDescription });

      const resetItems = materials.map(m => ({
        binMaterialId: m.id,
        binMaterialCode: m.code,
        binMaterialName: m.name,
        quantity: 0
      }));
      form.reset({ document: '', driverName: '', driverRUT: '', packingId: undefined, items: resetItems });

    } catch (error: any) {
      console.error('Error processing entry:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la entrada.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements',
          operation: 'write'
      }));
    }
  };

  const formItems = form.getValues('items');
  const [showOptionalMobile, setShowOptionalMobile] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Entrada</CardTitle>
        <CardDescription>
          {isDirectDispatch 
            ? <span className="text-primary font-medium">Registrar un despacho directo del exportador al productor. Este movimiento no afectará el stock del frigorífico.</span>
            : 'Ingrese un documento y las cantidades de los materiales que ingresan al inventario.'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="document"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Documento</FormLabel>
                    <FormControl><Input {...field} placeholder="Ej: 1234" autoComplete="off" inputMode="numeric" className="h-11 sm:h-10 text-base sm:text-sm" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="packingId"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Packing (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!exporterId || loadingPackings}>
                            <FormControl>
                                <SelectTrigger className="h-11 sm:h-10 text-base sm:text-sm">
                                    <SelectValue placeholder={!exporterId ? 'Seleccione exportador' : 'Opcional...'} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {packings?.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
              />
              <div className="sm:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs text-muted-foreground border border-dashed h-9"
                  onClick={() => setShowOptionalMobile(prev => !prev)}
                >
                  <span>Datos del Conductor (Opcional)</span>
                  {showOptionalMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem className={showOptionalMobile ? 'block' : 'hidden sm:block'}>
                    <FormLabel>Nombre Conductor (Opcional)</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <Input {...field} autoComplete="off" list="entry-driver-names" className="h-11 sm:h-10 text-base sm:text-sm" />
                            <datalist id="entry-driver-names">
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
                  <FormItem className={showOptionalMobile ? 'block' : 'hidden sm:block'}>
                    <FormLabel>Rut Conductor (Opcional)</FormLabel>
                    <FormControl>
                        <div className="relative">
                            <Input {...field} autoComplete="off" inputMode="numeric" list="entry-driver-ruts" className="h-11 sm:h-10 text-base sm:text-sm" />
                            <datalist id="entry-driver-ruts">
                                {suggestions.ruts.map(rut => <option key={rut} value={rut} />)}
                            </datalist>
                        </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
                <FormLabel>Materiales</FormLabel>
                {/* Mobile View */}
                <div className="sm:hidden space-y-3">
                  {loadingMaterials ? (
                    <Skeleton className="h-20 w-full" />
                  ) : formItems.map((item, index) => (
                    <div key={item.binMaterialId} className="border p-3.5 rounded-lg bg-card shadow-xs">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">
                                {item.binMaterialName}
                                <span className="text-muted-foreground text-sm font-normal">{getMultiplierLabel(item.binMaterialCode)}</span>
                            </FormLabel>
                            <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  value={field.value ?? ''}
                                  autoComplete="off"
                                  inputMode="numeric"
                                  min="0"
                                  placeholder="Cantidad"
                                  onFocus={(e) => e.target.select()}
                                  className="h-12 text-lg font-semibold"
                                />
                            </FormControl>
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
                                <TableHead className="w-[180px]">Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingMaterials ? (
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
                                                        <Input
                                                          type="number"
                                                          {...field}
                                                          value={field.value ?? ''}
                                                          autoComplete="off"
                                                          inputMode="numeric"
                                                          min="0"
                                                          onFocus={(e) => e.target.select()}
                                                        />
                                                    </FormControl>
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
              <Button type="submit" disabled={form.formState.isSubmitting || loadingMaterials} className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-semibold">
                {form.formState.isSubmitting ? 'Registrando...' : 'Registrar Entrada'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
