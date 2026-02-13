# Manual de Usuario - FrigoManager

## 1. Introducción

Bienvenido a FrigoManager, la aplicación para la gestión integral de su frigorífico. Este manual le guiará a través de las funcionalidades clave de cada módulo, desde la gestión de datos maestros hasta la generación de reportes.

---

## 2. Acceso a la Aplicación (Login)

La pantalla de inicio le permite acceder al sistema.

- **Iniciar Sesión**: Ingrese su email y contraseña para acceder con su perfil.
- **Registrarse**: Si es un usuario nuevo, puede crear una cuenta.
- **Ingresar como Invitado**: Permite un acceso de solo lectura o con permisos limitados (ideal para demostraciones).

---

## 3. Dashboard (Panel Ejecutivo)

El Dashboard es la pantalla principal y ofrece una vista general de los indicadores clave (KPIs) y el estado de la operación en tiempo real.

- **Filtros**: Puede filtrar la información por un **rango de fechas** y por **Cliente**. Los clientes disponibles en el filtro son los principales (SUBSOLE, MEYER, BLOSSOM, FALL CREEK, OLMUE). Si no se selecciona un cliente, se muestran los datos de toda la operación.
- **Tarjetas de KPI**:
    - **Total Bins en Cámara (Fruta)**: Cantidad total de bins (o su equivalente en pallets) con fruta actualmente almacenados.
    - **Total Bins Vacíos (Stock)**: Cantidad de bins vacíos disponibles en el inventario del frigorífico.
    - **Bins Pend. de Hidro**: Bins de fruta que han sido recepcionados y están esperando para entrar al proceso de hidrocooler.
    - **Bins en Proceso (Hidro)**: Bins que están actualmente dentro de un hidrocooler.
    - **Pend. por Almacenar en Cámara**: Bins de fruta que ya pasaron por el hidrocooler y están listos para ser ubicados en una cámara.
- **Gráficos**:
    - **Kilos Netos Recepcionados por Exportador**: Muestra el total de kilos de fruta recepcionados, agrupados por cliente exportador.
    - **Ocupación por Cámara**: Representa visualmente el porcentaje de ocupación de cada cámara. Dentro de cada barra, se muestra la cantidad numérica de bins equivalentes que contiene.

---

## 4. Módulos Operacionales

### 4.1. Datos Maestros

Ubicado en `Menú > Datos Maestros`, este es el corazón del sistema donde se configura la información fundamental.

- **Pestañas**: Cada pestaña permite gestionar un tipo de dato: Exportadores, Productores, Bins y Materiales, Otros Clientes, Embalajes, Packing, Usuarios y Perfiles.
- **Crear/Editar**: En cada pestaña, puede crear un nuevo registro usando el formulario de la izquierda o editar uno existente haciendo clic en el icono del lápiz.
- **Importar/Exportar**: Puede realizar una carga masiva de datos mediante archivos CSV. Use el botón "Descargar Plantilla" para obtener el formato correcto.

### 4.2. Bins y Materiales

Gestiona el inventario de bins y materiales de embalaje. Este módulo está optimizado para su uso en dispositivos móviles.

- **Selección Inicial**: Debe seleccionar un Exportador y un Productor.
- **Despacho Directo**: Si marca esta casilla, el movimiento se registrará en el Kardex con la observación "Despacho Directo" pero **no afectará** el stock de su bodega.
- **Pestaña Entradas**: Registra el ingreso de materiales. Al ingresar la cantidad de Bins, el sistema calculará automáticamente la cantidad de Totes y Láminas (proporción 1:24).
- **Pestaña Salidas**: Registra el retiro de materiales para un productor. El **N° de Salida** se genera automáticamente de forma incremental. También cuenta con el cálculo automático de materiales relacionados.
- **Pestaña Stock**: Muestra el inventario actual. Si no selecciona un exportador, muestra el stock de todos.

### 4.3. Recepción

Registra la entrada de fruta al frigorífico.

