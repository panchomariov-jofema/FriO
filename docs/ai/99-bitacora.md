# 99 · Bitácora de cambios y decisiones

Formato: `AAAA-MM-DD · módulo · qué cambió (archivos) · por qué`. Lo más nuevo arriba. 1–3 líneas por entrada.

- 2026-10-10 · optimizacion · A3: Creación de hook `useFirestoreQuery` (`hooks/use-firestore-query.ts`) para consultar sólo stock vivo de `chamberLots` en pantallas operativas (`despachos/page.tsx`, `other-fruit/PickingTab.tsx`, `other-fruit/StorageTab.tsx`). Se preserva `otherFruitReceptions` intacto tras verificar inconsistencia de status de cabecera en BD. Reportes y kardex no tocados.
- 2026-10-10 · seguridad · A1: Regla de Firestore actualizada a `allow read, write: if request.auth != null;` (`firestore.rules`). Base de datos protegida contra accesos no autenticados; usuarios, perfiles y permisos intactos al 100%.
- 2026-10-10 · backup · A0 completado y verificado: respaldo íntegro de 29 colecciones de Firestore (4.735 documentos totales, incluidos usersMaster y profiles) con hashes SHA256 y conteos de referencia (`scratch/backups/`, `scratch/conteos_A0.json`, `scratch/conteos_A0.md`).
- 2026-10-10 · docs · Decisión del dueño: se mantiene `gemini-1.5-flash` (no tocar). Se refuerza regla de cero pérdida de datos: respaldo + conteos antes y después de cada mantención (`plan-mejoras.md`, `CLAUDE.md`).
- 2026-10-08 · camaras · Colores únicos deterministas por código de producto para Vitafood en mapa de cámaras (`vitafood-colors.ts`, `vitafood-catalog.json`, `camaras/page.tsx`, `types.ts`): cada producto tiene un color no repetible (ej. azul para ENV CAJA EXHIBIDORA CHERRIES 40 LB V1), coordenadas con más de un producto se renderizan multicolor con degradado compartido y se agrega leyenda de productos presentes.
- 2026-10-08 · reportes · Corrección de crash en reporte Kardex Fruta Clientes (`kardex-fruta-otros-clientes/page.tsx`, `vitafood-utils.ts`): ordenamiento con `safeToMillis` y sanitización en `cleanFirestoreObject` para preservar instancias de Firestore (`serverTimestamp`); se reparan timestamps en BD sin pérdida de datos.
- 2026-10-08 · embalajes · Se implementa cierre de recepciones con faltantes ("No Recepcionado"), auditoría de usuarios y fechas por UMP (`types.ts`, `VitafoodReceptionWorkflow.tsx`, `ReceptionTab.tsx`) y nuevo reporte de auditoría `reportes/trazabilidad-ump`.
- 2026-10-08 · camaras · Se habilitan coordenadas D13, D14, E13, E14 y columnas auxiliares K y L para Cámara 3 (`chambers-config.ts`, `ChamberLayoutView.tsx`, dialogs).
- 2026-10-08 · docs · Se crea `CLAUDE.md` + `docs/ai/` (arquitectura, modelo de datos, cámaras, módulos, deuda técnica) y `.agents/rules/frio-context.md` para acelerar mejoras con IA.

## Pendientes conocidos
- `ERROR DESPACHO 22.09.txt`: "bins sale 12783 / 12784" — revisar diferencia de 1 bin en despacho del 22-09.
