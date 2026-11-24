'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Zap, AlertCircle, CheckCircle2, Warehouse, ArrowRight, Layers } from 'lucide-react';
import { chambersConfig } from '@/lib/chambers-config';
import { getEffectiveChamberConfig, getSortedCoordinates, safeToDate } from '@/lib/utils';
import { isOlmue } from '@/lib/clients';
import { cleanFirestoreObject } from '@/lib/vitafood-utils';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { OtherFruitReception, OtherFruitReceptionItem, ChamberLot } from '@/lib/types';

interface OlmueAutoStorageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receptions: OtherFruitReception[];
  chamberLots: ChamberLot[];
  chamberSettings: { id: string; row13Enabled?: boolean; colsKLEnabled?: boolean; colsPQREnabled?: boolean }[];
  preselectedReceptionId?: string;
  onSuccess?: () => void;
}

export function OlmueAutoStorageDialog({
  open,
  onOpenChange,
  receptions,
  chamberLots,
  chamberSettings,
  preselectedReceptionId,
  onSuccess,
}: OlmueAutoStorageDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedReceptionId, setSelectedReceptionId] = React.useState<string>('');
  const [selectedChamberId, setSelectedChamberId] = React.useState<string>('CAMARA-4');
  const [startCoordinate, setStartCoordinate] = React.useState<string>('A1');

  // 1. Filtrar recepciones pendientes de Olmué
  const olmuePendingReceptions = React.useMemo(() => {
    return (receptions || [])
      .filter(r => isOlmue(r))
      .map(r => {
        const pendingItems = (r.items || []).filter(
          item =>
            item &&
            Number(item.quantity || 0) > 0 &&
            item.status !== 'Almacenado' &&
            item.status !== 'Despachado' &&
            item.status !== 'No Recepcionado' &&
            (!item.storageLocation?.chamberId || !item.storageLocation?.coordinate || item.status === 'Pendiente de almacenar')
        );
        const totalPendingPallets = pendingItems.reduce(
          (acc, it) => acc + Number(it.quantity || 1),
          0
        );
        const products = [...new Set(pendingItems.map(it => it.productName))].join(', ');
        const varieties = [...new Set(pendingItems.map(it => it.variety).filter(Boolean))].join(', ');
        const fruitTypes = [...new Set(pendingItems.map(it => it.fruitType).filter(Boolean))].join(', ');

        return {
          reception: r,
          id: r.id,
          document: r.document || (r as any).documentNumber || 'S/N',
          documentNumber: (r as any).documentNumber,
          createdAt: r.createdAt,
          pendingItems,
          totalPendingPallets,
          products,
          varieties,
          fruitTypes,
        };
      })
      .filter(r => r.totalPendingPallets > 0);
  }, [receptions]);

  // Sincronizar recepción seleccionada por defecto
  React.useEffect(() => {
    if (open) {
      if (preselectedReceptionId && olmuePendingReceptions.some(r => r.id === preselectedReceptionId)) {
        setSelectedReceptionId(preselectedReceptionId);
      } else if (olmuePendingReceptions.length > 0 && (!selectedReceptionId || !olmuePendingReceptions.some(r => r.id === selectedReceptionId))) {
        setSelectedReceptionId(olmuePendingReceptions[0].id);
      }
    }
  }, [open, preselectedReceptionId, olmuePendingReceptions, selectedReceptionId]);

  const selectedReceptionData = React.useMemo(() => {
    return olmuePendingReceptions.find(r => r.id === selectedReceptionId) || null;
  }, [olmuePendingReceptions, selectedReceptionId]);

  // 2. Switches de la cámara seleccionada
  const activeChamberSetting = React.useMemo(() => {
    return chamberSettings?.find(s => s.id === selectedChamberId);
  }, [chamberSettings, selectedChamberId]);

  const isRow13Enabled = !!activeChamberSetting?.row13Enabled;
  const isColsKLEnabled = selectedChamberId === 'CAMARA-3' && !!activeChamberSetting?.colsKLEnabled;
  const isColsPQREnabled = selectedChamberId === 'CAMARA-5' && !!activeChamberSetting?.colsPQREnabled;

  // Toggle de switch de cámara
  const handleToggleRowSwitch = async (checked: boolean) => {
    if (!firestore || !selectedChamberId) return;
    try {
      await setDoc(doc(firestore, 'chamberSettings', selectedChamberId), { row13Enabled: checked }, { merge: true });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el switch de la cámara.' });
    }
  };

  const handleToggleColsKL = async (checked: boolean) => {
    if (!firestore || selectedChamberId !== 'CAMARA-3') return;
    try {
      await setDoc(doc(firestore, 'chamberSettings', selectedChamberId), { colsKLEnabled: checked }, { merge: true });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el switch K y L.' });
    }
  };

  const handleToggleColsPQR = async (checked: boolean) => {
    if (!firestore || selectedChamberId !== 'CAMARA-5') return;
    try {
      await setDoc(doc(firestore, 'chamberSettings', selectedChamberId), { colsPQREnabled: checked }, { merge: true });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el switch P, Q y R.' });
    }
  };

  // 3. Configuración efectiva y coordenadas secuenciales (A1..AX, B1..BX)
  const chamberConfig = chambersConfig[selectedChamberId];
  const effectiveChamberConfig = React.useMemo(() => {
    if (!chamberConfig) return null;
    return getEffectiveChamberConfig(chamberConfig, isRow13Enabled, isColsKLEnabled, isColsPQREnabled);
  }, [chamberConfig, isRow13Enabled, isColsKLEnabled, isColsPQREnabled]);

  const allSequentialCoords = React.useMemo(() => {
    if (!effectiveChamberConfig) return [];
    return getSortedCoordinates(effectiveChamberConfig, 'secuencial');
  }, [effectiveChamberConfig]);

  // Si cambia de cámara o de switches y la coordenada de inicio no existe, resetear a A1 o primera disponible
  React.useEffect(() => {
    if (allSequentialCoords.length > 0 && !allSequentialCoords.includes(startCoordinate)) {
      setStartCoordinate(allSequentialCoords[0]);
    }
  }, [allSequentialCoords, startCoordinate]);

  // 4. Ocupación de la cámara (cualquier fruta o pallet = coordenada ocupada)
  const occupiedCoordsSet = React.useMemo(() => {
    const occupied = new Set<string>();

    (chamberLots || []).forEach(l => {
      if (l.status === 'Almacenado' && l.chamberId === selectedChamberId && l.coordinate && Number(l.binCount || 0) > 0) {
        occupied.add(l.coordinate);
      }
    });

    (receptions || []).forEach(r => {
      (r.items || []).forEach(it => {
        if (
          it &&
          it.status === 'Almacenado' &&
          it.storageLocation?.chamberId === selectedChamberId &&
          it.storageLocation.coordinate &&
          Number(it.quantity || 0) > 0
        ) {
          occupied.add(it.storageLocation.coordinate);
        }
      });
    });

    return occupied;
  }, [chamberLots, receptions, selectedChamberId]);

  // 5. Cálculo y validación de asignación automática (1 pallet por coordenada libre)
  const calculation = React.useMemo(() => {
    if (!selectedReceptionData || allSequentialCoords.length === 0) {
      return {
        canStore: false,
        error: 'Seleccione una recepción válida.',
        freeCoords: [],
        assignedCoords: [],
        totalNeeded: 0,
        skippedCoords: [],
      };
    }

    const totalNeeded = selectedReceptionData.totalPendingPallets;
    const startIndex = allSequentialCoords.indexOf(startCoordinate);

    if (startIndex === -1) {
      return {
        canStore: false,
        error: `La coordenada de inicio (${startCoordinate}) no es válida en ${selectedChamberId}.`,
        freeCoords: [],
        assignedCoords: [],
        totalNeeded,
        skippedCoords: [],
      };
    }

    // Coordenadas desde la coordenada de inicio hasta el final de la cámara
    const candidateCoords = allSequentialCoords.slice(startIndex);

    // Identificar coordenadas libres y ocupadas
    const freeCoords: string[] = [];
    const skippedCoords: string[] = [];

    for (const coord of candidateCoords) {
      if (occupiedCoordsSet.has(coord)) {
        skippedCoords.push(coord);
      } else {
        freeCoords.push(coord);
      }
    }

    if (freeCoords.length < totalNeeded) {
      return {
        canStore: false,
        error: `Capacidad insuficiente: La recepción requiere ${totalNeeded} pallets, pero solo hay ${freeCoords.length} ubicaciones libres en ${selectedChamberId} desde ${startCoordinate}. No es posible almacenar este lote.`,
        freeCoords,
        assignedCoords: [],
        totalNeeded,
        availableCount: freeCoords.length,
        skippedCoords,
      };
    }

    const assignedCoords = freeCoords.slice(0, totalNeeded);
    const lastAssignedCoord = assignedCoords[assignedCoords.length - 1];
    const lastIndexInCandidates = candidateCoords.indexOf(lastAssignedCoord);
    const skippedInPath = candidateCoords.slice(0, lastIndexInCandidates + 1).filter(c => occupiedCoordsSet.has(c));

    return {
      canStore: true,
      error: null,
      freeCoords,
      assignedCoords,
      totalNeeded,
      firstCoord: assignedCoords[0],
      lastCoord: lastAssignedCoord,
      skippedInPath,
    };
  }, [selectedReceptionData, allSequentialCoords, startCoordinate, occupiedCoordsSet, selectedChamberId]);

  // 6. Confirmación del Almacenamiento Automático
  const handleConfirmAutoStore = async () => {
    if (!firestore || !selectedReceptionData || !calculation.canStore) return;

    setIsSubmitting(true);
    try {
      const recRef = doc(firestore, 'otherFruitReceptions', selectedReceptionData.id);

      // Desglosar cada pallet de los pendientes a 1 pallet por coordenada
      const newStoredItems: OtherFruitReceptionItem[] = [];
      let coordIndex = 0;

      selectedReceptionData.pendingItems.forEach(item => {
        const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
        for (let i = 0; i < qty; i++) {
          const assignedCoord = calculation.assignedCoords[coordIndex++];
          newStoredItems.push({
            ...item,
            quantity: 1,
            status: 'Almacenado',
            storageLocation: {
              chamberId: selectedChamberId,
              coordinate: assignedCoord,
            },
            storedAt: new Date(),
            storedByUserName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
            storedByUserId: user?.uid || undefined,
          });
        }
      });

      // Conservar items que ya estaban almacenados o no pendientes
      const nonPendingItems = (selectedReceptionData.reception.items || []).filter(
        it => it && (it.status === 'Almacenado' || it.status === 'Despachado' || it.status === 'No Recepcionado' || (it.storageLocation?.chamberId && it.storageLocation?.coordinate))
      );
      const finalItems = [...nonPendingItems, ...newStoredItems];

      // Determinar si queda algún ítem pendiente en la recepción
      const stillHasPending = finalItems.some(
        it => (it.status === 'Pendiente de almacenar' || it.status === 'Pendiente de recibir') && Number(it.quantity || 0) > 0
      );
      const newStatus = stillHasPending ? 'Parcialmente Almacenado' : 'Almacenado';

      await updateDoc(
        recRef,
        cleanFirestoreObject({
          items: finalItems,
          status: newStatus,
          updatedAt: serverTimestamp(),
        })
      );

      toast({
        title: '✅ Almacenamiento Automático Exitoso',
        description: `Se almacenaron ${calculation.totalNeeded} pallets de Olmué en ${selectedChamberId} (${calculation.firstCoord} → ${calculation.lastCoord}).`,
      });

      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al almacenar',
        description: err.message || 'Ocurrió un error al guardar las ubicaciones.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isChamber4 = selectedChamberId === 'CAMARA-4';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-600">
              <Zap className="h-5 w-5 fill-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                Almacenamiento Automático Express
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]">
                  OLMUÉ
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Asignación masiva por lote: 1 pallet por coordenada en orden ascendente (A1..AX → B1..BX).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* PASO 1: Selección de Lote / Recepción */}
          <div className="space-y-2 p-3 bg-muted/40 rounded-xl border">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                1. Lote / Recepción a Almacenar
              </Label>
              {selectedReceptionData && (
                <Badge className="bg-emerald-600 text-white font-bold text-xs">
                  {selectedReceptionData.totalPendingPallets} Pallets
                </Badge>
              )}
            </div>

            {olmuePendingReceptions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No hay recepciones de Olmué pendientes de almacenar.</p>
            ) : (
              <Select value={selectedReceptionId} onValueChange={setSelectedReceptionId}>
                <SelectTrigger className="w-full bg-background font-medium text-xs">
                  <SelectValue placeholder="Seleccione un lote..." />
                </SelectTrigger>
                <SelectContent>
                  {olmuePendingReceptions.map(r => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      Doc: {r.document} • {r.totalPendingPallets} Pallets ({r.products}
                      {r.varieties ? ` - ${r.varieties}` : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedReceptionData && (
              <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-background rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Documento</span>
                  <span className="font-mono font-bold truncate block">{selectedReceptionData.document}</span>
                </div>
                <div className="p-2 bg-background rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Producto</span>
                  <span className="font-bold truncate block">{selectedReceptionData.products || 'Cereza'}</span>
                </div>
                <div className="p-2 bg-background rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Variedad</span>
                  <span className="font-bold truncate block text-emerald-700 dark:text-emerald-400">
                    {selectedReceptionData.varieties || '—'}
                  </span>
                </div>
                <div className="p-2 bg-background rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Tipo Fruta</span>
                  <span className="font-bold truncate block">{selectedReceptionData.fruitTypes || '—'}</span>
                </div>
              </div>
            )}
          </div>

          {/* PASO 2: Selección de Cámara y Switches */}
          <div className="space-y-3 p-3 bg-muted/40 rounded-xl border">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Warehouse className="h-3.5 w-3.5" />
              2. Cámara y Configuración de Filas
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground font-semibold">Cámara de Destino</Label>
                <Select value={selectedChamberId} onValueChange={setSelectedChamberId}>
                  <SelectTrigger className="w-full bg-background font-bold text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(chambersConfig).map(chId => (
                      <SelectItem key={chId} value={chId} className="text-xs font-medium">
                        {chambersConfig[chId].name || chId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground font-semibold">Coordenada de Inicio</Label>
                <Select value={startCoordinate} onValueChange={setStartCoordinate}>
                  <SelectTrigger className="w-full bg-background font-mono font-bold text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {allSequentialCoords.map(coord => {
                      const isOccupied = occupiedCoordsSet.has(coord);
                      return (
                        <SelectItem key={coord} value={coord} className="text-xs font-mono">
                          {coord} {isOccupied ? '🔴 (Ocupada)' : '🟢 (Libre)'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Switches de Filas y Columnas Auxiliares */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between p-2 bg-background rounded-lg border">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    {isChamber4 ? 'Switch Filas 13 a 15' : 'Switch Filas 13 y 14'}
                    <Badge variant={isRow13Enabled ? 'default' : 'secondary'} className="text-[9px] h-4">
                      {isRow13Enabled ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {isChamber4
                      ? 'Desbloquea filas 13, 14 y 15 (A1..A15, B1..B15, etc.).'
                      : 'Desbloquea filas comodín 13 y 14 en columnas permitidas.'}
                  </p>
                </div>
                <Switch checked={isRow13Enabled} onCheckedChange={handleToggleRowSwitch} />
              </div>

              {selectedChamberId === 'CAMARA-3' && (
                <div className="flex items-center justify-between p-2 bg-background rounded-lg border">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold">Columnas K y L (Cámara 3)</span>
                    <p className="text-[10px] text-muted-foreground">Habilita las 2 columnas auxiliares de Cámara 3.</p>
                  </div>
                  <Switch checked={isColsKLEnabled} onCheckedChange={handleToggleColsKL} />
                </div>
              )}

              {selectedChamberId === 'CAMARA-5' && (
                <div className="flex items-center justify-between p-2 bg-background rounded-lg border">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold">Columnas P, Q y R (Cámara 5)</span>
                    <p className="text-[10px] text-muted-foreground">Habilita las 3 columnas auxiliares de Cámara 5.</p>
                  </div>
                  <Switch checked={isColsPQREnabled} onCheckedChange={handleToggleColsPQR} />
                </div>
              )}
            </div>
          </div>

          {/* PASO 3: Validación y Preview */}
          {calculation.canStore ? (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-xs font-bold">Espacio disponible confirmado</AlertTitle>
              <AlertDescription className="text-xs space-y-1.5 mt-1">
                <p>
                  Se asignarán <strong>{calculation.totalNeeded} pallets</strong> en <strong>{selectedChamberId}</strong> a razón de <strong>1 pallet por coordenada</strong>:
                </p>
                <div className="flex items-center gap-2 font-mono font-bold text-sm bg-background/80 p-2 rounded-lg border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 w-fit">
                  <span>{calculation.firstCoord}</span>
                  <ArrowRight className="h-4 w-4" />
                  <span>{calculation.lastCoord}</span>
                </div>
                {calculation.skippedInPath && calculation.skippedInPath.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    ℹ️ Se saltarán automáticamente <strong>{calculation.skippedInPath.length}</strong> coordenada(s) ocupada(s) en el trayecto ({calculation.skippedInPath.slice(0, 4).join(', ')}{calculation.skippedInPath.length > 4 ? '...' : ''}).
                  </p>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold">Capacidad Insuficiente</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {calculation.error || 'No hay suficiente espacio para almacenar esta recepción completa.'}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmAutoStore}
            disabled={!calculation.canStore || isSubmitting || olmuePendingReceptions.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Almacenando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 fill-white" />
                Confirmar Almacenamiento ({calculation.totalNeeded || 0} Pallets)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
