# Módulo · Reportes

Ruta: `/reportes` (índice con tarjetas; se pueden ocultar vía `reportSettings`). Cada reporte es una subruta con su `page.tsx` autocontenido (lee colecciones completas y calcula en cliente). Export PDF (`jspdf-autotable`) y Excel (`xlsx`). Encabezado común: `components/reports/ReportHeader.tsx`.

| Subruta | Fuente principal | Notas |
|---|---|---|
| `kardex-bins-materiales` | `binMaterialMovements`, `chamberLots`, `dispatches`, `receptionLots`, `producers` | Admin: carga de saldos iniciales (DD-MM-YYYY), cargas históricas, limpieza. Usa batch. |
| `saldo-por-productor` | `binMaterialMovements`, `binMaterials`, `producers` | "Saldo de Bins y Mat. Entregados" agrupado, con total general. |
| `stock-bins-materiales` | `binMaterialMovements`, `chamberLots`, `dispatches` | |
| `stock-bins-camaras` | `chamberLots`, `otherFruitReceptions` | Ocupación por cámara. |
| `despachos` | `dispatches`, `receptionLots`, `producers` | Cereza. |
| `despachos-fallcreek` | `otherFruitMovements`, `otherFruitReceptions`, `dispatches` | ~900 líneas. |
| `log-recepcion-fruta` | `receptionLots` | |
| `registro-temperaturas` | `chamberTemperatures` | |
| `stock-fruta-otros-clientes` | `otherFruitReceptions` | |
| `kardex-fruta-otros-clientes` | `otherFruitReceptions`, `otherFruitMovements` | Usa batch (ajustes). |
| `permanencia-stock-otros-clientes` | `otherFruitReceptions`, `otherFruitMovements` | Días en cámara (base de facturación). |
| `stock-embalajes` | `packagingReceptions` | |

Mockups de referencia: `docs/*.jpeg` (Stock por Ubicación, Saldo de Bins, Stock Bins en Cámaras, Stock Bins y Mat. en Planta).

## Para agregar un reporte
1. Crear `app/(app)/reportes/<slug>/page.tsx` copiando uno similar.
2. Agregar tarjeta en `reportes/page.tsx` (id usado también por `reportSettings`).
3. Documentarlo en esta tabla.
