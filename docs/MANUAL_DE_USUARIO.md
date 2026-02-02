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

### 4.7. Embalajes y Otros Hortofrutícolas

Estos módulos funcionan de manera similar para gestionar la recepción, almacenamiento y despacho de pallets de embalaje y fruta de otros clientes.

- **Recepción**: Registra la entrada.
- **Almacenamiento / Pendientes**: Muestra lo que está pendiente de ubicar y permite asignarle una bodega/pasillo (Embalajes) o cámara/coordenada (Otros Hortofrutícolas).
- **Despacho/Salidas**: Crea una solicitud de salida.
- **Picking**: Confirma la salida física de los materiales/fruta, rebajando el stock. La pestaña de "Picking" mostrará un indicador numérico con la cantidad de tareas pendientes. Desde aquí puede **generar un PDF** para la recolección física.
- **Stock**: Permite ver el inventario actual y reubicarlo.

#### 4.7.1. Portal Fall Creek (Despacho Manual Especial)
Este módulo ofrece una interfaz visual para el despacho de productos de Fall Creek.
- **Vista de Cámaras**: Muestra una grilla con la ocupación de las cámaras, permitiendo seleccionar coordenadas específicas para el despacho.
- **Selección Múltiple**: Puede hacer clic y arrastrar para seleccionar varias coordenadas a la vez.
- **Resumen de Pre-Despacho**: Una ventana emergente muestra el resumen de los productos seleccionados. Esta ventana **es movible**, permitiéndole arrastrarla para despejar la vista y seleccionar más lotes.
- **Generación de Solicitud**: Una vez completada la selección y los datos del despacho, se crea una solicitud que aparecerá en la pestaña de "Picking" del módulo de "Otros Hortofrutícolas".


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
    - Reporte de Despachos
    - Registro de Temperaturas
    - **Permanencia Stock (Otros Clientes)**: Calcula los días que el stock de fruta ha permanecido en el frigorífico, ideal para facturación.

---

Este manual cubre las funcionalidades principales. Para cualquier duda, no dude en consultar.
