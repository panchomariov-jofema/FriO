'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QrCode, PackageCheck, ScanLine, Trash2, CheckCircle2, Loader2, AlertCircle, AlertTriangle, FileUp, ClipboardList } from 'lucide-react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { BarcodeScanner } from '../BarcodeScanner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseFallCreekManifest, decomposePalletsIntoBins, type FallCreekManifestRow, fileToBase64 } from '@/lib/fall-creek-utils';
import { parseManifestAIAction } from '@/app/(app)/fall-creek/actions';
import { notifyPalletLogStarted } from '@/lib/telegram';

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
    onTriggerStorage,
    selectedManifestId: externalSelectedManifestId,
    onSelectedManifestIdChange,
    documentNumber
}: { 
    directStorageMode?: boolean, 
    usePhysicalScanner?: boolean,
    onTriggerStorage?: (item: any) => void,
    selectedManifestId?: string | null,
    onSelectedManifestIdChange?: (id: string | null) => void,
    documentNumber?: string
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const { data: allReceptions, loading } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    
    // Fetch necessary collections for direct storage suggestions (optional here if we pass item up)
    const { data: exporters } = useFirestoreCollection<any>('exporters');
    const { data: otherClients } = useFirestoreCollection<any>('otherClients');
    const { data: clientConfigs } = useFirestoreCollection<any>('clientStorageConfigs');
    const { data: allChamberLots } = useFirestoreCollection<any>('chamberLots');

    const [localSelectedManifestId, setLocalSelectedManifestId] = React.useState<string | null>(null);
    const selectedManifestId = externalSelectedManifestId !== undefined ? externalSelectedManifestId : localSelectedManifestId;
    const setSelectedManifestId = (id: string | null) => {
        if (onSelectedManifestIdChange) {
            onSelectedManifestIdChange(id);
        } else {
            setLocalSelectedManifestId(id);
        }
    };
    const [selectedPalletId, setSelectedPalletId] = React.useState<string | null>(null);
    const [scannedBins, setScannedBins] = React.useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [scanning, setScanning] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [importing, setImporting] = React.useState(false);
    const [showPreview, setShowPreview] = React.useState(false);
    const [previewItems, setPreviewItems] = React.useState<FallCreekManifestRow[]>([]);
    const [manifestDocument, setManifestDocument] = React.useState('');
    const [isConfirmingImport, setIsConfirmingImport] = React.useState(false);

    const duplicatePalletIds = React.useMemo(() => {
        const counts = new Map<string, number>();
        previewItems.forEach(item => {
            const pid = item['Pallet ID'] || '';
            if (pid) {
                counts.set(pid, (counts.get(pid) || 0) + 1);
            }
        });
        const duplicates = new Set<string>();
        counts.forEach((count, pid) => {
            if (count > 1) {
                duplicates.add(pid);
            }
        });
        return duplicates;
    }, [previewItems]);

    const fallCreekClient = React.useMemo(() => {
        return otherClients?.find((c: any) => c.name.toUpperCase() === 'FALL CREEK') || null;
    }, [otherClients]);

    const currentManifest = React.useMemo(() => {
        return allReceptions?.find(r => r.id === selectedManifestId) || null;
    }, [allReceptions, selectedManifestId]);

    const manifestWarningInfo = React.useMemo(() => {
        if (!currentManifest || !currentManifest.items) return null;
        
        const varieties = new Set<string>();
        const lots = new Set<string>();
        
        currentManifest.items.forEach(item => {
            if (item.productName) {
                varieties.add(item.productName);
            }
            if (item.clientLotId) {
                lots.add(item.clientLotId);
            }
        });
        
        const isMultiVariety = varieties.size > 1;
        const isMultiLot = lots.size > 1;
        
        return {
            isMultiVariety,
            isMultiLot,
            showWarning: isMultiVariety || isMultiLot
        };
    }, [currentManifest]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        try {
            let items: FallCreekManifestRow[] = [];
            
            const fileName = file.name.toLowerCase();
            const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
            const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(fileName);

            if (isPdf || isImage) {
                toast({ title: 'Procesando con IA', description: 'Leyendo el documento visualmente...' });
                const base64 = await fileToBase64(file);
                const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');
                const response = await parseManifestAIAction(base64, mimeType);
                
                if (response.success && response.data) {
                    items = response.data;
                } else {
                    let friendlyError = response.error || 'No se pudo extraer la información del documento.';
                    if (
                        friendlyError.includes('API_KEY_SERVICE_BLOCKED') || 
                        friendlyError.includes('API key') || 
                        friendlyError.includes('leaked') || 
                        friendlyError.includes('blocked') || 
                        friendlyError.includes('NOT_FOUND') ||
                        friendlyError.includes('403') ||
                        friendlyError.includes('404')
                    ) {
                        friendlyError = 'Error de API Key de Gemini: La clave configurada en el servidor no es válida, está bloqueada o fue reportada como filtrada. Por favor, genere y configure una clave válida (GOOGLE_GENAI_API_KEY) en las variables de entorno de App Hosting o local.';
                    }
                    throw new Error(friendlyError);
                }
            } else {
                items = await parseFallCreekManifest(file);
            }

            if (items.length === 0) {
                toast({ variant: 'destructive', title: 'Sin Datos', description: 'No se encontraron registros en el archivo.' });
                return;
            }

            setPreviewItems(items);
            setManifestDocument(file.name.replace(/\.[^/.]+$/, ""));
            setShowPreview(true);
        } catch (error: any) {
            console.error("Error parsing manifest:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Error de Importación', 
                description: error.message || 'No se pudo procesar el archivo.' 
            });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleConfirmImport = async () => {
        if (!firestore || !fallCreekClient || previewItems.length === 0) return;

        setIsConfirmingImport(true);
        try {
            const decomposedItems = decomposePalletsIntoBins(previewItems);

            const receptionData: any = {
                clientId: fallCreekClient.clientId,
                clientName: fallCreekClient.name,
                unit: fallCreekClient.unit,
                document: manifestDocument,
                items: decomposedItems,
                status: 'Pendiente de recibir',
                createdAt: serverTimestamp(),
                userId: user?.uid || null,
                userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
            };

            const docRef = await addDoc(collection(firestore, 'otherFruitReceptions'), receptionData);
            
            notifyPalletLogStarted(firestore, {
                ...receptionData,
                id: docRef.id
            } as any).catch(err => {
                console.error("Error al enviar la notificación de Telegram de inicio:", err);
            });

            toast({ title: 'Éxito', description: 'Manifiesto cargado correctamente. Se han generado los bins correspondientes para su recepción.' });
            
            // Auto-select newly loaded manifest
            if (docRef.id) {
                setSelectedManifestId(docRef.id);
            }
            
            setShowPreview(false);
            setPreviewItems([]);
        } catch (error: any) {
            console.error("Error saving manifest:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el manifiesto en la base de datos.' });
        } finally {
            setIsConfirmingImport(false);
        }
    };

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
                status: manifestStatus,
                documentNumber: documentNumber || activeManifest.documentNumber || '',
                userId: user?.uid || null,
                userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
            });

            toast({ title: 'Éxito', description: `Pallet ${selectedPalletId} actualizado.` });
            
            // If directStorageMode is ON, trigger storage dialog (only for successfully received bins with QR)
            if (directStorageMode && onTriggerStorage) {
                const palletItems = updatedItems.filter(i => i.palletId === selectedPalletId && i.status === 'Pendiente de almacenar');
                const itemIndices = updatedItems
                    .map((it, idx) => (it.palletId === selectedPalletId && it.status === 'Pendiente de almacenar') ? idx : -1)
                    .filter(idx => idx !== -1);

                if (palletItems.length > 0) {
                    const itemToStore = {
                        ...palletItems[0],
                        receptionId: activeManifest.id,
                        clientId: activeManifest.clientId,
                        clientName: activeManifest.clientName,
                        document: activeManifest.document,
                        itemIndices: itemIndices,
                        unit: activeManifest.unit,
                        quantity: palletItems.length
                    };

                    onTriggerStorage(itemToStore);
                }
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
                    <div className="flex items-center gap-2">
                        <Input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".xlsx,.xls,.csv,.pdf,image/*"
                            onChange={handleFileUpload}
                        />
                        <Button 
                            onClick={() => fileInputRef.current?.click()}
                            variant="outline"
                            className="border-[#004b8d] text-[#004b8d] hover:bg-[#004b8d]/10 h-10 text-xs sm:text-sm font-semibold"
                            disabled={importing}
                        >
                            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileUp className="mr-2 h-4 w-4"/>}
                            Cargar Manifiesto
                        </Button>
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
                                            <span className="text-xs text-muted-foreground">
                                                {m.items.filter(item => item.status === 'Pendiente de recibir').length} Bins por ingresar
                                            </span>
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

                {manifestWarningInfo?.showWarning && (
                    <Alert className="border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-100 flex items-start gap-3 my-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <AlertTitle className="font-bold text-amber-800 dark:text-amber-200 text-sm">
                                Atención: Pallet Log con Múltiples Lotes / Variedades
                            </AlertTitle>
                            <AlertDescription className="text-xs mt-1 text-amber-700 dark:text-amber-300 leading-normal">
                                Este Pallet Log contiene variedades y lotes distintos. Recuerde ordenar y separar físicamente los bins por variedad/lote en el andén antes de iniciar la recepción.
                            </AlertDescription>
                        </div>
                    </Alert>
                )}

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

                {showPreview && (
                    <Dialog open={showPreview} onOpenChange={setShowPreview}>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="text-[#004b8d]">Previsualización de Manifiesto</DialogTitle>
                                <DialogDescription>
                                    Se han detectado {previewItems.length} registros en el archivo. Revise la información antes de confirmar.
                                </DialogDescription>
                            </DialogHeader>
                            
                            <div className="space-y-4 py-2">
                                <div className="flex items-center gap-4 px-1">
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground">Referencia del Manifiesto / Guía</Label>
                                        <Input 
                                            value={manifestDocument} 
                                            onChange={e => setManifestDocument(e.target.value)}
                                            placeholder="Ej: Guía Fall Creek 1234"
                                            className="h-10 border-2"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-md border max-h-[40vh] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>Pallet ID</TableHead>
                                                <TableHead>Variedad / Producto</TableHead>
                                                <TableHead>Lote (Batch)</TableHead>
                                                <TableHead className="text-right">Bins</TableHead>
                                                <TableHead className="text-right">Plantas Totales</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {previewItems.map((item, index) => {
                                                const isDuplicate = duplicatePalletIds.has(item['Pallet ID'] || '');
                                                return (
                                                    <TableRow key={index} className={isDuplicate ? "bg-amber-50/50 hover:bg-amber-100/50 border-l-4 border-l-amber-500" : ""}>
                                                        <TableCell className={`font-mono font-bold ${isDuplicate ? "text-amber-700" : ""}`}>{item['Pallet ID']}</TableCell>
                                                        <TableCell>{item['Item Description']}</TableCell>
                                                        <TableCell className="font-mono text-xs text-muted-foreground">{item['Lot Number (Batch)']}</TableCell>
                                                        <TableCell className="text-right font-bold w-24">
                                                            <Input
                                                                type="number"
                                                                value={item['# of Packages']}
                                                                onChange={(e) => {
                                                                    const newBins = Number(e.target.value) || 0;
                                                                    const updated = [...previewItems];
                                                                    updated[index] = {
                                                                        ...item,
                                                                        '# of Packages': newBins
                                                                    };
                                                                    setPreviewItems(updated);
                                                                }}
                                                                className="h-8 text-right font-bold w-20 ml-auto border-muted focus:border-primary"
                                                                min={1}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right font-semibold text-[#7aba28]">{item['Qty of Plants']}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
                                <div className="flex gap-6 text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Pallets ID</span>
                                        <span className="text-xl font-bold text-[#004b8d]">{previewItems.length}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Bins</span>
                                        <span className="text-xl font-bold text-amber-600">
                                            {previewItems.reduce((sum, item) => sum + (Number(item['# of Packages']) || 0), 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Total Plantas</span>
                                        <span className="text-xl font-bold text-[#7aba28]">
                                            {previewItems.reduce((sum, item) => sum + (Number(item['Qty of Plants']) || 0), 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto justify-end">
                                    <Button variant="outline" onClick={() => setShowPreview(false)}>Cancelar</Button>
                                    <Button 
                                        onClick={handleConfirmImport} 
                                        className="bg-[#7aba28] hover:bg-[#6aa423] text-white font-bold"
                                        disabled={isConfirmingImport || !manifestDocument}
                                    >
                                        {isConfirmingImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ClipboardList className="mr-2 h-4 w-4"/>}
                                        Confirmar Importación
                                    </Button>
                                </div>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </CardContent>
        </Card>
    );
}
