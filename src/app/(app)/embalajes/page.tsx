'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReceptionTab } from '@/components/packaging/ReceptionTab';
import { StorageTab } from '@/components/packaging/StorageTab';
import { StockTab } from '@/components/packaging/StockTab';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { PackagingReception } from '@/lib/types';

export default function EmbalajesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: packagingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');


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
       <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Gestión de Embalajes</CardTitle>
            <CardDescription>
              Recepción, almacenamiento y consulta de stock de materiales de embalaje en pallets.
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
      </Card>

      <Tabs defaultValue="recepcion" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="recepcion">Recepción</TabsTrigger>
          <TabsTrigger value="almacenamiento">Pendientes de Almacenar</TabsTrigger>
          <TabsTrigger value="stock">Stock en Bodega</TabsTrigger>
        </TabsList>
        
        <TabsContent value="recepcion">
          <ReceptionTab />
        </TabsContent>
        
        <TabsContent value="almacenamiento">
          <StorageTab />
        </TabsContent>

        <TabsContent value="stock">
          <StockTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
