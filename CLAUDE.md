# FriO (FrigoManager) — Contexto para agentes IA

> Léeme primero. Este archivo es el índice. El detalle vive en `docs/ai/`.
> Regla de oro: **lee solo el doc del módulo que vas a tocar**, no todo el repo.

## Qué es
WMS para un **frigorífico de fruta** (Chile). Gestiona:
1. **Flujo Cereza** (exportadoras: SUBSOLE, MEYER, BLOSSOM…): Bins y Materiales → Recepción → Hidrocooler → Cámaras → Despachos.
2. **Socios Comerciales** (servicio de frío a terceros, bins o pallets).
3. **Embalajes / Vitafood** (pallets por UMP, almacenes y pasillos).
4. **Fall Creek** (plantas en bins/pallets, portal propio, manifiestos PDF/Excel, Telegram).

Nombre interno en código: `FrigoManager` (migrado desde Firebase Studio a Antigravity).

## Stack
- Next.js 15 (App Router, `src/app/(app)/…`), React 18, TypeScript, Tailwind + shadcn/ui (`src/components/ui` — no tocar salvo necesidad).
- Firebase: Firestore (cliente, tiempo real con `onSnapshot`), Auth (email/clave + anónimo). Deploy en **Firebase App Hosting** (`firebase deploy`, backend `frigomanager`).
- Genkit + Gemini (`src/ai/`) para leer manifiestos (Vitafood, Fall Creek) vía Server Actions.
- `xlsx`, `jspdf`, `unpdf`, `html5-qrcode`, `qrcode`, `recharts`, `zod`, `date-fns`.
- PWA (`public/sw.js`, `manifest.json`). Uso intenso en móvil (gruero / escaneo).

## Comandos
```
npm run dev        # puerto 9002
npm run typecheck  # ÚNICA verificación real: next.config ignora errores TS y ESLint en build
npm run build
firebase deploy    # App Hosting. NO usar Firebase Hosting ni apphosting:backends:create
```

## Mapa de módulos → doc a leer
| Módulo (ruta) | Doc | Archivos principales |
|---|---|---|
| Arquitectura, auth, permisos, patrones | `docs/ai/01-arquitectura.md` | `app/(app)/layout.tsx`, `firebase/*`, `hooks/*` |
| Modelo de datos (colecciones y estados) | `docs/ai/02-modelo-datos.md` | `lib/types.ts`, `lib/schemas.ts` |
| Cámaras, coordenadas, estrategias de llenado | `docs/ai/03-camaras-y-estrategias.md` | `lib/chambers-config.ts`, `lib/utils.ts` |
| Flujo Cereza (`/bins-y-materiales`, `/recepcion`, `/hidrocooler`, `/camaras`, `/despachos`) | `docs/ai/modulos/cereza.md` | `components/{bins-materials,reception,hidrocooler,camaras,dispatch}` |
| Socios Comerciales (`/otros-hortofruticolas`) | `docs/ai/modulos/socios-comerciales.md` | `components/other-fruit/*` |
| Embalajes + Vitafood (`/embalajes`) | `docs/ai/modulos/embalajes-vitafood.md` | `components/packaging/*`, `VitafoodReceptionWorkflow.tsx`, `lib/vitafood-utils.ts` |
| Fall Creek (`/fall-creek`) | `docs/ai/modulos/fall-creek.md` | `app/(app)/fall-creek/page.tsx`, `FallCreekReceptionWorkflow.tsx`, `lib/fall-creek-*.ts`, `lib/telegram.ts` |
| Reportes (`/reportes/*`) | `docs/ai/modulos/reportes.md` | `app/(app)/reportes/*` |
| Datos Maestros (`/datos-maestros`) | `docs/ai/modulos/datos-maestros.md` | `components/master-data/*` |
| Deuda técnica y riesgos conocidos | `docs/ai/90-deuda-tecnica.md` | — |
| Bitácora de cambios/decisiones | `docs/ai/99-bitacora.md` | — |

## Reglas de trabajo (obligatorias)
1. **Cambios mínimos y quirúrgicos.** Los archivos son enormes (fall-creek/page.tsx ~2.500 líneas, VitafoodReceptionWorkflow ~1.900). Edita la función puntual; no reescribas el archivo.
2. **Antes de editar**, busca con grep el nombre de la colección/función y revisa *todos* los lectores. Una colección como `otherFruitReceptions` la leen 20+ archivos (ver `02-modelo-datos.md`).
3. **El stock NO está en una colección de saldos**: se deriva de documentos (status de lotes/ítems, `storageLocation`, movimientos). Cambiar un `status` o la forma de `items[]` rompe stock, reportes y mapas de cámara.
4. **Escrituras multi-documento** (picking, despacho, reubicación, ajustes) van en `writeBatch` / `runTransaction`. Mantener ese patrón.
5. Antes de escribir en Firestore pasar objetos por `cleanFirestoreObject` (`lib/vitafood-utils.ts`) — Firestore rechaza `undefined`.
6. Fechas: usar `safeToDate`, `safeToMillis`, `safeFormatDate` (`lib/utils.ts`); hay datos mezclados `Timestamp`/`Date`/string.
7. Coordenadas: ordenar con `naturalSort`; config efectiva de cámara siempre vía `getEffectiveChamberConfig(config, chamberSettings)`.
8. Clientes especiales se detectan por **nombre** (`'FALL CREEK'`, `includes('VITAFOOD')`). No renombrar esos clientes en Datos Maestros. Si agregas lógica nueva por cliente, centralízala (ver deuda técnica).
9. Correr `npm run typecheck` al terminar (el build no avisa errores).
10. **Nunca** mostrar/commitear `.env.local`, `service-account.json`, ni tokens de Telegram (`settings/telegram`).
11. Al terminar una mejora: agregar 1–3 líneas en `docs/ai/99-bitacora.md` y actualizar el doc del módulo si cambió un flujo, estado o colección.

## Archivos que NO son la app (ignorar salvo pedido)
`scratch/`, `scratch_*.js` (scripts admin con service account), `*.html` de simulación en raíz y `docs/` (layouts, QRs, manuales), `*.xlsx`, `*.mp4`, `docs/backend.json` (blueprint viejo de Firebase Studio, **no** refleja la BD real), `src/lib/mock-chamber5.ts`, `src/firebase/query_cam6_direct.ts`.

## Idioma
UI, mensajes y docs en **español (Chile)**. Código y nombres de variables en inglés, como está.
