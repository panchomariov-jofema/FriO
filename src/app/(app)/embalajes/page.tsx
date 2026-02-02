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

export default function EmbalajesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: packagingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: packagingMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');

  const pendingPickingCount = React.useMemo(() => {
    if (!packagingMovements) return 0;
    return packagingMovements.filter(
      (mov) => mov.type === 'salida' && mov.status === 'Pendiente de Picking'
    ).length;
  }, [packagingMovements]);


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
      <Tabs defaultValue="recepcion" className="w-full">
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
          <CardContent>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
              <TabsTrigger value="recepcion">Recepción</TabsTrigger>
              <TabsTrigger value="almacenamiento">Almacenamiento</TabsTrigger>
              <TabsTrigger value="salidas">Despacho</TabsTrigger>
              <TabsTrigger value="picking" className="flex items-center gap-2">
                Picking
                {pendingPickingCount > 0 && (
                  <Badge className="h-5 w-5 p-0 flex items-center justify-center">{pendingPickingCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>
        
        <TabsContent value="recepcion">
          <ReceptionTab />
        </TabsContent>
        
        <TabsContent value="almacenamiento">
          <StorageTab />
        </TabsContent>
        
        <TabsContent value="salidas">
          <ExitTab />
        </TabsContent>

        <TabsContent value="picking">
            <PendingPickingTab />
        </TabsContent>

        <TabsContent value="stock">
            <StockAndRelocationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
