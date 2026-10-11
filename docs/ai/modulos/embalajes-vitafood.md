# Módulo · Embalajes y Vitafood

Ruta: `/embalajes`. Tabs: `recepcion`, `almacenamiento` (badge pendientes), `salidas` (Despacho), `stock`.
Archivos de apoyo en raíz: `Codigos_Vitafood.xlsx`, `Despacho_Vitafood.xlsx`, `Recepcion_Vitafood.xls`, `ETIQUETA_VITAFOOD.jpeg`, `manual_despacho.html`.

## Dos caminos según cliente
| | Embalaje genérico | **Vitafood** |
|---|---|---|
| Detección | `otherClients.type = 'embalaje'` | `name/clientId` **contiene `VITAFOOD`** |
| Recepción | `packaging/ReceptionTab.tsx` → `packagingReceptions` | `other-fruit/VitafoodReceptionWorkflow.tsx` → **`otherFruitReceptions`** |
| Unidad | pallets por producto | **pallet individual identificado por UMP** (`palletId`) |
| Ubicación | almacén + pasillo | almacén/pasillo o cámara |
| Despacho | `packaging/ExitTab.tsx` → `packagingMovements` | `packaging/VitafoodDispatchTab.tsx` → `packagingMovements` (`rawUmps`, `totalPallets`) |
| Picking | `PendingPickingTab` / `PackagingPickingDialog` | escaneo de UMP en `VitafoodDispatchTab` |
| Stock | `StockAndRelocationTab` (mezcla ambos) | idem + `RelocatePackagingDialog`, `AdjustPackagingDialog` |

## Vitafood: recepción (`VitafoodReceptionWorkflow.tsx`, ~1.900 líneas)
1. Subir **Orden de Entrada** (Excel SAP → `parseVitafoodManifest` en `lib/vitafood-utils.ts`; PDF/imagen → IA `parseVitafoodManifestAIAction` → `ai/vitafood-ai.ts`). Debe cargarse en modo Online (con red).
2. Se crea la recepción con todos los pallets en `Pendiente de recibir` (manifiesto activo; guía editable) y se respalda copia local en `localStorage` (`frio_vitafood_manifest_backup_*`).
3. **Modo Offline (Cámara / Sin Internet):**
   - Escaneo de UMP (`handleReceivePallet`) y Almacenamiento (`onStoreConfirm`) operan sin conexión encolando en `frio_vitafood_offline_queue`.
   - **Merge optimista:** la pantalla refleja el avance local inmediatamente sin esperar a Firestore ni perder datos ante recargas.
   - **Idempotencia:** actualizaciones por `palletId` respetando los índices exactos de `items[]`.
   - **Sincronización:** al recuperar señal o con botón manual (`OfflineSyncIndicator`), sube los pendientes en bloque con `cleanFirestoreObject` y `updateDoc`.
4. Ingreso manual de pallet fuera de manifiesto (`handleManualSubmit`).
5. Cierre con faltantes → ítems `No Recepcionado`. Deshacer recepción de pallet si no está almacenado.
- Feedback sonido/vibración al escanear (uso móvil).

## Vitafood: despacho (`VitafoodDispatchTab.tsx`, ~1.500 líneas)
- Cargar archivo de despacho (`parseVitafoodDispatchFile`) o pegar texto con UMPs → lista a pickear.
- Escaneo marca pickeado; se puede guardar como **solicitud de picking** (pendiente) y retomarla.
- Confirmación en batch: crea/actualiza `packagingMovements` y marca ítems de `otherFruitReceptions` como despachados.

## Gotchas
- Vitafood vive en `otherFruitReceptions` aunque se opere desde Embalajes: cualquier cambio en esa colección afecta Socios, Fall Creek y Vitafood.
- La detección por nombre aparece en ≥8 archivos (`grep -rn "VITAFOOD" src`).
