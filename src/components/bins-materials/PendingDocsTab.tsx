'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { PendingDocument } from '@/lib/types';
import { collection, query, where } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';

export function PendingDocsTab() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const pendingDocsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'documentosPendientes'), where('estado', '==', 'PENDIENTE'));
  }, [firestore]);

  const { data: pendingDocs, loading } = useCollection<PendingDocument>(pendingDocsQuery);
  
  const handleCopyJson = (doc: PendingDocument) => {
    const jsonString = JSON.stringify(doc, null, 2);
    navigator.clipboard.writeText(jsonString)
        .then(() => {
            toast({ title: 'Copiado', description: 'El objeto JSON del documento se ha copiado al portapapeles.' });
        })
        .catch(err => {
            console.error('Error al copiar JSON: ', err);
            toast({ title: 'Error', description: 'No se pudo copiar el JSON.', variant: 'destructive' });
        });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos Pendientes de Emisión</CardTitle>
        <CardDescription>
          Aquí se listan las salidas de materiales que están listas para generar su Documento Tributario Electrónico (DTE).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha Salida</TableHead>
                <TableHead>Razón Social Receptor</TableHead>
                <TableHead>Exportador Referencia</TableHead>
                <TableHead>Patente Vehículo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                ))
              ) : pendingDocs && pendingDocs.length > 0 ? (
                pendingDocs.map(doc => (
                    <TableRow key={doc.id}>
                        <TableCell>{doc.fecha_salida?.toDate().toLocaleString('es-CL')}</TableCell>
                        <TableCell>{doc.receptor.razon_social}</TableCell>
                        <TableCell>{doc.documento.referencia_exportador}</TableCell>
                        <TableCell className="font-mono">{doc.documento.patente_vehiculo}</TableCell>
                        <TableCell>
                            <Badge variant="destructive">{doc.estado}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                           <Button variant="outline" size="sm" onClick={() => handleCopyJson(doc)}>Capturar Datos</Button>
                        </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                        No hay documentos pendientes.
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
