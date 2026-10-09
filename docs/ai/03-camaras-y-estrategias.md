# 03 · Cámaras, coordenadas y estrategias de llenado

Archivos: `src/lib/chambers-config.ts` (estática), `src/lib/utils.ts` (orden de coordenadas), colección `chamberSettings` (dinámica), `clientStorageConfigs` (por cliente).

## Cámaras
| Cámara | Columnas | Filas | Capacidad base | Notas |
|---|---|---|---|---|
| CAMARA-1..3 | A–J (10) | 1–14 | 800 | Filas 13-14 bloqueadas por defecto |
| CAMARA-3 | + K, L opcionales | | +160 | Si `chamberSettings/CAMARA-3.colsKLEnabled` |
| CAMARA-4..6 | A–O (15) | 1–14 | 1500 | Filas 13-14 bloqueadas por defecto |

- Coordenada = `Columna + Fila` (`A1`, `K12`). Ordenar siempre con `naturalSort`.
- **Filas comodín 13-14**: si `row13Enabled`, se desbloquean solo en las columnas de `getAllowedComodinCols()` (chicas: A,B,C,H,I,J; grandes: A,B,C,M,N,O; cámara 3 incluye D,E y K,L si aplica). F-G (o centro) es pasillo.
- **Siempre** usar `getEffectiveChamberConfig(chambersConfig[id], chamberSettings)` antes de dibujar o asignar.
- `exporterChamberAssignments` (hardcode): SUBSOLE → C2, C3; MEYER → C3, C6; BLOSSOM → C3, C5.

## Estrategias (`getSortedCoordinates(config, strategy)`)
Definen el **orden** en que se sugieren coordenadas libres al almacenar. Se configuran por exportador/cliente (`storageStrategy` en maestro o `clientStorageConfigs`).

| Estrategia | Orden |
|---|---|
| `secuencial` | Columna por columna, fila 1→N |
| `inverted-secuencial` | Columna por columna, fila N→1 (desde el fondo) |
| `fifo` | Zigzag (serpiente): A baja, B sube, C baja… |
| `horizontal-secuencial` | Fila por fila, A→última columna |
| `aisle-access` | Bloque A–E y luego H–L/O, saltando pasillo F–G |
| `pareado` | Por pares de columnas (A,B), (C,D)… — legado Fall Creek |
| `serpentina-vertical` | Bloque norte (A–E) y sur (L–H) en serpentina fondo↔puerta |
| `modelo-sof` | Columnas pares fondo→puerta, impares puerta→fondo |
| `fifo-vertical` | Todas las columnas fondo→puerta |

Simulaciones HTML de referencia en la raíz: `Fifo- Vertical.html`, `serpentina-vertical.html`, `Modelo_SOF.html`, `Simulacion_llenado.html`, `Fall Creek V2.html`, `docs/Almacenamiento Secencial 13 y 14.html`.

> Si agregas una estrategia: actualizar el union type en **3 lugares** de `types.ts` (`Exporter`, `OtherClient`, `ClientStorageConfig`), la firma de `getSortedCoordinates`, el selector en `ClientStorageConfigDialog.tsx` / Datos Maestros, y esta tabla.

## Ocupación de una coordenada
No existe un documento "coordenada". La ocupación se **calcula** uniendo (tipo `StoredItem`):
- `chamberLots` con `status: 'Almacenado'` (cereza), y
- ítems de `otherFruitReceptions` con `status: 'Almacenado'` y `storageLocation.chamberId/coordinate` (socios, Fall Creek, Vitafood en cámara).

Capacidad por coordenada: `binsPerCoordinate` / `palletsPerCoordinate` del cliente. Equivalencias usadas en conteos: Fall Creek pallet = 3 bins; pallet genérico = 2; bin = 1 (ver `ReceptionTab.tsx` y `lib/telegram.ts`).

Pantallas que calculan esto (cambiar la lógica en una implica revisar las otras):
`camaras/page.tsx`, `other-fruit/StorageTab.tsx`, `StoreOtherFruitDialog.tsx`, `RelocateOtherFruitDialog.tsx`, `camaras/RelocateLotDialog.tsx`, `hidrocooler/StoreInChamberDialog.tsx`, `fall-creek/page.tsx`, `packaging/ReceptionTab.tsx`, `packaging/RelocatePackagingDialog.tsx`, `reportes/stock-bins-camaras`.

> Mejora pendiente sugerida: extraer un único `computeChamberOccupancy()` en `lib/` y reutilizarlo en todas.
