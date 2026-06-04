'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { DTEGuiaDespacho } from '@/lib/types';
import { collection, query, where, updateDoc, doc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { generateDteXml } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Download } from 'lucide-react';

export function PendingDocsTab() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const pendingDocsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'documentosPendientes'), where('estado', '==', 'PENDIENTE'));
  }, [firestore]);

  const { data: pendingDocs, isLoading: loading } = useCollection<DTEGuiaDespacho>(pendingDocsQuery);
  
  const handleGenerateXml = async (docToProcess: DTEGuiaDespacho) => {
    const xmlString = generateDteXml(docToProcess);
    
    // Download the XML file
    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const folio = docToProcess.idDoc.folio;
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

  const handleGeneratePdf = (docToProcess: DTEGuiaDespacho) => {
    const pdf = new jsPDF();
    
    // Title
    pdf.setFontSize(18);
    pdf.text('Guía de Despacho', pdf.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

    // Header info
    pdf.setFontSize(10);
    pdf.text(`Folio: ${docToProcess.idDoc.folio}`, 190, 30, { align: 'right' });
    pdf.text(`Fecha: ${docToProcess.idDoc.fchEmis}`, 190, 35, { align: 'right' });

    // Emisor
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text("Emisor:", 14, 45);
    pdf.setFont('helvetica', 'normal');
    pdf.text(docToProcess.emisor.RznSocEmisor, 16, 52);
    pdf.text(`RUT: ${docToProcess.emisor.RUTEmisor}`, 16, 59);
    pdf.text(`${docToProcess.emisor.DirOrigen}, ${docToProcess.emisor.CmnaOrigen}`, 16, 66);

    // Receptor
    pdf.setFont('helvetica', 'bold');
    pdf.text("Receptor:", 100, 45);
    pdf.setFont('helvetica', 'normal');
    pdf.text(docToProcess.receptor.RznSocRecep, 102, 52);
    pdf.text(`RUT: ${docToProcess.receptor.RUTRecep}`, 102, 59);
    pdf.text(`${docToProcess.receptor.DirRecep}, ${docToProcess.receptor.CmnaRecep}`, 102, 66);

    // Transporte
    if (docToProcess.transporte) {
        pdf.setFont('helvetica', 'bold');
        pdf.text("Transporte:", 14, 76);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Patente: ${docToProcess.transporte.Patente}`, 16, 83);
        if (docToProcess.transporte.DirDest) {
            pdf.text(`Dirección Destino: ${docToProcess.transporte.DirDest}`, 16, 90);
        }
    }
    
    const tableData = docToProcess.detalle.map(item => [
      item.NmbItem,
      item.QtyItem,
      item.UnmdItem,
    ]);
    
    (pdf as any).autoTable({
      startY: (docToProcess.transporte ? 95 : 75),
      head: [['Descripción', 'Cantidad', 'Unidad']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] },
    });
    
    pdf.output('dataurlnewwindow');
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
                <TableHead>Fecha Emisión</TableHead>
                <TableHead>Folio</TableHead>
                <TableHead>Receptor</TableHead>
                <TableHead>Patente</TableHead>
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
                        <TableCell>{doc.idDoc.fchEmis}</TableCell>
                        <TableCell className="font-mono">{doc.idDoc.folio}</TableCell>
                        <TableCell>{doc.receptor.RznSocRecep}</TableCell>
                        <TableCell className="font-mono">{doc.transporte?.Patente}</TableCell>
                        <TableCell>
                            <Badge variant="destructive">{doc.estado}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                           <div className="flex items-center justify-end gap-2">
                             <Button variant="outline" size="sm" onClick={() => handleGeneratePdf(doc)}>
                               <Download className="h-4 w-4" />
                             </Button>
                             <Button variant="outline" size="sm" onClick={() => handleGenerateXml(doc)}>Generar XML</Button>
                           </div>
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
