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
1. Subir **Orden de Entrada** (Excel SAP → `parseVitafoodManifest` en `lib/vitafood-utils.ts`; PDF/imagen → IA `parseVitafoodManifestAIAction` → `ai/vitafood-ai.ts`).
2. Se crea la recepción con todos los pallets en `Pendiente de recibir` (manifiesto activo; guía editable).
3. Escaneo/ingreso de UMP (`handleUmpLookup` maneja notación científica tipo `6.00609e+09`) → `handleReceivePallet` → `Pendiente de almacenar` (opción de almacenamiento directo).
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
