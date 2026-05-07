import { ai } from './genkit';
import { z } from 'zod';

export const coolingTimePredictionFlow = ai.defineFlow(
  {
    name: 'coolingTimePrediction',
    inputSchema: z.object({
      variety: z.string(),
      initialTemperature: z.number(),
      targetTemperature: z.number().default(0),
      binType: z.string().optional(),
    }),
    outputSchema: z.object({
      estimatedMinutes: z.number(),
      recommendation: z.string(),
      energyEfficiencyTip: z.string(),
    }),
  },
  async (input) => {
    const prompt = `
      Eres un experto en logística de frío industrial. 
      Analiza el siguiente lote de fruta para el proceso de hidrocooling:
      - Variedad: ${input.variety}
      - Temperatura Inicial: ${input.initialTemperature}°C
      - Temperatura Objetivo: ${input.targetTemperature}°C
      
      Proporciona un tiempo estimado de enfriamiento en minutos (número), 
      una recomendación operativa breve y un consejo de eficiencia energética.
      Responde en formato JSON puro que coincida con el esquema de salida.
    `;

    const response = await ai.generate({
      prompt,
      config: {
        temperature: 0.2,
      },
    });

    try {
      // Clean possible markdown backticks
      const cleanJson = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      // Fallback in case of parsing error
      return {
        estimatedMinutes: 45,
        recommendation: "Monitorear temperatura cada 15 min.",
        energyEfficiencyTip: "Asegurar que el agua esté a 0°C antes de iniciar."
      };
    }
  }
);

export const cameraHealthAnalysisFlow = ai.defineFlow(
  {
    name: 'cameraHealthAnalysis',
    inputSchema: z.object({
      chamberId: z.string(),
      currentTemp: z.number(),
      currentHumidity: z.number(),
      occupancyPercent: z.number(),
    }),
    outputSchema: z.object({
      status: z.enum(['Optimo', 'Atención', 'Crítico']),
      diagnosis: z.string(),
      actionRequired: z.string(),
    }),
  },
  async (input) => {
    const prompt = `
      Analiza el estado de una cámara frigorífica:
      - ID Cámara: ${input.chamberId}
      - Temp Actual: ${input.currentTemp}°C
      - Humedad Actual: ${input.currentHumidity}%
      - Ocupación: ${input.occupancyPercent}%
      
      Status debe ser 'Optimo' si está cerca de 0°C y 90% HR, 'Atención' si hay desviaciones menores, 'Crítico' si hay riesgo de pérdida de fruta.
      Proporciona diagnóstico y acción requerida.
      Responde en formato JSON puro.
    `;

    const response = await ai.generate({
      prompt,
      config: {
        temperature: 0.1,
      },
    });

    try {
        const cleanJson = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        return {
            status: 'Atención',
            diagnosis: "Datos inconsistentes.",
            actionRequired: "Verificar sensores manualmente."
        };
    }
  }
);
