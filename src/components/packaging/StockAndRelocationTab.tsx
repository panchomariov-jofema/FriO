'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, PackagingMaster, OtherClient, OtherFruitReception } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RelocatePackagingDialog, RelocatePackagingData } from './RelocatePackagingDialog';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Download, Upload } from 'lucide-react';
import { AdjustPackagingDialog } from './AdjustPackagingDialog';
import { Input } from '@/components/ui/input';
import { chambersConfig } from '@/lib/chambers-config';
import { cleanFirestoreObject } from '@/lib/vitafood-utils';

interface StoredPackagingItem {
    id: string; // receptionId + itemIndex
    receptionId: string;
    itemIndex: number;
    collectionType: 'packagingReceptions' | 'otherFruitReceptions';
    clientName: string;
    document: string;
    code: string;
    name: string;
    lote?: string;
    palletCount: number;
    unitsCount?: number;
    palletId?: string;
    locationDisplay: string;
    location: {
        warehouse?: string;
        aisle?: string;
        chamberId?: string;
        coordinate?: string;
    };
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
  'UMP': 'palletId',
  'Código': 'code',
  'Artículo': 'name',
  'Lote': 'lote',
  'Ubicación': 'locationDisplay',
  'Cant. Pallets': 'palletCount',
  'Unidades': 'unitsCount',
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
  const { data: packagingReceptions, loading: loadingPackaging } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: otherFruitReceptions, loading: loadingOtherFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: allPackagingMasters, loading: loadingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');

  const [itemToRelocate, setItemToRelocate] = React.useState<StoredPackagingItem | null>(null);
  const [isDialogOpen, setDialogOpen] = React.useState(false);
  const [itemToAdjust, setItemToAdjust] = React.useState<StoredPackagingItem | null>(null);
  const [isAdjustDialogOpen, setAdjustDialogOpen] = React.useState(false);
  const [codeFilter, setCodeFilter] = React.useState('');
  const firestore = useFirestore();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isLoading = loadingPackaging || loadingOtherFruit || loadingMasters || loadingClients;

  const storedItems = React.useMemo(() => {
    // Determine which clients are packaging clients
    const packagingClientIds = new Set<string>();
    (allClients || []).forEach(c => {
      if (c.type?.toLowerCase() === 'embalaje' || c.name?.toUpperCase().includes('VITAFOOD') || c.clientId?.toUpperCase().includes('VITAFOOD')) {
        packagingClientIds.add(c.clientId.toUpperCase());
        packagingClientIds.add(c.name.toUpperCase());
      }
    });
    packagingClientIds.add('VITAFOODS');
    packagingClientIds.add('VITAFOOD');

    // 1. Traditional packaging receptions
    const pkgItems: StoredPackagingItem[] = (packagingReceptions || [])
        .flatMap((reception) => 
            (reception.items || [])
                .map((item, index) => ({ item, index, reception }))
                .filter(({ item }) => item.status === 'Almacenado' && item.palletCount > 0 && item.storageLocation)
                .map(({ item, index, reception }) => {
                    const loc = item.storageLocation as any;
                    const locDisplay = (loc && loc.warehouse && loc.aisle)
                      ? `${loc.warehouse} / ${loc.aisle}`
                      : ((loc && loc.chamberId && loc.coordinate)
                          ? `${chambersConfig[loc.chamberId]?.name || loc.chamberId} / ${loc.coordinate}`
                          : (loc?.coordinate || 'Almacenado'));

                    return {
                        id: `${reception.id}-${index}`,
                        receptionId: reception.id,
                        itemIndex: index,
                        collectionType: 'packagingReceptions' as const,
                        clientName: reception.clientName,
                        document: reception.document,
                        code: item.packagingMasterCode,
                        name: item.packagingMasterName,
                        lote: item.lote,
                        palletCount: item.palletCount,
                        unitsCount: item.palletCount,
                        palletId: item.lote || item.packagingMasterCode || '-',
                        locationDisplay: locDisplay,
                        location: item.storageLocation || { warehouse: '', aisle: '' },
                    };
                })
        );

    // 2. ONLY Vitafoods and packaging clients stored in otherFruitReceptions (Filter out Fruit/Plants like Fall Creek)
    const vitafoodItems: StoredPackagingItem[] = (otherFruitReceptions || [])
        .filter(reception => {
          const clientIdUpper = String(reception.clientId || '').toUpperCase();
          const clientNameUpper = String(reception.clientName || '').toUpperCase();
          return (
            packagingClientIds.has(clientIdUpper) ||
            packagingClientIds.has(clientNameUpper) ||
            clientNameUpper.includes('VITAFOOD') ||
            clientIdUpper.includes('VITAFOOD') ||
            clientNameUpper.includes('EMBALAJE')
          );
        })
        .flatMap((reception) => 
            (reception.items || [])
                .map((item, index) => ({ item, index, reception }))
                .filter(({ item }) => item.status === 'Almacenado' && item.quantity > 0 && item.storageLocation)
                .map(({ item, index, reception }) => {
                    const loc = item.storageLocation as any;
                    let locDisplay = 'Almacenado';
                    if (loc) {
                      if (loc.warehouse && loc.aisle) {
                        locDisplay = `${loc.warehouse} / ${loc.aisle}`;
                      } else if (loc.chamberId && loc.coordinate) {
                        locDisplay = `${chambersConfig[loc.chamberId]?.name || loc.chamberId} / ${loc.coordinate}`;
                      } else if (loc.coordinate) {
                        locDisplay = loc.coordinate;
                      }
                    }

                    return {
                        id: `${reception.id}-${index}`,
                        receptionId: reception.id,
                        itemIndex: index,
                        collectionType: 'otherFruitReceptions' as const,
                        clientName: reception.clientName,
                        document: reception.document || (reception as any).documentNumber || '',
                        code: item.productCode || item.palletId || '',
                        name: item.productName,
                        lote: item.clientLotId,
                        palletCount: 1, // 1 Pallet item per row
                        unitsCount: item.quantity, // exact units contained on the pallet!
                        palletId: item.palletId || item.containerId || '',
                        locationDisplay: locDisplay,
                        location: {
                          warehouse: loc?.warehouse,
                          aisle: loc?.aisle,
                          chamberId: loc?.chamberId,
                          coordinate: loc?.coordinate
                        },
                    };
                })
        );

    return [...pkgItems, ...vitafoodItems].sort((a, b) => 
      a.clientName.localeCompare(b.clientName) || a.code.localeCompare(b.code)
    );
  }, [packagingReceptions, otherFruitReceptions, allClients]);
  
