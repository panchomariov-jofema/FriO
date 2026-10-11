# Propuesta de Distribución: Capacidad 792 en Cámaras Chicas

Este documento presenta la simulación y análisis de distribución optimizada considerando que las **Cámaras Chicas (2 y 3)** incrementan su capacidad total a **792 Bins** cada una.

---

### Infografía de Distribución (Capacidad 792)

![Infografía de Distribución (Capacidad 792)](file:///C:/Users/francisco.villarreal/.gemini/antigravity/brain/a9a5c157-0ea8-438f-9885-c09e93e3b25c/chamber_792_distribution_1782233057711.png)

---

### Esquema Lógico de Distribución (Estrategia Limpia)

```mermaid
graph TD
    FC["Producción Fall Creek (3.727 Bins)"]
    FC --> CR["Sekoya Crunch® (2.395 Bins)"]
    FC --> GR["Sekoya Grande® (630 Bins)"]
    FC --> FI["Sekoya Fiesta™ (536 Bins)"]
    FC --> L164["FC11-164 (166 Bins)"]

    CR --> C4["Cámara 4 (Grande): 1.152 Bins (100%)"]
    CR --> C5["Cámara 5 (Grande): 1.152 Bins (100%)"]
    CR --> C2_C["Cámara 2 (Chica): 91 Bins (Rebalse)"]

    GR --> C2_G["Cámara 2 (Chica): 630 Bins"]

    FI --> C3_F["Cámara 3 (Chica): 536 Bins"]
    L164 --> C3_L["Cámara 3 (Chica): 166 Bins (100%)"]

    style C4 fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff
    style C5 fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff
    style C3_F fill:#ea580c,stroke:#c2410c,stroke-width:2px,color:#fff
    style C2_G fill:#16a34a,stroke:#15803d,stroke-width:2px,color:#fff
```

---

### Tabla de Ocupación con Capacidad 792

| Cámara | Capacidad | Variedad / Bins Asignados | Ocupación Fís. | Holgura / Observaciones |
| :--- | :---: | :--- | :---: | :--- |
| **Cámara 4** *(Grande)* | **1.152** | 🔵 **Sekoya Crunch®**: 1.152 | **100%** | Monovarietal pura. Trazabilidad perfecta. |
| **Cámara 5** *(Grande)* | **1.152** | 🔵 **Sekoya Crunch®**: 1.152 | **100%** | Monovarietal pura. Trazabilidad perfecta. |
| **Cámara 2** *(Chica)* | **792** | 🟢 **Sekoya Grande®**: 630<br>🔵 **Sekoya Crunch®**: 91 *(Rebalse)* | **91,0%** | **71 bins libres**. Muy limpia (solo 2 variedades). |
| **Cámara 3** *(Chica)* | **792** | 🟠 **Sekoya Fiesta™**: 536<br>🔴 **FC11-164**: 166 | **88,6%** | **90 bins libres**. Monovarietal pura de estas dos. |
| **Total** | **3.888** | **Asignados: 3.727 Bins** | **95,8%** | **161 Bins libres de holgura total combinada**. |

---

### Ventajas de este escenario (Capacidad 792)
1. **Separación de FC11-164:** Al tener 792 bins de capacidad en la Cámara 3, **toda la variedad FC11-164 (166 bins) cabe completa en la Cámara 3** junto con *Sekoya Fiesta*. Ya no es necesario partirla en dos cámaras como en el escenario de 756.
2. **Cámara 2 más holgada:** Solo contiene *Sekoya Grande* y el rebalse de *Crunch*, con una holgura de 71 bins para maniobras.
3. **Mayor Seguridad Global:** La holgura total en planta sube de 89 a **161 bins libres** (más de un 4.1% de espacio libre de seguridad), lo que entrega una tremenda tranquilidad para la operación diaria.
