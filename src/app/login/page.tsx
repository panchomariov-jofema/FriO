'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth, useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { FirebaseError } from 'firebase/app';
import { LoadingScreen } from '@/components/LoadingScreen';
import { FrioLogo } from '@/components/ui/FrioLogo';

const loginSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  React.useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const onSubmit = async (values: LoginFormValues) => {
    if (!auth) return;

    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
    } catch (error) {
      console.error(error);
      if (error instanceof FirebaseError) {
        let message = 'Ocurrió un error inesperado.';
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            message = 'Credenciales inválidas. Verifique su email y contraseña.';
            break;
          case 'auth/invalid-email':
            message = 'El formato del email no es válido.';
            break;
          case 'auth/too-many-requests':
            message = 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.';
            break;
          default:
            message = error.message;
        }
        toast({
          variant: 'destructive',
          title: 'Error de autenticación',
          description: message,
        });
      }
    }
  };

  if (isUserLoading || user) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen login-background">
      <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border/20 shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <FrioLogo className="text-6xl text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Iniciar Sesión
          </CardTitle>
          <CardDescription>
            Sistema de Gestión Frigorífica FriO. Ingrese con sus credenciales autorizadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="usuario@dominio.com"
                        {...field}
                        autoComplete="email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col text-center text-xs text-muted-foreground border-t pt-4">
          <p>Acceso restringido a personal autorizado.</p>
          <p className="mt-1">Para altas de cuenta o recuperación de acceso, contacte al Administrador.</p>
        </CardFooter>
      </Card>
    </div>
  );
}
