# FriO — Sistema de Gestión Frigorífica

Aplicación web progresiva (PWA) para la gestión integral de operaciones frigoríficas, recepción, almacenamiento, trazabilidad y despacho de cerezas, socios comerciales (plantas/arándanos Fall Creek) y embalajes (Vitafoods).

## Documentación y Guía del Sistema

Para el mapa de módulos, reglas de desarrollo, arquitectura y operaciones, consulta:
- **[`CLAUDE.md`](./CLAUDE.md)**: Índice maestro del sistema, convenciones y reglas de negocio.
- **[`docs/ai/`](./docs/ai/)**: Documentación técnica detallada de arquitectura, modelo de datos y cámaras.
- **[`docs/manuales/`](./docs/manuales/)**: Manuales operativos y guías de usuario.
- **[`docs/simulaciones/`](./docs/simulaciones/)**: Simuladores visuales de estrategias de llenado de cámaras.
- **[`docs/negocio/`](./docs/negocio/)**: Catálogos, planillas y referencias de clientes.

## Tecnologías Principales
- **Framework:** Next.js (App Router) + React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend / Base de Datos:** Google Firebase (Firestore + Authentication + Firebase App Hosting)
- **Inteligencia Artificial:** Google Genkit (`gemini-1.5-flash`) para extracción de manifiestos y órdenes SAP.
