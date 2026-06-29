import { getDocumentProxy } from 'unpdf';
import { FallCreekManifestRow } from './fall-creek-utils';

interface MergedTextCell {
    text: string;
    x: number;
    xEnd: number;
}

interface LineItems {
    y: number;
    textItems: MergedTextCell[];
}

// Columns boundaries based on X coordinates in the PDF layout
function getColumnNameByX(x: number): keyof FallCreekManifestRow | null {
    if (x < 45) return 'Pallet #';
    if (x >= 45 && x < 90) return 'Pallet ID';
    if (x >= 90 && x < 140) return 'Package IDs';
    if (x >= 140 && x < 185) return 'Item';
    if (x >= 185 && x < 350) return 'Item Description';
    if (x >= 350 && x < 430) return 'Lot Number (Batch)';
    if (x >= 430 && x < 495) return 'Qty of Plants';
    if (x >= 495 && x < 540) return '# of Pots/Tray';
    if (x >= 540) return '# of Packages';
    return null;
}

export async function parseFallCreekPDF(pdfBuffer: Uint8Array): Promise<FallCreekManifestRow[]> {
    const pdf = await getDocumentProxy(pdfBuffer);
    const numPages = pdf.numPages;
    
    const resultRows: FallCreekManifestRow[] = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // 1. Filter out empty text items and marked content
        const rawItems: any[] = textContent.items.filter((item: any) => 
            item && typeof item.str === 'string' && item.str.trim() !== '' && Array.isArray(item.transform)
        );
        
        if (rawItems.length === 0) continue;

        // 2. Group items by Y coordinate (using a tolerance of 4 points)
        const rowsByY: { y: number; items: any[] }[] = [];
        for (const item of rawItems) {
            const y = item.transform[5];
            
            let found = false;
            for (const r of rowsByY) {
                if (Math.abs(r.y - y) < 4) {
                    r.items.push(item);
                    found = true;
                    break;
                }
            }
            if (!found) {
                rowsByY.push({ y, items: [item] });
            }
        }

        // Sort rows from top to bottom (Y descending)
        rowsByY.sort((a, b) => b.y - a.y);

        // Sort items in each row from left to right (X ascending)
        for (const r of rowsByY) {
            r.items.sort((a, b) => a.transform[4] - b.transform[4]);
        }

        // 3. Merge close items on the same line to reconstruct words and cells
        const lines: LineItems[] = [];
        for (const r of rowsByY) {
            const mergedCells: MergedTextCell[] = [];
            let currentCell: MergedTextCell | null = null;
            
            for (const item of r.items) {
                const text = item.str;
                const x = item.transform[4];
                const width = item.width || 0;
                const xEnd = x + width;
                
                if (!currentCell) {
                    currentCell = { text, x, xEnd };
                } else {
                    const gap = x - currentCell.xEnd;
                    // If gap is small (e.g. less than 8 points), merge them
                    if (gap < 8) {
                        const needsSpace = gap > 1 && !currentCell.text.endsWith(' ') && !text.startsWith(' ');
                        currentCell.text += (needsSpace ? ' ' : '') + text;
                        currentCell.xEnd = xEnd;
                    } else {
                        mergedCells.push(currentCell);
                        currentCell = { text, x, xEnd };
                    }
                }
            }
            if (currentCell) {
                mergedCells.push(currentCell);
            }
            lines.push({ y: r.y, textItems: mergedCells });
        }

        // 4. Parse data rows
        const pageRows: FallCreekManifestRow[] = [];
        
        for (const line of lines) {
            // IGNORE page headers (above Y = 640) and page footers (below Y = 50)
            if (line.y >= 640 || line.y <= 50) {
                continue;
            }

            const lineText = line.textItems.map(c => c.text.toLowerCase()).join(' ');
            
            // Skip headers/footers
            if (
                lineText.includes('pallet #') || 
                lineText.includes('pallet id') || 
                lineText.includes('palet #') || 
                lineText.includes('palet id') || 
                lineText.includes('qty of plants') ||
                lineText.includes('total') ||
                lineText.includes('page') ||
                lineText.includes('página') ||
                lineText.includes('pagina') ||
                lineText.includes('document') ||
                lineText.includes('transfer order') || 
                lineText.includes('shipper/exporter') ||
                lineText.includes('descripción') ||
                lineText.includes('description') ||
                lineText.includes('variedad') ||
                lineText.includes('producto') ||
                lineText.includes('lote') ||
                lineText.includes('cantidad') ||
                lineText.includes('macetas') ||
                lineText.includes('bandejas') ||
                lineText.includes('paquetes') ||
                lineText.includes('peso bruto') ||
                lineText.includes('peso neto') ||
                lineText.includes('gross weight') ||
                lineText.includes('net weight') ||
                lineText.includes('estimado') ||
                lineText.includes('estimated') ||
                lineText.includes('fundo') ||
                lineText.includes('coihueco') ||
                lineText.includes('chile') ||
                lineText.includes('cliente:') ||
                lineText.includes('fecha de envío') ||
                lineText.includes('orden de compra') ||
                lineText.includes('pedido de ventas') ||
                lineText.includes('notas de palet')
            ) {
                continue;
            }

            const rowData: any = {
                'Pallet #': 0,
                'Pallet ID': '',
                'Package IDs': '',
                'Item': '',
                'Item Description': '',
                'Lot Number (Batch)': '',
                'Qty of Plants': 0,
                '# of Pots/Tray': 0,
                '# of Packages': 0
            };
            
            let hasData = false;
            
            for (const cell of line.textItems) {
                const colName = getColumnNameByX(cell.x);
                if (colName) {
                    if (['Pallet #', 'Qty of Plants', '# of Pots/Tray', '# of Packages'].includes(colName)) {
                        const cleaned = cell.text.replace(/,/g, '').replace(/[^\d]/g, '');
                        const val = parseInt(cleaned, 10) || 0;
                        rowData[colName] = val;
                    } else {
                        if (rowData[colName]) {
                            rowData[colName] += ' ' + cell.text;
                        } else {
                            rowData[colName] = cell.text;
                        }
                    }
                    hasData = true;
                }
            }
            
            if (hasData) {
                const isContinuation = !rowData['Pallet ID'] && !rowData['Pallet #'] && pageRows.length > 0;
                
                if (isContinuation) {
                    const lastRow = pageRows[pageRows.length - 1] as any;
                    for (const colName of ['Package IDs', 'Item Description', 'Item', 'Lot Number (Batch)']) {
                        if (rowData[colName]) {
                            lastRow[colName] = (lastRow[colName] ? lastRow[colName] + ' ' : '') + rowData[colName].trim();
                        }
                    }
                    for (const colName of ['Qty of Plants', '# of Pots/Tray', '# of Packages']) {
                        if (rowData[colName] > 0) {
                            lastRow[colName] += rowData[colName];
                        }
                    }
                } else if (rowData['Pallet ID'] || rowData['Pallet #']) {
                    rowData['Pallet ID'] = String(rowData['Pallet ID']).trim();
                    rowData['Package IDs'] = String(rowData['Package IDs']).trim();
                    rowData['Item'] = String(rowData['Item']).trim();
                    rowData['Item Description'] = String(rowData['Item Description']).trim();
                    rowData['Lot Number (Batch)'] = String(rowData['Lot Number (Batch)']).trim();
                    pageRows.push(rowData);
                }
            }
        }
        resultRows.push(...pageRows);
    }
    
    return resultRows;
}
