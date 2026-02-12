'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, PackagingMaster, OtherClient } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RelocatePackagingDialog } from './RelocatePackagingDialog';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Download, Upload } from 'lucide-react';

interface StoredPackagingItem {
    id: string; // receptionId + itemIndex
    receptionId: string;
    itemIndex: number;
    clientName: string;
    document: string;
    code: string;
    name: string;
    lote?: string;
    palletCount: number;
    location: {
        warehouse: string;
        aisle: string;
    }
}

const IMPORT_HEADER_MAP: { [key: string]: string } = {
  'ID Cliente': 'clientId',
  'Documento': 'document',
  'Lote': 'lote',
  'Codigo Articulo': 'packagingMasterCode',
  'Cantidad Pallets': 'palletCount',
  'Almacen': 'warehouse',
  'Pasillo': 'aisle',
};
const SPANISH_IMPORT_HEADERS = Object.keys(IMPORT_HEADER_MAP);

const EXPORT_HEADER_MAP: { [key: string]: string } = {
  'Cliente': 'clientName',
  'Código': 'code',
  'Artículo': 'name',
  'Lote': 'lote',
  'Ubicación': 'location',
  'Cant. Pallets': 'palletCount',
};
const SPANISH_EXPORT_HEADERS = Object.keys(EXPORT_HEADER_MAP);


// Helper functions for CSV export/import
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


