'use server'

import { parseFallCreekVisionFlow } from '@/ai/fall-creek-ai';
import { parseFallCreekPDF } from '@/lib/fall-creek-pdf-parser';

export async function parseManifestAIAction(base64Data: string, mimeType: string) {
    try {
        if (mimeType === 'application/pdf') {
            console.log(`Starting local PDF manifest parse`);
            const buffer = Buffer.from(base64Data, 'base64');
            const uint8Array = new Uint8Array(buffer);
            const result = await parseFallCreekPDF(uint8Array);
            console.log(`Local PDF parse completed. Found ${result.length} rows.`);
            return { success: true, data: result };
        } else {
            console.log(`Starting AI manifest parse for non-PDF mimeType: ${mimeType}`);
            const result = await parseFallCreekVisionFlow({ base64Data, mimeType });
            console.log(`AI parse completed. Found ${result.length} rows.`);
            return { success: true, data: result };
        }
    } catch (error: any) {
        console.error("Manifest Parse Action Error:", error);
        return { success: false, error: error.message || String(error) };
    }
}
