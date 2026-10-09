'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
    QrCode, PackageCheck, ScanLine, Trash2, CheckCircle2, Loader2, 
    AlertCircle, AlertTriangle, FileUp, ClipboardList, Plus, Sparkles, 
    Box, Check, ChevronsUpDown, Search, RotateCcw, FileText, Smartphone,
    CheckCircle, X, Edit2, Save, Filter, Ban, XCircle
} from 'lucide-react';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, collection, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { OtherFruitReception, OtherFruitReceptionItem, PackagingMaster, OtherClient } from '@/lib/types';
import { BarcodeScanner } from '../BarcodeScanner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseVitafoodManifest, fileToBase64, cleanFirestoreObject, type VitafoodManifestRow, type VitafoodParsedManifest } from '@/lib/vitafood-utils';
import { parseVitafoodManifestAIAction } from '@/app/(app)/otros-hortofruticolas/actions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

export function VitafoodReceptionWorkflow({
    directStorageMode = true,
    usePhysicalScanner = false,
    onTriggerStorage,
    selectedManifestId: externalSelectedManifestId,
    onSelectedManifestIdChange,
    selectedClient
}: {
    directStorageMode?: boolean;
    usePhysicalScanner?: boolean;
    onTriggerStorage?: (item: any) => void;
    selectedManifestId?: string | null;
    onSelectedManifestIdChange?: (id: string | null) => void;
    selectedClient: OtherClient | null;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    
    const { data: allReceptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: allPackagingMasters } = useFirestoreCollection<PackagingMaster>('packagingMaster');

    const [localSelectedManifestId, setLocalSelectedManifestId] = React.useState<string | null>(null);
    const selectedManifestId = externalSelectedManifestId !== undefined ? externalSelectedManifestId : localSelectedManifestId;
    const setSelectedManifestId = (id: string | null) => {
        if (onSelectedManifestIdChange) {
            onSelectedManifestIdChange(id);
        } else {
            setLocalSelectedManifestId(id);
        }
    };

    // Scanner and state
    const [scannedUmpInput, setScannedUmpInput] = React.useState('');
    const [scannedMatch, setScannedMatch] = React.useState<{ item: OtherFruitReceptionItem; index: number } | null>(null);
    const [scanningCamera, setScanningCamera] = React.useState(false);
    const [isSubmittingReception, setIsSubmittingReception] = React.useState(false);
    const [scanSuccessFlash, setScanSuccessFlash] = React.useState(false);

    // Filter for Pallet List on Mobile
    const [palletFilter, setPalletFilter] = React.useState<'todos' | 'pendientes' | 'recibidos' | 'almacenados' | 'no-recepcionados'>('todos');

    // Import state
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [importing, setImporting] = React.useState(false);
    const [showPreview, setShowPreview] = React.useState(false);
    const [previewData, setPreviewData] = React.useState<VitafoodParsedManifest | null>(null);
    const [customGuiaNumber, setCustomGuiaNumber] = React.useState('');
    const [isConfirmingImport, setIsConfirmingImport] = React.useState(false);

    // Dialog state for closing reception with missing pallets
    const [isCloseReceptionDialogOpen, setIsCloseReceptionDialogOpen] = React.useState(false);
    const [isClosingReception, setIsClosingReception] = React.useState(false);
    const [itemToMarkNotReceived, setItemToMarkNotReceived] = React.useState<{ item: OtherFruitReceptionItem; index: number } | null>(null);

    // Edit Guia in Active Order
    const [isEditingGuia, setIsEditingGuia] = React.useState(false);
    const [editableGuiaNumber, setEditableGuiaNumber] = React.useState('');
    const [isSavingGuia, setIsSavingGuia] = React.useState(false);

    // Manual Entry state
    const [isManualMode, setIsManualMode] = React.useState(false);
    const [manualProductCode, setManualProductCode] = React.useState('');
    const [manualProductName, setManualProductName] = React.useState('');
    const [manualUmp, setManualUmp] = React.useState('');
    const [manualLote, setManualLote] = React.useState('');
    const [manualQuantity, setManualQuantity] = React.useState<number | ''>('');
    const [manualGuia, setManualGuia] = React.useState('');
    const [manualProductSearchOpen, setManualProductSearchOpen] = React.useState(false);
    const [manualProductSearchTerm, setManualProductSearchTerm] = React.useState('');

    // Active Manifests for Vitafood: Only show orders with pending items to scan ("Por Pistolear")
    const [showCompletedOrders, setShowCompletedOrders] = React.useState(false);

    const vitafoodManifests = React.useMemo(() => {
        if (!allReceptions) return [];
        return allReceptions.filter(r => {
            const isClientMatch = (r.clientName?.toUpperCase().includes('VITAFOOD') || r.clientId === selectedClient?.clientId);
            if (!isClientMatch || r.status === 'Despachado' || r.status === 'Cerrado') return false;

            // An order has pending scans if any item has status 'Pendiente de recibir'
            const hasPendingReceive = r.items?.some(i => i.status === 'Pendiente de recibir');

            // If user explicitly asks to view completed or if it's the currently selected manifest, keep it; otherwise filter out completed ("Listo")
            if (showCompletedOrders || r.id === selectedManifestId) {
                return true;
            }
            return hasPendingReceive;
        });
    }, [allReceptions, selectedClient, showCompletedOrders, selectedManifestId]);

    // Current active manifest
    const currentManifest = React.useMemo(() => {
        if (!allReceptions) return null;
        return allReceptions.find(r => r.id === selectedManifestId) || null;
    }, [allReceptions, selectedManifestId]);

    // Set default manifest & sync editable guia (prioritize pending orders)
    React.useEffect(() => {
        if (vitafoodManifests.length > 0 && !selectedManifestId) {
            const pendingManifest = vitafoodManifests.find(m => 
                m.items?.some(i => i.status === 'Pendiente de recibir')
            );
            setSelectedManifestId(pendingManifest ? pendingManifest.id : vitafoodManifests[0].id);
        }
    }, [vitafoodManifests, selectedManifestId]);

    React.useEffect(() => {
        if (currentManifest) {
            setEditableGuiaNumber(currentManifest.documentNumber || currentManifest.document || '');
        }
    }, [currentManifest]);

    // Sound and vibration feedback for mobile scanning
    const triggerScanFeedback = () => {
        if (typeof window !== 'undefined') {
            try {
                if ('vibrate' in navigator) {
                    navigator.vibrate([80, 50, 80]);
                }
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    const ctx = new AudioContextClass();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1050, ctx.currentTime);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.15);
                }
            } catch (e) {
                // Ignore audio context errors
            }
        }
        setScanSuccessFlash(true);
        setTimeout(() => setScanSuccessFlash(false), 600);
    };

    // Manifest Progress Statistics
    const manifestStats = React.useMemo(() => {
        if (!currentManifest || !currentManifest.items) {
            return { total: 0, pendingReceive: 0, receivedPendingStore: 0, stored: 0, notReceived: 0, progressPct: 0 };
        }
        const total = currentManifest.items.length;
        const pendingReceive = currentManifest.items.filter(i => i.status === 'Pendiente de recibir').length;
        const receivedPendingStore = currentManifest.items.filter(i => i.status === 'Pendiente de almacenar' || i.status === 'Recibido').length;
        const stored = currentManifest.items.filter(i => i.status === 'Almacenado').length;
        const notReceived = currentManifest.items.filter(i => i.status === 'No Recepcionado').length;
        const completed = receivedPendingStore + stored + notReceived;
        const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, pendingReceive, receivedPendingStore, stored, notReceived, progressPct };
    }, [currentManifest]);

    // Filtered items list
    const filteredPallets = React.useMemo(() => {
        if (!currentManifest?.items) return [];
        return currentManifest.items.map((item, index) => ({ item, index })).filter(({ item }) => {
            if (palletFilter === 'pendientes') return item.status === 'Pendiente de recibir';
            if (palletFilter === 'recibidos') return item.status === 'Pendiente de almacenar' || item.status === 'Recibido';
            if (palletFilter === 'almacenados') return item.status === 'Almacenado';
            if (palletFilter === 'no-recepcionados') return item.status === 'No Recepcionado';
            return true;
        });
    }, [currentManifest, palletFilter]);

    // Handle File Upload for Orden de Entrada
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        try {
            const fileName = file.name.toLowerCase();
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
            const isPdf = fileName.endsWith('.pdf');

            let parsed: VitafoodParsedManifest;

            if (isExcel) {
                parsed = await parseVitafoodManifest(file);
            } else {
                const base64Data = await fileToBase64(file);
                const mimeType = isPdf ? 'application/pdf' : file.type || 'application/octet-stream';
                const aiResult = await parseVitafoodManifestAIAction(base64Data, mimeType);
                if (!aiResult.success || !aiResult.data) {
                    throw new Error(aiResult.error || 'Error al procesar el archivo con IA');
                }
                parsed = {
                    header: aiResult.data.header || {},
                    rows: (aiResult.data.rows || []).map((r: any) => ({
                        palletNumber: r.palletNumber || 1,
                        material: String(r.material || '').replace(/\.0$/, ''),
                        description: r.description || `MATERIAL ${r.material}`,
                        lote: String(r.lote || '').replace(/\.0$/, ''),
                        quantity: Number(r.quantity) || 1,
                        unit: 'UN',
                        ump: String(r.ump || '').replace(/\.0$/, ''),
                        mfgDate: r.mfgDate,
                        expDate: r.expDate
                    }))
                };
            }

            if (!parsed.rows || parsed.rows.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Sin datos válidos',
                    description: 'No se encontraron filas de pallets válidas en el documento.'
                });
                return;
            }

            setPreviewData(parsed);
            // Mandatory Guia number default
            setCustomGuiaNumber(parsed.header.documentNumber || parsed.header.orderNumber || '');
            setShowPreview(true);
        } catch (error: any) {
            console.error("Error importing Vitafood manifest:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Importación',
                description: error.message || 'No se pudo leer el archivo. Verifique el formato.'
            });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Confirm Pre-Reception Import into Firestore
    const handleConfirmImport = async () => {
        if (!previewData || !firestore || !selectedClient) {
            toast({
                variant: 'destructive',
                title: 'Error de Inicialización',
                description: 'No se ha seleccionado el cliente o no se ha inicializado Firestore.'
            });
            return;
        }

        const guiaFinal = customGuiaNumber.trim();
        if (!guiaFinal) {
            toast({
                variant: 'destructive',
                title: 'N° de Guía Obligatorio',
                description: 'Debe ingresar el número de Guía de Despacho antes de confirmar.'
            });
            return;
        }

        setIsConfirmingImport(true);
        try {
            const displayLotId = `VITA-${guiaFinal}`;

            const items: OtherFruitReceptionItem[] = previewData.rows.map((row) => {
                const obsParts = [
                    row.mfgDate ? `Elab: ${row.mfgDate}` : '',
                    row.expDate ? `Venc: ${row.expDate}` : '',
                    previewData.header.origin ? `Origen: ${previewData.header.origin}` : '',
                    previewData.header.driver ? `Chofer: ${previewData.header.driver}` : '',
                ].filter(Boolean);

                const item: any = {
                    productCode: String(row.material || '').trim(),
                    productName: String(row.description || `MATERIAL ${row.material}`).trim(),
                    palletId: String(row.ump || '').trim(),
                    clientLotId: String(row.lote || '').trim() || 'S/L',
                    quantity: Number(row.quantity) || 1,
                    unit: 'Pallets',
                    status: 'Pendiente de recibir'
                };

                if (obsParts.length > 0) {
                    item.observation = obsParts.join(' | ');
                }

                return item;
            });

            const rawReceptionDoc: any = {
                clientId: selectedClient.clientId || 'VITAFOODS',
                clientName: selectedClient.name || 'VITAFOODS',
                unit: 'Pallets',
                document: guiaFinal,
                documentNumber: guiaFinal,
                displayLotId: displayLotId,
                status: 'Pendiente de recibir',
                items: items,
                createdAt: serverTimestamp(),
                userId: user?.uid || null,
                userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
                observation: `Orden de Compra / PL: ${previewData.header.orderNumber || 'N/A'} - Guía: ${guiaFinal} - Total: ${items.length} Pallets`
            };

            const cleanedDoc = cleanFirestoreObject(rawReceptionDoc);
            const docRef = await addDoc(collection(firestore, 'otherFruitReceptions'), cleanedDoc);
            setSelectedManifestId(docRef.id);
            setShowPreview(false);
            setPreviewData(null);

            toast({
                title: '¡Orden de Entrada Cargada!',
                description: `Se registraron ${items.length} pallets asociados a la Guía ${guiaFinal}.`
            });
        } catch (error: any) {
            console.error("Error creating Vitafood reception:", error);
            toast({
                variant: 'destructive',
                title: 'Error al Guardar',
                description: error.message || 'No se pudo registrar la orden de entrada en la base de datos.'
            });
        } finally {
            setIsConfirmingImport(false);
        }
    };

    // Save Edited Guia Number on Active Order
    const handleSaveGuiaNumber = async () => {
        if (!currentManifest || !firestore || !editableGuiaNumber.trim()) return;
        setIsSavingGuia(true);
        try {
            const newGuia = editableGuiaNumber.trim();
            await updateDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id), {
                document: newGuia,
                documentNumber: newGuia,
                displayLotId: `VITA-${newGuia}`,
                updatedAt: serverTimestamp()
            });
            setIsEditingGuia(false);
            toast({
                title: 'Guía Actualizada',
                description: `El número de Guía de Despacho se actualizó a ${newGuia}.`
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el N° de Guía.' });
        } finally {
            setIsSavingGuia(false);
        }
    };

    // Void / Delete Entire Active Manifest (Error Recovery)
    const handleDeleteManifest = async () => {
        if (!currentManifest || !firestore) return;
        try {
            await deleteDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id));
            setSelectedManifestId(null);
            setScannedMatch(null);
            setScannedUmpInput('');
            toast({
                title: 'Orden Anulada',
                description: `La orden Guía ${currentManifest.document} fue eliminada correctamente.`
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la orden.' });
        }
    };

    // Undo Pallet Reception (Revert to Pendiente de recibir)
    const handleUndoReception = async (itemIndex: number) => {
        if (!currentManifest || !firestore || !currentManifest.items?.[itemIndex]) return;
        try {
            const updatedItems = [...currentManifest.items];
            const targetItem = updatedItems[itemIndex];
            
            // Check if already stored
            if (targetItem.status === 'Almacenado') {
                toast({
                    variant: 'destructive',
                    title: 'Pallet Almacenado',
                    description: 'Este pallet ya tiene ubicación asignada en cámara. Debe reubicarlo o limpiarlo desde Stock.'
                });
                return;
            }

            updatedItems[itemIndex] = {
                ...targetItem,
                status: 'Pendiente de recibir'
            };

            await updateDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id), {
                items: updatedItems,
                status: 'Pendiente de recibir',
                updatedAt: serverTimestamp()
            });

            toast({
                title: 'Recepción Deshecha',
                description: `El pallet UMP ${targetItem.palletId} volvió a estado "Por Recepcionar".`
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo revertir la recepción.' });
        }
    };

    // Mark individual pallet as "No Recepcionado"
    const handleMarkItemNotReceived = async (itemIndex: number) => {
        if (!currentManifest || !firestore || !currentManifest.items?.[itemIndex]) return;
        try {
            const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Operador';
            const currentUserId = user?.uid || '';
            const now = new Date();

            const updatedItems = [...currentManifest.items];
            const targetItem = updatedItems[itemIndex];

            if (targetItem.status === 'Almacenado') {
                toast({
                    variant: 'destructive',
                    title: 'Pallet Almacenado',
                    description: 'No se puede marcar como "No Recepcionado" un pallet que ya fue almacenado en cámara.'
                });
                return;
            }

            updatedItems[itemIndex] = {
                ...targetItem,
                status: 'No Recepcionado',
                notReceivedAt: now,
                notReceivedByUserName: currentUserName,
                notReceivedByUserId: currentUserId,
            };

            const hasPendingReceive = updatedItems.some(i => i.status === 'Pendiente de recibir');
            const hasPendingStore = updatedItems.some(i => i.status === 'Pendiente de almacenar');
            
            let newStatus: OtherFruitReception['status'] = 'Pendiente de almacenar';
            if (hasPendingReceive) {
                newStatus = 'Pendiente de recibir';
            } else if (hasPendingStore) {
                newStatus = 'Pendiente de almacenar';
            } else {
                // No remaining items pending receive or store: either all stored or not received
                const hasStored = updatedItems.some(i => i.status === 'Almacenado');
                newStatus = hasStored ? 'Almacenado' : 'Cerrado';
            }

            await updateDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id), {
                items: updatedItems,
                status: newStatus,
                updatedAt: serverTimestamp()
            });

            toast({
                title: 'UMP Clasificado',
                description: `El pallet UMP ${targetItem.palletId || `#${itemIndex + 1}`} fue marcado como "No Recepcionado".`
            });
            setItemToMarkNotReceived(null);
        } catch (e) {
            console.error('Error marking item as not received:', e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo clasificar el pallet.' });
        }
    };

    // Close Reception / Complete Entry with Missing Pallets
    const handleCloseReceptionWithMissing = async () => {
        if (!currentManifest || !firestore) return;
        setIsClosingReception(true);
        try {
            const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Operador';
            const currentUserId = user?.uid || '';
            const now = new Date();

            const updatedItems = currentManifest.items.map(item => {
                if (item.status === 'Pendiente de recibir') {
                    return {
                        ...item,
                        status: 'No Recepcionado' as const,
                        notReceivedAt: now,
                        notReceivedByUserName: currentUserName,
                        notReceivedByUserId: currentUserId,
                    };
                }
                return item;
            });

            const hasPendingStore = updatedItems.some(i => i.status === 'Pendiente de almacenar');
            const hasStored = updatedItems.some(i => i.status === 'Almacenado');

            let newStatus: OtherFruitReception['status'] = 'Cerrado';
            if (hasPendingStore) {
                newStatus = 'Pendiente de almacenar';
            } else if (hasStored) {
                newStatus = 'Almacenado';
            } else {
                newStatus = 'Cerrado';
            }

            await updateDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id), {
                items: updatedItems,
                status: newStatus,
                updatedAt: serverTimestamp()
            });

            const notReceivedCount = updatedItems.filter(i => i.status === 'No Recepcionado').length;

            toast({
                title: '✅ Recepción Cerrada',
                description: `Entrada completada. Se clasificaron ${notReceivedCount} pallet(s) como "No Recepcionados".`
            });

            setIsCloseReceptionDialogOpen(false);
            setScannedMatch(null);
            setScannedUmpInput('');
            setSelectedManifestId(null);
        } catch (e: any) {
            console.error('Error closing reception:', e);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo cerrar la recepción.'
            });
        } finally {
            setIsClosingReception(false);
        }
    };

    // Lookup UMP when typed or scanned
    const handleUmpLookup = (rawVal: string) => {
        const val = rawVal.trim();
        setScannedUmpInput(val);

        if (!val || !currentManifest || !currentManifest.items) {
            setScannedMatch(null);
            return;
        }

        const matchIdx = currentManifest.items.findIndex(item => {
            if (!item.palletId) return false;
            const cleanPallet = item.palletId.replace(/\.0$/, '').trim();
            const cleanInput = val.replace(/\.0$/, '').trim();
            return cleanPallet === cleanInput || cleanPallet.endsWith(cleanInput);
        });

        if (matchIdx !== -1) {
            setScannedMatch({
                item: currentManifest.items[matchIdx],
                index: matchIdx
            });
            triggerScanFeedback();
        } else {
            setScannedMatch(null);
        }
    };

    // Confirm Reception of Scanned Pallet
    const handleReceivePallet = async (matchToReceive?: { item: OtherFruitReceptionItem; index: number }) => {
        const targetMatch = matchToReceive || scannedMatch;
        if (!targetMatch || !currentManifest || !firestore) return;

        setIsSubmittingReception(true);
        try {
            const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Operador';
            const currentUserId = user?.uid || '';
            const now = new Date();

            const updatedItems = [...currentManifest.items];
            const updatedItem: OtherFruitReceptionItem = {
                ...targetMatch.item,
                status: 'Pendiente de almacenar',
                receivedAt: now,
                receivedByUserName: currentUserName,
                receivedByUserId: currentUserId,
            };
            updatedItems[targetMatch.index] = updatedItem;

            const hasPendingReceive = updatedItems.some(i => i.status === 'Pendiente de recibir');
            const hasPendingStore = updatedItems.some(i => i.status === 'Pendiente de almacenar');
            let newStatus: OtherFruitReception['status'] = 'Pendiente de almacenar';
            if (!hasPendingReceive && !hasPendingStore) {
                newStatus = 'Almacenado';
            } else if (hasPendingReceive) {
                newStatus = 'Pendiente de recibir';
            }

            await updateDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id), {
                items: updatedItems,
                status: newStatus,
                updatedAt: serverTimestamp()
            });

            triggerScanFeedback();

            toast({
                title: '✅ ¡Pallet Recepcionado!',
                description: `UMP ${targetMatch.item.palletId} (${targetMatch.item.productName}) registrado.`
            });

            setScannedUmpInput('');
            setScannedMatch(null);

            // Direct Storage trigger
            if (directStorageMode && onTriggerStorage) {
                onTriggerStorage({
                    ...updatedItem,
                    receptionId: currentManifest.id,
                    clientId: currentManifest.clientId,
                    clientName: currentManifest.clientName,
                    document: currentManifest.document,
                    itemIndices: [targetMatch.index],
                    unit: 'Pallets',
                    quantity: updatedItem.quantity
                });
            }
        } catch (error: any) {
            console.error("Error receiving pallet:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo actualizar el estado del pallet.'
            });
        } finally {
            setIsSubmittingReception(false);
        }
    };

    // Handle Manual Pallet Reception (Punto 5)
    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !selectedClient) return;

        const guiaFinal = manualGuia.trim() || currentManifest?.document;
        if (!guiaFinal) {
            toast({
                variant: 'destructive',
                title: 'N° de Guía Obligatorio',
                description: 'Debe ingresar el número de Guía de Despacho física.'
            });
            return;
        }

        if (!manualProductCode || !manualUmp.trim() || !manualQuantity || Number(manualQuantity) <= 0) {
            toast({
                variant: 'destructive',
                title: 'Campos Incompletos',
                description: 'Debe ingresar Producto, UMP, Lote y una Cantidad válida.'
            });
            return;
        }

        setIsSubmittingReception(true);
        try {
            const displayLotId = `VITA-${guiaFinal}`;

            const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'Operador';
            const currentUserId = user?.uid || '';
            const now = new Date();

            const newItem: any = {
                productCode: String(manualProductCode).trim(),
                productName: String(manualProductName || `PRODUCTO ${manualProductCode}`).trim(),
                palletId: String(manualUmp).trim(),
                clientLotId: String(manualLote).trim() || 'S/L',
                quantity: Number(manualQuantity) || 1,
                unit: 'Pallets',
                status: 'Pendiente de almacenar',
                receivedAt: now,
                receivedByUserName: currentUserName,
                receivedByUserId: currentUserId,
            };

            let receptionId = currentManifest?.id;

            if (currentManifest && currentManifest.document === guiaFinal) {
                const updatedItems = [...(currentManifest.items || []), newItem];
                await updateDoc(doc(firestore, 'otherFruitReceptions', currentManifest.id), {
                    items: updatedItems,
                    status: 'Pendiente de almacenar',
                    updatedAt: serverTimestamp()
                });
            } else {
                const newReceptionDoc: any = {
                    clientId: selectedClient.clientId || 'VITAFOODS',
                    clientName: selectedClient.name || 'VITAFOODS',
                    unit: 'Pallets',
                    document: guiaFinal,
                    documentNumber: guiaFinal,
                    displayLotId: displayLotId,
                    status: 'Pendiente de almacenar',
                    items: [newItem],
                    createdAt: serverTimestamp(),
                    userId: user?.uid || null,
                    userName: user?.email || (user?.isAnonymous ? 'Anónimo' : user?.displayName || 'N/A'),
                    observation: `Ingreso Manual en Terreno - Guía: ${guiaFinal}`
                };
                const docRef = await addDoc(collection(firestore, 'otherFruitReceptions'), newReceptionDoc);
                receptionId = docRef.id;
                setSelectedManifestId(receptionId);
            }

            triggerScanFeedback();

            toast({
                title: '✅ ¡Pallet Ingresado!',
                description: `Pallet UMP ${manualUmp} registrado con Guía ${guiaFinal}.`
            });

            setManualUmp('');

            if (directStorageMode && onTriggerStorage && receptionId) {
                onTriggerStorage({
                    ...newItem,
                    receptionId: receptionId,
                    clientId: selectedClient.clientId,
                    clientName: selectedClient.name,
                    document: guiaFinal,
                    itemIndices: [currentManifest ? currentManifest.items.length : 0],
                    unit: 'Pallets',
                    quantity: newItem.quantity
                });
            }
        } catch (error: any) {
            console.error("Error creating manual pallet reception:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo registrar el pallet manual.'
            });
        } finally {
            setIsSubmittingReception(false);
        }
    };

    return (
        <div className="space-y-4 max-w-full overflow-hidden">
            {/* TOP HEADER CARD: MOBILE & DESKTOP OPTIMIZED */}
            <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-6 pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="bg-primary/20 text-primary border-primary/30 font-bold px-2 py-0.5 text-[11px]">
                                    VITAFOOD EMBALAJES
                                </Badge>
                                <Badge variant="outline" className="text-[10px] font-mono">
                                    SAP S4/HANA
                                </Badge>
                                <div className="flex items-center text-xs text-muted-foreground ml-auto sm:ml-0 gap-1 font-medium">
                                    <Smartphone className="w-3.5 h-3.5 text-primary" />
                                    <span>Modo Móvil + Pistola</span>
                                </div>
                            </div>
                            <CardTitle className="text-xl sm:text-2xl font-black mt-1.5 tracking-tight text-foreground">
                                Recepción de Pallets
                            </CardTitle>
                        </div>

                        {/* Top Action: Upload Manifest */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".xlsx,.xls,.csv,.pdf,.docx,image/*"
                                className="hidden"
                            />
                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={importing}
                                className="w-full sm:w-auto font-bold h-11 shadow-sm gap-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                {importing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>Procesando...</span>
                                    </>
                                ) : (
                                    <>
                                        <FileUp className="h-4 w-4" />
                                        <span>Cargar Orden de Entrada</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
                    {/* Active Order & Mandatory Guía Header */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t pt-3">
                        {/* Selector of Active Manifest */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs font-bold text-muted-foreground whitespace-nowrap uppercase tracking-wider">
                                Orden:
                            </span>
                            {vitafoodManifests.length > 0 ? (
                                <Select value={selectedManifestId || ''} onValueChange={setSelectedManifestId}>
                                    <SelectTrigger className="w-full sm:w-[260px] h-10 bg-background font-semibold text-xs sm:text-sm">
                                        <SelectValue placeholder="Seleccione orden..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {vitafoodManifests.map(m => {
                                            const pending = m.items?.filter(i => i.status === 'Pendiente de recibir').length || 0;
                                            return (
                                                <SelectItem key={m.id} value={m.id} className="text-xs sm:text-sm font-medium">
                                                    Guía: {m.document} ({m.items?.length || 0} pallets {pending > 0 ? `• ${pending} pend.` : '• Listo'})
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <span className="text-xs text-muted-foreground italic">
                                    Todas las órdenes están completadas. Cargue una nueva orden.
                                </span>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowCompletedOrders(prev => !prev)}
                                className={cn(
                                    "h-7 px-2 text-[11px] whitespace-nowrap",
                                    showCompletedOrders ? "text-primary font-bold bg-primary/10" : "text-muted-foreground hover:text-foreground"
                                )}
                                title={showCompletedOrders ? "Ocultar órdenes completadas / listas" : "Ver también órdenes completadas"}
                            >
                                {showCompletedOrders ? "Ocultar completadas" : "Ver completadas"}
                            </Button>
                        </div>

                        {/* Guía de Despacho Box (Prominent & Editable) */}
                        {currentManifest && (
                            <div className="flex items-center gap-2 bg-background p-1.5 px-3 rounded-lg border shadow-xs">
                                <FileText className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                                    N° Guía:
                                </span>
                                {isEditingGuia ? (
                                    <div className="flex items-center gap-1">
                                        <Input
                                            value={editableGuiaNumber}
                                            onChange={(e) => setEditableGuiaNumber(e.target.value)}
                                            className="h-7 w-28 text-xs font-bold font-mono px-2"
                                            placeholder="N° Guía..."
                                            autoFocus
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleSaveGuiaNumber}
                                            disabled={isSavingGuia || !editableGuiaNumber.trim()}
                                            className="h-7 w-7 p-0 text-primary"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setIsEditingGuia(false)}
                                            className="h-7 w-7 p-0 text-muted-foreground"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-black text-sm text-foreground">
                                            {currentManifest.document}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setIsEditingGuia(true)}
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                            title="Editar número de guía física"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                )}

                                {/* Close Reception / Complete Entry with Missing Pallets */}
                                {manifestStats.pendingReceive > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsCloseReceptionDialogOpen(true)}
                                        className="h-7 px-2.5 text-xs font-bold border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 ml-1"
                                        title="Cerrar la recepción marcando los pallets faltantes como No Recepcionados"
                                    >
                                        <Ban className="w-3.5 h-3.5 mr-1" />
                                        Cerrar Ciclo ({manifestStats.pendingReceive} faltantes)
                                    </Button>
                                )}

                                {/* Cancel Order Button */}
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-1"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                                            Anular
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>¿Anular Orden de Entrada?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Esta acción eliminará la Orden con Guía <strong>{currentManifest.document}</strong> ({currentManifest.items?.length || 0} pallets). 
                                                Use esta opción si cargó un archivo equivocado.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleDeleteManifest}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
                                            >
                                                Sí, Anular Orden
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}

                        {/* Mode Toggle: Scanner vs Manual */}
                        <div className="flex items-center justify-center gap-1 bg-muted/70 p-1 rounded-lg border self-end sm:self-auto">
                            <Button
                                variant={!isManualMode ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setIsManualMode(false)}
                                className={cn("text-xs h-8 px-3", !isManualMode && "font-bold shadow-xs")}
                            >
                                <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                                Pistoleo UMP
                            </Button>
                            <Button
                                variant={isManualMode ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setIsManualMode(true)}
                                className={cn("text-xs h-8 px-3", isManualMode && "font-bold shadow-xs")}
                            >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Manual
                            </Button>
                        </div>
                    </div>

                    {/* Progress Bar & KPI Stats on Mobile */}
                    {currentManifest && !isManualMode && (
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between text-xs font-bold">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <PackageCheck className="w-3.5 h-3.5 text-primary" />
                                    Progreso Recepción Camión:
                                </span>
                                <span className="text-primary font-black">
                                    {manifestStats.receivedPendingStore + manifestStats.stored} / {manifestStats.total} Pallets ({manifestStats.progressPct}%)
                                </span>
                            </div>
                            <Progress value={manifestStats.progressPct} className="h-2.5 bg-muted" />

                            {/* 5 KPI Grid Cards (Thumb-friendly) */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                                <div className="bg-muted/40 p-2.5 rounded-xl border text-center">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total</span>
                                    <span className="text-lg sm:text-xl font-black text-foreground">{manifestStats.total}</span>
                                </div>
                                <div 
                                    className={cn(
                                        "p-2.5 rounded-xl border text-center cursor-pointer transition-all",
                                        palletFilter === 'pendientes' ? "ring-2 ring-amber-500 bg-amber-500/15" : "bg-amber-500/10 border-amber-500/30"
                                    )}
                                    onClick={() => setPalletFilter(palletFilter === 'pendientes' ? 'todos' : 'pendientes')}
                                >
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold block">Por Pistolear</span>
                                    <span className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400">{manifestStats.pendingReceive}</span>
                                </div>
                                <div 
                                    className={cn(
                                        "p-2.5 rounded-xl border text-center cursor-pointer transition-all",
                                        palletFilter === 'recibidos' ? "ring-2 ring-blue-500 bg-blue-500/15" : "bg-blue-500/10 border-blue-500/30"
                                    )}
                                    onClick={() => setPalletFilter(palletFilter === 'recibidos' ? 'todos' : 'recibidos')}
                                >
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-bold block">Por Almacenar</span>
                                    <span className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">{manifestStats.receivedPendingStore}</span>
                                </div>
                                <div 
                                    className={cn(
                                        "p-2.5 rounded-xl border text-center cursor-pointer transition-all",
                                        palletFilter === 'almacenados' ? "ring-2 ring-emerald-500 bg-emerald-500/15" : "bg-emerald-500/10 border-emerald-500/30"
                                    )}
                                    onClick={() => setPalletFilter(palletFilter === 'almacenados' ? 'todos' : 'almacenados')}
                                >
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold block">Almacenados</span>
                                    <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">{manifestStats.stored}</span>
                                </div>
                                <div 
                                    className={cn(
                                        "p-2.5 rounded-xl border text-center cursor-pointer transition-all",
                                        palletFilter === 'no-recepcionados' ? "ring-2 ring-rose-500 bg-rose-500/15" : "bg-rose-500/10 border-rose-500/30"
                                    )}
                                    onClick={() => setPalletFilter(palletFilter === 'no-recepcionados' ? 'todos' : 'no-recepcionados')}
                                >
                                    <span className="text-[10px] text-rose-600 dark:text-rose-400 uppercase font-bold block">No Recepcionados</span>
                                    <span className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400">{manifestStats.notReceived}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* MAIN OPERATIONAL WORKSPACE */}
            {!isManualMode ? (
                /* ----------------- MODO ESCANEO UMP (MOBILE FIRST) ----------------- */
                <Card className={cn(
                    "border-2 shadow-md transition-all duration-300",
                    scanSuccessFlash ? "border-emerald-500 bg-emerald-50/20" : "border-primary/40"
                )}>
                    <CardHeader className="p-4 sm:p-6 pb-3 bg-muted/20">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <CardTitle className="text-base sm:text-lg font-black flex items-center gap-2 text-foreground">
                                    <ScanLine className="h-5 w-5 text-primary shrink-0" />
                                    Pistoleo de UMP (Pallet)
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                                    Lea el código de barras inferior de la etiqueta.
                                </CardDescription>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setScanningCamera(true)}
                                className="h-9 px-3 gap-1.5 text-xs font-bold shrink-0 border-primary/40 bg-background"
                            >
                                <QrCode className="h-4 w-4 text-primary" />
                                <span>Cámara</span>
                            </Button>
                        </div>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-6 space-y-4">
                        {/* Camera Scanner Modal Component */}
                        <BarcodeScanner
                            open={scanningCamera}
                            onOpenChange={setScanningCamera}
                            onScan={(val) => {
                                handleUmpLookup(val);
                                setScanningCamera(false);
                            }}
                            title="Escanear Etiqueta UMP"
                            description="Apunte la cámara al código de barras inferior del pallet"
                        />

                        {/* BIG MOBILE SCAN INPUT */}
                        <div className="space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        autoFocus
                                        placeholder="Escanee UMP (ej: 6006085585)..."
                                        value={scannedUmpInput}
                                        onChange={(e) => handleUmpLookup(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && scannedMatch) {
                                                e.preventDefault();
                                                handleReceivePallet();
                                            }
                                        }}
                                        className="text-base sm:text-lg font-mono font-black tracking-wider h-13 px-4 border-2 focus-visible:border-primary shadow-xs bg-background"
                                        inputMode="numeric"
                                    />
                                    {scannedUmpInput && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setScannedUmpInput('');
                                                setScannedMatch(null);
                                            }}
                                            className="absolute right-2 top-2.5 h-8 w-8 p-0 rounded-full"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>

                                <Button
                                    size="lg"
                                    disabled={!scannedMatch || isSubmittingReception}
                                    onClick={() => handleReceivePallet()}
                                    className="h-13 px-6 font-black text-base shadow-md gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    {isSubmittingReception ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <PackageCheck className="h-5 w-5" />
                                    )}
                                    <span>Recepcionar Pallet</span>
                                </Button>
                            </div>
                            <span className="text-[11px] text-muted-foreground block text-center sm:text-left">
                                💡 Tip: También puede teclear solo los últimos 4 dígitos del UMP para matching instantáneo.
                            </span>
                        </div>

                        {/* MATCH CARD DISPLAY */}
                        {scannedMatch ? (
                            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-2 border-primary/50 rounded-2xl p-4 sm:p-5 shadow-md animate-in fade-in zoom-in-95 duration-200 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-primary/20">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-5 w-5 text-primary" />
                                        <span className="font-black text-sm sm:text-base text-foreground uppercase tracking-wide">
                                            Pallet Identificado
                                        </span>
                                    </div>
                                    <Badge className="bg-primary text-primary-foreground font-mono text-xs sm:text-sm px-3 py-1 font-bold">
                                        UMP: {scannedMatch.item.palletId}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <div className="bg-background/90 p-2.5 rounded-xl border">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Material</span>
                                        <p className="text-sm sm:text-base font-black text-foreground font-mono mt-0.5">{scannedMatch.item.productCode}</p>
                                    </div>
                                    <div className="bg-background/90 p-2.5 rounded-xl border col-span-2 sm:col-span-1">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Denominación</span>
                                        <p className="text-xs font-semibold text-foreground truncate mt-0.5" title={scannedMatch.item.productName}>
                                            {scannedMatch.item.productName}
                                        </p>
                                    </div>
                                    <div className="bg-background/90 p-2.5 rounded-xl border">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Lote</span>
                                        <p className="text-sm sm:text-base font-black text-foreground font-mono mt-0.5">{scannedMatch.item.clientLotId || 'N/A'}</p>
                                    </div>
                                    <div className="bg-background/90 p-2.5 rounded-xl border">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Cantidad</span>
                                        <p className="text-base sm:text-lg font-black text-primary mt-0.5">{scannedMatch.item.quantity} UN</p>
                                    </div>
                                </div>

                                <div className="pt-1 flex justify-end">
                                    <Button
                                        size="lg"
                                        disabled={isSubmittingReception}
                                        onClick={() => handleReceivePallet()}
                                        className="w-full sm:w-auto h-12 font-black shadow-lg gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <Check className="h-5 w-5" />
                                        <span>Confirmar Recepción (ENTER)</span>
                                    </Button>
                                </div>
                            </div>
                        ) : scannedUmpInput ? (
                            <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/30">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>UMP No Encontrado</AlertTitle>
                                <AlertDescription className="text-xs">
                                    El UMP &ldquo;{scannedUmpInput}&rdquo; no figura pendiente en la orden activa. Verifique el número o use Ingreso Manual.
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {/* PALLET LIST: MOBILE CARDS & DESKTOP TABLE */}
                        {currentManifest && currentManifest.items && currentManifest.items.length > 0 && (
                            <div className="space-y-3 pt-3 border-t">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <ClipboardList className="h-4 w-4 text-primary" />
                                        <h3 className="font-bold text-xs sm:text-sm uppercase tracking-wider text-muted-foreground">
                                            Detalle de Pallets ({filteredPallets.length} de {currentManifest.items.length})
                                        </h3>
                                    </div>

                                    {/* Quick Filters */}
                                    <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
                                        <Button
                                            size="sm"
                                            variant={palletFilter === 'todos' ? 'secondary' : 'ghost'}
                                            onClick={() => setPalletFilter('todos')}
                                            className="h-7 text-[11px] px-2"
                                        >
                                            Todos
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={palletFilter === 'pendientes' ? 'secondary' : 'ghost'}
                                            onClick={() => setPalletFilter('pendientes')}
                                            className="h-7 text-[11px] px-2 text-amber-600"
                                        >
                                            Por Pistolear ({manifestStats.pendingReceive})
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={palletFilter === 'recibidos' ? 'secondary' : 'ghost'}
                                            onClick={() => setPalletFilter('recibidos')}
                                            className="h-7 text-[11px] px-2 text-blue-600"
                                        >
                                            Por Almacenar ({manifestStats.receivedPendingStore})
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant={palletFilter === 'no-recepcionados' ? 'secondary' : 'ghost'}
                                            onClick={() => setPalletFilter('no-recepcionados')}
                                            className="h-7 text-[11px] px-2 text-rose-600"
                                        >
                                            No Recepcionados ({manifestStats.notReceived})
                                        </Button>
                                    </div>
                                </div>

                                {/* MOBILE VIEW: TOUCH CARDS */}
                                <div className="space-y-2 block sm:hidden">
                                    {filteredPallets.map(({ item, index }) => {
                                        const isPendingReceive = item.status === 'Pendiente de recibir';
                                        const isPendingStore = item.status === 'Pendiente de almacenar' || item.status === 'Recibido';
                                        const isStored = item.status === 'Almacenado';
                                        const isNotReceived = item.status === 'No Recepcionado';

                                        return (
                                            <div
                                                key={index}
                                                className={cn(
                                                    "p-3 rounded-xl border bg-card/90 shadow-xs space-y-2 transition-all",
                                                    isPendingReceive && "border-amber-500/30 hover:border-primary active:scale-[0.99]",
                                                    isPendingStore && "border-blue-500/40 bg-blue-50/10",
                                                    isStored && "border-emerald-500/40 bg-emerald-50/10",
                                                    isNotReceived && "border-rose-500/40 bg-rose-50/10 opacity-75"
                                                )}
                                                onClick={() => {
                                                    if (isPendingReceive) handleUmpLookup(item.palletId || '');
                                                }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono font-bold text-muted-foreground">
                                                            #{index + 1}
                                                        </span>
                                                        <span className={cn(
                                                            "font-mono font-black text-sm",
                                                            isNotReceived ? "text-muted-foreground line-through" : "text-foreground"
                                                        )}>
                                                            {item.palletId || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        {isPendingReceive && (
                                                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold">
                                                                Por Pistolear
                                                            </Badge>
                                                        )}
                                                        {isPendingStore && (
                                                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30 font-bold">
                                                                Por Almacenar
                                                            </Badge>
                                                        )}
                                                        {isStored && (
                                                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                                                                {item.storageLocation?.chamberId} - {item.storageLocation?.coordinate}
                                                            </Badge>
                                                        )}
                                                        {isNotReceived && (
                                                            <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30 font-bold">
                                                                No Recepcionado
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="text-xs text-foreground font-medium truncate">
                                                    {item.productName}
                                                </div>

                                                <div className="flex items-center justify-between text-xs pt-1 border-t">
                                                    <div className="flex items-center gap-2 text-muted-foreground font-mono">
                                                        <span>Mat: {item.productCode}</span>
                                                        <span>•</span>
                                                        <span>Lote: {item.clientLotId || '—'}</span>
                                                    </div>
                                                    <span className="font-black text-primary text-sm">
                                                        {item.quantity} UN
                                                    </span>
                                                </div>

                                                {/* Mobile Actions */}
                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    {isPendingReceive && (
                                                        <div className="flex items-center gap-2 w-full">
                                                            <Button
                                                                size="sm"
                                                                className="flex-1 h-9 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleReceivePallet({ item, index });
                                                                }}
                                                            >
                                                                <PackageCheck className="w-3.5 h-3.5 mr-1" />
                                                                Recepcionar
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-9 px-2.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setItemToMarkNotReceived({ item, index });
                                                                }}
                                                                title="Marcar como No Recepcionado (no llegó físicamente)"
                                                            >
                                                                <Ban className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {isNotReceived && (
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className="text-xs text-rose-500 italic">No llegó físicamente</span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 text-xs text-muted-foreground hover:text-primary gap-1"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUndoReception(index);
                                                                }}
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                                Revertir
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {isPendingStore && (
                                                        <div className="flex items-center gap-2 w-full">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-9 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUndoReception(index);
                                                                }}
                                                                title="Deshacer recepción"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                            </Button>
                                                            {onTriggerStorage && (
                                                                <Button
                                                                    size="sm"
                                                                    className="flex-1 h-9 text-xs font-bold"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onTriggerStorage({
                                                                            ...item,
                                                                            receptionId: currentManifest.id,
                                                                            clientId: currentManifest.clientId,
                                                                            clientName: currentManifest.clientName,
                                                                            document: currentManifest.document,
                                                                            itemIndices: [index],
                                                                            unit: 'Pallets',
                                                                            quantity: item.quantity
                                                                        });
                                                                    }}
                                                                >
                                                                    Almacenar en Cámara
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* DESKTOP VIEW: TABLE */}
                                <div className="hidden sm:block rounded-xl border overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-12 text-center">#</TableHead>
                                                <TableHead>UMP</TableHead>
                                                <TableHead>Material</TableHead>
                                                <TableHead>Descripción</TableHead>
                                                <TableHead>Lote</TableHead>
                                                <TableHead className="text-right">Cantidad</TableHead>
                                                <TableHead className="text-center">Estado</TableHead>
                                                <TableHead className="text-right">Acción</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredPallets.map(({ item, index }) => {
                                                const isPendingReceive = item.status === 'Pendiente de recibir';
                                                const isPendingStore = item.status === 'Pendiente de almacenar' || item.status === 'Recibido';
                                                const isStored = item.status === 'Almacenado';
                                                const isNotReceived = item.status === 'No Recepcionado';

                                                return (
                                                    <TableRow
                                                        key={index}
                                                        className={cn(
                                                            "transition-colors",
                                                            isPendingReceive && "hover:bg-accent/40 cursor-pointer",
                                                            isStored && "bg-emerald-50/30 dark:bg-emerald-950/10",
                                                            isNotReceived && "bg-rose-50/20 dark:bg-rose-950/10 opacity-75"
                                                        )}
                                                        onClick={() => {
                                                            if (isPendingReceive) handleUmpLookup(item.palletId || '');
                                                        }}
                                                    >
                                                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                                            {index + 1}
                                                        </TableCell>
                                                        <TableCell className={cn(
                                                            "font-mono font-bold",
                                                            isNotReceived ? "text-muted-foreground line-through" : "text-foreground"
                                                        )}>
                                                            {item.palletId || 'N/A'}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">
                                                            {item.productCode}
                                                        </TableCell>
                                                        <TableCell className="font-medium text-xs max-w-[200px] truncate" title={item.productName}>
                                                            {item.productName}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">
                                                            {item.clientLotId || '—'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-black text-sm">
                                                            {item.quantity} UN
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {isPendingReceive && (
                                                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                                                    Por Pistolear
                                                                </Badge>
                                                            )}
                                                            {isPendingStore && (
                                                                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                                                                    Por Almacenar
                                                                </Badge>
                                                            )}
                                                            {isStored && (
                                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                                                    {item.storageLocation?.chamberId} - {item.storageLocation?.coordinate}
                                                                </Badge>
                                                            )}
                                                            {isNotReceived && (
                                                                <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30">
                                                                    No Recepcionado
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {isPendingReceive ? (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 text-xs font-semibold text-primary hover:text-primary"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleReceivePallet({ item, index });
                                                                            }}
                                                                        >
                                                                            Recibir
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setItemToMarkNotReceived({ item, index });
                                                                            }}
                                                                            title="Marcar como No Recepcionado"
                                                                        >
                                                                            <Ban className="w-3.5 h-3.5 mr-1" />
                                                                            No Llegó
                                                                        </Button>
                                                                    </>
                                                                ) : isNotReceived ? (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 text-xs text-muted-foreground hover:text-primary gap-1"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleUndoReception(index);
                                                                        }}
                                                                        title="Revertir a Por Pistolear"
                                                                    >
                                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                                        Revertir
                                                                    </Button>
                                                                ) : isPendingStore ? (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleUndoReception(index);
                                                                            }}
                                                                            title="Deshacer recepción"
                                                                        >
                                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                        {onTriggerStorage && (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="h-7 text-xs font-semibold"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    onTriggerStorage({
                                                                                        ...item,
                                                                                        receptionId: currentManifest.id,
                                                                                        clientId: currentManifest.clientId,
                                                                                        clientName: currentManifest.clientName,
                                                                                        document: currentManifest.document,
                                                                                        itemIndices: [index],
                                                                                        unit: 'Pallets',
                                                                                        quantity: item.quantity
                                                                                    });
                                                                                }}
                                                                            >
                                                                                Almacenar
                                                                            </Button>
                                                                        )}
                                                                    </>
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                /* ----------------- MODO MANUAL (MOBILE FIRST) ----------------- */
                <Card className="border-2 border-primary/30 shadow-md">
                    <CardHeader className="p-4 sm:p-6 pb-3 bg-muted/20">
                        <CardTitle className="text-base sm:text-lg font-black flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" />
                            Ingreso Manual de Pallet
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Complete los datos del pallet físico cuando no disponga de una Orden de Entrada cargada.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-6">
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Guía de Despacho (Obligatorio) */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase text-primary">N° Guía de Despacho *</Label>
                                    <Input
                                        placeholder="Ej: 80085402"
                                        value={manualGuia}
                                        onChange={(e) => setManualGuia(e.target.value)}
                                        className="h-11 font-mono font-bold"
                                        required
                                    />
                                </div>

                                {/* Producto / Material */}
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs font-bold uppercase">Material / Producto *</Label>
                                    <Popover open={manualProductSearchOpen} onOpenChange={setManualProductSearchOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between h-11 text-left font-normal"
                                            >
                                                <span className="truncate text-xs sm:text-sm font-medium">
                                                    {manualProductCode ? `${manualProductCode} - ${manualProductName}` : "Seleccione producto..."}
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[320px] p-2" align="start">
                                            <div className="flex items-center border-b px-2 pb-2 mb-2 gap-2">
                                                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <Input
                                                    placeholder="Buscar código o nombre..."
                                                    value={manualProductSearchTerm}
                                                    onChange={(e) => setManualProductSearchTerm(e.target.value)}
                                                    className="h-8 border-none focus-visible:ring-0 p-0 text-xs"
                                                />
                                            </div>
                                            <ScrollArea className="h-[200px]">
                                                {((allPackagingMasters || []).filter(p => 
                                                    p.name.toLowerCase().includes(manualProductSearchTerm.toLowerCase()) ||
                                                    p.code.toLowerCase().includes(manualProductSearchTerm.toLowerCase())
                                                )).length === 0 ? (
                                                    <div className="p-4 text-xs text-center text-muted-foreground">
                                                        No se encontraron productos.
                                                    </div>
                                                ) : (
                                                    (allPackagingMasters || [])
                                                        .filter(p => 
                                                            p.name.toLowerCase().includes(manualProductSearchTerm.toLowerCase()) ||
                                                            p.code.toLowerCase().includes(manualProductSearchTerm.toLowerCase())
                                                        )
                                                        .map(p => (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setManualProductCode(p.code);
                                                                    setManualProductName(p.name);
                                                                    setManualProductSearchOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-accent flex items-center justify-between",
                                                                    manualProductCode === p.code && "bg-accent/70 font-bold"
                                                                )}
                                                            >
                                                                <div className="truncate pr-2">
                                                                    <span className="font-mono text-primary font-bold mr-1.5">{p.code}</span>
                                                                    <span>{p.name}</span>
                                                                </div>
                                                                {manualProductCode === p.code && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                                            </button>
                                                        ))
                                                )}
                                            </ScrollArea>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {/* UMP */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase text-primary">Número UMP *</Label>
                                    <Input
                                        placeholder="Ej: 6006085585"
                                        value={manualUmp}
                                        onChange={(e) => setManualUmp(e.target.value)}
                                        className="h-11 font-mono font-black border-primary/50 focus-visible:border-primary text-base"
                                        required
                                        inputMode="numeric"
                                    />
                                </div>

                                {/* Lote */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase">Lote</Label>
                                    <Input
                                        placeholder="Ej: 176826"
                                        value={manualLote}
                                        onChange={(e) => setManualLote(e.target.value)}
                                        className="h-11 font-mono"
                                    />
                                </div>

                                {/* Cantidad (Unidades por pallet) */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase text-primary">Cantidad (Unidades) *</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        placeholder="Ej: 900"
                                        value={manualQuantity}
                                        onChange={(e) => setManualQuantity(e.target.value ? Number(e.target.value) : '')}
                                        className="h-11 font-black text-lg"
                                        required
                                        inputMode="numeric"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsManualMode(false)}
                                    className="h-11 font-semibold"
                                >
                                    Volver a Escaneo UMP
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmittingReception}
                                    className="h-11 font-black shadow-md gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    {isSubmittingReception ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="h-4 w-4" />
                                    )}
                                    <span>Recepcionar Pallet Manual</span>
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* PREVIEW DIALOG FOR IMPORTED MANIFEST */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-black">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Vista Previa: Orden de Entrada Vitafood
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Confirme el N° de Guía de Despacho antes de crear la orden de recepción.
                        </DialogDescription>
                    </DialogHeader>

                    {previewData && (
                        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                            {/* Metadata Header Box with Mandatory Guía */}
                            <div className="bg-primary/5 p-4 rounded-xl border-2 border-primary/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <Label className="font-black text-primary uppercase text-xs flex items-center gap-1">
                                        <FileText className="w-3.5 h-3.5" />
                                        N° Guía de Despacho *
                                    </Label>
                                    <Input
                                        value={customGuiaNumber}
                                        onChange={(e) => setCustomGuiaNumber(e.target.value)}
                                        className="h-10 mt-1 font-mono font-black text-base border-primary/50 bg-background"
                                        placeholder="Ingrese N° de Guía..."
                                        required
                                    />
                                </div>
                                <div>
                                    <span className="font-bold text-muted-foreground uppercase text-[10px] block">Orden de Compra:</span>
                                    <p className="font-bold text-foreground mt-2 font-mono text-sm">{previewData.header.orderNumber || 'N/A'}</p>
                                </div>
                                <div>
                                    <span className="font-bold text-muted-foreground uppercase text-[10px] block">Total Pallets:</span>
                                    <p className="text-lg font-black text-primary mt-1">{previewData.rows.length} Pallets</p>
                                </div>
                            </div>

                            {/* Table of extracted pallets */}
                            <div className="rounded-xl border overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-muted/60">
                                        <TableRow>
                                            <TableHead className="w-12 text-center">#</TableHead>
                                            <TableHead>Material</TableHead>
                                            <TableHead>Denominación</TableHead>
                                            <TableHead>Lote</TableHead>
                                            <TableHead>UMP</TableHead>
                                            <TableHead className="text-right">Cantidad</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData.rows.map((row, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-center font-mono text-xs">{row.palletNumber || idx + 1}</TableCell>
                                                <TableCell className="font-mono text-xs font-semibold">{row.material}</TableCell>
                                                <TableCell className="text-xs max-w-[180px] truncate" title={row.description}>{row.description}</TableCell>
                                                <TableCell className="font-mono text-xs">{row.lote || '—'}</TableCell>
                                                <TableCell className="font-mono text-xs font-bold text-primary">{row.ump}</TableCell>
                                                <TableCell className="text-right font-black text-xs">{row.quantity} {row.unit}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="border-t pt-3 flex flex-col sm:flex-row justify-between gap-2">
                        <Button variant="ghost" onClick={() => setShowPreview(false)} className="w-full sm:w-auto">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmImport}
                            disabled={isConfirmingImport || !customGuiaNumber.trim()}
                            className="w-full sm:w-auto font-black shadow-md gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-11"
                        >
                            {isConfirmingImport ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4" />
                            )}
                            Confirmar y Cargar {previewData?.rows.length || 0} Pallets
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CONFIRMATION DIALOG: CERRAR CICLO / ENTRADA CON FALTANTES */}
            <AlertDialog open={isCloseReceptionDialogOpen} onOpenChange={setIsCloseReceptionDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-5 w-5" />
                            ¿Cerrar Recepción con Faltantes?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2 text-sm text-foreground/80">
                            <p>
                                De un total de <strong>{manifestStats.total} pallets</strong> declarados en la Guía <strong>{currentManifest?.document}</strong>, hay <strong className="text-amber-600">{manifestStats.pendingReceive} pallets</strong> que aún están pendientes por pistolear porque no llegaron físicamente.
                            </p>
                            <p>
                                Al cerrar el ciclo:
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                                <li>Los <strong>{manifestStats.pendingReceive} pallets no pistoleados</strong> quedarán clasificados como <span className="font-bold text-rose-600">"No Recepcionados"</span>.</li>
                                <li>No quedarán pendientes de pistola y la entrada se considerará cerrada.</li>
                                <li>Los pallets ya almacenados ({manifestStats.stored}) permanecerán seguros en cámara/bodega.</li>
                            </ul>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isClosingReception}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCloseReceptionWithMissing}
                            disabled={isClosingReception}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-black"
                        >
                            {isClosingReception ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Cerrando...
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-1.5" />
                                    Sí, Cerrar Entrada ({manifestStats.pendingReceive} faltantes)
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* CONFIRMATION DIALOG: MARCAR PALLET INDIVIDUAL COMO NO RECEPCIONADO */}
            <AlertDialog open={!!itemToMarkNotReceived} onOpenChange={(open) => !open && setItemToMarkNotReceived(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Ban className="h-5 w-5" />
                            Marcar Pallet como No Recepcionado
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                            ¿Confirma que el pallet UMP <strong>{itemToMarkNotReceived?.item.palletId || `#${(itemToMarkNotReceived?.index ?? 0) + 1}`}</strong> ({itemToMarkNotReceived?.item.productName}) no llegó físicamente en el transporte?
                            <br /><br />
                            Quedará clasificado como <strong className="text-rose-600">"No Recepcionado"</strong>. Si llega posteriormente, podrá revertirlo a "Por Pistolear".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (itemToMarkNotReceived) {
                                    handleMarkItemNotReceived(itemToMarkNotReceived.index);
                                }
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            Confirmar como No Recepcionado
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
