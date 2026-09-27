'use server';

import { parseVitafoodVisionFlow } from '@/ai/vitafood-ai';

export async function parseVitafoodManifestAIAction(base64Data: string, mimeType: string) {
    try {
        console.log(`Starting AI Vitafood manifest parse for mimeType: ${mimeType}`);
        const result = await parseVitafoodVisionFlow({ base64Data, mimeType });
        console.log(`AI Vitafood parse completed. Found ${result?.rows?.length || 0} rows.`);
        return { success: true, data: result };
    } catch (error: any) {
        console.error("Vitafood Manifest Parse Action Error:", error);
        return { success: false, error: error.message || String(error) };
    }
}
