'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitReception, PackagingReception, OtherClient } from '@/lib/types';
import { parseVitafoodDispatchFile, cleanFirestoreObject, VitafoodParsedDispatch } from '@/lib/vitafood-utils';
import { chambersConfig } from '@/lib/chambers-config';
import { useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { doc, writeBatch, serverTimestamp, collection, setDoc } from 'firebase/firestore';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Scan, 
  Truck, 
  Search, 
  Trash2, 
  FileText,
  Warehouse as WarehouseIcon,
  Snowflake,
  Package,
  Layers
} from 'lucide-react';
import { BarcodeScanner } from '@/components/BarcodeScanner';

export interface MatchedPickingItem {
  key: string;
  ump: string;
  productCode: string;
  productName: string;
  clientLotId: string;
  quantity: number;
  unit: string;
  locationDisplay: string;
  locationType: 'chamber' | 'warehouse';
  locationSortKey: string;
  receptionId: string;
  itemIndex: number;
  collectionType: 'otherFruitReceptions' | 'packagingReceptions';
  clientName: string;
  clientId: string;
  isPicked: boolean;
}

export function VitafoodDispatchTab() {
  const { data: otherFruitReceptions, loading: loadingFruit } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: packagingReceptions, loading: loadingPackaging } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');

  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Form State
  const [dispatchDocument, setDispatchDocument] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [carrier, setCarrier] = React.useState('');
  const [licensePlate, setLicensePlate] = React.useState('');
  const [manualText, setManualText] = React.useState('');
  
  // Data state
  const [requestedUmps, setRequestedUmps] = React.useState<string[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pickedState, setPickedState] = React.useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const [activeInputMode, setActiveInputMode] = React.useState<'file' | 'manual'>('file');
  const [isDraftRestored, setIsDraftRestored] = React.useState(false);

  // Load saved draft on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('frio_vitafood_active_dispatch');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.requestedUmps && Array.isArray(parsed.requestedUmps) && parsed.requestedUmps.length > 0) {
            setRequestedUmps(parsed.requestedUmps);
            setFileName(parsed.fileName || 'Borrador en Progreso');
            setDispatchDocument(parsed.dispatchDocument || '');
            setDestination(parsed.destination || '');
            setCarrier(parsed.carrier || '');
            setLicensePlate(parsed.licensePlate || '');
            setPickedState(parsed.pickedState || {});
            setIsDraftRestored(true);
          }
        }
      } catch (e) {
        console.error("Error loading dispatch draft from storage:", e);
      }
    }
  }, []);

  // Save draft whenever state changes
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (requestedUmps.length > 0) {
          localStorage.setItem('frio_vitafood_active_dispatch', JSON.stringify({
            requestedUmps,
            fileName,
            dispatchDocument,
            destination,
            carrier,
            licensePlate,
            pickedState,
            savedAt: new Date().toISOString()
          }));
        } else {
          localStorage.removeItem('frio_vitafood_active_dispatch');
        }
      } catch (e) {
        console.error("Error saving dispatch draft to storage:", e);
      }
    }
  }, [requestedUmps, fileName, dispatchDocument, destination, carrier, licensePlate, pickedState]);

  // Handle File Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setFileName(file.name);
      setIsDraftRestored(false);
      const parsed: VitafoodParsedDispatch = await parseVitafoodDispatchFile(file);
      
      if (parsed.header.documentNumber && !dispatchDocument) {
        setDispatchDocument(parsed.header.documentNumber);
      }
      if (parsed.header.destination && !destination) {
        setDestination(parsed.header.destination);
      }
      if (parsed.header.carrier && !carrier) {
        setCarrier(parsed.header.carrier);
      }

      setRequestedUmps(parsed.rawUmps);
      const initialPicked: Record<string, boolean> = {};
      parsed.rawUmps.forEach(ump => {
        initialPicked[ump] = true;
      });
      setPickedState(initialPicked);

      toast({
        title: "Archivo procesado",
        description: `Se detectaron ${parsed.rawUmps.length} UMPs en ${file.name}.`,
      });
    } catch (err: any) {
      console.error("Error parsing dispatch excel:", err);
      toast({
        variant: "destructive",
        title: "Error al leer archivo",
        description: err.message || "No se pudo interpretar el formato del archivo.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Manual Text Process
  const handleProcessManualText = () => {
    if (!manualText.trim()) return;
    const lines = manualText
      .split(/[\n,;\t]+/)
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s.length > 0);

    if (lines.length === 0) return;

    setRequestedUmps(lines);
    const initialPicked: Record<string, boolean> = {};
    lines.forEach(ump => {
      initialPicked[ump] = true;
    });
    setPickedState(initialPicked);
    setFileName("Ingreso Manual");
    setIsDraftRestored(false);

    toast({
      title: "Lista Procesada",
      description: `Se cargaron ${lines.length} UMPs.`,
    });
  };

  // Matching Engine against Live Stock
  const { matchedItems, missingUmps, stats } = React.useMemo(() => {
    if (!requestedUmps.length) {
      return { matchedItems: [], missingUmps: [], stats: { requested: 0, matched: 0, missing: 0 } };
    }

    // Build index of available stock items
    const availableItems: {
      ump: string;
      productCode: string;
      productName: string;
      clientLotId: string;
      quantity: number;
      unit: string;
      locationDisplay: string;
      locationType: 'chamber' | 'warehouse';
      locationSortKey: string;
      receptionId: string;
      itemIndex: number;
      collectionType: 'otherFruitReceptions' | 'packagingReceptions';
      clientName: string;
      clientId: string;
    }[] = [];

    (otherFruitReceptions || []).forEach(reception => {
      (reception.items || []).forEach((item, index) => {
        if (item.status === 'Almacenado' && item.quantity > 0) {
          const ump = String(item.palletId || item.containerId || '').trim();
          const loc = item.storageLocation as any;
          let locationDisplay = 'Almacenado';
          let locationType: 'chamber' | 'warehouse' = 'warehouse';
          let locationSortKey = 'ZZZ';

          if (loc) {
            if (loc.warehouse && loc.aisle) {
              locationDisplay = `${loc.warehouse} / ${loc.aisle}`;
              locationType = 'warehouse';
              locationSortKey = `W_${loc.warehouse}_${loc.aisle}`;
            } else if (loc.chamberId && loc.coordinate) {
              const chName = chambersConfig[loc.chamberId]?.name || loc.chamberId;
              locationDisplay = `${chName} / ${loc.coordinate}`;
              locationType = 'chamber';
              locationSortKey = `C_${loc.chamberId}_${loc.coordinate}`;
            } else if (loc.coordinate) {
              locationDisplay = loc.coordinate;
              locationSortKey = `C_${loc.coordinate}`;
            }
          }

          if (ump) {
            availableItems.push({
              ump,
              productCode: item.productCode || '',
              productName: item.productName || 'Producto Embalaje',
              clientLotId: item.clientLotId || '-',
              quantity: item.quantity,
              unit: item.unit || reception.unit || 'Pallet',
              locationDisplay,
              locationType,
              locationSortKey,
              receptionId: reception.id,
              itemIndex: index,
              collectionType: 'otherFruitReceptions',
              clientName: reception.clientName || 'Vitafoods',
              clientId: reception.clientId || 'VITAFOODS',
            });
          }
        }
      });
    });

    (packagingReceptions || []).forEach(reception => {
      (reception.items || []).forEach((item, index) => {
        if (item.status === 'Almacenado' && item.palletCount > 0) {
          const ump = String(item.lote || item.packagingMasterCode || '').trim();
          const loc = item.storageLocation as any;
          let locationDisplay = (loc?.warehouse && loc?.aisle) ? `${loc.warehouse} / ${loc.aisle}` : 'Almacenado';
          let locationSortKey = (loc?.warehouse && loc?.aisle) ? `W_${loc.warehouse}_${loc.aisle}` : 'ZZZ';

          if (ump) {
            availableItems.push({
              ump,
              productCode: item.packagingMasterCode || '',
              productName: item.packagingMasterName || 'Material',
              clientLotId: item.lote || '-',
              quantity: item.palletCount,
              unit: 'Pallets',
              locationDisplay,
              locationType: 'warehouse',
              locationSortKey,
              receptionId: reception.id,
              itemIndex: index,
              collectionType: 'packagingReceptions',
              clientName: reception.clientName || 'Embalajes',
              clientId: reception.clientId || 'EMBALAJES',
            });
          }
        }
      });
    });

    const matched: MatchedPickingItem[] = [];
    const missing: string[] = [];
    const usedKeys = new Set<string>();

    requestedUmps.forEach(reqUmp => {
      const cleanReq = reqUmp.trim().toUpperCase();
      const foundIdx = availableItems.findIndex(it => 
        !usedKeys.has(`${it.receptionId}-${it.itemIndex}`) &&
        (it.ump.toUpperCase() === cleanReq || it.ump.toUpperCase().includes(cleanReq))
      );

      if (foundIdx !== -1) {
        const item = availableItems[foundIdx];
        const key = `${item.receptionId}-${item.itemIndex}`;
        usedKeys.add(key);
        matched.push({
          ...item,
          key,
          isPicked: pickedState[item.ump] ?? true,
        });
      } else {
        missing.push(reqUmp);
      }
    });

    matched.sort((a, b) => a.locationSortKey.localeCompare(b.locationSortKey) || a.ump.localeCompare(b.ump));

    return {
      matchedItems: matched,
      missingUmps: missing,
      stats: {
        requested: requestedUmps.length,
        matched: matched.length,
        missing: missing.length,
      }
    };
  }, [requestedUmps, otherFruitReceptions, packagingReceptions, pickedState]);

  const filteredMatched = React.useMemo(() => {
    if (!searchFilter.trim()) return matchedItems;
    const q = searchFilter.toLowerCase().trim();
    return matchedItems.filter(item => 
      item.ump.toLowerCase().includes(q) ||
      item.productName.toLowerCase().includes(q) ||
      item.productCode.toLowerCase().includes(q) ||
      item.clientLotId.toLowerCase().includes(q) ||
      item.locationDisplay.toLowerCase().includes(q)
    );
  }, [matchedItems, searchFilter]);

  const handleTogglePick = (ump: string) => {
    setPickedState(prev => ({
      ...prev,
      [ump]: !prev[ump]
    }));
  };

  const handleToggleAllPicked = (checked: boolean) => {
    const updated: Record<string, boolean> = {};
    matchedItems.forEach(item => {
      updated[item.ump] = checked;
    });
    setPickedState(updated);
  };

  const handleBarcodeScanned = (scannedCode: string) => {
    const code = scannedCode.trim().toUpperCase();
    const found = matchedItems.find(it => it.ump.toUpperCase() === code || code.includes(it.ump.toUpperCase()));
    if (found) {
      setPickedState(prev => ({ ...prev, [found.ump]: true }));
      toast({
        title: "✅ UMP Verificado",
        description: `${found.ump} marcado para despacho (${found.locationDisplay}).`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "⚠️ UMP no encontrado en Picking",
        description: `El código ${code} no está en la lista de despacho activa.`,
      });
    }
  };

  const handleReset = () => {
    setRequestedUmps([]);
    setFileName(null);
    setPickedState({});
    setDispatchDocument('');
    setDestination('');
    setCarrier('');
    setLicensePlate('');
    setManualText('');
    setIsDraftRestored(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('frio_vitafood_active_dispatch');
    }
  };

  const handleSaveAsPickingRequest = async () => {
    if (!firestore) return;
    if (matchedItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Sin UMPs coincidentes",
        description: "No hay UMPs encontrados en stock para crear la solicitud de picking.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const movementRef = doc(collection(firestore, 'packagingMovements'));
      await setDoc(movementRef, cleanFirestoreObject({
        type: 'salida',
        clientId: matchedItems[0]?.clientId || 'VITAFOODS',
        clientName: matchedItems[0]?.clientName || 'Vitafoods',
        document: dispatchDocument || 'Sin Documento',
        destination: destination || '',
        carrier: carrier || '',
        licensePlate: licensePlate || '',
        totalPallets: matchedItems.length,
        fileName: fileName || 'Carga Excel',
        items: matchedItems.map(it => ({
          ump: it.ump,
          productCode: it.productCode,
          productName: it.productName,
          lote: it.clientLotId,
          quantity: it.quantity,
          unit: it.unit,
          location: it.locationDisplay,
          receptionId: it.receptionId,
          itemIndex: it.itemIndex,
          collectionType: it.collectionType,
        })),
        status: 'Pendiente de Picking',
        createdAt: serverTimestamp(),
        userId: user?.uid || '',
        userName: user?.displayName || user?.email || '',
      }));

      toast({
        title: "📋 Solicitud de Picking Guardada",
        description: `Se guardó la orden con ${matchedItems.length} pallets en "En Picking / Historial" para continuar desde cualquier dispositivo.`,
      });
    } catch (err: any) {
      console.error("Error saving picking order:", err);
      toast({
        variant: "destructive",
        title: "Error al guardar solicitud",
        description: err.message || "No se pudo guardar la orden en Firestore.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Bloqueador de ventanas emergentes",
        description: "Permita las ventanas emergentes en su navegador para imprimir el documento.",
      });
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const totalUnits = matchedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const rowsHtml = matchedItems.map((item, idx) => `
      <tr>
        <td style="text-align: center; font-weight: bold; width: 30px;">${idx + 1}</td>
        <td style="font-weight: bold; background-color: #f1f5f9; text-transform: uppercase; font-size: 11px; white-space: nowrap;">
          ${item.locationDisplay}
        </td>
        <td style="font-family: monospace; font-size: 13px; font-weight: bold; letter-spacing: 0.5px;">
          ${item.ump}
        </td>
        <td style="font-family: monospace; font-size: 11px; text-align: center;">
          ${item.clientLotId || '-'}
        </td>
        <td>
          <div style="font-weight: 600; font-size: 11px;">${item.productName}</div>
          ${item.productCode ? `<div style="font-size: 9px; color: #64748b; font-family: monospace;">CÓD: ${item.productCode}</div>` : ''}
        </td>
        <td style="text-align: right; font-weight: bold; font-size: 12px; white-space: nowrap;">
          ${item.quantity.toLocaleString('es-CL')} <span style="font-size: 9px; font-weight: normal; color: #64748b;">${item.unit}</span>
        </td>
        <td style="text-align: center; width: 50px;">
          <div style="display: inline-block; width: 18px; height: 18px; border: 2px solid #0f172a; border-radius: 3px; vertical-align: middle;"></div>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Picking List - Guía ${dispatchDocument || 'Borrador'}</title>
        <style>
          @page {
            size: letter portrait;
            margin: 10mm 12mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
          }
          body {
            padding: 15px;
            font-size: 11px;
            line-height: 1.3;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
          }
          .title {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .subtitle {
            font-size: 10px;
            color: #475569;
            font-weight: 600;
          }
          .meta-grid {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            background-color: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
          }
          .meta-grid td {
            padding: 6px 10px;
            font-size: 11px;
            border: 1px solid #e2e8f0;
          }
          .meta-label {
            font-size: 9px;
            text-transform: uppercase;
            font-weight: 700;
            color: #64748b;
            display: block;
            margin-bottom: 2px;
          }
          .meta-val {
            font-weight: 700;
            font-size: 12px;
          }
          .picking-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          .picking-table th {
            background-color: #0f172a;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 7px 8px;
            text-align: left;
            border: 1px solid #0f172a;
          }
          .picking-table td {
            padding: 6px 8px;
            border: 1px solid #cbd5e1;
            font-size: 11px;
            vertical-align: middle;
          }
          .picking-table tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .summary-bar {
            display: flex;
            justify-content: space-between;
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 8px 12px;
            font-weight: bold;
            margin-bottom: 24px;
            border-radius: 4px;
          }
          .signatures-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-top: 35px;
            page-break-inside: avoid;
          }
          .signature-box {
            border-top: 1px solid #0f172a;
            padding-top: 6px;
            text-align: center;
            font-size: 10px;
          }
          .signature-title {
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 25px;
          }
          .footer-note {
            margin-top: 25px;
            font-size: 9px;
            color: #64748b;
            text-align: center;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
            page-break-inside: avoid;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td>
              <div class="title">ORDEN DE PICKING / PREPARACIÓN DE DESPACHO</div>
              <div class="subtitle">FRIGOMANAGER &bull; FRÍO MAIPO &bull; LOGÍSTICA DE EMBALAJES</div>
            </td>
            <td style="text-align: right;">
              <div style="font-size: 13px; font-weight: 800;">GUÍA N°: ${dispatchDocument || 'PENDIENTE'}</div>
              <div style="font-size: 10px; color: #64748b;">Emisión: ${dateStr} ${timeStr}</div>
            </td>
          </tr>
        </table>

        <table class="meta-grid">
          <tr>
            <td width="25%">
              <span class="meta-label">Cliente</span>
              <span class="meta-val">${matchedItems[0]?.clientName || 'VITAFOODS'}</span>
            </td>
            <td width="25%">
              <span class="meta-label">Destino / Planta</span>
              <span class="meta-val">${destination || 'PLANTA PRINCIPAL'}</span>
            </td>
            <td width="25%">
              <span class="meta-label">Transportista</span>
              <span class="meta-val">${carrier || '-'}</span>
            </td>
            <td width="25%">
              <span class="meta-label">Patente Camión</span>
              <span class="meta-val" style="font-family: monospace;">${licensePlate || '-'}</span>
            </td>
          </tr>
        </table>

        <table class="picking-table">
          <thead>
            <tr>
              <th style="text-align: center; width: 30px;">#</th>
              <th style="width: 160px;">Ubicación Física</th>
              <th style="width: 120px;">UMP (Pallet ID)</th>
              <th style="width: 85px; text-align: center;">Lote</th>
              <th>Producto / Material</th>
              <th style="text-align: right; width: 85px;">Cant.</th>
              <th style="text-align: center; width: 50px;">Check</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="summary-bar">
          <span>TOTAL PALLETS: <strong>${matchedItems.length}</strong></span>
          <span>TOTAL BULTOS / UNIDADES: <strong>${totalUnits.toLocaleString('es-CL')}</strong></span>
          <span>EMITIDO POR: <strong>${user?.displayName || user?.email || 'BODEGA'}</strong></span>
        </div>

        <div class="signatures-grid">
          <div class="signature-box">
            <div class="signature-title">Preparado por (Bodega)</div>
            <div>Firma / Nombre</div>
          </div>
          <div class="signature-box">
            <div class="signature-title">Control / Despachador</div>
            <div>Firma / Nombre</div>
          </div>
          <div class="signature-box">
            <div class="signature-title">Chofer / Transportista</div>
            <div>Firma / RUT</div>
          </div>
        </div>

        <div class="footer-note">
          Documento de control interno de preparación y carga. Verifique la coincidencia física de cada UMP antes de cargar al camión.
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleConfirmDispatch = async () => {
    if (!firestore) return;
    if (!dispatchDocument.trim()) {
      toast({
        variant: "destructive",
        title: "N° de Guía Obligatorio",
        description: "Debe ingresar el número de Guía de Despacho antes de confirmar.",
      });
      return;
    }

    const itemsToDispatch = matchedItems.filter(it => pickedState[it.ump]);
    if (itemsToDispatch.length === 0) {
      toast({
        variant: "destructive",
        title: "Sin UMPs seleccionados",
        description: "Seleccione al menos un UMP verificado para despachar.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(firestore);

      const byReception = new Map<string, { collectionType: string; itemsToUpdate: MatchedPickingItem[] }>();
      itemsToDispatch.forEach(it => {
        if (!byReception.has(it.receptionId)) {
          byReception.set(it.receptionId, { collectionType: it.collectionType, itemsToUpdate: [] });
        }
        byReception.get(it.receptionId)!.itemsToUpdate.push(it);
      });

      for (const [receptionId, data] of byReception.entries()) {
        if (data.collectionType === 'otherFruitReceptions') {
          const recDoc = otherFruitReceptions?.find(r => r.id === receptionId);
          if (recDoc) {
            const recRef = doc(firestore, 'otherFruitReceptions', receptionId);
            const currentItems = [...recDoc.items];
            
            data.itemsToUpdate.forEach(up => {
              if (currentItems[up.itemIndex]) {
                currentItems[up.itemIndex] = {
                  ...currentItems[up.itemIndex],
                  status: 'Despachado',
                } as any;
              }
            });

            const allDispatched = currentItems.every(i => i.status === 'Despachado');
            const newStatus = allDispatched ? 'Despachado' : 'Parcialmente Despachado';

            batch.update(recRef, cleanFirestoreObject({
              items: currentItems,
              status: newStatus,
              updatedAt: serverTimestamp(),
              lastDispatchDocument: dispatchDocument,
            }));
          }
        } else {
          const pkgDoc = packagingReceptions?.find(r => r.id === receptionId);
          if (pkgDoc) {
            const pkgRef = doc(firestore, 'packagingReceptions', receptionId);
            const currentItems = [...pkgDoc.items];

            data.itemsToUpdate.forEach(up => {
              if (currentItems[up.itemIndex]) {
                currentItems[up.itemIndex] = {
                  ...currentItems[up.itemIndex],
                  status: 'Despachado' as any,
                };
              }
            });

            const allDispatched = currentItems.every(i => (i.status as any) === 'Despachado');
            batch.update(pkgRef, cleanFirestoreObject({
              items: currentItems,
              status: allDispatched ? 'Almacenado' : 'Parcialmente Almacenado',
              updatedAt: serverTimestamp(),
            }));
          }
        }
      }

      const movementRef = doc(collection(firestore, 'packagingMovements'));
      batch.set(movementRef, cleanFirestoreObject({
        type: 'salida',
        clientId: itemsToDispatch[0]?.clientId || 'VITAFOODS',
        clientName: itemsToDispatch[0]?.clientName || 'Vitafoods',
        document: dispatchDocument,
        destination: destination || '',
        carrier: carrier || '',
        licensePlate: licensePlate || '',
        totalPallets: itemsToDispatch.length,
        items: itemsToDispatch.map(it => ({
          ump: it.ump,
          productCode: it.productCode,
          productName: it.productName,
          lote: it.clientLotId,
          quantity: it.quantity,
          unit: it.unit,
          location: it.locationDisplay,
          receptionId: it.receptionId,
        })),
        status: 'Completado',
        createdAt: serverTimestamp(),
        userId: user?.uid || '',
        userName: user?.displayName || user?.email || '',
      }));

      await batch.commit();

      toast({
        title: "🚀 Despacho Confirmado con Éxito",
        description: `Se despacharon ${itemsToDispatch.length} UMPs con Guía N° ${dispatchDocument}. El stock fue actualizado.`,
      });

      handleReset();
    } catch (err: any) {
      console.error("Error confirming dispatch:", err);
      toast({
        variant: "destructive",
        title: "Error al confirmar despacho",
        description: err.message || "Ocurrió un error al actualizar los registros.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const allPicked = matchedItems.length > 0 && matchedItems.every(it => pickedState[it.ump]);
  const pickedCount = matchedItems.filter(it => pickedState[it.ump]).length;

  return (
    <div className="space-y-6">
      {/* 1. Header & Dispatch Manifest Information */}
      <Card className="border-t-4 border-t-primary shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Truck className="h-6 w-6 text-primary" />
                Despacho y Picking List (Vitafoods / Embalajes)
              </CardTitle>
              <CardDescription>
                Cargue el archivo Excel con los UMP a despachar para cruzar contra el stock y generar el Picking List ordenado.
              </CardDescription>
            </div>
            {fileName && (
              <Button variant="outline" size="sm" onClick={handleReset} className="text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4 mr-1.5" />
                Limpiar / Nueva Carga
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDraftRestored && (
            <div className="bg-primary/10 border border-primary/20 p-2.5 rounded-lg text-xs flex items-center justify-between text-primary font-medium">
              <span>💾 Se ha restaurado automáticamente la orden de despacho en progreso.</span>
              <Button size="sm" variant="ghost" onClick={handleReset} className="h-6 text-xs text-destructive hover:bg-destructive/10">
                Descartar
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                N° Guía de Despacho <span className="text-destructive font-black">*</span>
              </Label>
              <Input 
                placeholder="Ej. 104523" 
                value={dispatchDocument} 
                onChange={(e) => setDispatchDocument(e.target.value)}
                className="font-mono font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Destino / Cliente</Label>
              <Input 
                placeholder="Ej. Planta Vitafoods / Central" 
                value={destination} 
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Transportista</Label>
              <Input 
                placeholder="Ej. Transportes del Sur" 
                value={carrier} 
                onChange={(e) => setCarrier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Patente Camión</Label>
              <Input 
                placeholder="Ej. AB-CD-12" 
                value={licensePlate} 
                onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
          </div>

          {/* 2. File Upload / Input Selector */}
          {!requestedUmps.length && (
            <div className="mt-4 pt-4 border-t">
              <Tabs value={activeInputMode} onValueChange={(v) => setActiveInputMode(v as any)}>
                <TabsList className="grid w-full grid-cols-2 max-w-md mb-4">
                  <TabsTrigger value="file" className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4 w-4" /> Cargar Excel / CSV
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Ingreso / Pegado Manual
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-xl p-8 text-center hover:bg-muted/50 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 border-primary/30 hover:border-primary bg-primary/5"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept=".xlsx, .xls, .csv" 
                      className="hidden" 
                    />
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                      <UploadCloud className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="font-bold text-base text-foreground">Haga clic o arrastre el archivo de Despacho Vitafoods aquí</p>
                      <p className="text-xs text-muted-foreground mt-1">Soporta formato Excel (.xlsx, .xls) o CSV con listado de UMP</p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="mt-1 font-bold">
                      Seleccionar Archivo
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="manual">
                  <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
                    <Label className="text-xs font-bold">Pegue o escriba los UMP (separados por salto de línea o coma):</Label>
                    <Textarea 
                      rows={4}
                      placeholder="6006093412&#10;6006093413&#10;6006093414..."
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <div className="flex justify-end">
                      <Button onClick={handleProcessManualText} disabled={!manualText.trim()} className="font-bold">
                        Procesar Lista de UMPs
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Match Results & KPI Summary */}
      {requestedUmps.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400">Total Solicitados</p>
                  <p className="text-3xl font-black text-blue-950 dark:text-blue-100">{stats.requested}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600">
                  <Layers className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">Encontrados en Stock</p>
                  <p className="text-3xl font-black text-emerald-950 dark:text-emerald-100">{stats.matched}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className={stats.missing > 0 ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200" : "bg-muted/30"}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-amber-600 dark:text-amber-400">No Encontrados / Faltantes</p>
                  <p className="text-3xl font-black text-amber-950 dark:text-amber-100">{stats.missing}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Missing UMPs Alert */}
          {missingUmps.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>Atención: {missingUmps.length} UMPs del archivo no se encuentran disponibles en el stock almacenado</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {missingUmps.map(u => (
                  <Badge key={u} variant="outline" className="font-mono bg-background text-amber-800 dark:text-amber-300 border-amber-300">
                    {u}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 4. Picking List Table & Actions */}
          <Card className="shadow-md">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    Picking List Ordenado por Ubicación Física
                  </CardTitle>
                  <CardDescription>
                    {pickedCount} de {matchedItems.length} pallets seleccionados para despacho.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Filtrar por UMP, lote, ubicación..." 
                      value={searchFilter} 
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-9 h-9 text-xs"
                    />
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsScannerOpen(true)}
                    className="gap-1.5 h-9 bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary font-bold"
                  >
                    <Scan className="h-4 w-4" /> Escanear UMP
                  </Button>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handlePrint}
                    className="gap-1.5 h-9"
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="border-t max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/40 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <Checkbox 
                          checked={allPicked} 
                          onCheckedChange={(v) => handleToggleAllPicked(!!v)}
                        />
                      </TableHead>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead className="font-bold">Ubicación Física</TableHead>
                      <TableHead className="font-bold">UMP (Pallet ID)</TableHead>
                      <TableHead className="font-bold">Lote Cliente</TableHead>
                      <TableHead className="font-bold">Producto / Material</TableHead>
                      <TableHead className="text-right font-bold">Cant.</TableHead>
                      <TableHead className="w-24 text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMatched.length > 0 ? (
                      filteredMatched.map((item, idx) => {
                        const isChecked = pickedState[item.ump] ?? true;
                        return (
                          <TableRow 
                            key={item.key} 
                            className={`cursor-pointer transition-colors ${isChecked ? 'bg-primary/5 hover:bg-primary/10' : 'opacity-60 hover:opacity-100'}`}
                            onClick={() => handleTogglePick(item.ump)}
                          >
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox 
                                checked={isChecked} 
                                onCheckedChange={() => handleTogglePick(item.ump)}
                              />
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground font-mono">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {item.locationType === 'chamber' ? (
                                  <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-300 gap-1 font-bold">
                                    <Snowflake className="h-3 w-3" />
                                    {item.locationDisplay}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 gap-1 font-bold">
                                    <WarehouseIcon className="h-3 w-3" />
                                    {item.locationDisplay}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono font-bold text-sm text-foreground">
                              {item.ump}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.clientLotId}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-xs leading-tight">{item.productName}</p>
                                {item.productCode && <p className="text-[10px] text-muted-foreground font-mono">{item.productCode}</p>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-black text-sm">
                              {item.quantity} <span className="text-[10px] font-normal text-muted-foreground">{item.unit}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              {isChecked ? (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[10px]">
                                  Listo
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                  Pendiente
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          {searchFilter ? 'No se encontraron UMPs con ese criterio de búsqueda.' : 'No hay UMPs para mostrar.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* 5. Footer Confirmation Actions */}
              <div className="p-4 bg-muted/20 border-t flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{pickedCount}</span> pallets listos para despachar con Guía <span className="font-mono font-bold text-foreground">{dispatchDocument || '(Pendiente)'}</span>.
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button 
                    variant="outline" 
                    onClick={handleReset} 
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-initial"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="secondary"
                    onClick={handleSaveAsPickingRequest} 
                    disabled={isSubmitting || matchedItems.length === 0}
                    className="flex-1 sm:flex-initial font-bold"
                  >
                    Guardar Solicitud de Picking
                  </Button>
                  <Button 
                    onClick={handleConfirmDispatch} 
                    disabled={isSubmitting || pickedCount === 0 || !dispatchDocument.trim()}
                    className="flex-1 sm:flex-initial font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                  >
                    {isSubmitting ? 'Confirmando Salida...' : `Confirmar Despacho (${pickedCount} Pallets)`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScanner 
        open={isScannerOpen} 
        onOpenChange={setIsScannerOpen} 
        onScan={handleBarcodeScanned}
        title="Escanear UMP para Despacho"
        description="Escanee el código de barras o QR del UMP para marcarlo en el Picking List."
        closeOnScan={false}
      />
    </div>
  );
}
