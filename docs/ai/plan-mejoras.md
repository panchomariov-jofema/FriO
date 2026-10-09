# Plan de mejoras FriO — ventana de fin de semana

> Para el agente (Antigravity): ejecuta **una mejora a la vez**, en el orden de la lista. No pases a la siguiente sin que la anterior esté probada. Lee `CLAUDE.md` y el doc del módulo antes de cada una.

## Reglas de la ventana (no negociables)
1. **Paso 0 obligatorio: respaldo** de Firestore antes de tocar nada (ver A0).
2. **No modificar ni borrar documentos de `usersMaster` ni `profiles`.** Usuarios, perfiles y permisos deben quedar exactamente como están. Solo se permite *agregar* campos nuevos opcionales si la mejora lo indica.
3. No cambiar estructura de `items[]`, `status` existentes ni nombres de colecciones.
4. Una rama git por mejora (`mejora/A1-reglas`, etc.) y un commit por mejora con mensaje claro.
5. Tras cada mejora: `npm run typecheck`, prueba manual con los 3 tipos de usuario (normal, gruero, invitado) y línea en `docs/ai/99-bitacora.md`.
6. Si algo falla y no se resuelve en 30 min: revertir (`git revert` / redeploy de la versión anterior) y seguir con la siguiente.
7. Antes del lunes 8:00 la app desplegada debe estar estable. Si hay duda, **no desplegar**.

---

## 🔴 ALTA

### A0 · Respaldo completo de Firestore
- `gcloud firestore export gs://<bucket>/backup-AAAA-MM-DD --project=frigomanagerm1-96752421-f2f17` (requiere bucket y facturación activa).
- Alternativa si no hay bucket: script con service account que exporte cada colección a JSON local (en `scratch/`, que está en `.gitignore`).
- **Criterio de éxito:** existe respaldo de todas las colecciones, incluidas `usersMaster` y `profiles`.

### A1 · Cerrar la base de datos a usuarios no autenticados
- **Por qué:** `firestore.rules` tiene `allow read, write: if true`; cualquiera con la apiKey pública puede leer o borrar todo.
- **Qué hacer:** cambiar a `allow read, write: if request.auth != null;` y desplegar **solo reglas**: `firebase deploy --only firestore:rules`.
- **No afecta** a usuarios existentes ni a invitados (el login anónimo también queda autenticado). Los scripts con service account no se ven afectados.
- **Verificar antes:** que ninguna pantalla lea Firestore antes de iniciar sesión (revisar `app/login/page.tsx` y `app/page.tsx`).
- **Prueba:** login normal, gruero e invitado → recorrer Recepción, Cámaras, Socios (almacenar + picking), Fall Creek, Embalajes/Vitafood, un reporte, Datos Maestros.
- **Rollback:** volver a la regla anterior y `firebase deploy --only firestore:rules` (efecto inmediato).

### A2 · Modelo de IA retirado (lectura de manifiestos)
- **Por qué:** `src/ai/genkit.ts` usa `gemini-1.5-flash`, modelo retirado por Google (sept-2025). La lectura por IA de PDF/imagen (Vitafood y Fall Creek) probablemente falla hoy; la carga por Excel no depende de esto.
- **Qué hacer:** probar primero `parseVitafoodManifestAIAction` con un PDF real. Si falla, cambiar `defaultModel` a un modelo Gemini Flash vigente según la documentación actual de Google (verificar nombre exacto y fecha de retiro) en ambas ramas (googleai y vertexai). No tocar los prompts ni los schemas de salida.
- **Prueba:** subir un PDF de orden Vitafood y un manifiesto Fall Creek; comparar filas extraídas contra el documento.

### A3 · Velocidad: pantallas operativas leen solo stock vivo
- **Por qué:** Fall Creek mantiene 3.500+ bins almacenados y Vitafood crecerá igual; `useFirestoreCollection` descarga colecciones completas (incluidos despachados y cerrados) en cada pantalla.
- **Qué hacer:**
  1. Crear un hook nuevo `useFirestoreQuery(collection, constraints)` (no modificar `useFirestoreCollection`, que usan los reportes).
  2. **Verificar primero** cómo se actualiza el `status` de cabecera de `otherFruitReceptions` al despachar todos sus ítems (¿pasa a `Despachado`/`Cerrado`?). Solo si es consistente, en pantallas **operativas** (Cámaras, Socios → Almacenamiento/Stock/Salidas, Fall Creek → storage/stock, Vitafood despacho) filtrar con `where('status', 'not-in', ['Despachado', 'Cerrado'])`.
  3. `chamberLots`: filtrar `where('status', 'in', ['Pendiente por Almacenar', 'Almacenado'])` en pantallas operativas.
  4. **Los reportes y kardex NO se tocan** (necesitan historia).
