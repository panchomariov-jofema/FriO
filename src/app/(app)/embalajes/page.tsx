
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReceptionTab } from '@/components/packaging/ReceptionTab';
import { OtherFruitStorageTab } from '@/components/other-fruit/StorageTab';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception, OtherFruitReception } from '@/lib/types';
import { ExitTab } from '@/components/packaging/ExitTab';
import { StockAndRelocationTab } from '@/components/packaging/StockAndRelocationTab';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Badge } from '@/components/ui/badge';

export default function EmbalajesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: packagingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: otherFruitReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { permissions } = usePermissions();

  const pendingStorageCount = React.useMemo(() => {
    const packagingCount = (packagingReceptions || [])
        .flatMap(reception => reception.items || [])
        .filter(item => item && item.status === 'Pendiente de almacenar')
        .length;
    const vitafoodCount = (otherFruitReceptions || [])
        .filter(r => 
          r.clientName?.toUpperCase().includes('VITAFOOD') || 
          r.clientId?.toUpperCase().includes('VITAFOOD') || 
          r.clientName?.toUpperCase().includes('EMBALAJE')
        )
        .flatMap(reception => reception.items || [])
        .filter(item => item && item.status === 'Pendiente de almacenar')
        .length;
    return packagingCount + vitafoodCount;
  }, [packagingReceptions, otherFruitReceptions]);

  const allowedTabs = React.useMemo(() => {
    const embalajesPermission = permissions.find(p => typeof p === 'object' && p !== null && 'name' in p && p.name === 'Embalajes');
    if (!embalajesPermission || typeof embalajesPermission === 'string') {
        return ['recepcion', 'almacenamiento', 'salidas', 'stock'];
    }
    if (typeof embalajesPermission === 'object' && embalajesPermission.allowedTabs) {
        const base = embalajesPermission.allowedTabs;
        if (!base.includes('almacenamiento')) {
          return ['recepcion', 'almacenamiento', ...base.filter(t => t !== 'recepcion')];
        }
        return base;
    }
    return ['recepcion', 'almacenamiento', 'salidas', 'stock'];
  }, [permissions]);

  const tabsConfig = [
    { value: 'recepcion', label: 'Recepción' },
    { value: 'almacenamiento', label: 'Almacenamiento', badge: pendingStorageCount },
    { value: 'salidas', label: 'Despacho' },
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
                Recepción y gestión de stock de materiales de embalaje en pallets.
              </CardDescription>
            </div>
            {process.env.NODE_ENV === 'development' && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpiar Stock
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Está seguro de limpiar todo el stock de embalajes?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción eliminará permanentemente todas las recepciones de embalajes. Esta acción no se puede deshacer.
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
            )}
          </CardHeader>
          {visibleTabs.length > 0 && (
            <CardContent>
                <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)`}}>
                {visibleTabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="flex items-center justify-center gap-2">
                      {tab.label}
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <Badge className="h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] font-black">{tab.badge}</Badge>
                      )}
                    </TabsTrigger>
                ))}
                </TabsList>
            </CardContent>
          )}
        </Card>
        
        {allowedTabs.includes('recepcion') && <TabsContent value="recepcion"><ReceptionTab /></TabsContent>}
        {allowedTabs.includes('almacenamiento') && <TabsContent value="almacenamiento"><OtherFruitStorageTab /></TabsContent>}
        {allowedTabs.includes('salidas') && <TabsContent value="salidas"><ExitTab /></TabsContent>}
        {allowedTabs.includes('stock') && <TabsContent value="stock"><StockAndRelocationTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
