# Manual de Usuario - FrigoManager

## 1. Introducción

Bienvenido a **FrigoManager**, la solución integral para la gestión de frigoríficos, optimizada para la temporada de cerezas y la administración de servicios a terceros. Este manual detalla el funcionamiento de cada módulo, desde la recepción de materiales hasta el despacho final.

---

## 2. Acceso y Seguridad

### 2.1. Inicio de Sesión
- **Credenciales**: Acceda con su correo y contraseña asignada.
- **Modo Invitado**: Permite explorar las visualizaciones de stock sin permisos de escritura.

### 2.2. Perfiles y Permisos
El sistema utiliza perfiles (Maestro, Gruero, Ejecutivo, etc.) que limitan el acceso a módulos específicos. 
- **ADMINISTRADOR**: Único perfil con acceso a herramientas de "Limpieza de Historial", "Importación de Saldos Iniciales" y "Cargas Históricas" en los reportes.

---

## 3. Dashboard Ejecutivo

El centro de control de la planta.
- **Filtros**: Permite filtrar toda la estadística por un rango de fechas y por Cliente específico (SUBSOLE, MEYER, FALL CREEK, etc.).
- **KPIs en Tiempo Real**:
    - **Total Bins en Cámara**: Stock físico actual de fruta.
    - **Total Bins Vacíos**: Disponibilidad de bins para entrega a productores.
    - **Procesos**: Cantidades en Hidrocooler y pendientes de almacenamiento.
- **Gráficos**: Visualice los kilos netos recepcionados por exportador y el porcentaje de ocupación de las 6 cámaras de frío.

---

## 4. Módulo Cereza (Flujo Principal)

### 4.1. Bins y Materiales
Gestión del inventario de materiales vacíos.
- **Entradas**: Registro de ingreso de materiales. Al ingresar Bins, el sistema sugiere automáticamente la cantidad de Totes y Láminas (proporción 1:24).
- **Salidas**: Genera una solicitud de salida. Si existen los datos en "Datos Matriz", se crea un documento **DTE (Guía de Despacho)** pendiente en la pestaña correspondiente.
- **Despacho Directo**: Permite registrar movimientos del exportador al productor que no tocan el stock físico del frigorífico.
- **Stock**: Consulta de saldos por exportador. (Herramientas de importación reservadas para el Administrador).

### 4.2. Recepción de Fruta
- **Creación de Lote**: Registro inicial con Guía, Variedad y cantidad de Bins.
- **Pesaje**: Calculadora integrada para ingresar pesos parciales. El sistema calcula automáticamente el **Peso Neto** descontando la tara del bin (65kg) y ajustando por totes.
- **Temperaturas**: Registro de T° Pre-Hidro y Post-Hidro. Al registrar la T° Post-Hidro, el lote se cierra en recepción.

### 4.3. Hidrocooler
- **Procesamiento**: Permite dividir lotes grandes en cargas específicas para Hidrocooler 1 o 2.
- **Gestión**: Posibilidad de editar la cantidad de bins en proceso (el sistema ajusta el saldo pendiente automáticamente).

### 4.4. Cámaras de Frío
- **Almacenamiento**: Asignación de coordenadas (A1, B2, etc.).
- **Estrategias**: 
    - *Secuencial*: Llena la cámara por orden alfabético.
    - *FIFO (Serpiente)*: Optimiza el flujo de aire y la salida, moviéndose en zigzag por los pasillos.
- **Mapa Visual**: Grilla interactiva con colores por lote. Permite la **Reubicación** rápida de coordenadas completas.
- **Carga Externa**: Importación de lotes procesados en otros frigoríficos que entran directo a cámara.

### 4.5. Despachos
- **FIFO Automático**: El sistema selecciona los lotes más antiguos del cliente hasta completar la cantidad solicitada.
- **Despacho Manual**: El usuario elige coordenadas específicas desde una tabla filtrable por Variedad y Cámara.
- **Picking**: El "Gruero" debe confirmar físicamente cada ubicación en la app para rebajar el stock. Permite generar un PDF de la hoja de ruta.

---

## 5. Socios Comerciales y Otros Clientes

### 5.1. Flujo de Fruta y Embalajes de Terceros
Módulo diseñado para clientes como **FALL CREEK** o servicios de frío externos.
1. **Recepción**: Registro de artículos (Pallets o Bins) con opción de lectura de códigos de barra.
2. **Almacenamiento**: Ubicación en Almacenes/Pasillos (Embalaje) o Cámaras/Coordenadas (Fruta).
3. **Picking**: Proceso de validación de salida para descontar inventario.

### 5.2. Portal Especial Fall Creek
Interfaz optimizada para selección masiva.
- **Layout Pareado**: Estrategia de almacenamiento en pares de coordenadas.
- **Selección por Arrastre**: Permite seleccionar múltiples coordenadas con el mouse/dedo para generar pre-despachos rápidamente.
- **Ventana Flotante**: Resumen de selección que se puede mover para no obstruir la vista del mapa de cámaras.

---

## 6. Reportes y Kardex

### 6.1. Kardex de Movimientos (Bins y Materiales)
Reporte maestro que consolida:
- Entradas/Salidas manuales.
- Ingresos automáticos de fruta a cámara (Entradas).
- Despachos confirmados a packing (Salidas).
- *Nota: El Administrador puede cargar saldos iniciales históricos en formato DD-MM-YYYY.*

### 6.2. Saldo de Bins y Mat. Entregados
Visualización agrupada y contraída.
- Muestra el saldo total (ej: "500 Bins") en la cabecera.
- Permite expandir para ver el detalle por código de producto.
- Incluye un **Total General** al final del reporte.

### 6.3. Otros Reportes
- **Permanencia**: Días que la fruta de terceros lleva en cámara (ideal para facturación).
- **Temperaturas**: Historial de mediciones térmicas por cámara.
- **Stock por Ubicación**: Mapa plano de dónde está cada cosa.

---

## 7. Datos Maestros

Configuración central del sistema:
- **Exportadores y Productores**: Relaciones N:N y estados activo/inactivo.
- **Usuarios y Perfiles**: Configuración de acceso granular a módulos y pestañas.
- **Datos Matriz**: Información legal de la empresa para la generación de DTEs.
- **Configuración de Bodega**: Definición de Almacenes, Pasillos y capacidades de Hidrocooler.

---

## 8. Consejos de Uso y PWA

- **Instalación**: En dispositivos móviles, use el botón "INSTALAR APP" para usar FrigoManager como una aplicación nativa, mejorando la velocidad y permitiendo el uso de la cámara para escaneo.
- **Offline**: La aplicación mantiene datos básicos en caché, pero requiere conexión para sincronizar movimientos con la base de datos central.
- **Limpieza de Datos**: Antes de iniciar una nueva temporada, el administrador debe usar las funciones de "Limpiar Stock" y "Limpiar Historial" para comenzar desde cero.
