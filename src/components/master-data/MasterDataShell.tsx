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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Form,
} from '@/components/ui/form';
import type { z } from 'zod';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { MasterData } from '@/lib/types';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, MoreHorizontal, Pencil, PlusCircle, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';

interface MasterDataShellProps<T extends MasterData> {
  collectionName: string;
  schema: z.ZodType<any, any>;
  columns: { key: keyof T; header: string }[];
  renderForm: React.ComponentType<{ form: any }>;
  docNameField: keyof T;
  csvHeaders: (keyof T)[];
  csvTemplateFileName: string;
}

export function MasterDataShell<T extends MasterData>({
  collectionName,
  schema,
  columns,
  renderForm: RenderFormComponent,
  docNameField,
  csvHeaders,
  csvTemplateFileName,
}: MasterDataShellProps<T>) {
  const { data, loading } = useFirestoreCollection<T>(collectionName);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [currentItem, setCurrentItem] = React.useState<T | null>(null);
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  const handleDialogOpen = (item: T | null = null) => {
    setCurrentItem(item);
    form.reset(item ? (typeof item.modulesAccess === 'object' ? {...item, modulesAccess: item.modulesAccess.join(', ')} : item) : schema.cast({}));
    setIsDialogOpen(true);
  };

  const handleDeleteDialogOpen = (item: T) => {
    setCurrentItem(item);
    setIsDeleteDialogOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      if (currentItem?.id) {
        await updateDoc(doc(db, collectionName, currentItem.id), values);
        toast({ title: 'Éxito', description: 'Registro actualizado correctamente.' });
      } else {
        await addDoc(collection(db, collectionName), values);
        toast({ title: 'Éxito', description: 'Registro creado correctamente.' });
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving document: ', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el registro.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!currentItem?.id) return;
    try {
      await deleteDoc(doc(db, collectionName, currentItem.id));
      toast({ title: 'Éxito', description: 'Registro eliminado correctamente.' });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting document: ', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el registro.',
        variant: 'destructive',
      });
    }
  };
  
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const fileHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

        if (JSON.stringify(fileHeaders) !== JSON.stringify(csvHeaders)) {
            toast({
                title: 'Error de formato',
                description: `Las cabeceras del CSV no coinciden. Esperado: ${csvHeaders.join(', ')}`,
                variant: 'destructive',
            });
            return;
        }

        const errors: string[] = [];
        let successCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const rowData: { [key: string]: any } = {};
            csvHeaders.forEach((header, index) => {
                rowData[header as string] = values[index];
            });

            try {
                const validatedData = schema.parse(rowData);
                await addDoc(collection(db, collectionName), validatedData);
                successCount++;
            } catch (error) {
                if (error instanceof z.ZodError) {
                    errors.push(`Línea ${i + 1}: ${error.errors.map(e => e.message).join(', ')}`);
                } else {
                    errors.push(`Línea ${i + 1}: Error desconocido al guardar.`);
                }
            }
        }
        
        toast({
            title: 'Importación Completada',
            description: `${successCount} registros importados. ${errors.length} errores.`,
        });

        if (errors.length > 0) {
            toast({
                title: 'Errores de Importación',
                description: (<div className="h-40 overflow-y-auto">{errors.map((e, i)=><p key={i}>{e}</p>)}</div>),
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
    <div>
        <div className="flex justify-end gap-2 mb-4">
            <Button onClick={() => handleDialogOpen()}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Nuevo Registro
            </Button>
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
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
                Array.from({length: 3}).map((_, i) => (
                    <TableRow key={i}>
                        {columns.map((col, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                        <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                ))
            ) : data.length > 0 ? (
              data.map((item) => (
                <TableRow key={item.id}>
                  {columns.map((col) => (
                    <TableCell key={String(col.key)}>
                        {Array.isArray(item[col.key]) ? (item[col.key] as string[]).join(', ') : String(item[col.key] ?? '')}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menú</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDialogOpen(item)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteDialogOpen(item)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentItem?.id ? 'Editar' : 'Crear'} Registro</DialogTitle>
            <DialogDescription>
              Complete la información del registro.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {RenderFormComponent && <RenderFormComponent form={form} />}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Guardar</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el registro de <strong>{String(currentItem?.[docNameField] ?? '')}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
