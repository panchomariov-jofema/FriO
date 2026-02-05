
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

const CustomAppleIcon = ({ className }: { className?: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
      <path d="M9 2 Q 10.5 0 12 2 T 15 2" />
    </svg>
  );

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
            <div className="flex items-baseline gap-1">
                <span className="font-bold text-5xl text-primary">Fri</span>
                <CustomAppleIcon className="w-10 h-10 text-primary translate-y-1" />
            </div>
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