- **Crear Lote**: Seleccione un Exportador y Productor, luego complete los datos del lote (documento, variedad, cantidad de bins, etc.).
- **Lista de Lotes**: Abajo, verá una tabla con los lotes recepcionados.
    - **Pesar**: Para lotes "Pendiente de Peso", haga clic para abrir la calculadora de peso.
    - **Registrar T°**: Para lotes "Pendiente de Pre-Hidro" o "Post-Hidro", haga clic para ingresar las temperaturas correspondientes. Al registrar la T° Post-Hidro, el lote se considera "Cerrado".
    - **Editar**: El icono del lápiz permite corregir datos como cantidad de bins, pesos y temperaturas.

### 4.4. Hidrocooler

Gestiona el proceso de enfriamiento de la fruta.

- **Lotes Pendientes**: Muestra los lotes que vienen de "Recepción" y esperan ser procesados.
    - **Acción Procesar**: Abre un diálogo para seleccionar un hidrocooler (1 o 2) y la cantidad de bins a procesar. El sistema sugiere una cantidad según el hidrocooler, pero puede ser ajustada.
- **Lotes en Proceso**: Muestra las fracciones de lotes que se están enfriando.
    - **Acción Finalizar Proceso**: Mueve el lote al módulo de "Cámaras" como "Pendiente por Almacenar".
    - **Acción Editar** (lápiz): Permite ajustar la cantidad de bins en un lote que ya está en proceso. La diferencia se suma o resta del lote pendiente original.

### 4.5. Cámaras

Visualiza y gestiona el almacenamiento de fruta en las cámaras de frío.

- **Lotes de Productor Pendientes**: Muestra lotes que terminaron el hidrocooler y esperan ubicación.
    - **Carga Externa**: Permite subir un CSV con lotes procesados externamente, que aparecerán también como pendientes.
    - **Acción Almacenar**: Abre un diálogo para seleccionar la cámara y coordenada de inicio. El sistema sugiere la ubicación más óptima (priorizando completar coordenadas del mismo lote, y luego buscando la primera vacía).
- **Estado de Cámaras**: Un acordeón que muestra cada cámara.
    - **Vista Gráfica**: Al expandir, se ve una grilla con las coordenadas. Los colores representan lotes distintos para una fácil identificación.
    - **Ocupación**: Muestra el porcentaje y la cantidad de bins equivalentes.
    - **Reubicar**: Al hacer clic en una coordenada ocupada, puede mover todo su contenido a otra ubicación vacía.
    - **Limpiar Stock**: El botón de la papelera elimina **todo** el stock de las cámaras (función de desarrollo).

### 4.6. Despachos

Gestiona la salida de fruta para los clientes.

- **Resumen**: Muestra el stock total por cámara y por exportador.
- **Despacho Automático (FIFO)**: Seleccione un cliente y una cantidad máxima de bins. El sistema creará una solicitud de despacho seleccionando los lotes más antiguos (FIFO) sin dividirlos.
- **Despacho Manual**: Permite filtrar por exportador, cámara y variedad para seleccionar manualmente los lotes exactos a despachar.
- **Lista de Solicitudes**: Muestra los despachos creados.
    - **Hacer Picking**: Para despachos "Pendiente de Picking". Abre una lista de todas las ubicaciones a visitar. El operador debe marcar cada una. Al confirmar, el stock se rebaja definitivamente y el despacho se marca como "Completado". Desde esta ventana puede generar un PDF para imprimir.
    - **Generar PDF**: Para despachos "Completados", permite descargar un PDF con el detalle del despacho.
    - **Deshacer**: Cancela una solicitud "Pendiente de Picking" sin afectar el stock.

### 4.7. Embalajes y Socios Comerciales

Estos módulos, aunque separados en el menú, funcionan con una lógica muy similar para gestionar productos que no son de productores de cereza (pallets de embalajes, fruta de otros clientes, etc.).

#### 4.7.1. Flujo General