- **Prueba:** los conteos de stock por cliente/cámara antes y después deben ser **idénticos** (anotar los números antes del cambio).
- Si la verificación del punto 2 no es concluyente, dejar `otherFruitReceptions` sin filtrar y hacer solo `chamberLots`.

---

## 🟠 MEDIA

### M1 · Admin por perfil en vez de email hardcodeado
- Hoy: `user?.email === 'francisco.villarreal@outlook.es'` en `bins-y-materiales/page.tsx`, `bins-materials/StockTab.tsx`, `reportes/page.tsx`, `reportes/kardex-bins-materiales/page.tsx`.
- Hacer: crear `lib/auth-utils.ts → isAdminUser(user, profile)` que devuelva `true` si el email es el actual **o** si el perfil tiene `isAdmin: true` (campo nuevo opcional). Reemplazar las 4 comparaciones. No modificar perfiles existentes.

### M2 · Diferencia de 1 bin en despacho 22-09
- `ERROR DESPACHO 22.09.txt`: "bins sale 12783 / 12784". Revisar el despacho de esa fecha (dispatches + chamberLots + binMaterialMovements) y documentar la causa. **Solo diagnóstico**, no corregir datos sin confirmación del dueño.

### M3 · Centralizar detección de clientes especiales
- Crear `lib/clients.ts` con `isFallCreek(x)`, `isVitafood(x)`, `binsPerUnit(client, unit)` (FC pallet = 3, pallet = 2, bin = 1) replicando **exactamente** las condiciones actuales.
- Reemplazar usos en los ≥15 archivos (`grep -rn "FALL CREEK\|VITAFOOD\|fallcreek" src`). Comportamiento idéntico; es refactor puro.

### M4 · Cálculo único de ocupación de cámaras
- Extraer `lib/occupancy.ts → computeChamberOccupancy(chamberLots, otherFruitReceptions, chamberSettings, configs)` y usarlo en las pantallas listadas en `03-camaras-y-estrategias.md`. Hacer de a una pantalla y comparar el mapa antes/después.

### M5 · Eliminar duplicado de Hidrocooler
- `src/components/hidrocooler/page.tsx` es copia divergente de `src/app/(app)/hidrocooler/page.tsx`. Confirmar con grep que nadie lo importa y eliminarlo.

### M6 · Registro abierto e invitados con acceso total (solo análisis)
- `login/page.tsx` permite crear cuentas; `layout.tsx` da acceso total a usuarios sin perfil o anónimos.
- **Esta ventana: solo análisis.** Listar en Firebase Auth qué usuarios son anónimos y si algún operador real trabaja como invitado. Entregar propuesta; **no cambiar** el comportamiento hasta que el dueño decida.

---

## 🟢 BAJA

### B1 · Tipo único `StorageStrategy`
- Definirlo una vez en `types.ts` y usarlo en `Exporter`, `OtherClient`, `ClientStorageConfig` y `getSortedCoordinates`.

### B2 · Errores de TypeScript
- Correr `npm run typecheck`, listar errores y corregir los triviales. Mantener `ignoreBuildErrors` hasta llegar a 0 errores.

### B3 · Cereza: no borrar `chamberLots` al despachar
- Hoy `handleConfirmProducerFruitExit` borra el lote al quedar en 0. Alternativa: `status: 'Despachado'` con `binCount: 0`. **Riesgo:** todas las pantallas que leen `chamberLots` deben ignorar `Despachado`. Hacer solo después de A3 y M4.

### B4 · Partir archivos gigantes
- Empezar por `fall-creek/page.tsx`: extraer cada tab a `components/fall-creek/<Tab>.tsx` sin cambiar lógica. Luego `camaras/page.tsx`, `VitafoodReceptionWorkflow.tsx`.

### B5 · Limpieza del proyecto
- Mover archivos de negocio de la raíz a `docs/negocio/` (xlsx, jpeg, mp4) y simulaciones HTML a `docs/simulaciones/`. Borrar archivos vacíos `git` y `main`. Reemplazar `README.md` de plantilla por uno que apunte a `CLAUDE.md`. Eliminar `mock-chamber5.ts` y `query_cam6_direct.ts` si nadie los importa.

---

## Orden sugerido para el fin de semana
**Sábado:** A0 → A1 → A2 → A3.  **Domingo:** M5 → M1 → M3 → M2/M6 (análisis). Lo de BAJA solo si sobra tiempo.
**Domingo noche:** prueba completa con los 3 tipos de usuario y deploy final.
