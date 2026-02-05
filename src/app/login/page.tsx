
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
import {
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { FirebaseError } from 'firebase/app';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Separator } from '@/components/ui/separator';
import { FrioLogo } from '@/components/ui/FrioLogo';

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
  
  const handleAnonymousSignIn = async () => {
    if (!auth) return;

    try {
      await signInAnonymously(auth);
      toast({ title: '¡Éxito!', description: 'Iniciando sesión como invitado...' });
      // Redirect is handled by the useEffect
    } catch (error) {
       console.error(error);
       if (error instanceof FirebaseError) {
         toast({
          variant: 'destructive',
          title: 'Error de autenticación',
          description: 'No se pudo iniciar sesión como invitado.',
        });
       }
    }
  };


  if (isUserLoading || user) {
    return <LoadingScreen />;
  }


  return (
    <div className="flex items-center justify-center min-h-screen login-background">
      <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border/20">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <FrioLogo className="text-6xl text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {isSignUp ? 'Crear una cuenta' : 'Iniciar Sesión'}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? 'Ingrese sus datos para registrarse.'
              : 'Bienvenido a FriO.'}
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                O continúa con
              </span>
            </div>
          </div>
          
          <Button variant="outline" className="w-full" onClick={handleAnonymousSignIn}>
            Ingresar como Invitado
          </Button>

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
