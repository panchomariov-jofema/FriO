# Módulo · Datos Maestros

Ruta: `/datos-maestros` (`app/(app)/datos-maestros/page.tsx`, ~1.150 líneas). CRUD genérico con `components/master-data/MasterDataShell.tsx` (tabla + diálogo + import/export CSV por `csvHeaders`).

| Tab | Colección | Formulario/schema |
|---|---|---|
| Exportadores | `exporters` | `exporterSchema` |
| Productores | `producers` | `producerSchema` (multi-exportador) |
| Bins/Materiales | `binMaterials` | `binMaterialSchema` |
| Otros Clientes | `otherClients` | `otherClientSchema` (tipo + unidad) |
| Embalajes (productos) | `packagingMaster` | `packagingMasterSchema` |
| Almacenes / Pasillos (Emb.) | `warehouses`, `aisles` | |
| Packings | `packings` | |
| Usuarios | `usersMaster` | `userName` = parte local del email de login |
| Perfiles | `profiles` | `ModulePermissionsSelector.tsx` (módulos + tabs) |
| Hidro-coolers | `hidrocoolers` | |
| Datos Matriz | `businessEntities` | Emisor de DTE |
| Generar Etiquetas | — | Etiquetas/QR (ver también `docs/generador_etiquetas.html`, `docs/etiquetas.py`) |
| Telegram | `settings/telegram` | `TelegramSettings.tsx` |

## Gotchas
- `MasterDataShell` tiene valores de ejemplo con nombres de clientes reales (SUBSOLE, MEYER, BLOSSOM, Fall Creek).
- `modulesAccess` puede venir como array, JSON string o CSV (datos legados); `ModulePermissionsSelector` normaliza.
- Renombrar un cliente especial (FALL CREEK / VITAFOOD) desactiva su lógica específica.
- Agregar un campo a un maestro: tipo en `types.ts` + schema en `schemas.ts` + `columns`/`csvHeaders` en `datos-maestros/page.tsx`.
