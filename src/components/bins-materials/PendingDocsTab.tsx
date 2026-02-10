'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { PendingDocument } from '@/lib/types';
import { collection, query, where, updateDoc, doc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { generateDteXml } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function PendingDocsTab() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const pendingDocsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'documentosPendientes'), where('estado', '==', 'PENDIENTE'));
  }, [firestore]);

  const { data: pendingDocs, loading } = useCollection<PendingDocument>(pendingDocsQuery);
  
  const handleGenerateXml = async (docToProcess: PendingDocument) => {
    const xmlString = generateDteXml(docToProcess);
    
    // Download the XML file
    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const folio = docToProcess.sourceMovementId ? docToProcess.sourceMovementId.substring(0, 10) : 'S-F';
    link.download = `DTE_52_F${folio}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Update the document status to 'GENERADO'
    if (firestore) {
      try {
        const docRef = doc(firestore, 'documentosPendientes', docToProcess.id);
        await updateDoc(docRef, { 
            estado: 'GENERADO',
            generatedAt: new Date(),
            generatedBy: user?.email || user?.uid,
         });
        toast({ title: 'XML Generado', description: `El DTE para el folio ${folio} se ha generado y el estado ha sido actualizado.` });
      } catch (error) {
        console.error('Error updating document status:', error);
        toast({ title: 'Error', description: 'No se pudo actualizar el estado del documento.', variant: 'destructive' });
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `documentosPendientes/${docToProcess.id}`,
            operation: 'update',
        }));
      }
    }
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
                           <Button variant="outline" size="sm" onClick={() => handleGenerateXml(doc)}>Generar XML</Button>
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
