'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useUser } from '@/firebase';
import type { Exporter, BinMaterial, BinMaterialMovement, ChamberLot, Dispatch } from '@/lib/types';
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { Button } from '../ui/button';
import { Trash2, Upload, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
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

interface StockTabProps {
  exporterId: string | null;
}

const IMPORT_HEADERS = ['binMaterialCode', 'exporterId', 'quantity'];

function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function StockTab({ exporterId }: StockTabProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: movements, loading: loadingMovements } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');
  const { data: chamberLots, loading: loadingChamberLots } = useFirestoreCollection<ChamberLot>('chamberLots');
  const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');
  const { data: allMaterials, loading: loadingMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');

  const isAdmin = user?.email === 'francisco.villarreal@outlook.es';

  const loading = loadingExporters || loadingMovements || loadingChamberLots || loadingDispatches || loadingMaterials;

  const stockData = React.useMemo(() => {
    if (loading) return [];

    const activeExporterIds = new Set(exporters.filter(e => e.status !== 'inactivo').map(e => e.exporterId));
    const exporterMap = new Map(exporters.map(e => [e.exporterId, e.name]));
    const materialMap = new Map(allMaterials.map(m => [m.code, m.name]));

    const aggregation: Record<string, {
        exporterId: string;
        exporterName: string;
        materialCode: string;
        materialName: string;
        quantity: number;
    }> = {};

    const addToAggregation = (expId: string, code: string, name: string, qty: number) => {
        // Apply filter by exporterId if present
        if (exporterId && expId !== exporterId) return;
        if (!activeExporterIds.has(expId)) return;
        
        const key = `${expId}_${code}`;
        if (!aggregation[key]) {
            aggregation[key] = {
                exporterId: expId,
                exporterName: exporterMap.get(expId) || expId,
                materialCode: code,
                materialName: name,
                quantity: 0,
            };
        }
        aggregation[key].quantity += qty;
    };

    // 1. Manual Movements from Kardex
    (movements || []).forEach(mov => {
        if (mov.observation === 'Despacho Directo') return;
        mov.items.forEach(item => {
            const qty = mov.type === 'entrada' ? item.quantity : -item.quantity;
            const currentName = materialMap.get(item.binMaterialCode) || item.binMaterialName;
            addToAggregation(mov.exporterId, item.binMaterialCode, currentName, qty);
        });
    });

    // 2. Fruit Bins in Chambers (In-stock in plant)
    (chamberLots || []).forEach(lot => {
        if (lot.status === 'Almacenado') {
            addToAggregation(lot.exporterId, 'FRUTA', `Bins con ${lot.variety}`, lot.binCount);
        }
    });

    // 3. Dispatches to Packing (Out-stock from plant)
    (dispatches || []).forEach(dispatch => {
        if (dispatch.status === 'Completado') {
            addToAggregation(dispatch.exporterId, 'FRUTA', 'Salida por Despacho', -dispatch.totalBins);
        }
    });

    return Object.values(aggregation)
        .filter(item => item.quantity !== 0)
        .sort((a, b) => a.exporterName.localeCompare(b.exporterName) || a.materialCode.localeCompare(b.materialCode));
  }, [loading, exporters, movements, chamberLots, dispatches, allMaterials, exporterId]);

  const handleClearStock = async () => {
    if (!firestore) return;

    try {
      const batch = writeBatch(firestore);
      const movementsSnap = await getDocs(collection(firestore, 'binMaterialMovements'));
      
      if (movementsSnap.empty) {
        toast({ title: 'Sin Movimientos', description: 'No hay registros de movimientos manuales para eliminar.' });
        return;
      }

      movementsSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      toast({ title: 'Éxito', description: 'Se han eliminado los movimientos manuales. El stock dinámico se ha recalculado.' });
    } catch (e: any) {
      console.error("Error al limpiar el stock: ", e);
      toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al limpiar los registros.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialMovements',
          operation: 'delete'
      }));
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + IMPORT_HEADERS.join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_saldos_iniciales.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !firestore || loadingMaterials || loadingExporters) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length <= 1) {
        toast({ title: 'Error de archivo', description: 'El archivo CSV está vacío.', variant: 'destructive' });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      if (!IMPORT_HEADERS.every(h => headers.includes(h))) {
        toast({ title: 'Error de formato', description: `Cabeceras requeridas: ${IMPORT_HEADERS.join(', ')}`, variant: 'destructive' });
        return;
      }

      const batch = writeBatch(firestore);
      const errors: string[] = [];
      let processed = 0;

      const materialMap = new Map(allMaterials.map(m => [`${m.code}_${m.exporterId}`, m]));
      const activeExporterIds = new Set(exporters.filter(e => e.status !== 'inactivo').map(e => e.exporterId));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = Object.fromEntries(headers.map((h, index) => [h, values[index]]));
        
        const { binMaterialCode, exporterId: rowExporterId, quantity } = row;
        const qty = parseInt(quantity, 10);

        if (!activeExporterIds.has(rowExporterId)) {
          errors.push(`Línea ${i + 1}: El Exportador "${rowExporterId}" no existe.`);
          continue;
        }

        const material = materialMap.get(`${binMaterialCode}_${rowExporterId}`);
        if (!material) {
          errors.push(`Línea ${i + 1}: El Código "${binMaterialCode}" no existe para el Exportador "${rowExporterId}".`);
          continue;
        }

        if (isNaN(qty) || qty < 0) {
          errors.push(`Línea ${i + 1}: Cantidad inválida.`);
          continue;
        }

        // We create an 'entrada' movement for each imported balance to feed the dynamic calculation
        const movementRef = doc(collection(firestore, 'binMaterialMovements'));
        batch.set(movementRef, {
            type: 'entrada',
            document: 'SALDO-INICIAL-IMPORT',
            exporterId: rowExporterId,
            producerId: 'SISTEMA',
            driverName: 'SISTEMA',
            driverRUT: '0',
            items: [{
                binMaterialId: material.id,
                binMaterialCode: material.code,
                binMaterialName: material.name,
                quantity: qty
            }],
            createdAt: serverTimestamp(),
            observation: 'Carga de Saldo Inicial (Tab Stock)',
            userId: user?.uid,
            userName: user?.email
        });
        processed++;
      }

      if (errors.length > 0) {
        toast({
          title: 'Importación con errores',
          description: <div className="max-h-40 overflow-y-auto">{errors.map((err, idx) => <p key={idx} className="text-xs">{err}</p>)}</div>,
          variant: 'destructive',
          duration: 10000
        });
      }

      if (processed > 0) {
        try {
          await batch.commit();
          toast({ title: 'Éxito', description: `${processed} registros de saldo inicial creados.` });
        } catch (err) {
          toast({ title: 'Error al guardar', description: 'No se pudieron procesar los datos.', variant: 'destructive' });
        }
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Stock Actual (Calculado dinámicamente)</CardTitle>
          <CardDescription>
            {exporterId 
              ? 'Inventario real para el exportador seleccionado, incluyendo bins en cámara y despachos.'
              : 'Inventario real consolidado de todos los exportadores activos.'
            }
          </CardDescription>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar Saldos
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="mr-2 h-4 w-4" />
                  Plantilla
              </Button>
              <AlertDialog>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpiar Movimientos
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                      <AlertDialogTitle>¿Está seguro de limpiar los movimientos?</AlertDialogTitle>
                      <AlertDialogDescription>
                          Esta acción eliminará todos los registros manuales del Kardex. El stock de bins en cámaras y despachos completados no se verá afectado. Use esta opción con precaución al inicio de temporada.
                      </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearStock} className="bg-destructive hover:bg-destructive/90">
                          Sí, Limpiar Historial
                      </AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>
              <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv"
                  onChange={handleFileImport}
              />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Mobile View */}
        <div className="sm:hidden space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : stockData.length > 0 ? (
            stockData.map((item, idx) => (
              <div key={idx} className="border p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-semibold">{item.materialName}</p>
                  <p className="text-sm text-muted-foreground">
                    {!exporterId ? `${item.exporterName} - ` : ''}Cód: {item.materialCode}
                  </p>
                </div>
                <p className="text-2xl font-bold">{item.quantity.toLocaleString('es-CL')}</p>
              </div>
            ))
          ) : (
             <div className="text-center p-8 border-dashed border rounded-md text-sm text-muted-foreground">
                No hay stock registrado para esta selección.
             </div>
          )}
        </div>

        {/* Desktop View */}
        <div className="hidden sm:block rounded-md border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Material / Detalle</TableHead>
                {!exporterId && <TableHead>Exportador</TableHead>}
                <TableHead className="text-right">Cantidad en Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={exporterId ? 3 : 4}><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : stockData.length > 0 ? (
                stockData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">{item.materialCode}</TableCell>
                    <TableCell className="font-medium text-sm">{item.materialName}</TableCell>
                    {!exporterId && <TableCell className="text-sm">{item.exporterName}</TableCell>}
                    <TableCell className="text-right font-bold text-sm">{item.quantity.toLocaleString('es-CL')}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={exporterId ? 3 : 4} className="h-24 text-center">
                    No hay datos de stock registrados para los filtros actuales.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
