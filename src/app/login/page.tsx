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
import { Leaf } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { FirebaseError } from 'firebase/app';
import { LoadingScreen } from '@/components/LoadingScreen';

const loginSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = React.useState(false);
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
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, values.email, values.password);
        toast({ title: '¡Éxito!', description: 'Usuario registrado. Iniciando sesión...' });
      } else {
        await signInWithEmailAndPassword(auth, values.email, values.password);
      }
      // The onAuthStateChanged listener in the layout will handle the redirect
    } catch (error) {
      console.error(error);
      if (error instanceof FirebaseError) {
        let message = 'Ocurrió un error inesperado.';
        switch (error.code) {
          case 'auth/user-not-found':
            message = 'No se encontró un usuario con ese email.';
            break;
          case 'auth/wrong-password':
            message = 'Contraseña incorrecta.';
            break;
          case 'auth/email-already-in-use':
            message = 'Este email ya está en uso.';
            break;
          case 'auth/invalid-email':
              message = 'El formato del email no es válido.';
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
    <div className="flex items-center justify-center min-h-screen bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <Leaf className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {isSignUp ? 'Crear una cuenta' : 'Iniciar Sesión'}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? 'Ingrese sus datos para registrarse.'
              : 'Bienvenido a FrigoManager.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
                {form.formState.isSubmitting
                  ? 'Procesando...'
                  : isSignUp
                  ? 'Registrarse'
                  : 'Iniciar Sesión'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm">
          <p>
            {isSignUp
              ? '¿Ya tienes una cuenta?'
              : '¿No tienes una cuenta?'}
            <Button
              variant="link"
              className="p-1"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Inicia sesión' : 'Regístrate'}
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
