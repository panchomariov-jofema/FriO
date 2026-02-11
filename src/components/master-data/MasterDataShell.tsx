'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { z } from 'zod';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { MasterData } from '@/lib/types';
import { addDoc, collection, deleteDoc, doc, updateDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Download, Pencil, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';

// Helper functions for CSV export
function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row =>
        headers.map(header => {
            let value = row[header];
            if (value === undefined || value === null) {
                return '""';
            }
            if (value instanceof Date) {
                value = value.toLocaleString('es-CL');
            } else if (typeof value === 'object' && value.toDate instanceof Function) { // Firebase Timestamp
                value = value.toDate().toLocaleString('es-CL');
            } else if (Array.isArray(value) || typeof value === 'object') {
                value = JSON.stringify(value);
            }
            
            const stringValue = String(value);
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}

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


const defaultProfiles = [
  { profileId: 'MAESTRO', name: 'Maestro', modulesAccess: ['Dashboard', 'Bins y Materiales', 'Recepción', 'Hidrocooler', 'Cámaras', 'Despachos', 'Reportes', 'Embalajes', 'Socios Comerciales', 'Fall Creek', 'Datos Maestros'] },
  { profileId: 'EJECUTIVO', name: 'Ejecutivo', modulesAccess: ['Dashboard', 'Reportes'] },
  { profileId: 'EXP_SUBSOLE', name: 'Exportador Subsole', modulesAccess: [{ name: 'Dashboard', fixedExporterId: 'SUBSOLE' }] },
  { profileId: 'EXP_MEYER', name: 'Exportador Meyer', modulesAccess: [{ name: 'Dashboard', fixedExporterId: 'MEYER' }] },
  { profileId: 'EXP_BLOSSOM', name: 'Exportador Blossom', modulesAccess: [{ name: 'Dashboard', fixedExporterId: 'BLOSSOM' }] },
  { profileId: 'SUP_PATIO', name: 'Supervisor Patio', modulesAccess: ['Recepción', 'Hidrocooler', 'Cámaras'] },
  { profileId: 'SUP_SUBSOLE', name: 'Supervisor Subsole', modulesAccess: ['Recepción', 'Despachos'] },
  { profileId: 'SUP_HIDRO', name: 'Supervisor Hidrocooler', modulesAccess: ['Hidrocooler'] },
  { profileId: 'GRUERO', name: 'Gruero', modulesAccess: ['Cámaras', { name: 'Embalajes', allowedTabs: ['almacenamiento'] }, { name: 'Socios Comerciales', allowedTabs: ['almacenamiento'] }] },
  { profileId: 'JEF_LOG', name: 'Jefe de Logística', modulesAccess: ["Dashboard", "Bins y Materiales", "Recepción", "Hidrocooler", "Cámaras", "Despachos", "Embalajes", "Socios Comerciales", "Fall Creek", "Reportes"] },
];


export function MasterDataShell<T extends MasterData>({
  title,
  collectionName,
  schema,
  columns,
  RenderFormComponent,
  docNameField,
  csvHeaders,
  csvTemplateFileName,
  formProps,
}: MasterDataShellProps<T>) {
  const { data, loading } = useFirestoreCollection<T>(collectionName);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<T | null>(null);
  const [currentItem, setCurrentItem] = React.useState<T | null>(null);
  
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
        Object.keys(schema.shape).map(key => [key, ''])
    ),
  });

  const handleEdit = (item: T) => {
    setCurrentItem(item);
    form.reset(item);
  };

  const handleCancelEdit = () => {
    setCurrentItem(null);
    form.reset(Object.fromEntries(
        Object.keys(schema.shape).map(key => [key, ''])
      ));
  }

  const handleDeleteDialogOpen = (item: T) => {
    setItemToDelete(item);
    setIsDeleteDialogOpen(true);
  };

  const handleStatusToggle = async (item: T) => {
    if (!item.id) return;
    
    const currentStatus = (item as any).status;
    // Treat undefined or any value other than 'inactivo' as active.
    const newStatus = currentStatus === 'inactivo' ? 'activo' : 'inactivo';

    const docRef = doc(firestore, collectionName, item.id);
    
    try {
        await updateDoc(docRef, { status: newStatus });
        toast({ title: 'Éxito', description: 'Estado actualizado.' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: { status: newStatus },
          })
        );
    }
  };

  const onSubmit = async (values: z.infer<typeof schema>) => {
      const dataToSave = {...values};
      
      if (currentItem?.id) { // --- UPDATE ---
        const docRef = doc(firestore, collectionName, currentItem.id);
        await updateDoc(docRef, dataToSave)
        .then(()=> {
            toast({ title: 'Éxito', description: 'Registro actualizado correctamente.' });
            handleCancelEdit();
        })
        .catch(error => {
            errorEmitter.emit(
              'permission-error',
              new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: dataToSave,
              })
            );
        });

      } else { // --- CREATE ---
        const keyFields: Record<string, string> = {
          exporters: 'exporterId',
          producers: 'producerId',
          binMaterials: 'code',
          otherClients: 'clientId',
          packagingMaster: 'code',
          usersMaster: 'userName',
          profiles: 'profileId',
          packings: 'name',
          businessEntities: 'rut',
        };
        
        const keyField = keyFields[collectionName];
        if (keyField && dataToSave[keyField]) {
            const q = query(collection(firestore, collectionName), where(keyField, "==", dataToSave[keyField]));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                toast({
                    variant: 'destructive',
                    title: 'Clave Duplicada',
                    description: `Ya existe un registro con el valor '${dataToSave[keyField]}' en el campo '${keyField}'.`,
                });
                return; // Stop submission
            }
        }
        
        const collRef = collection(firestore, collectionName);
        addDoc(collRef, dataToSave)
        .then(() => {
            toast({ title: 'Éxito', description: 'Registro creado correctamente.' });
            handleCancelEdit();
        })
        .catch(error => {
             errorEmitter.emit(
              'permission-error',
              new FirestorePermissionError({
                path: collRef.path,
                operation: 'create',
                requestResourceData: dataToSave,
              })
            );
        });
      }
  };

  const handleDelete = () => {
    if (!itemToDelete?.id) return;
    const docRef = doc(firestore, collectionName, itemToDelete.id);
    deleteDoc(docRef)
    .then(() => {
      toast({ title: 'Éxito', description: 'Registro eliminado correctamente.' });
      setIsDeleteDialogOpen(false);
      setItemToDelete(null);
    })
    .catch(error => {
       errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        })
      );
    });
  };
  
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 1) {
            toast({ title: 'Error de archivo', description: 'El archivo CSV está vacío o tiene un formato incorrecto.', variant: 'destructive'});
            return;
        }
        const fileHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

        // Quick check to see if headers match
        const expectedHeaders = csvHeaders as string[];
        if (JSON.stringify(fileHeaders) !== JSON.stringify(expectedHeaders)) {
            toast({
                title: 'Error de formato',
                description: `Las cabeceras del CSV no coinciden. Esperado: ${expectedHeaders.join(', ')}`,
                variant: 'destructive',
            });
            return;
        }

        const errors: string[] = [];
        let successCount = 0;

        const keyFields: Record<string, string> = {
          exporters: 'exporterId',
          producers: 'producerId',
          binMaterials: 'code',
          otherClients: 'clientId',
          packagingMaster: 'code',
          usersMaster: 'userName',
          profiles: 'profileId',
          packings: 'name',
        };
        const keyField = keyFields[collectionName];
        
        const batch = writeBatch(firestore);
        let operations = 0;

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const rowData: { [key: string]: any } = {};
            
            expectedHeaders.forEach((header, index) => {
                rowData[header] = values[index];
            });

            if (rowData.type && typeof rowData.type === 'string') {
              rowData.type = rowData.type.toLowerCase();
            }

            try {
                const validatedData = schema.parse(rowData);

                let existingDocRef: any = null;
                if (keyField && validatedData[keyField]) {
                    const q = query(collection(firestore, collectionName), where(keyField, "==", validatedData[keyField]));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        existingDocRef = querySnapshot.docs[0].ref;
                    }
                }
        
                if (existingDocRef) {
                    batch.update(existingDocRef, validatedData);
                } else {
                    const newDocRef = doc(collection(firestore, collectionName));
                    batch.set(newDocRef, validatedData);
                }
                successCount++;
                operations++;

                if (operations >= 400) {
                  await batch.commit();
                  operations = 0;
                }

            } catch (error) {
                if (error instanceof z.ZodError) {
                    errors.push(`Línea ${i + 1}: ${error.errors.map(e => e.message).join(', ')}`);
                } else {
                    console.error("Error processing import line:", error);
                    errors.push(`Línea ${i + 1}: Error al guardar en base de datos.`);
                }
            }
        }

        if (operations > 0) {
            await batch.commit();
        }
        
        toast({
            title: 'Importación Completada',
            description: `${successCount} registros procesados. ${errors.length > 0 ? `${errors.length} errores.` : ''}`,
        });

        if (errors.length > 0) {
            console.error("Import Errors:", errors);
            toast({
                title: `Se encontraron ${errors.length} errores de importación`,
                description: (<div className="h-40 w-full overflow-y-auto">{errors.map((e, i)=><p key={i} className="text-xs">{e}</p>)}</div>),
                variant: 'destructive',
                duration: 9000,
            });
        }
    };
    reader.readAsText(file);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + csvHeaders.join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", csvTemplateFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleExport = () => {
    if (!data || data.length === 0) {
        toast({
            variant: 'destructive',
            title: 'Sin datos',
            description: 'No hay datos para exportar.',
        });
        return;
    }
    const headers = csvHeaders as string[];
    const csv = convertToCSV(data, headers);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `export_${collectionName}_${date}.csv`);
  };

  const handleSeedProfiles = async () => {
    if (!firestore || collectionName !== 'profiles') return;

    const batch = writeBatch(firestore);
    const profilesRef = collection(firestore, 'profiles');
    
    defaultProfiles.forEach(profile => {
        const docRef = doc(profilesRef);
        batch.set(docRef, profile);
    });

    try {
        await batch.commit();
        toast({
            title: 'Éxito',
            description: 'Perfiles de ejemplo cargados correctamente.'
        });
    } catch (error) {
        console.error("Error seeding profiles: ", error);
        toast({
            title: 'Error al cargar perfiles',
            description: 'No se pudieron guardar los perfiles de ejemplo.',
            variant: 'destructive'
        });
    }
  };


  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-1">
        <Card>
            <CardHeader>
                <CardTitle>{currentItem ? 'Editar' : 'Nuevo'} {title.slice(0, -1)}</CardTitle>
                <CardDescription>
                    {currentItem ? 'Modifique los datos del registro.' : 'Complete el formulario para crear un nuevo registro.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <RenderFormComponent form={form} {...formProps} />
                    <div className="flex justify-end gap-2">
                         {currentItem && (
                            <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
                        )}
                        <Button type="submit">{currentItem ? 'Guardar Cambios' : 'Crear Registro'}</Button>
                    </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <div className="flex justify-end gap-2 mb-4">
            {collectionName === 'profiles' && data.length === 0 && !loading && (
              <Button variant="outline" onClick={handleSeedProfiles}>
                Cargar Perfiles de Ejemplo
              </Button>
            )}
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Importar CSV
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={loading || !data || data.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
            </Button>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileImport}
            />
        </div>
        <div className="rounded-md border">
            <Table>
            <TableHeader>
                <TableRow>
                {columns.map((col) => (
                    <TableHead key={String(col.key)}>{col.header}</TableHead>
                ))}
                <TableHead className="text-right w-[100px]">Acciones</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    Array.from({length: 5}).map((_, i) => (
                        <TableRow key={i}>
                            {columns.map((col, j) => (
                                <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                            ))}
                            <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                        </TableRow>
                    ))
                ) : data.length > 0 ? (
                data.map((item) => (
                    <TableRow key={item.id} className={currentItem?.id === item.id ? 'bg-muted/50' : ''}>
                    {columns.map((col) => (
                        <TableCell key={String(col.key)}>
                           {['producers', 'otherClients'].includes(collectionName) && col.key === 'status' ? (
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        checked={(item as any).status !== 'inactivo'}
                                        onCheckedChange={() => handleStatusToggle(item)}
                                        aria-label={`Cambiar estado para ${String((item as any).name)}`}
                                    />
                                    <Badge variant={(item as any).status === 'inactivo' ? 'secondary' : 'default'}>
                                        {(item as any).status === 'inactivo' ? 'inactivo' : 'activo'}
                                    </Badge>
                                </div>
                            ) : Array.isArray(item[col.key]) ? (
                                JSON.stringify(item[col.key])
                            ) : (
                                String(item[col.key] ?? '—')
                            )}
                        </TableCell>
                    ))}
                    <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteDialogOpen(item)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                             <span className="sr-only">Eliminar</span>
                        </Button>
                    </TableCell>
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                    No se encontraron resultados.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
      </div>


      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el registro de <strong>{String(itemToDelete?.[docNameField] ?? '')}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
