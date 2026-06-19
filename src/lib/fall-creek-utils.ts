import * as XLSX from 'xlsx';
import { OtherFruitReceptionItem } from './types';

export interface FallCreekManifestRow {
    'Pallet #': number;
    'Pallet ID': string;
    'Package IDs': string;
    'Item': string;
    'Item Description': string;
    'Lot Number (Batch)': string;
    'Qty of Plants': number;
    '# of Pots/Tray': number;
    '# of Packages': number;
}

export function parseFallCreekManifest(file: File): Promise<FallCreekManifestRow[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                
                // We know headers are in row 8 (0-indexed)
                const rows = XLSX.utils.sheet_to_json(sheet, { range: 8 }) as FallCreekManifestRow[];
                
                // Filter out empty rows or rows without Pallet ID
                const validRows = rows.filter(row => row['Pallet ID'] && String(row['Pallet ID']).trim() !== '');
                
                resolve(validRows);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

export function cleanVarietyName(name: string): string {
    if (!name) return '';
    // Remove technical metadata after variety name
    // Usually starts with 'FC... or ‘FC...
    const fcIndex = name.search(/['‘]FC/i);
    let cleaned = fcIndex !== -1 ? name.substring(0, fcIndex).trim() : name;
    
    // Also remove generic "Pot in Peat" or similar if they leaked through
    cleaned = cleaned.replace(/ \d+ Liter Pot.*/i, '');
    cleaned = cleaned.replace(/Pot in Peat/i, '');
    
    return cleaned.trim();
}

export function decomposePalletsIntoBins(pallets: FallCreekManifestRow[]): OtherFruitReceptionItem[] {
    return pallets.flatMap(row => {
        const totalBinCount = Number(row['# of Packages']) || 3;
        const totalPlants = Number(row['Qty of Plants']) || 0;
        const description = String(row['Item Description'] || '');
        const palletId = String(row['Pallet ID'] || '');
        const lotId = String(row['Lot Number (Batch)'] || '');
        const itemCode = String(row['Item'] || '');

        // Try to split by / or ; or |
        const parts = description.split(/\s*[\/|;]\s*/).filter(p => p.trim().length > 0);
        const isMixedVariety = parts.length > 1;
        
        if (isMixedVariety) {
            const binItems: OtherFruitReceptionItem[] = [];
            let remainingBins = totalBinCount;
            let processedParts = 0;
            
            parts.forEach((part) => {
                if (remainingBins <= 0) return;
                
                // Look for multipliers like (2), x2, or just a number at the end
                const multiplierMatch = part.match(/\((\d+)\)$|x(\d+)$|\s+(\d+)$/);
                let partBinCount = 1;
                let cleanPart = part;
                
                if (multiplierMatch) {
                    const countStr = multiplierMatch[1] || multiplierMatch[2] || multiplierMatch[3];
                    partBinCount = parseInt(countStr, 10);
                    cleanPart = part.replace(multiplierMatch[0], '').trim();
                }

                // If it's the last part and we have more bins than assigned, take the rest
                processedParts++;
                if (processedParts === parts.length && remainingBins > partBinCount) {
                    partBinCount = remainingBins;
                }
                
                const binsForThisPart = Math.min(partBinCount, remainingBins);
                if (binsForThisPart <= 0) return;

                // Estimate plants per bin for this specific variety
                const plantsPerPartBin = Math.floor((totalPlants * (binsForThisPart / totalBinCount)) / binsForThisPart) || 0;

                for (let i = 0; i < binsForThisPart; i++) {
                    binItems.push({
                        palletId,
                        clientLotId: lotId,
                        productName: cleanVarietyName(cleanPart),
                        productCode: itemCode,
                        quantity: 1,
                        unit: 'Bins',
                        totalPlants: plantsPerPartBin,
                        plantsPerBin: plantsPerPartBin,
                        status: 'Pendiente de recibir',
                        isMixedVariety: true
                    });
                    remainingBins--;
                }
            });
            
            // Safety: if after processing parts we still have bins (rare but possible with weird multipliers)
            if (remainingBins > 0 && binItems.length > 0) {
                const lastItem = binItems[binItems.length - 1];
                for (let i = 0; i < remainingBins; i++) {
                    binItems.push({ ...lastItem });
                }
            }
            
            return binItems;
        } else {
            // Standard single-variety case
            const binItems: OtherFruitReceptionItem[] = [];
            const plantsPerBin = Math.floor(totalPlants / totalBinCount);
            
            for (let i = 0; i < totalBinCount; i++) {
                binItems.push({
                    palletId,
                    clientLotId: lotId,
                    productName: cleanVarietyName(description),
                    productCode: itemCode,
                    quantity: 1,
                    unit: 'Bins',
                    totalPlants: plantsPerBin,
                    plantsPerBin: plantsPerBin,
                    status: 'Pendiente de recibir',
                    isMixedVariety: false
                });
            }
            return binItems;
        }
    });
}

export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // Remove the data:mimeType;base64, prefix
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
}

export interface ExcelTemperatureRow {
  date: Date;
  chamberId: string;
  temperature: number;
}

export function parseTemperatureExcel(file: File): Promise<ExcelTemperatureRow[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                
                let headerRowIdx = -1;
                for (let i = 0; i < Math.min(20, rows.length); i++) {
                    const row = rows[i];
                    if (row && row.includes('FECHA') && row.includes('HORA')) {
                        headerRowIdx = i;
                        break;
                    }
                }
                
                if (headerRowIdx === -1) {
                    throw new Error('No se encontró la cabecera con "FECHA" y "HORA" en el archivo Excel.');
                }
                
                const headers = rows[headerRowIdx];
                const result: ExcelTemperatureRow[] = [];
                
                const chamberMapping: Record<number, string> = {};
                headers.forEach((header, idx) => {
                    if (typeof header === 'string') {
                        const match = header.toUpperCase().match(/C[ÁA]MARA\s*(?:N[°º]|\s)\s*(\d+)/);
                        if (match) {
                            chamberMapping[idx] = `CAMARA-${match[1]}`;
                        }
                    }
                });
                
                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;
                    
                    const excelDate = row[0];
                    const excelTime = row[1];
                    
                    if (typeof excelDate !== 'number') continue;
                    
                    const timeFraction = typeof excelTime === 'number' ? excelTime : 0;
                    const dateMs = (excelDate - 25569) * 86400 * 1000;
                    const timeMs = timeFraction * 86400 * 1000;
                    
                    const utcDate = new Date(dateMs + timeMs);
                    const localDate = new Date(
                        utcDate.getUTCFullYear(),
                        utcDate.getUTCMonth(),
                        utcDate.getUTCDate(),
                        utcDate.getUTCHours(),
                        utcDate.getUTCMinutes(),
                        utcDate.getUTCSeconds()
                    );
                    
                    Object.entries(chamberMapping).forEach(([colIdxStr, chamberId]) => {
                        const colIdx = parseInt(colIdxStr, 10);
                        const val = row[colIdx];
                        if (val !== undefined && val !== null && val !== '') {
                            const temp = parseFloat(String(val));
                            if (!isNaN(temp)) {
                                result.push({
                                    date: localDate,
                                    chamberId,
                                    temperature: temp
                                });
                            }
                        }
                    });
                }
                
                resolve(result);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

