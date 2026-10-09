# 02 · Modelo de datos (Firestore)

Tipos en `src/lib/types.ts`; validaciones de formularios en `src/lib/schemas.ts` (zod).
`docs/backend.json` es un blueprint antiguo: **no confiar**, la verdad es `types.ts` + el código.

## Maestros
| Colección | Tipo | Notas |
|---|---|---|
| `exporters` | `Exporter` | Exportadoras cereza. `storageStrategy`, `binsPerCoordinate`. |
| `producers` | `Producer` | `exporterId` puede ser string **o array** (relación N:N). Datos tributarios para DTE. |
| `binMaterials` | `BinMaterial` | Bins, totes, láminas… por exportador. |
| `otherClients` | `OtherClient` | Socios comerciales. `type`: `embalaje` \| `frio_hortofruticola` \| `fruta`; `unit`: `Bins` \| `Pallets`. |
| `packagingMaster` | `PackagingMaster` | Productos por cliente. `clientId = '99999'` = producto global. |
| `packings` | `Packing` | Destinos packing por exportador. |
| `usersMaster` | `UserMaster` | `userName` = parte local del email. |
| `profiles` | `Profile` | `modulesAccess` (ver 01-arquitectura). |
| `hidrocoolers` | `Hidrocooler` | Capacidad en bins. |
| `businessEntities` | `BusinessEntity` | "Datos Matriz" para emitir DTE. |
| `warehouses`, `aisles` | `Warehouse`, `Aisle` | Almacenes/pasillos de embalaje. |
| `clientStorageConfigs` | `ClientStorageConfig` | id = clientId. Estrategia, bins/pallets por coordenada, cámara preferida, reservas por cámara. |
| `chamberSettings` | `ChamberSetting` | id = chamberId. `row13Enabled` (filas comodín 13-14), `colsKLEnabled` (cámara 3). |
| `settings/telegram` | `TelegramConfig` | Token y chat. Sensible. |
| `reportSettings` | `ReportSetting` | Reportes ocultos. |

## Flujo Cereza (cadena de documentos)
```
receptionLots ──(peso)──► hidrocoolerLots ──(procesar)──► processingLots ──(almacenar)──► chamberLots ──► dispatches
```
| Colección | Estados (`status`) |
|---|---|
| `receptionLots` | `Pendiente de Peso` → `Pendiente de Pre-Hidro` → `Pendiente de Post-Hidro` → `Cerrado` |
| `hidrocoolerLots` | `Pendiente de Pre-Hidro` (cola de lotes esperando hidro) |
| `processingLots` | `En Proceso` → `Finalizado` |
| `chamberLots` | `Pendiente por Almacenar` → `Almacenado` → `Despachado`. `receptionDate` = fecha FIFO real; `chamberId` + `coordinate` |
| `dispatches` | `Pendiente de Picking` → `Completado`. `bins[]` con chamberLotId/coordenada |
| `chamberTemperatures` | Lecturas por cámara |

## Bins y Materiales
| Colección | Notas |
|---|---|
| `binMaterialMovements` | `type: entrada/salida`, `items[]`. Flags: `noAffectStock` (despacho directo exportador→productor), `isFruitDispatch` (generado al despachar fruta). **El stock se calcula sumando movimientos** + lotes en cámara + despachos (no hay colección de saldos activa; `BinMaterialStock` es legado). |
| `documentosPendientes` | DTE Guía de Despacho (`DTEGuiaDespacho`) `estado: PENDIENTE/GENERADO`; XML con `generateDteXml()` en `lib/utils.ts`. |

## Socios Comerciales / Vitafood / Fall Creek
| Colección | Notas |
|---|---|
| `otherFruitReceptions` | **La colección más central** (leída por ~23 archivos). Una recepción con `items[]`; cada ítem tiene su `status` y `storageLocation {chamberId, coordinate, warehouse?, aisle?}`. Se usa para Socios, **Vitafood (pallets por UMP = `palletId`)** y **Fall Creek**. |
| `otherFruitMovements` | Salidas socios/Fall Creek. `status: Pendiente de Picking/Completado`; `locations[]` apunta a `receptionId + itemIndex`. |
| `packagingReceptions` | Recepción de embalajes (no Vitafood) con `items[].storageLocation {warehouse, aisle}`. |
| `packagingMovements` | Salidas de embalajes y **despachos Vitafood** (`rawUmps`, `totalPallets`, `locations[]`). |

Estados de ítem (`OtherFruitReceptionItem.status`): `Pendiente de recibir` → `Recibido` → `Pendiente de almacenar` → `Almacenado` → `Despachado` | `No Recepcionado`.
Estados de cabecera (`OtherFruitReception.status`): agrega `Parcialmente Almacenado` y `Cerrado`.

> ⚠️ Referencias por **índice de array** (`itemIndex`). Nunca reordenar, insertar en medio ni borrar elementos de `items[]` de una recepción con movimientos: rompe `locations[]` de salidas y reubicaciones. Marcar por status en vez de borrar.

## Quién escribe qué (para medir impacto)
| Colección | Escriben |
|---|---|
| `receptionLots` | `components/reception/*` |
| `hidrocoolerLots`, `processingLots` | `WeightCalculator`, `EditLotDialog`, `hidrocooler/page` |
| `chamberLots` | `hidrocooler/*` (StoreInChamber, ExternalReceptionUploader), `camaras/page`, `RelocateLotDialog`, `despachos`, `other-fruit/PickingTab` |
| `dispatches` | `despachos/page`, `ManualDispatchTab`, `PickingTab` |
| `binMaterialMovements` | `bins-materials/*`, `PickingTab`, `fall-creek/page`, kardex (cargas históricas) |
| `otherFruitReceptions` | `other-fruit/*` (Reception, Storage, StoreDialog, Relocate, Exit, Picking), `VitafoodReceptionWorkflow`, `FallCreekReceptionWorkflow`, `packaging/*` (Vitafood stock/relocate/dispatch), `fall-creek/page` |
| `otherFruitMovements` | `other-fruit/ExitTab`, `PickingTab`, `fall-creek/page` |
| `packagingReceptions` / `packagingMovements` | `packaging/*` |

Para el listado exacto: `grep -rln "'<coleccion>'" src`.
