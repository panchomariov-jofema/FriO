import * as XLSX from 'xlsx';

export interface VitafoodManifestRow {
    palletNumber: number;
    material: string;
    description: string;
    lote: string;
    quantity: number;
    unit: string;
    ump: string;
    mfgDate?: string;
    expDate?: string;
    orderNumber?: string;
    documentNumber?: string;
    origin?: string;
    carrier?: string;
    driver?: string;
}

export interface VitafoodManifestHeader {
    orderNumber?: string;
    documentNumber?: string;
    date?: string;
    origin?: string;
    carrier?: string;
    driver?: string;
    totalKilos?: number;
    totalBoxes?: number;
}

export interface VitafoodParsedManifest {
    header: VitafoodManifestHeader;
    rows: VitafoodManifestRow[];
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = reader.result as string;
            // Remove data:application/pdf;base64, prefix if present
            const base64Content = base64String.split(',')[1] || base64String;
            resolve(base64Content);
        };
        reader.onerror = (error) => reject(error);
    });
}

export function parseVitafoodManifest(file: File): Promise<VitafoodParsedManifest> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                
                // Convert entire sheet to array of arrays to find metadata and table
                const rawSheetData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
                
                const header: VitafoodManifestHeader = {};
                let tableHeaderRowIndex = -1;

                // 1. Scan rows for metadata and table header
                for (let i = 0; i < rawSheetData.length; i++) {
                    const row = rawSheetData[i];
                    if (!row || !Array.isArray(row)) continue;

                    const rowText = row.map(cell => String(cell || '').trim()).join(' ');

                    // Check for Order Number / Paking List
                    if (rowText.includes('Paking List') || rowText.includes('Packing List')) {
                        const match = rowText.match(/(\d{6,10})/);
                        if (match) header.orderNumber = match[1];
                    }
                    if (rowText.includes('ORDEN DE COMPRA')) {
                        const match = rowText.match(/ORDEN DE COMPRA\s*:?\s*(\d+)/i);
                        if (match) header.orderNumber = match[1];
                    }
                    if (rowText.includes('ENTREGA')) {
                        const match = rowText.match(/ENTREGA\s*:?\s*(\d+)/i);
                        if (match) header.documentNumber = match[1];
                    }
                    if (rowText.includes('ORIGEN')) {
                        const originIdx = row.findIndex(c => String(c).includes('ORIGEN'));
                        if (originIdx !== -1 && row[originIdx + 2]) {
                            header.origin = String(row[originIdx + 2]).trim();
                        }
                    }
                    if (rowText.includes('CONDUCTOR')) {
                        const condIdx = row.findIndex(c => String(c).includes('CONDUCTOR'));
                        if (condIdx !== -1 && row[condIdx + 2]) {
                            header.driver = String(row[condIdx + 2]).trim();
                        }
                    }
                    if (rowText.includes('EMPRESA TRANSPORTES')) {
                        const transIdx = row.findIndex(c => String(c).includes('EMPRESA TRANSPORTES'));
                        if (transIdx !== -1 && row[transIdx + 2]) {
                            header.carrier = String(row[transIdx + 2]).trim();
                        }
                    }
                    if (rowText.includes('FECHA')) {
                        const fIdx = row.findIndex(c => String(c).includes('FECHA'));
                        if (fIdx !== -1 && row[fIdx + 2]) {
                            header.date = String(row[fIdx + 2]).trim();
                        }
                    }

                    // Check if this row is the table header (contains Material and Un.manip. or UMP or Lote)
                    const lowerRow = row.map(c => String(c || '').toLowerCase().trim());
                    const hasMaterial = lowerRow.some(c => c.includes('material'));
                    const hasUmp = lowerRow.some(c => c.includes('manip') || c.includes('ump'));
                    const hasPallet = lowerRow.some(c => c.includes('pallet'));

                    if (hasMaterial && (hasUmp || hasPallet)) {
                        tableHeaderRowIndex = i;
                    }
                }

                // If not found by scanning, default to row 10 (index 9) or 0
                const rangeIndex = tableHeaderRowIndex !== -1 ? tableHeaderRowIndex : 0;
                
                // Read rows using the detected header range
                const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { range: rangeIndex });
                
                const validRows: VitafoodManifestRow[] = [];
                let fallbackPalletNum = 1;

                for (const r of rawRows) {
                    // Extract Material
                    let material = '';
                    for (const key of Object.keys(r)) {
                        if (/material/i.test(key)) {
                            material = String(r[key] || '').trim();
                            break;
                        }
                    }

                    // Extract UMP (Un.manip. / Unidad manipulacion / UMP)
                    let ump = '';
                    for (const key of Object.keys(r)) {
                        if (/manip|ump/i.test(key)) {
                            ump = String(r[key] || '').trim();
                            // Handle scientific notation e.g. 6.00609e+09
                            if (ump.includes('e+')) {
                                const num = Number(ump);
                                if (!isNaN(num)) ump = num.toFixed(0);
                            }
                            break;
                        }
                    }

                    // Extract Lote
                    let lote = '';
                    for (const key of Object.keys(r)) {
                        if (/lote/i.test(key)) {
                            lote = String(r[key] || '').trim();
                            break;
                        }
                    }

                    // Extract Description
                    let description = '';
                    for (const key of Object.keys(r)) {
                        if (/denominaci|descrip/i.test(key)) {
                            description = String(r[key] || '').trim();
                            break;
                        }
                    }

                    // Extract Quantity (Cantidad HU / Cantidad / UN)
                    let quantity = 0;
                    for (const key of Object.keys(r)) {
                        if (/cantidad/i.test(key)) {
                            const val = Number(r[key]);
                            if (!isNaN(val) && val > 0) {
                                quantity = val;
                                break;
                            }
                        }
                    }

                    // Extract Dates
                    let mfgDate: string | undefined;
                    let expDate: string | undefined;
                    for (const key of Object.keys(r)) {
                        if (/fabric|elab/i.test(key)) {
                            mfgDate = String(r[key] || '').trim();
                        }
                        if (/cad|fpc|venc/i.test(key)) {
                            expDate = String(r[key] || '').trim();
                        }
                    }

                    // Extract Pallet Number
                    let palletNum = fallbackPalletNum;
                    for (const key of Object.keys(r)) {
                        if (/n[°º]?\s*pallet/i.test(key)) {
                            const pVal = parseInt(String(r[key]), 10);
                            if (!isNaN(pVal) && pVal > 0) {
                                palletNum = pVal;
                            }
                            break;
                        }
                    }

                    // Skip empty rows or totals summary row
                    if (!material && !ump) continue;
                    if (description && (description.toLowerCase().includes('total') || description.toLowerCase().includes('pallet'))) {
                        if (!material && !ump) continue;
                    }

                    // If quantity is missing or 0, default to 1
                    if (quantity <= 0) quantity = 1;

                    validRows.push({
                        palletNumber: palletNum,
                        material: material.replace(/\.0$/, ''),
                        description: description || `MATERIAL ${material}`,
                        lote: lote.replace(/\.0$/, ''),
                        quantity: quantity,
                        unit: 'UN',
                        ump: ump.replace(/\.0$/, ''),
                        mfgDate: mfgDate || undefined,
                        expDate: expDate || undefined,
                        orderNumber: header.orderNumber,
                        documentNumber: header.documentNumber,
                        origin: header.origin,
                        carrier: header.carrier,
                        driver: header.driver
                    });

                    fallbackPalletNum++;
                }

                resolve({
                    header,
                    rows: validRows
                });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}
