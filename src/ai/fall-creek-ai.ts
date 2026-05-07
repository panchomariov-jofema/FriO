import { ai } from './genkit';
import { z } from 'zod';

export const parseFallCreekVisionFlow = ai.defineFlow(
  {
    name: 'parseFallCreekVision',
    inputSchema: z.object({
      base64Data: z.string(),
      mimeType: z.string(),
    }),
    outputSchema: z.array(z.object({
      'Pallet #': z.number(),
      'Pallet ID': z.string(),
      'Package IDs': z.string(),
      'Item': z.string(),
      'Item Description': z.string(),
      'Lot Number (Batch)': z.string(),
      'Qty of Plants': z.number(),
      '# of Pots/Tray': z.number(),
      '# of Packages': z.number(),
    })),
  },
  async (input) => {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: 'Actúa como un experto en extracción de datos de documentos logísticos. Extrae la tabla completa del "Pallet Log" de Fall Creek de la imagen proporcionada. \n\nImportante:\n1. Devuelve un array JSON de objetos.\n2. Los campos deben ser EXACTAMENTE: "Pallet #", "Pallet ID", "Package IDs", "Item", "Item Description", "Lot Number (Batch)", "Qty of Plants", "# of Pots/Tray", "# of Packages".\n3. Si un valor es numérico en la imagen, conviértelo a número en el JSON.\n4. Si hay varias filas, extrae todas.\n5. Responde SOLO con el JSON puro, sin explicaciones ni markdown.' },
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
      console.error("Error parsing AI response:", e);
      return [];
    }
  }
);
