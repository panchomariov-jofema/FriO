# Módulo · Flujo Cereza

Rutas: `/bins-y-materiales`, `/recepcion`, `/hidrocooler`, `/camaras`, `/despachos`.
Clientes: exportadoras (`exporters`) con sus productores (`producers`). Unidad: **bins**.

## 1. Bins y Materiales (`/bins-y-materiales`)
- Tabs: `entradas` (EntriesTab), `salidas` (ExitsTab), `stock` (StockTab). Docs DTE pendientes en `PendingDocsTab`.
- Entrada/Salida de bins (propios o arrendados de FÑO) sugiere totes y láminas sumando el total de bins (proporción 1:24 totes, 1:1 lámina).
- **Subarriendo FÑO (`EXP005`) → Exportadoras (`SUBSOLE`, `MEYER`, `BLOSSOM`):** Cuando FÑO registra una salida hacia una exportadora (`bins-rental-utils.ts`), se rebaja del stock de FÑO y se acredita automáticamente en el stock disponible de la exportadora para que pueda subarrendar esos bins (`BINS_PALOGIX`, `BINS_VT`, etc.) a sus propios productores y recibirlos de vuelta vacíos desde su Packing.
- Salida → `binMaterialMovements` (salida) y, si hay `businessEntities`, un DTE en `documentosPendientes`.
- "Despacho directo" exportador→productor: movimiento con `noAffectStock: true`.
- Stock = suma de movimientos (+ arriendos desde FÑO + efectos de recepción/despacho de fruta). Admin (email hardcode) puede importar saldos y limpiar historial.

## 2. Recepción (`/recepcion`)
Componentes: `LotCreationForm` → `LotList` → `WeightCalculator` → `TemperatureForm` (`EditLotDialog` para correcciones).
- Crea `receptionLots` (`displayLotId`, guía, variedad, bins, totes).
- Pesaje: pesos parciales; neto = total − tara bin **65 kg** − ajuste totes. Al guardar peso se crea el `hidrocoolerLots` correspondiente (batch).
- T° Pre-Hidro y Post-Hidro; con Post-Hidro el lote queda `Cerrado`.
- Variedades: `Variety` en `types.ts` (SANTINA, LAPINS, REGINA, KORDIA, SKEENA, SWEETHEART, SYLVIA, SUNBURST).

## 3. Hidrocooler (`/hidrocooler`)
- Toma `hidrocoolerLots` y los divide en cargas `processingLots` por hidrocooler (capacidad en `hidrocoolers`).
- Al finalizar → `chamberLots` en `Pendiente por Almacenar` (propaga `receptionDate` = fecha FIFO).
- `ExternalReceptionUploader`: carga externa (fruta procesada en otro frigorífico) directo a cámara.
- ⚠️ Existe **duplicado**: `src/app/(app)/hidrocooler/page.tsx` (el que se usa) y `src/components/hidrocooler/page.tsx` (copia divergente). Editar el de `app/`.

## 4. Cámaras (`/camaras`)
- `camaras/page.tsx` (~1.500 líneas): mapa por cámara, almacenamiento de pendientes, reubicación (`RelocateLotDialog`), temperatura (`ChamberTemperatureInput` → `chamberTemperatures`), toggles de `chamberSettings`.
- Almacenar = asignar `chamberId` + `coordinate` y `status: 'Almacenado'`. Sugerencia según estrategia del exportador (ver `03-camaras-y-estrategias.md`).
- Esta pantalla también muestra ítems de socios/Fall Creek/Vitafood (lee `otherFruitReceptions`).

## 5. Despachos (`/despachos`)
- Tabs: **Automático (FIFO)** — elige `chamberLots` más antiguos por `receptionDate` hasta completar; **Manual** (`ManualDispatchTab`) — selección de coordenadas filtrando variedad/cámara.
- Crea `dispatches` en `Pendiente de Picking`. `handleUndoDispatch` revierte.
- **Picking** (gruero): `DispatchPickingDialog` (PDF hoja de ruta, DTE). La confirmación real está en `other-fruit/PickingTab.tsx → handleConfirmProducerFruitExit`:
  - por cada bin: descuenta `binCount` del `chamberLot`; **si queda en 0, borra el documento** (no lo pasa a `Despachado`);
  - marca `dispatches.status = 'Completado'` en el mismo batch.
- El gruero ve el picking desde **Socios Comerciales → Picking** (su nav solo tiene Cámaras y Socios).

## Gotchas
- Cambiar lógica FIFO: revisar `despachos/page.tsx` y `ManualDispatchTab.tsx` (ambos usan `receptionDate`).
- El Dashboard (`dashboard/page.tsx`) recalcula KPIs leyendo casi todas las colecciones de este flujo.
