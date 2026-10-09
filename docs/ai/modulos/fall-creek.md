# Módulo · Fall Creek

Ruta: `/fall-creek` (portal propio, color `#004b8d`). Cliente detectado por `clientName === 'FALL CREEK'` / id `fallcreek`.
Producto: plantas (variedades Sekoya Crunch®, Grande®, Fiesta™, FC11-164…) en bins; manifiestos llegan como **Pallet Logs**.
Referencia de distribución: `distribucion_almacenamiento.md` (y `_792`), imágenes `distribucion_camaras*.png`.

## Archivos
- `app/(app)/fall-creek/page.tsx` (**~2.500 líneas, el más grande**): tabs `storage`, `stock-query`, `history`, `bins`; sub-tabs de historial `manifests`, `dispatches`, `contingencies`. Mapa con **selección por arrastre** (drag) para pre-despachos, ventana flotante de resumen, modo test.
- `components/other-fruit/FallCreekReceptionWorkflow.tsx`: importar manifiesto, confirmar pallets por escaneo, observaciones.
- `lib/fall-creek-utils.ts`: `parseFallCreekManifest` (Excel, headers fila 8), `decomposePalletsIntoBins` (pallet multi-variedad → bins, estima plantas/bin), `cleanVarietyName`, `parseTemperatureExcel`.
- `lib/fall-creek-pdf-parser.ts`: parser PDF por coordenadas X/Y (`unpdf`). Frágil ante cambios de layout del PDF.
- `ai/fall-creek-ai.ts` + `fall-creek/actions.ts`: lectura IA.
- `lib/telegram.ts`: notificaciones (almacenamiento iniciado/terminado, despacho creado, picking completado).

## Datos
- Recepciones en `otherFruitReceptions` (ítems con `palletId`, `containerId`, `plantsPerBin`, `totalPlants`, `isMixedVariety`).
- Salidas en `otherFruitMovements` → picking en `other-fruit/PickingTab`.
- También registra `binMaterialMovements` (bins entregados/devueltos).
- Conversión: **1 pallet Fall Creek = 3 bins**.
- Estrategias típicas: `pareado` (legado), `serpentina-vertical`, `aisle-access` (muestreo SAG).

## Gotchas
- Modo test (`handleStartTest`, `handleDeleteTestData`) escribe y borra datos reales en Firestore: no usar en producción sin cuidado.
- Reporte dedicado: `/reportes/despachos-fallcreek`.
