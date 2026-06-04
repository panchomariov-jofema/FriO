import pandas as pd
import os
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
# LA LÍNEA CLAVE: renderPDF debe importarse solo desde graphics
from reportlab.graphics import renderPDF 

# --- CONFIGURACIÓN PARA FRIO ---
ARCHIVO_CSV = 'etiquetas_qr_BINFC_x3800.csv'
ARCHIVO_SALIDA = 'Etiquetas_FriO_3800.pdf'
ANCHO_MM = 100
ALTO_MM = 60

def generar_etiquetas():
    print("Iniciando generación de 3800 etiquetas para FriO...")
    
    if not os.path.exists(ARCHIVO_CSV):
        print(f"Error fatal: No se encuentra {ARCHIVO_CSV}")
        return

    try:
        # Carga de datos con Pandas
        df = pd.read_csv(ARCHIVO_CSV)
        
        # Dimensiones físicas en puntos (1mm = 2.83 pts)
        ancho_puntos = ANCHO_MM * mm
        alto_puntos = ALTO_MM * mm
        
        c = canvas.Canvas(ARCHIVO_SALIDA, pagesize=(ancho_puntos, alto_puntos))
        
        for index, row in df.iterrows():
            codigo = str(row['Codigo'])
            
            # Dibujar Texto Superior
            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(50*mm, 52*mm, "FriO - WMS")
            
            # Generar QR
            qr_code = qr.QrCodeWidget(codigo)
            bounds = qr_code.getBounds()
            qr_width = bounds[2] - bounds[0]
            
            # Escalado a 35mm
            size_mm = 35 * mm
            factor = size_mm / qr_width
            d = Drawing(size_mm, size_mm, transform=[factor, 0, 0, factor, 0, 0])
            d.add(qr_code)
            
            # Dibujar el QR en el PDF usando el motor renderPDF
            renderPDF.draw(d, c, 32.5*mm, 12*mm)
            
            # Dibujar Texto Inferior (ID)
            c.setFont("Helvetica-Bold", 12)
            c.drawCentredString(50*mm, 6*mm, f"BIN: {codigo}")
            
            c.showPage()
            
            if (index + 1) % 500 == 0:
                print(f"Progreso: {index + 1} etiquetas...")

        c.save()
        print(f"\n¡Éxito! Archivo creado: {os.path.abspath(ARCHIVO_SALIDA)}")

    except Exception as e:
        print(f"Ocurrió un error: {e}")

if __name__ == "__main__":
    generar_etiquetas()