  const filteredItems = React.useMemo(() => {
    if (!codeFilter) {
        return storedItems;
    }
    const q = codeFilter.toLowerCase().trim();
    return storedItems.filter(item => 
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        (item.lote && item.lote.toLowerCase().includes(q)) ||
        (item.palletId && item.palletId.toLowerCase().includes(q)) ||
        (item.document && item.document.toLowerCase().includes(q)) ||
        item.locationDisplay.toLowerCase().includes(q)
    );
  }, [storedItems, codeFilter]);


  const handleRelocateClick = (item: StoredPackagingItem) => {
    setItemToRelocate(item);
    setDialogOpen(true);
  };
  
  const handleAdjustClick = (item: StoredPackagingItem) => {
    setItemToAdjust(item);
    setAdjustDialogOpen(true);
  };

  const handleRelocateConfirm = async (newLocation: RelocatePackagingData) => {
    if (!itemToRelocate || !firestore) return;

    let targetLocationObj: any = {};
    let targetDisplay = '';

    if (newLocation.destinationType === 'chamber') {
      targetLocationObj = {
        chamberId: newLocation.chamberId,
        coordinate: newLocation.coordinate,
      };
      const chName = chambersConfig[newLocation.chamberId!]?.name || newLocation.chamberId;
      targetDisplay = `❄️ ${chName} / ${newLocation.coordinate}`;
    } else {
      targetLocationObj = {
        warehouse: newLocation.warehouse,
        aisle: newLocation.aisle,
      };
      targetDisplay = `🏢 ${newLocation.warehouse} / ${newLocation.aisle}`;
    }

    if (itemToRelocate.collectionType === 'otherFruitReceptions') {
      const receptionDocRef = doc(firestore, 'otherFruitReceptions', itemToRelocate.receptionId);
      const originalReception = otherFruitReceptions?.find(r => r.id === itemToRelocate.receptionId);
      if (!originalReception) return;

      const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
      updatedItems[itemToRelocate.itemIndex] = {
          ...updatedItems[itemToRelocate.itemIndex],
          storageLocation: targetLocationObj,
          storedAt: new Date(), 
      };

      try {
          await updateDoc(receptionDocRef, cleanFirestoreObject({
              items: updatedItems,
              updatedAt: serverTimestamp(),
          }));
          toast({ title: '✅ Éxito', description: `Pallet reubicado a ${targetDisplay}.` });
          setDialogOpen(false);
      } catch (error) {
          console.error("Error relocating otherFruit packaging item:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reubicar el pallet.' });
      }
      return;
    }

    const receptionDocRef = doc(firestore, 'packagingReceptions', itemToRelocate.receptionId);
    const originalReception = packagingReceptions?.find(r => r.id === itemToRelocate.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    updatedItems[itemToRelocate.itemIndex] = {
        ...updatedItems[itemToRelocate.itemIndex],
        storageLocation: targetLocationObj,
        storedAt: new Date(), 
    };

    try {
        await updateDoc(receptionDocRef, cleanFirestoreObject({
            items: updatedItems,
            updatedAt: serverTimestamp(),
        }));
        toast({ title: '✅ Éxito', description: `Pallet reubicado a ${targetDisplay}.` });
        setDialogOpen(false);
    } catch (error) {
        console.error("Error relocating packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reubicar el pallet.' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'packagingReceptions',
            operation: 'update',
        }));
    }
  };

