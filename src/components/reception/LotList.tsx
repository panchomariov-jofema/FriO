'use client';

import * as React from 'react';
import { collection, query, where, onSnapshot, Query, doc, deleteDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { ReceptionLot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '../ui/button';
import { EditLotDialog } from './EditLotDialog';
import { safeToMillis, safeFormatDate } from '@/lib/utils';
import { Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LotListProps {
  exporterId: string | null;
}

export function LotList({ exporterId }: LotListProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [lots, setLots] = React.useState<ReceptionLot[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  const [isEditOpen, setEditOpen] = React.useState(false);
  const [selectedLot, setSelectedLot] = React.useState<ReceptionLot | null>(null);

  React.useEffect(() => {
    if (!firestore) {
        setLots([]);
        setLoading(false);
        return;
    };

    setLoading(true);
    
    let q: Query;
    const lotsRef = collection(firestore, 'receptionLots');

    if (exporterId) {
      q = query(lotsRef, where('exporterId', '==', exporterId));
    } else {
      q = query(lotsRef);
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionLot))
        .sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
        
      setLots(fetchedLots);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching lots: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, exporterId]);

  const handleEditClick = (lot: ReceptionLot) => {
    setSelectedLot(lot);
    setEditOpen(true);
  };

  const handleDeleteClick = async (lot: ReceptionLot) => {
    if (!firestore) return;
    if (!window.confirm(`¿Eliminar el registro ${lot.displayLotId || lot.document}?`)) return;
    try {
      await deleteDoc(doc(firestore, 'receptionLots', lot.id));
      toast({ title: 'Eliminado', description: `Registro ${lot.displayLotId || lot.document} eliminado.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el registro.' });
    }
  };

  const closeDialogs = () => {
    setEditOpen(false);
    setSelectedLot(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recepciones Registradas (Retornos con Fruta)</CardTitle>
          <CardDescription>Historial de retornos de bins, totes y láminas recepcionados para el exportador seleccionado.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>ID Lote / Guía</TableHead>
                  <TableHead className="text-right">Bins</TableHead>
                  <TableHead className="text-right">Totes</TableHead>
                  <TableHead className="text-right">Láminas</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Totes Vacíos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : lots.length > 0 ? (
                  lots.map((lot) => {
                    const laminas = lot.laminaCount !== undefined ? lot.laminaCount : (lot.binCount || 0);
                    return (
                    <TableRow key={lot.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {lot.createdAt ? safeFormatDate(lot.createdAt, 'dd/MM/yyyy HH:mm') : '-'}
                      </TableCell>
                      <TableCell className="font-medium">{lot.displayLotId || lot.document || lot.id}</TableCell>
                      <TableCell className="text-right font-semibold">{lot.binCount}</TableCell>
                      <TableCell className="text-right">{lot.toteCount}</TableCell>
                      <TableCell className="text-right">{laminas}</TableCell>
                      <TableCell className="text-right hidden md:table-cell">{lot.emptyTotes || 0}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(lot)}>
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Editar</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteClick(lot)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No se encontraron recepciones para esta selección.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {selectedLot && (
        <EditLotDialog
            lot={selectedLot}
            open={isEditOpen}
            onOpenChange={setEditOpen}
            onLotUpdated={closeDialogs}
        />
      )}
    </>
  );
}
