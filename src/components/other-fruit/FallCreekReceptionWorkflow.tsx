'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QrCode, PackageCheck, ScanLine, Trash2, CheckCircle2, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { BarcodeScanner } from '../BarcodeScanner';
import { cn } from '@/lib/utils';

const cleanVarietyName = (name: string) => {
    if (!name) return 'N/A';
    // Look for the first quote (standard or curly) which usually starts the technical code
    const quoteIndex = name.search(/['‘"“]/);
    if (quoteIndex !== -1) {
        return name.substring(0, quoteIndex).trim();
    }
    // Fallback: if no quotes but has " 2 Liter" or similar, we could cut there too, 
    // but the quote rule seems most robust based on the examples.
    return name;
};

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function FallCreekReceptionWorkflow({ 
    directStorageMode, 
    usePhysicalScanner,
    onTriggerStorage 
}: { 
    directStorageMode?: boolean, 
    usePhysicalScanner?: boolean,
    onTriggerStorage?: (item: any) => void 
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const { data: allReceptions, loading } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    
    // Fetch necessary collections for direct storage suggestions (optional here if we pass item up)
    const { data: exporters } = useFirestoreCollection<any>('exporters');
    const { data: otherClients } = useFirestoreCollection<any>('otherClients');
    const { data: clientConfigs } = useFirestoreCollection<any>('clientStorageConfigs');
    const { data: allChamberLots } = useFirestoreCollection<any>('chamberLots');

    const [selectedManifestId, setSelectedManifestId] = React.useState<string | null>(null);
    const [selectedPalletId, setSelectedPalletId] = React.useState<string | null>(null);
    const [scannedBins, setScannedBins] = React.useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [scanning, setScanning] = React.useState(false);

    // Filter manifests for Fall Creek that are pending reception
    const pendingManifests = React.useMemo(() => {
        return (allReceptions || []).filter(r => 
            r.clientName?.toUpperCase() === 'FALL CREEK' && 
            (r.status === 'Pendiente de recibir' || r.items.some(item => item.status === 'Pendiente de recibir'))
        );
    }, [allReceptions]);

    const activeManifest = React.useMemo(() => {
        return pendingManifests.find(m => m.id === selectedManifestId);
    }, [pendingManifests, selectedManifestId]);

    // Group items by Pallet ID and filter those that still have pending bins
    const availablePallets = React.useMemo(() => {
        if (!activeManifest) return [];
        
        const pallets: Record<string, { id: string, total: number, received: number, varieties: Set<string> }> = {};
        
        activeManifest.items.forEach(item => {
            if (!item.palletId) return;
            if (!pallets[item.palletId]) {
                pallets[item.palletId] = { id: item.palletId, total: 0, received: 0, varieties: new Set() };
            }
            pallets[item.palletId].total++;
            
            // For Fall Creek, the variety is stored in productName
            const variety = cleanVarietyName(item.productName);
            pallets[item.palletId].varieties.add(variety);
            
            if (item.status !== 'Pendiente de recibir') {
                pallets[item.palletId].received++;
            }
        });

        return Object.values(pallets)
            .filter(p => p.received < p.total)
            .map(p => ({
                ...p,
                isMixed: p.varieties.size > 1
            }));
    }, [activeManifest]);

    // Get the 3 items for the current pallet to show their varieties in the slots
    const currentPalletItems = React.useMemo(() => {
        if (!activeManifest || !selectedPalletId) return [];
        return activeManifest.items.filter(item => item.palletId === selectedPalletId);
    }, [activeManifest, selectedPalletId]);

    const activeScanDescription = React.useMemo(() => {
        if (!selectedPalletId) return '';
        
        const pendingItems = currentPalletItems.filter(item => item.status === 'Pendiente de recibir');
        const currentScanningItem = pendingItems[scannedBins.length];
        if (!currentScanningItem) return '';
        
        const variety = cleanVarietyName(currentScanningItem.productName);
        const palletInfo = availablePallets.find(p => p.id === selectedPalletId);
        const isMixed = palletInfo?.isMixed || false;
        
        if (isMixed) {
            return `⚠️ PALLET MIXTO - Escanee variedad: ${variety}`;
        } else {
            return `Variedad a escanear: ${variety}`;
        }
    }, [selectedPalletId, currentPalletItems, scannedBins, availablePallets]);

    const handleConfirmPallet = async (binsOverride?: string[]) => {
        const binsToUse = binsOverride || scannedBins;
        if (!firestore || !activeManifest || !selectedPalletId || binsToUse.length === 0) return;

        setIsSubmitting(true);
        try {
            let scanIdx = 0;
            const updatedItems = activeManifest.items.map(item => {
                if (item.palletId === selectedPalletId && item.status === 'Pendiente de recibir') {
                    const binQr = binsToUse[scanIdx++];
                    if (binQr) {
                        return {
                            ...item,
                            containerId: binQr,
                            status: 'Pendiente de almacenar' as const
                        };
                    }
                }
                return item;
            });

            const allReceived = updatedItems.every(item => item.status !== 'Pendiente de recibir');
            const manifestStatus = allReceived ? 'Recibido' : 'Parcialmente Recibido';

            await updateDoc(doc(firestore, 'otherFruitReceptions', activeManifest.id!), {
                items: updatedItems,
                status: manifestStatus
            });

            toast({ title: 'Éxito', description: `Pallet ${selectedPalletId} actualizado.` });
            
            // If directStorageMode is ON, trigger storage dialog
            if (directStorageMode && onTriggerStorage) {
                // Construct a consolidated item for storage
                const palletItems = updatedItems.filter(i => i.palletId === selectedPalletId);
                const itemIndices = updatedItems
                    .map((it, idx) => it.palletId === selectedPalletId ? idx : -1)
                    .filter(idx => idx !== -1);

                const itemToStore = {
                    ...palletItems[0],
                    receptionId: activeManifest.id,
                    clientId: activeManifest.clientId,
                    clientName: activeManifest.clientName,
                    document: activeManifest.document,
                    itemIndices: itemIndices,
                    unit: activeManifest.unit,
                    quantity: palletItems.length // Usually 3
                };

                onTriggerStorage(itemToStore);
            }
            
            // Check if manifest is fully received
            const hasMorePending = updatedItems.some(item => item.status === 'Pendiente de recibir');
            if (!hasMorePending) {
                setSelectedManifestId(null);
            }

            setSelectedPalletId(null);
            setScannedBins([]);
        } catch (error) {
            console.error("Error updating manifest:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleScan = async (qrCode: string) => {
        if (!qrCode) return;
        
        // 1. Check local session (current pallet)
        if (scannedBins.includes(qrCode)) {
            toast({ variant: 'destructive', title: 'Error', description: 'Este código ya ha sido escaneado en este pallet.' });
            return;
        }

        // 2. Global Uniqueness Check (Across all manifests/years)
        const existingReception = allReceptions?.find(r => 
            r.items.some(item => item.containerId === qrCode)
        );

        if (existingReception) {
            toast({ 
                variant: 'destructive', 
                title: 'Bin ya registrado', 
                description: `El bin ${qrCode} ya fue recibido previamente en el manifiesto "${existingReception.document}".` 
            });
            return;
        }

        // How many items need to be scanned on this pallet in total?
        const pendingItemsForPallet = currentPalletItems.filter(i => i.status === 'Pendiente de recibir').length;

        if (scannedBins.length >= pendingItemsForPallet) {
            toast({ variant: 'destructive', title: 'Error', description: 'Ya se han escaneado todos los bins pendientes de este pallet.' });
            return;
        }

        const nextBins = [...scannedBins, qrCode];
        setScannedBins(nextBins);

        // If we reached the total required, we close the scanner and auto-submit
        if (nextBins.length >= pendingItemsForPallet) {
            setScanning(false);
            await handleConfirmPallet(nextBins);
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

    return (
        <Card className="border-2 border-[#004b8d]/20 shadow-lg overflow-hidden">
            <CardHeader className="bg-[#004b8d]/5 border-b p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#004b8d] rounded-lg shrink-0">
                            <PackageCheck className="h-5 w-5 sm:h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg sm:text-xl text-[#004b8d]">Recepción Especial Fall Creek</CardTitle>
                            <CardDescription className="text-xs sm:text-sm">Escaneo masivo de bins por Pallet ID.</CardDescription>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                    {/* Step 1: Select Manifest */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">1. Seleccionar Manifiesto / Log</label>
                        <Select value={selectedManifestId || ''} onValueChange={setSelectedManifestId}>
                            <SelectTrigger className="h-12 sm:h-14 text-sm sm:text-lg border-2">
                                <SelectValue placeholder="Seleccione un Pallet Log..." />
                            </SelectTrigger>
                            <SelectContent>
                                {pendingManifests.map(m => (
                                    <SelectItem key={m.id} value={m.id!}>
                                        <div className="flex flex-col items-start py-1">
                                            <span className="font-bold">{m.document}</span>
                                            <span className="text-xs text-muted-foreground">{m.items.length} Bins totales</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Step 2: Select Pallet ID */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">2. Seleccionar Pallet ID</label>
                        <Select 
                            value={selectedPalletId || ''} 
                            onValueChange={(val) => {
                                setSelectedPalletId(val);
                                setScannedBins([]);
                            }}
                            disabled={!selectedManifestId}
                        >
                            <SelectTrigger className="h-12 sm:h-14 text-sm sm:text-lg border-2">
                                <SelectValue placeholder="Elija un Pallet ID..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                {availablePallets.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        <div className="flex items-center justify-between w-full min-w-[240px]">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-lg">{p.id}</span>
                                                {p.isMixed && (
                                                    <Badge variant="destructive" className="bg-red-500 text-white border-none text-[9px] h-5 px-1.5 font-black uppercase tracking-tighter shadow-sm animate-pulse">
                                                        ⚠️ MIXTO
                                                    </Badge>
                                                )}
                                            </div>
                                            <Badge variant="secondary" className={`ml-2 ${p.isMixed ? 'bg-red-100 text-red-700' : 'bg-[#004b8d]/10 text-[#004b8d]'}`}>
                                                {p.received}/{p.total}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Step 3: Scanning Bins */}
                {selectedPalletId && (
                    <Card className="bg-muted/30 border-dashed border-2 border-[#7aba28]/40 overflow-hidden">
                        <CardContent className="p-3 sm:p-6 space-y-4 sm:space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm sm:text-lg font-bold flex items-center gap-2">
                                    <QrCode className="h-4 w-4 sm:h-5 text-[#7aba28]" />
                                    Bins de Pallet {selectedPalletId}
                                </h3>
                                <Badge variant="outline" className="bg-[#7aba28]/10 text-[#7aba28] border-[#7aba28]/20 px-2 py-0.5 text-[10px] sm:text-xs">
                                    {scannedBins.length + (currentPalletItems.filter(i => i.status !== 'Pendiente de recibir').length)} / 3
                                </Badge>
                            </div>

                            {availablePallets.find(p => p.id === selectedPalletId)?.isMixed && (
                                <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg flex items-start gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-black text-red-800 uppercase tracking-tight">Atención: Pallet Multi-Variedad</p>
                                        <p className="text-[10px] text-red-700 leading-tight">Este pallet contiene diferentes tipos de plantas. Verifique físicamente cada bin antes de escanearlo para asegurar la trazabilidad.</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-3">
                                {currentPalletItems.map((item, i) => {
                                    const isAlreadyReceived = item.status !== 'Pendiente de recibir';
                                    const sessionScanIndex = currentPalletItems.slice(0, i).filter(item => item.status === 'Pendiente de recibir').length;
                                    const isScannedInSession = scannedBins[sessionScanIndex] !== undefined && item.status === 'Pendiente de recibir';
                                    const isScanned = isAlreadyReceived || isScannedInSession;
                                    const containerId = isAlreadyReceived ? item.containerId : scannedBins[sessionScanIndex];
                                    
                                    // A slot is active if it's the first pending item that hasn't been scanned in this session
                                    const isActive = !isScanned && sessionScanIndex === scannedBins.length;

                                    return (
                                        <div 
                                            key={i}
                                            onClick={() => isActive && setScanning(true)}
                                            className={cn(
                                                "relative h-24 sm:h-28 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer",
                                                isScanned 
                                                    ? "bg-white border-[#7aba28] shadow-sm ring-1 ring-[#7aba28]/20" 
                                                    : isActive
                                                        ? "bg-blue-50/50 border-[#004b8d] border-dashed animate-pulse ring-4 ring-[#004b8d]/10"
                                                        : "bg-muted/20 border-muted-foreground/10 border-dashed opacity-60"
                                            )}
                                        >
                                            <div className="absolute top-2 left-3 flex items-center gap-2">
                                                <div className={cn(
                                                    "text-[9px] px-1.5 rounded-full font-bold uppercase",
                                                    isScanned ? "bg-[#7aba28] text-white" : "bg-muted-foreground/20 text-muted-foreground"
                                                )}>
                                                    Bin {i+1}
                                                </div>
                                            </div>

                                            {isScanned ? (
                                                <>
                                                    <div className="text-[10px] font-bold text-[#004b8d] uppercase tracking-tight mb-1">
                                                        {cleanVarietyName(item.productName)}
                                                    </div>
                                                    <CheckCircle2 className="h-5 w-5 text-[#7aba28]" />
                                                    <span className="text-xs font-mono font-bold truncate max-w-[90%]">{containerId}</span>
                                                    {!isAlreadyReceived && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="absolute top-1 right-1 h-8 w-8 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setScannedBins(prev => prev.filter((_, idx) => idx !== sessionScanIndex));
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 px-4 text-center">
                                                    <div className={cn(
                                                        "text-xs sm:text-sm font-black uppercase tracking-tight",
                                                        isActive ? "text-[#004b8d]" : "text-muted-foreground/40"
                                                    )}>
                                                        {cleanVarietyName(item.productName)}
                                                    </div>
                                                    <div className={cn(
                                                        "p-2 rounded-full mt-2",
                                                        isActive ? "bg-[#004b8d]/10 text-[#004b8d]" : "bg-muted text-muted-foreground/30"
                                                    )}>
                                                        <ScanLine className="h-5 w-5" />
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] uppercase font-bold tracking-widest",
                                                        isActive ? "text-[#004b8d]" : "text-muted-foreground/40"
                                                    )}>
                                                        {isActive ? "Tocar para Escanear" : "Esperando..."}
                                                    </span>
                                                    {isActive && (
                                                        <div className="absolute bottom-1 right-2">
                                                            <span className="flex h-2 w-2">
                                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#004b8d] opacity-75"></span>
                                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#004b8d]"></span>
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Button 
                                    className="h-14 sm:h-16 text-sm sm:text-lg font-bold bg-[#004b8d] hover:bg-[#003a6d] shadow-md"
                                    onClick={() => setScanning(true)}
                                    disabled={scannedBins.length >= 3}
                                >
                                    <ScanLine className="mr-2 h-5 w-5 sm:h-6 sm:h-6" />
                                    Escanear
                                </Button>
                                
                                <Button 
                                    className="h-14 sm:h-16 text-sm sm:text-lg font-bold bg-[#7aba28] hover:bg-[#6aa423] shadow-md"
                                    disabled={scannedBins.length === 0 || isSubmitting}
                                    onClick={() => handleConfirmPallet()}
                                >
                                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5 sm:h-6 sm:h-6" />}
                                    Finalizar
                                </Button>
                            </div>
                            
                            {scannedBins.length > 0 && scannedBins.length < 3 && (
                                <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-100 rounded-lg text-orange-800 text-[10px] sm:text-xs">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    <span>Escanee los 3 bins para completar el pallet.</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                <BarcodeScanner
                    open={scanning}
                    onOpenChange={setScanning}
                    onScan={handleScan}
                    closeOnScan={false}
                    title={`Lector de Bins - Pallet ${selectedPalletId}`}
                    description={activeScanDescription}
                    usePhysicalScanner={usePhysicalScanner}
                    currentCount={Math.min(scannedBins.length + 1, currentPalletItems.filter(item => item.status === 'Pendiente de recibir').length)}
                    totalCount={currentPalletItems.filter(item => item.status === 'Pendiente de recibir').length}
                />
            </CardContent>
        </Card>
    );
}
