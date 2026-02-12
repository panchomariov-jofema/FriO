'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/firebase';
import { addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { packagingMasterSchema } from '@/lib/schemas';

interface CreatePackagingProductProps {
  clientId: string;
  onProductCreated?: () => void;
}

// We only need code and name, clientId is passed as a prop.
const createProductSchema = packagingMasterSchema.omit({ clientId: true });
type CreateProductFormValues = z.infer<typeof createProductSchema>;

export function CreatePackagingProduct({ clientId, onProductCreated }: CreatePackagingProductProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const form = useForm<CreateProductFormValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      code: '',
      name: '',
    },
  });

  const onSubmit = async (values: CreateProductFormValues) => {
    if (!firestore || !clientId) return;

    // Check for duplicate code for the same client
    const q = query(
      collection(firestore, 'packagingMaster'),
      where('clientId', '==', clientId),
      where('code', '==', values.code)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      toast({
        variant: 'destructive',
        title: 'Código Duplicado',
        description: `Ya existe un producto con el código "${values.code}" para este cliente.`,
      });
      return;
    }

    const newProductData = {
      ...values,
      clientId,
    };

    try {
      await addDoc(collection(firestore, 'packagingMaster'), newProductData);
      toast({
        title: 'Éxito',
        description: `Producto "${values.name}" creado.`,
      });
      form.reset();
      onProductCreated?.();
    } catch (error) {
      console.error('Error creating new packaging product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear el nuevo producto.',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Guardando...' : 'Guardar Producto'}
        </Button>
      </form>
    </Form>
  );
}
