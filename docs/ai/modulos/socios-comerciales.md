# Módulo · Socios Comerciales (Otros Hortofrutícolas)

Ruta: `/otros-hortofruticolas` (label sidebar: **Socios Comerciales**). Manual de usuario: `manual_socios_comerciales.md` / `manual_detallado_socios_comerciales.md`.
Clientes: `otherClients` (unidad **Bins** o **Pallets** según cliente). Productos: `packagingMaster` (global `clientId = '99999'`).

## Tabs (filtradas por `allowedTabs` del perfil; `stock` siempre visible)
| Tab | Componente | Hace |
|---|---|---|
| `recepcion` | `other-fruit/ReceptionTab.tsx` | Crea `otherFruitReceptions` (guía, temperatura opcional, `items[]` con producto, cantidad, lote cliente). Si el cliente es Vitafood o Fall Creek, deriva a su workflow propio. |
| `almacenamiento` | `StorageTab.tsx` + `StoreOtherFruitDialog.tsx` | Asigna `storageLocation` a ítems `Pendiente de almacenar` (cámara/coordenada para fruta; almacén/pasillo para embalaje). Modo directo y escaneo. Sugerencia según `clientStorageConfigs`. Puede **dividir** un ítem en varias coordenadas. |
| `stock` | `StockAndRelocationTab.tsx` + `RelocateOtherFruitDialog.tsx` | Stock por cliente/coordenada y reubicación parcial. |
| `salidas` | `ExitTab.tsx` (~1.400 líneas) | Arma salida eligiendo coordenadas (FIFO por lote/variedad, clic en celdas, +/-). Crea `otherFruitMovements` en `Pendiente de Picking` con `locations[]` (`receptionId` + `itemIndex`). |
| `picking` | `PickingTab.tsx` + `OtherFruitPickingDialog.tsx` | Confirma salidas: fruta socios (`handleConfirmFruitExit`), embalajes (`handleConfirmPackagingExit`) y **cereza** (`handleConfirmProducerFruitExit`). Genera PDFs. |

## Reglas
- Stock de un socio = ítems `Almacenado` de sus recepciones menos lo descontado por picking. Al confirmar picking se actualizan cantidades/status de los ítems referenciados por `itemIndex`.
- La unidad (Bins/Pallets) viene del cliente y cambia textos y conversiones.
- `ClientSelector` y `ClientStorageConfigDialog` son compartidos con otros módulos.

## Gotchas
- `ExitTab`, `StorageTab`, `ReceptionTab` contienen ramas `if (clientName === 'FALL CREEK')` / `includes('VITAFOOD')`. Al tocar lógica general, verificar que esas ramas sigan funcionando.
- No eliminar elementos de `items[]` (rompe `itemIndex`). Usar `status: 'No Recepcionado'` o similar.