export function StockAndRelocationTab() {
  const { data: allReceptions, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');

  const [itemToRelocate, setItemToRelocate] = React.useState<StoredPackagingItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isLoading = loading || loadingMasters || loadingClients;

  const storedItems = React.useMemo(() => {
    return (allReceptions || [])
        .flatMap((reception) => 
            reception.items
                .map((item, index) => ({ item, index, reception }))
                .filter(({ item }) => item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation)
                .map(({ item, index, reception }) => ({
                    id: `${reception.id}-${index}`,
                    receptionId: reception.id,
                    itemIndex: index,
                    clientName: reception.clientName,
                    document: reception.document,
                    code: item.packagingMasterCode,
                    name: item.packagingMasterName,
                    lote: item.lote,
                    palletCount: item.palletCount,
                    location: item.storageLocation!,
                }))
        )
        .sort((a,b) => a.code.localeCompare(b.code) || a.clientName.localeCompare(b.clientName));
  }, [allReceptions]);

  const handleRelocateClick = (item: StoredPackagingItem) => {
    setItemToRelocate(item);
    setDialogOpen(true);
  };
  
  const handleRelocateConfirm = async (newLocation: { warehouse: string; aisle: string; }) => {
    if (!itemToRelocate || !firestore) return;

    const receptionDocRef = doc(firestore, 'packagingReceptions', itemToRelocate.receptionId);
    
    const originalReception = allReceptions.find(r => r.id === itemToRelocate.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    updatedItems[itemToRelocate.itemIndex] = {
        ...updatedItems[itemToRelocate.itemIndex],
        storageLocation: newLocation,
        storedAt: new Date(), 
    };

    const updateData = {
        items: updatedItems,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `Pallet reubicado a ${newLocation.warehouse} - ${newLocation.aisle}.` });
        setDialogOpen(false);
    } catch (error) {
        console.error("Error relocating packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reubicar el pallet.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: receptionDocRef.path,
            operation: 'update',
            requestResourceData: updateData,
        }));
    }
  };

  const handleExport = () => {
     if (!storedItems || storedItems.length === 0) {
        toast({ variant: 'destructive', title: 'Sin datos', description: 'No hay stock para exportar.' });
        return;
    }
    const dataToExport = storedItems.map(item => ({
        clientName: item.clientName,
        code: item.code,
        name: item.name,
        lote: item.lote || '',
        location: `${item.location.warehouse} / ${item.location.aisle}`,
        palletCount: item.palletCount,
    }));
    
    const headerRow = SPANISH_EXPORT_HEADERS.join(';');
    const rows = dataToExport.map(row => {
      return SPANISH_EXPORT_HEADERS.map(header => {
        const key = EXPORT_HEADER_MAP[header as keyof typeof EXPORT_HEADER_MAP];
        const value = row[key as keyof typeof row];
        const stringValue = String(value ?? '');
        return `"${stringValue.replace(/"/g, '""')}"`;
      }).join(';');
    });

    const csvString = [headerRow, ...rows].join('\n');
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csvString, `export_stock_embalajes_${date}.csv`);
  };

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + SPANISH_IMPORT_HEADERS.join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_stock_embalajes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !firestore || !allClients || !allPackagingMasters) {
        toast({ title: 'Error', description: 'Datos maestros no cargados. Intente de nuevo.', variant: 'destructive' });
        return;
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length <= 1) {
        toast({ title: 'Error de archivo', description: 'El archivo CSV está vacío o solo contiene la cabecera.', variant: 'destructive' });
        return;
      }
      
      const fileHeaders = lines[0].split(',').map(h => h.trim());
      const expectedSpanishHeaders = Object.keys(IMPORT_HEADER_MAP);
      
      if (fileHeaders.length !== expectedSpanishHeaders.length || !fileHeaders.every(h => expectedSpanishHeaders.includes(h))) {
        toast({ title: 'Error de formato', description: `Las cabeceras del CSV no coinciden. Esperado: ${expectedSpanishHeaders.join(', ')}`, variant: 'destructive' });
        return;
      }

      const clientMap = new Map((allClients || []).map(c => [c.clientId, c.name]));
      const masterMap = new Map((allPackagingMasters || []).map(m => [m.code, m]));
      const errors: string[] = [];
      const receptionsToCreate: Record<string, any> = {};

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const rowData: { [key: string]: any } = {};

        fileHeaders.forEach((header, index) => {
            const englishKey = IMPORT_HEADER_MAP[header];
            if(englishKey) {
                rowData[englishKey] = values[index];
            }
        });

        const clientName = clientMap.get(rowData.clientId);
        const master = masterMap.get(rowData.packagingMasterCode);

        if (!clientName) {
            errors.push(`Línea ${i + 2}: El ID Cliente "${rowData.clientId}" no existe.`);
            continue;
        }
        if (!master || master.clientId !== rowData.clientId) {
            errors.push(`Línea ${i + 2}: El Codigo Articulo "${rowData.packagingMasterCode}" no existe o no pertenece al cliente.`);
            continue;
        }
        const palletCount = parseInt(rowData.palletCount, 10);
        if (isNaN(palletCount) || palletCount <= 0) {
             errors.push(`Línea ${i + 2}: Cantidad Pallets debe ser un número positivo.`);
            continue;
        }
        
        const receptionKey = `${rowData.clientId}_${rowData.document}`;
        if (!receptionsToCreate[receptionKey]) {
            receptionsToCreate[receptionKey] = {
                clientId: rowData.clientId,
                clientName: clientName,
                document: rowData.document,
                items: [],
                status: 'Almacenado',
                createdAt: serverTimestamp(),
            };
        }

        const newItem: any = {
            packagingMasterId: master.id,
            packagingMasterCode: master.code,
            packagingMasterName: master.name,
            palletCount: palletCount,
            status: 'Almacenado',
            storageLocation: { warehouse: rowData.warehouse, aisle: rowData.aisle },
            storedAt: new Date(),
        };

        if (rowData.lote) {
            newItem.lote = rowData.lote;
        }
        
        receptionsToCreate[receptionKey].items.push(newItem);
      }
      
      if (errors.length > 0) {
        toast({ title: `Errores en el archivo`, description: <div className="h-40 w-full overflow-y-auto">{errors.map((e, i)=><p key={i} className="text-xs">{e}</p>)}</div>, variant: 'destructive', duration: 9000 });
        return;
      }
      
      try {
        const batch = writeBatch(firestore);
        const receptionsRef = collection(firestore, 'packagingReceptions');
        Object.values(receptionsToCreate).forEach(receptionData => {
            const docRef = doc(receptionsRef);
            batch.set(docRef, receptionData);
        });
        await batch.commit();
        toast({ title: 'Éxito', description: `${Object.keys(receptionsToCreate).length} recepciones importadas correctamente.` });
      } catch (error) {
        console.error("Error importing stock:", error);
        toast({ variant: 'destructive', title: 'Error al Guardar', description: 'No se pudieron guardar los datos.' });
      }
    };
    
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };


  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div>
              <CardTitle>Stock Actual y Reubicación</CardTitle>
              <CardDescription>Consulte el stock almacenado y reubique pallets según sea necesario.</CardDescription>
            </div>
             <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar
                </Button>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                    <Download className="mr-2 h-4 w-4" />
                    Plantilla
                </Button>
                <Button onClick={handleExport} disabled={isLoading || storedItems.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".csv"
                    onChange={handleFileImport}
                />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Código</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Cant. Pallets</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : storedItems.length > 0 ? (
                  storedItems.map((item) => (
                    <TableRow key={item.id}>
                        <TableCell>{item.clientName}</TableCell>
                        <TableCell className="font-mono hidden sm:table-cell">{item.code}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.lote || '-'}</TableCell>
                        <TableCell>{item.location.warehouse} / {item.location.aisle}</TableCell>
                        <TableCell className="font-semibold">{item.palletCount}</TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleRelocateClick(item)}>Reubicar</Button>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">No hay stock almacenado.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <RelocatePackagingDialog
        item={itemToRelocate}
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleRelocateConfirm}
       />
    </>
  );
}
