
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReceptionTab } from '@/components/packaging/ReceptionTab';
import { StorageTab } from '@/components/packaging/StorageTab';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, PackagingMovement } from '@/lib/types';
import { ExitTab } from '@/components/packaging/ExitTab';
import { StockAndRelocationTab } from '@/components/packaging/StockAndRelocationTab';
import { PendingPickingTab } from '@/components/packaging/PendingPickingTab';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/contexts/PermissionsContext';

export default function EmbalajesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: packagingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: packagingMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');
  const { permissions } = usePermissions();

  const pendingPickingCount = React.useMemo(() => {
    if (!packagingMovements) return 0;
    return packagingMovements.filter(
      (mov) => mov.type === 'salida' && mov.status === 'Pendiente de Picking'
    ).length;
  }, [packagingMovements]);

  const allowedTabs = React.useMemo(() => {
    const embalajesPermission = permissions.find(p => typeof p === 'object' && p !== null && 'name' in p && p.name === 'Embalajes');
    if (!embalajesPermission || typeof embalajesPermission === 'string') {
        return ['recepcion', 'almacenamiento', 'salidas', 'picking', 'stock'];
    }
    if (typeof embalajesPermission === 'object' && embalajesPermission.allowedTabs) {
        return embalajesPermission.allowedTabs;
    }
    return [];
  }, [permissions]);

  const tabsConfig = [
    { value: 'recepcion', label: 'Recepción' },
    { value: 'almacenamiento', label: 'Almacenamiento' },
    { value: 'salidas', label: 'Despacho' },
    { value: 'picking', label: 'Picking', badge: pendingPickingCount },
    { value: 'stock', label: 'Stock' },
  ];

  const visibleTabs = tabsConfig.filter(tab => allowedTabs.includes(tab.value));


  const handleClearStock = async () => {
    if (!firestore) return;
    if (!packagingReceptions || packagingReceptions.length === 0) {
      toast({ title: 'Sin Stock', description: 'No hay recepciones de embalaje para limpiar.' });
      return;
    }

    try {
      const packagingReceptionsRef = collection(firestore, 'packagingReceptions');
      const querySnapshot = await getDocs(packagingReceptionsRef);
      const batch = writeBatch(firestore);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      toast({ title: 'Éxito', description: 'Todas las recepciones de embalajes han sido eliminadas.' });
    } catch (e: any) {
      console.error("Error al limpiar el stock de embalajes: ", e);
      toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al limpiar el stock.' });
      errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'packagingReceptions',
          operation: 'delete'
      }));
    }
  };


  return (
    <div className="space-y-4">
      <Tabs defaultValue={visibleTabs.length > 0 ? visibleTabs[0].value : 'recepcion'} className="w-full">
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Gestión de Embalajes</CardTitle>
              <CardDescription>
                Recepción y almacenamiento de materiales de embalaje en pallets.
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon">
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Limpiar Stock</span>
                  </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                  <AlertDialogHeader>
                      <AlertDialogTitle>¿Está seguro de limpiar todo el stock?</AlertDialogTitle>
                      <AlertDialogDescription>
                          Esta acción no se puede deshacer. Se eliminarán permanentemente TODAS las recepciones
                          de embalajes. Esta herramienta es solo para fines de desarrollo y pruebas.
                      </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearStock} className="bg-destructive hover:bg-destructive/90">
                          Sí, Limpiar Stock
                      </AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardHeader>
          {visibleTabs.length > 0 && (
            <CardContent>
                <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)`}}>
                {visibleTabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                    {tab.label}
                    {tab.badge > 0 && (
                        <Badge className="h-5 w-5 p-0 flex items-center justify-center">{tab.badge}</Badge>
                    )}
                    </TabsTrigger>
                ))}
                </TabsList>
            </CardContent>
          )}
        </Card>
        
        {allowedTabs.includes('recepcion') && <TabsContent value="recepcion"><ReceptionTab /></TabsContent>}
        {allowedTabs.includes('almacenamiento') && <TabsContent value="almacenamiento"><StorageTab /></TabsContent>}
        {allowedTabs.includes('salidas') && <TabsContent value="salidas"><ExitTab /></TabsContent>}
        {allowedTabs.includes('picking') && <TabsContent value="picking"><PendingPickingTab /></TabsContent>}
        {allowedTabs.includes('stock') && <TabsContent value="stock"><StockAndRelocationTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
