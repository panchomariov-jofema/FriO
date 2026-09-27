import { ai, getModel } from './genkit';
import { z } from 'zod';

export const parseVitafoodVisionFlow = ai.defineFlow(
  {
    name: 'parseVitafoodVision',
    inputSchema: z.object({
      base64Data: z.string(),
      mimeType: z.string(),
    }),
    outputSchema: z.object({
      header: z.object({
        orderNumber: z.string().optional(),
        documentNumber: z.string().optional(),
        date: z.string().optional(),
        origin: z.string().optional(),
        carrier: z.string().optional(),
        driver: z.string().optional(),
      }),
      rows: z.array(z.object({
        palletNumber: z.number(),
        material: z.string(),
        description: z.string(),
        lote: z.string(),
        quantity: z.number(),
        unit: z.string(),
        ump: z.string(),
        mfgDate: z.string().optional(),
        expDate: z.string().optional(),
      }))
    }),
  },
  async (input) => {
    const response = await ai.generate({
      model: getModel(),
      prompt: [
        { 
          text: `Actúa como un experto en extracción de datos de documentos logísticos y órdenes de despacho/recepción de SAP de VITAFOODS.
Extrae el encabezado y la tabla completa de pallets del documento proporcionado.

Importante:
1. Devuelve un objeto JSON con la estructura:
{
  "header": {
    "orderNumber": "N° de Orden de Compra o Packing List (ej: 5027946)",
    "documentNumber": "N° de Entrega / Guía (ej: 80085402)",
    "date": "Fecha (ej: 20.10.2025)",
    "origin": "Origen (ej: PLANTA CHILLAN)",
    "carrier": "Empresa de transportes",
    "driver": "Nombre del conductor"
  },
  "rows": [
    {
      "palletNumber": 1,
      "material": "Código de material (ej: 15003257)",
      "description": "Denominación o nombre del producto (ej: ENV CAJA FRAMBUESA SYSCO...)",
      "lote": "Lote (ej: 176826)",
      "quantity": 900,
      "unit": "UN",
      "ump": "Unidad de Manipulación / UMP (ej: 6006085585)",
      "mfgDate": "Fecha de fabricación/elaboración (ej: 20.10.2025)",
      "expDate": "Fecha de vencimiento/caducidad (ej: 20.10.2027)"
    }
  ]
}
2. Si un valor es numérico (palletNumber, quantity), conviértelo a número en el JSON.
3. Extrae todos y cada uno de los pallets de la tabla sin omitir ninguno.
4. Responde ÚNICAMENTE con el JSON puro, sin bloques markdown (\`\`\`json), explicaciones ni texto adicional.` 
        },
        { media: { url: `data:${input.mimeType};base64,${input.base64Data}` } }
      ],
      config: {
        temperature: 0,
      }
    });

    try {
      const text = response.text;
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error("Error parsing Vitafood AI response:", e);
      return { header: {}, rows: [] };
    }
  }
);
