'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Eye, EyeOff, Send, Save, Loader2, MessageSquareCode } from 'lucide-react';

export function TelegramSettings() {
  const [botToken, setBotToken] = React.useState('');
  const [chatId, setChatId] = React.useState('');
  const [showToken, setShowToken] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const firestore = useFirestore();
  const { toast } = useToast();

  // Cargar configuración inicial al montar el componente
  React.useEffect(() => {
    async function loadConfig() {
      if (!firestore) return;
      try {
        const docRef = doc(firestore, 'settings', 'telegram');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBotToken(data.botToken || '');
          setChatId(data.chatId || '');
        }
      } catch (err) {
        console.error('Error cargando configuración de Telegram:', err);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo cargar la configuración de Telegram.',
        });
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [firestore, toast]);

  // Guardar configuración en Firestore
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    setSaving(true);
    try {
      const docRef = doc(firestore, 'settings', 'telegram');
      await setDoc(docRef, {
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Configuración guardada',
        description: 'Los datos de Telegram se actualizaron correctamente.',
      });
    } catch (err) {
      console.error('Error al guardar configuración:', err);
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudo guardar la configuración en la base de datos.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Probar conexión enviando un mensaje de prueba a Telegram
  const handleTestConnection = async () => {
    const trimmedToken = botToken.trim();
    const trimmedChatId = chatId.trim();

    if (!trimmedToken || !trimmedChatId) {
      toast({
        variant: 'destructive',
        title: 'Campos incompletos',
        description: 'Por favor ingrese el Token del Bot y el ID del Chat antes de realizar la prueba.',
      });
      return;
    }

    setTesting(true);
    try {
      const testMessage = `⚡ *¡Prueba de conexión exitosa en FrigoManager!*\n\nTu bot de Telegram está correctamente configurado y listo para notificar el almacenamiento de Pallet Logs. 🍇❄️`;
      
      const response = await fetch(`https://api.telegram.org/bot${trimmedToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: trimmedChatId,
          text: testMessage,
          parse_mode: 'Markdown',
        }),
      });

      if (response.ok) {
        toast({
          title: '¡Conexión Exitosa!',
          description: 'El mensaje de prueba se envió correctamente a Telegram.',
        });
      } else {
        const errText = await response.text();
        console.error('Error API Telegram:', errText);
        toast({
          variant: 'destructive',
          title: 'Error de conexión',
          description: 'Telegram rechazó el mensaje. Revise el Token y el Chat ID.',
        });
      }
    } catch (err) {
      console.error('Error en prueba de conexión:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al intentar comunicarse con Telegram.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground font-medium">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <Card className="border border-slate-200 shadow-md">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
            <MessageSquareCode className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl text-slate-800">Integración con Telegram</CardTitle>
            <CardDescription>
              Configura un bot para que avise de manera automática a tu equipo cada vez que se almacena un Pallet Log por completo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <form onSubmit={handleSave}>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="botToken" className="text-slate-700 font-semibold">
              Token del Bot de Telegram
            </Label>
            <div className="relative">
              <Input
                id="botToken"
                type={showToken ? 'text' : 'password'}
                placeholder="Ej: 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="pr-10 font-mono text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                title={showToken ? 'Ocultar Token' : 'Mostrar Token'}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtenido al crear tu bot conversando con el `@BotFather` oficial de Telegram.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chatId" className="text-slate-700 font-semibold">
              Chat ID de Destino
            </Label>
            <Input
              id="chatId"
              type="text"
              placeholder="Ej: -100123456789 (Grupo) o 987654321 (Chat directo)"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              El identificador numérico de tu chat o grupo. Puedes obtenerlo agregando al bot `@userinfobot` o `@RawDataBot` al chat grupal.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="border-sky-200 text-sky-700 hover:bg-sky-50 transition-colors flex items-center gap-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Probar Conexión
          </Button>

          <Button
            type="submit"
            disabled={saving || testing}
            className="bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm transition-colors flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar Configuración
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