  const handleAdjustConfirm = async (newQuantity: number) => {
    if (!itemToAdjust || !firestore) return;

    if (newQuantity < 0) {
        toast({ title: 'Error', description: 'La cantidad no puede ser negativa.', variant: 'destructive'});
        return;
    }

    if (itemToAdjust.collectionType === 'otherFruitReceptions') {
      const receptionDocRef = doc(firestore, 'otherFruitReceptions', itemToAdjust.receptionId);
      const originalReception = otherFruitReceptions?.find(r => r.id === itemToAdjust.receptionId);
      if (!originalReception) return;

      const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
      const itemToUpdate = updatedItems[itemToAdjust.itemIndex];
      if (itemToUpdate) {
          itemToUpdate.quantity = newQuantity;
      }

      try {
          await updateDoc(receptionDocRef, cleanFirestoreObject({
              items: updatedItems,
              updatedAt: serverTimestamp(),
          }));
          toast({ title: '✅ Éxito', description: `La cantidad ha sido ajustada a ${newQuantity}.` });
          setAdjustDialogOpen(false);
      } catch (error) {
          console.error("Error adjusting item:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'No se pudo ajustar la cantidad.' });
      }
      return;
    }

    const receptionDocRef = doc(firestore, 'packagingReceptions', itemToAdjust.receptionId);
    const originalReception = packagingReceptions?.find(r => r.id === itemToAdjust.receptionId);
    if (!originalReception) return;

    const updatedItems = JSON.parse(JSON.stringify(originalReception.items));
    const itemToUpdate = updatedItems[itemToAdjust.itemIndex];
    
    if (itemToUpdate) {
        itemToUpdate.palletCount = newQuantity;
    } else {
        toast({ title: 'Error', description: 'No se pudo encontrar el ítem original para actualizar.', variant: 'destructive'});
        return;
    }

    const updateData = {
        items: updatedItems,
        updatedAt: serverTimestamp(),
    };

    try {
        await updateDoc(receptionDocRef, updateData);
        toast({ title: 'Éxito', description: `La cantidad de pallets ha sido ajustada a ${newQuantity}.` });
        setAdjustDialogOpen(false);
    } catch (error) {
        console.error("Error adjusting packaging item:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo ajustar la cantidad.' });
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
        location: item.locationDisplay,
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
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div>
              <CardTitle className="text-lg sm:text-xl font-bold">Stock Actual y Reubicación</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Consulte el stock almacenado y reubique pallets según sea necesario.</CardDescription>
            </div>
             <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="flex-1 sm:flex-initial text-xs">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Importar
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="flex-1 sm:flex-initial text-xs">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Plantilla
                </Button>
                <Button size="sm" onClick={handleExport} disabled={isLoading || storedItems.length === 0} className="flex-1 sm:flex-initial text-xs">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
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
          <div className="pt-2 sm:pt-4">
              <Input
                placeholder="Filtrar por UMP, código, artículo, lote o ubicación..."
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value)}
                className="max-w-md text-xs sm:text-sm h-9"
              />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="font-bold">UMP</TableHead>
                  <TableHead className="hidden sm:table-cell">Código</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Cant. Pallets</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <TableRow key={item.id}>
                        <TableCell className="font-medium text-xs">{item.clientName}</TableCell>
                        <TableCell className="font-mono font-bold text-xs">{item.palletId || '-'}</TableCell>
                        <TableCell className="font-mono hidden sm:table-cell text-xs">{item.code}</TableCell>
                        <TableCell className="font-medium text-xs">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs">{item.lote || '-'}</TableCell>
                        <TableCell className="font-medium text-xs">{item.locationDisplay}</TableCell>
                        <TableCell className="font-semibold text-xs">{item.palletCount}</TableCell>
                        <TableCell className="font-semibold text-xs text-muted-foreground">{item.unitsCount !== undefined ? `${item.unitsCount} UN` : '-'}</TableCell>
                        <TableCell className="text-right">
                           <div className="flex gap-2 justify-end">
                                <Button variant="outline" size="sm" onClick={() => handleAdjustClick(item)}>Ajustar</Button>
                                <Button size="sm" onClick={() => handleRelocateClick(item)}>Reubicar</Button>
                            </div>
                        </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                        {codeFilter ? 'No se encontraron artículos con ese criterio.' : 'No hay stock almacenado.'}
                    </TableCell>
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
       <AdjustPackagingDialog
        item={itemToAdjust}
        open={isAdjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        onConfirm={handleAdjustConfirm}
       />
    </>
  );
}
