# 90 · Deuda técnica y riesgos conocidos

Ordenado por prioridad sugerida. Al resolver uno, moverlo a la bitácora.

## 🔴 Seguridad
1. **`firestore.rules` abierto** (`allow read, write: if true`). Cualquiera con el `apiKey` (público en `src/firebase/config.ts`) puede leer/borrar toda la BD. Mínimo: `request.auth != null`; ideal: reglas por perfil.
2. **Login anónimo + fallback "sin perfil = acceso total"** en `layout.tsx`. Un usuario anónimo ve y opera todo.
3. **Signup abierto** en `login/page.tsx` (`createUserWithEmailAndPassword`).
4. **Admin por email hardcodeado** en 4 archivos (ver 01-arquitectura). Mover a un flag en `profiles` (p.ej. `isAdmin`).
5. `service-account.json` y scripts `scratch*` en la carpeta del proyecto (están en `.gitignore`, pero mantenerlos fuera del repo/zip que se comparta).

## 🟠 Rendimiento / costo (causa probable de lentitud)
6. `useFirestoreCollection` escucha **colecciones completas** sin `where`/`limit`. Dashboard, Cámaras y Fall Creek abren muchas a la vez. Con temporadas acumuladas crece lineal. Opciones: filtrar por `status` activo, por temporada/fecha, o archivar temporadas cerradas.
7. Cálculo de ocupación de cámaras duplicado en ~10 archivos (ver 03). Extraer a `lib/occupancy.ts`.

## 🟡 Mantenibilidad (causa de que las mejoras tomen mucho tiempo)
8. **Archivos gigantes**: `fall-creek/page.tsx` (2.471), `VitafoodReceptionWorkflow.tsx` (1.856), `camaras/page.tsx` (1.533), `VitafoodDispatchTab.tsx` (1.487), `other-fruit/ExitTab.tsx` (1.361), `dashboard/page.tsx` (1.330). Partir por tab/diálogo cuando se toquen.
9. **Lógica por cliente hardcodeada por nombre** (`'FALL CREEK'`, `includes('VITAFOOD')`, multiplicador pallet 3/2/1) repartida en ≥15 archivos. Centralizar en `lib/clients.ts` (`isFallCreek(client)`, `isVitafood(client)`, `unitsPerPallet(client)`) o en un campo `workflow` de `otherClients`.
10. Union type de estrategias repetido 4 veces (`types.ts` ×3 + `utils.ts`). Definir `type StorageStrategy` una vez.
11. `next.config.ts` con `ignoreBuildErrors` y `ignoreDuringBuilds`: el build nunca falla por TS. Correr `npm run typecheck` siempre.
12. Duplicado `src/components/hidrocooler/page.tsx` vs `src/app/(app)/hidrocooler/page.tsx`.
13. Referencias por `itemIndex` en `items[]` (frágil). A futuro: ítems con id propio.
14. Cereza: picking total **borra** el `chamberLot` (se pierde traza; el status `Despachado` existe pero no se usa ahí).
15. Restos de plantilla: `README.md` de Firebase Studio, `docs/backend.json`, `mock-chamber5.ts`, `query_cam6_direct.ts`, `firebase/firestore/use-collection.tsx` casi sin uso, archivos vacíos `git` y `main` en la raíz.
16. Modelo Genkit `gemini-1.5-flash` (antiguo); evaluar actualizar si falla la lectura de manifiestos.
17. Raíz del proyecto mezclada con archivos de negocio (xlsx, mp4, html de simulación). Sugerido moverlos a `docs/negocio/` y `docs/simulaciones/`.
