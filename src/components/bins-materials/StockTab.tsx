
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useUser } from '@/firebase';
import type { BinMaterialStock, Exporter, BinMaterial } from '@/lib/types';
import { collection, onSnapshot, query, where, Query, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
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
  const [stock, setStock] = React.useState<BinMaterialStock[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: allMaterials, loading: loadingMaterials } = useFirestoreCollection<BinMaterial>('binMaterials');
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isAdmin = user?.email === 'francisco.villarreal@outlook.es';

  const exporterMap = React.useMemo(() => {
    return exporters.reduce((acc, exporter) => {
      acc[exporter.exporterId] = exporter.name;
      return acc;
    }, {} as Record<string, string>);
  }, [exporters]);

  React.useEffect(() => {
    if (!firestore) return;

    setLoading(true);
    let stockQuery: Query;
    
    const stockRef = collection(firestore, 'binMaterialStock');
    if (exporterId) {
        stockQuery = query(stockRef, where('exporterId', '==', exporterId));
    } else {
        stockQuery = query(stockRef);
    }

    const unsubscribe = onSnapshot(stockQuery, (snapshot) => {
      const stockData: BinMaterialStock[] = [];
      snapshot.forEach(doc => {
        stockData.push({ id: doc.id, ...doc.data() } as BinMaterialStock);
      });
      setStock(stockData.sort((a,b) => a.binMaterialName.localeCompare(b.binMaterialName)));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching stock:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, exporterId]);

  const handleClearStock = async () => {
    if (!firestore) return;

    try {
      const stockRef = collection(firestore, 'binMaterialStock');
      const querySnapshot = await getDocs(stockRef);
      
      if (querySnapshot.empty) {
        toast({ title: 'Sin Stock', description: 'No hay registros de stock para eliminar.' });
        return;
      }

      const batch = writeBatch(firestore);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      toast({ title: 'Éxito', description: 'Todo el stock de bins y materiales ha sido eliminado para la nueva temporada.' });
    } catch (e: any) {
      console.error("Error al limpiar el stock: ", e);
      toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al limpiar el stock.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'binMaterialStock',
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
        toast({ title: 'Error de archivo', description: 'El archivo CSV está vacío o solo contiene la cabecera.', variant: 'destructive' });
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

      // Map for quick lookups
      const materialMap = new Map(allMaterials.map(m => [`${m.code}_${m.exporterId}`, m]));
      const activeExporterIds = new Set(exporters.filter(e => e.status !== 'inactivo').map(e => e.exporterId));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = Object.fromEntries(headers.map((h, index) => [h, values[index]]));
        
        const { binMaterialCode, exporterId: rowExporterId, quantity } = row;
        const qty = parseInt(quantity, 10);

        if (!activeExporterIds.has(rowExporterId)) {
          errors.push(`Línea ${i + 1}: El Exportador "${rowExporterId}" no existe o está inactivo.`);
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

        // Search for existing stock doc to update or create
        const stockQuery = query(
          collection(firestore, 'binMaterialStock'),
          where('exporterId', '==', rowExporterId),
          where('binMaterialId', '==', material.id)
        );
        const stockSnap = await getDocs(stockQuery);
        
        if (stockSnap.empty) {
          const newStockRef = doc(collection(firestore, 'binMaterialStock'));
          batch.set(newStockRef, {
            binMaterialId: material.id,
            binMaterialCode: material.code,
            binMaterialName: material.name,
            exporterId: rowExporterId,
            quantity: qty,
            lastUpdatedAt: serverTimestamp(),
          });
        } else {
          batch.update(stockSnap.docs[0].ref, {
            quantity: qty,
            lastUpdatedAt: serverTimestamp(),
          });
        }
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
          toast({ title: 'Éxito', description: `${processed} saldos iniciales cargados correctamente.` });
        } catch (err) {
          toast({ title: 'Error al guardar', description: 'No se pudieron procesar los datos en la base de datos.', variant: 'destructive' });
        }
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isLoading = loading || loadingExporters || loadingMaterials;

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Stock Actual</CardTitle>
          <CardDescription>
            {exporterId 
              ? 'Saldos de bins y materiales para el exportador seleccionado.'
              : 'Saldos de bins y materiales para todos los exportadores.'
            }
          </CardDescription>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
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
                      Limpiar Stock General
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                      <AlertDialogTitle>¿Está seguro de limpiar TODO el stock?</AlertDialogTitle>
                      <AlertDialogDescription>
                          Esta acción eliminará permanentemente todos los registros de stock de bins y materiales (de todos los exportadores). Use esta opción solo para iniciar una nueva temporada.
                      </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearStock} className="bg-destructive hover:bg-destructive/90">
                          Sí, Limpiar Todo
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
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : stock.length > 0 ? (
            stock.map(item => (
              <div key={item.id} className="border p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-semibold">{item.binMaterialName}</p>
                  <p className="text-sm text-muted-foreground">
                    {exporterId ? `Código: ${item.binMaterialCode}` : exporterMap[item.exporterId] || item.exporterId}
                  </p>
                </div>
                <p className="text-2xl font-bold">{item.quantity}</p>
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
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre del Material</TableHead>
                {!exporterId && <TableHead>Exportador</TableHead>}
                <TableHead className="text-right">Cantidad en Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={exporterId ? 3 : 4}><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : stock.length > 0 ? (
                stock.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.binMaterialCode}</TableCell>
                    <TableCell className="font-medium">{item.binMaterialName}</TableCell>
                    {!exporterId && <TableCell>{exporterMap[item.exporterId] || item.exporterId}</TableCell>}
                    <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={exporterId ? 3 : 4} className="h-24 text-center">
                    {exporterId ? 'No hay stock para el exportador seleccionado.' : 'No hay stock registrado.'}
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
