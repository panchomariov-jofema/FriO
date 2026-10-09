# 01 · Arquitectura

## Estructura de carpetas
```
src/
  app/
    login/page.tsx            # email/clave (crea cuenta en modo signup) + "Modo invitado" (anónimo)
    (app)/layout.tsx          # shell: sidebar, permisos por perfil, badges de pendientes, tabs móviles
    (app)/<modulo>/page.tsx   # una ruta por módulo (ver CLAUDE.md)
    (app)/<modulo>/actions.ts # Server Actions ('use server') → Genkit
  components/<modulo>/        # tabs y diálogos de cada módulo
  components/ui/              # shadcn (no modificar)
  firebase/                   # init, provider, useCollection/useDoc, errores
  hooks/                      # useFirestoreCollection + filtros por exportador/cliente
  contexts/PermissionsContext.tsx
  lib/                        # tipos, zod schemas, utilidades, config de cámaras, parsers, telegram
  ai/                         # genkit.ts + flows (vitafood-ai, fall-creek-ai, insights)
```

## Firebase
- `firebase/index.ts → initializeFirebase()`: **no modificar** (App Hosting inyecta config; fallback a `firebase/config.ts`).
- Proyecto: `frigomanagerm1-96752421-f2f17`. Backend App Hosting: `frigomanager` (`maxInstances: 1`).
- Secret `GOOGLE_GENAI_API_KEY` en `apphosting.yaml`; sin key, Genkit cae a Vertex AI.
- Todo el acceso a datos es **desde el cliente**. No hay Cloud Functions ni backend propio; las únicas server actions son para IA.

## Lectura de datos
- Patrón dominante: `useFirestoreCollection<T>('coleccion')` (`hooks/use-firestore-collection.ts`) → `onSnapshot` de **la colección completa, sin filtros**. Usado en ~50 archivos.
  - Implicancia: cada pantalla descarga colecciones completas (p.ej. `otherFruitReceptions`). Al crecer la data esto es el principal costo/lentitud. Para nuevas consultas grandes preferir `query(... where ...)`.
- Hooks filtrados: `use-producers-by-exporter`, `use-bin-materials-by-exporter`, `usePackagingMastersByClient`, `use-packings-by-exporter`.
- `firebase/firestore/use-collection.tsx` / `use-doc.tsx` (plantilla Firebase Studio) existen pero casi no se usan.

## Escritura
- `addDoc/updateDoc/deleteDoc` directos para operaciones simples.
- `writeBatch` / `runTransaction` en flujos multi-documento (picking, despachos, reubicaciones, ajustes, kardex, recepción cereza). Mantener atomicidad.
- `cleanFirestoreObject()` para eliminar `undefined` antes de escribir.
- Auditoría: la mayoría de documentos guardan `userId`, `userName`, `createdAt` (serverTimestamp).

## Autenticación y permisos
1. Login con email/clave o anónimo (`signInAnonymously`).
2. `layout.tsx` toma la parte local del email (`juan@x.cl → juan`) y busca en `usersMaster.userName`; con su `profileId` busca en `profiles`.
3. `profiles.modulesAccess: ModulePermission[]`:
   - string = nombre del módulo tal como aparece en el sidebar (`'Dashboard'`, `'Cámaras'`, `'Fall Creek'`…).
   - objeto con `allowedTabs` para módulos con tabs: `Embalajes`, `Socios Comerciales`, `Bins y Materiales` (tabs: `recepcion`, `almacenamiento`, `salidas`, `picking`, `stock`, `entradas`).
   - `{ name: 'Dashboard', fixedExporterId }` fija el dashboard a un exportador.
4. Perfil cuyo `profileId` contiene `grua` → nav reducida de **gruero** (Cámaras + Socios Comerciales).
5. **Sin perfil o anónimo → acceso a todo** (fallback "demo"). Ver deuda técnica.
6. "Admin" está **hardcodeado por email** (`francisco.villarreal@outlook.es`) en: `bins-y-materiales/page.tsx`, `bins-materials/StockTab.tsx`, `reportes/page.tsx`, `reportes/kardex-bins-materiales/page.tsx`. Habilita importación de saldos, limpieza de historial y cargas históricas.
7. Los permisos llegan a las páginas vía `PermissionsContext` (`usePermissions()`).

> Si renombras un módulo en el sidebar (`navStructure` en layout.tsx) **debes** migrar los `modulesAccess` de los perfiles, porque el match es por label.

## Badges / notificaciones
- `layout.tsx` escucha `dispatches`, `otherFruitMovements`, `packagingMovements`, `packagingReceptions`, `otherFruitReceptions` para badges de pendientes en el sidebar.
- Telegram (`lib/telegram.ts`, config en `settings/telegram`): avisos Fall Creek (inicio/fin de almacenamiento de Pallet Log, despacho creado, picking completado). Hora Santiago.

## IA (Genkit)
- `ai/genkit.ts`: modelo `gemini-1.5-flash` (googleai o vertexai).
- `ai/vitafood-ai.ts` → `parseVitafoodVisionFlow` (PDF/imagen de orden SAP Vitafood → header + filas con UMP). Invocado por `otros-hortofruticolas/actions.ts`.
- `ai/fall-creek-ai.ts` (+ `fall-creek/actions.ts`): lectura de manifiestos Fall Creek.
- `ai/insights.ts` → `components/dashboard/AIRecommendations.tsx`.

## UI
- Tema verde (blueprint): primario `#A7D1AB`, fondo `#F0F4F1`, acento `#74B72E`, fuente PT Sans. Fall Creek usa azul `#004b8d`.
- Tablas + diálogos (`Dialog`) para CRUD; tabs por módulo; mapas de cámara como grillas clickeables.
- Escaneo QR/barras: `components/BarcodeScanner.tsx` (html5-qrcode) + feedback de sonido/vibración en Vitafood.
- PDFs con `jspdf` + `jspdf-autotable`; Excel con `xlsx`.
