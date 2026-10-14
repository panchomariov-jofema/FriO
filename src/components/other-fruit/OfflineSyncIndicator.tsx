'use client';

import * as React from 'react';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  HardDrive
} from 'lucide-react';
import { 
  getOfflineQueue, 
  syncOfflineQueueToFirestore, 
  QUEUE_EVENT_NAME, 
  type OfflinePalletAction 
} from '@/lib/vitafood-offline-sync';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = React.useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [queue, setQueue] = React.useState<OfflinePalletAction[]>(() => getOfflineQueue());
  const [isSyncing, setIsSyncing] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const updateQueueState = React.useCallback(() => {
    setQueue(getOfflineQueue());
  }, []);

  // Listen to network status
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to queue changes (local storage & custom event)
  React.useEffect(() => {
    const handleCustomEvent = () => updateQueueState();
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'frio_vitafood_offline_queue') {
        updateQueueState();
      }
    };

    window.addEventListener(QUEUE_EVENT_NAME, handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener(QUEUE_EVENT_NAME, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [updateQueueState]);

  // Synchronize handler
  const syncNow = React.useCallback(async (silent = false) => {
    if (!firestore || isSyncing) return;
    const currentQueue = getOfflineQueue();
    if (currentQueue.length === 0) return;

    setIsSyncing(true);
    try {
      const result = await syncOfflineQueueToFirestore(firestore);
      updateQueueState();

      if (result.syncedCount > 0) {
        toast({
          title: '✅ Sincronización Exitosa',
          description: `Se subieron ${result.syncedCount} pallet(s) a la nube sin perder datos.`,
        });
      }

      if (result.errors.length > 0 && !silent) {
        toast({
          variant: 'destructive',
          title: 'Aviso de Sincronización',
          description: result.errors[0],
        });
      }
    } catch (err: any) {
      console.error('Error during offline sync:', err);
      if (!silent) {
        toast({
          variant: 'destructive',
          title: 'Fallo al sincronizar',
          description: 'Aún no se puede contactar al servidor. Los datos permanecen a salvo en el dispositivo.',
        });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [firestore, isSyncing, toast, updateQueueState]);

  // Auto-sync when transitioning from offline to online
  React.useEffect(() => {
    if (isOnline && queue.length > 0 && !isSyncing) {
      // Small timeout to allow network stack to stabilize
      const timer = setTimeout(() => {
        syncNow(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, queue.length, isSyncing, syncNow]);

  return {
    isOnline,
    queue,
    pendingCount: queue.length,
    isSyncing,
    syncNow,
    refreshQueue: updateQueueState,
  };
}

export function OfflineSyncIndicator({ className }: { className?: string }) {
  const [mounted, setMounted] = React.useState(false);
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineSync();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || (isOnline && pendingCount === 0)) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className || ''}`}>
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 text-[11px] font-medium py-0.5 px-2">
          <Wifi className="w-3 h-3 mr-1 text-emerald-600" />
          En línea
        </Badge>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className={`flex items-center gap-2 ${className || ''}`}>
        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs py-1 px-2.5 font-semibold animate-pulse">
          <WifiOff className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-400" />
          Modo Cámara (Sin Red)
        </Badge>
        {pendingCount > 0 && (
          <Badge variant="outline" className="text-xs bg-background border-amber-500/40 text-amber-800 dark:text-amber-300 font-bold">
            <HardDrive className="w-3 h-3 mr-1 text-amber-600" />
            {pendingCount} guardado{pendingCount > 1 ? 's' : ''} localmente
          </Badge>
        )}
      </div>
    );
  }

  // Online but has pending items to sync
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 text-xs py-1 px-2.5 font-semibold">
        <HardDrive className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
        {pendingCount} pendiente{pendingCount > 1 ? 's' : ''} en cola
      </Badge>
      <Button
        variant="outline"
        size="sm"
        onClick={() => syncNow(false)}
        disabled={isSyncing}
        className="h-7 text-xs px-2.5 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
      >
        <RefreshCw className={`w-3 h-3 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
      </Button>
    </div>
  );
}
