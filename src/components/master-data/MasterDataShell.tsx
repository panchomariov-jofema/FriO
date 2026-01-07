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
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Download, Pencil, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface MasterDataShellProps<T extends MasterData> {
  title: string;
  collectionName: string;
  schema: z.ZodType<any, any>;
  columns: { key: keyof T; header: string }[];
  RenderFormComponent: React.ComponentType<{ form: any, [key: string]: any }>;
  docNameField: keyof T;
  csvHeaders: (keyof T)[];
  csvTemplateFileName: string;
  formProps?: Record<string, any>;
}

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
    const itemData = typeof (item as any).modulesAccess === 'object' 
        ? {...item, modulesAccess: (item as any).modulesAccess.join(', ')} 
        : item;
    form.reset(itemData);
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

  const onSubmit = (values: z.infer<typeof schema>) => {
      // If modulesAccess exists and is a string, convert it to an array
      const dataToSave = {...values};
      if (typeof dataToSave.modulesAccess === 'string') {
        dataToSave.modulesAccess = dataToSave.modulesAccess.split(',').map((s: string) => s.trim());
      }
      
      if (currentItem?.id) {
        const docRef = doc(firestore, collectionName, currentItem.id);
        updateDoc(docRef, dataToSave)
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

      } else {
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
  
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
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

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const rowData: { [key: string]: any } = {};
            
            expectedHeaders.forEach((header, index) => {
                rowData[header] = values[index];
            });

            try {
                const validatedData = schema.parse(rowData);
                await addDoc(collection(firestore, collectionName), validatedData);
                successCount++;
            } catch (error) {
                if (error instanceof z.ZodError) {
                    errors.push(`Línea ${i + 1}: ${error.errors.map(e => e.message).join(', ')}`);
                } else {
                    console.error('Import error:', error);
                    errors.push(`Línea ${i + 1}: Error desconocido al guardar.`);
                }
            }
        }
        
        toast({
            title: 'Importación Completada',
            description: `${successCount} registros importados. ${errors.length} errores.`,
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
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Importar CSV
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla
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
                            {Array.isArray(item[col.key]) ? (item[col.key] as string[]).join(', ') : String(item[col.key] ?? '')}
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
