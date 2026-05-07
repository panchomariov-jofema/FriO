'use server'

import { parseFallCreekVisionFlow } from '@/ai/fall-creek-ai';

export async function parseManifestAIAction(base64Data: string, mimeType: string) {
    try {
        console.log(`Starting AI manifest parse for mimeType: ${mimeType}`);
        const result = await parseFallCreekVisionFlow.run({ base64Data, mimeType });
        console.log(`AI parse completed. Found ${result.length} rows.`);
        return { success: true, data: result };
    } catch (error: any) {
        console.error("Genkit Action Error:", error);
        return { success: false, error: error.message || String(error) };
    }
}