El flujo de trabajo para ambos módulos es el siguiente:

1.  **Recepción**: En la pestaña **Recepción**, se registra el ingreso de la mercadería. Se especifica el cliente, el documento de entrada (guía de despacho), y se detallan los artículos y cantidades. Para los embalajes, se puede crear un nuevo producto directamente si no existe. Para la fruta, se puede registrar la temperatura y el lote del cliente.
2.  **Almacenamiento**: Una vez recepcionada, la mercadería aparece en la pestaña **Almacenamiento** (o "Pendientes"). Desde aquí, el operador de bodega debe asignarle una ubicación física:
    *   **Embalajes**: Se asigna un **Almacén** y un **Pasillo**.
    *   **Fruta de Socios Comerciales**: Se asigna una **Cámara** y una **Coordenada**, de forma similar a la fruta de productor.
3.  **Despacho/Salidas**: En la pestaña **Despacho** (o "Salidas"), se crea una solicitud para retirar mercadería. Se puede seleccionar el cliente y los artículos a despachar, ya sea de forma automática (FIFO) o manual, seleccionando lotes específicos.
4.  **Picking**: La solicitud creada aparece en la pestaña **Picking**. Esta es una tarea para el operador de bodega.
    *   La pestaña mostrará un **indicador numérico** con la cantidad de tareas de picking pendientes.
    *   Al entrar a una tarea, se muestra una lista detallada de los productos y sus ubicaciones.
    *   El operador puede **generar un PDF** para imprimir una hoja de trabajo que facilite la recolección física.
    *   Una vez recolectados los productos, el operador debe marcar cada ítem y **Confirmar la Salida**. Esta acción descuenta el stock de forma definitiva y marca la solicitud como "Completada".
5.  **Stock**: Esta pestaña ofrece una vista general del inventario actual. Permite consultar qué hay en cada ubicación y ofrece la opción de **Reubicar** pallets o bins de una ubicación a otra.

#### 4.7.2. Portal Fall Creek (Despacho Manual Especial)

Este módulo es una versión especializada del despacho manual, diseñada específicamente para Fall Creek, y se accede desde el menú principal.

-   **Vista de Cámaras**: Muestra una grilla visual de las cámaras que contienen productos de Fall Creek.
-   **Selección Múltiple**: El operador puede hacer clic y arrastrar el mouse sobre las coordenadas para seleccionar múltiples ubicaciones de forma rápida y visual.
-   **Resumen de Pre-Despacho**: Una ventana emergente, que **se puede mover por la pantalla**, muestra un resumen de los productos seleccionados. Esto permite al usuario seguir seleccionando coordenadas sin que la ventana de resumen obstaculice la vista.
-   **Generación de Solicitud**: Al completar la selección y los datos del despacho (documento, cliente destino, etc.), se genera una solicitud. Esta solicitud **no se procesa aquí**, sino que aparece en la pestaña de **"Picking"** del módulo de "Socios Comerciales" para que el bodeguero realice la confirmación final.

### 4.8. Reportes

Ofrece una lista de reportes tabulares de solo lectura con opción de exportar a CSV.

- **Navegación**: Haga clic en cualquier tarjeta para acceder al reporte detallado.
- **Exportar CSV**: Cada reporte tiene un botón para descargar los datos en formato CSV, compatible con Excel.
- **Reportes Disponibles**:
    - Stock de Bins y Materiales
    - Stock de Embalajes
    - Kardex de Movimientos de Bins y Materiales
    - Registro de Recepción de Fruta
    - Stock por Ubicación (Otros Clientes)
    - Kardex de Movimientos de Fruta (Otros Clientes)
    - Reporte de Despachos a Packing
    - Registro de Temperaturas
    - **Permanencia Stock (Otros Clientes)**: Calcula los días que el stock de fruta ha permanecido en el frigorífico, ideal para facturación.

---

Este manual cubre las funcionalidades principales. Para cualquier duda, no dude en consultar.
