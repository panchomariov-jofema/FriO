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

export async function parseFallCreekPDF(pdfBuffer: Uint8Array): Promise<FallCreekManifestRow[]> {
    const pdf = await getDocumentProxy(pdfBuffer);
    const numPages = pdf.numPages;
    
    const resultRows: FallCreekManifestRow[] = [];
    let activeHeaderColumns: { name: string; x: number }[] = [];
    
    // Header keywords to map strings to standard columns
    const headerKeywords = [
        { key: 'pallet #', name: 'Pallet #' },
        { key: 'pallet no', name: 'Pallet #' },
        { key: 'pallet id', name: 'Pallet ID' },
        { key: 'palletid', name: 'Pallet ID' },
        { key: 'package id', name: 'Package IDs' },
        { key: 'packageid', name: 'Package IDs' },
        { key: 'item', name: 'Item' },
        { key: 'description', name: 'Item Description' },
        { key: 'lot number', name: 'Lot Number (Batch)' },
        { key: 'lot number (batch)', name: 'Lot Number (Batch)' },
        { key: 'lot', name: 'Lot Number (Batch)' },
        { key: 'qty of plants', name: 'Qty of Plants' },
        { key: 'qty', name: 'Qty of Plants' },
        { key: 'plants', name: 'Qty of Plants' },
        { key: '# of pots/tray', name: '# of Pots/Tray' },
        { key: 'pots/tray', name: '# of Pots/Tray' },
        { key: 'pots', name: '# of Pots/Tray' },
        { key: '# of packages', name: '# of Packages' },
        { key: 'packages', name: '# of Packages' }
    ];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // 1. Filter out empty text items and marked content (which lack transform)
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

        // 4. Try to find the header row on this page
        let pageHeaderColumns: { name: string; x: number }[] = [];
        let headerLineIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const matches: { name: string; x: number }[] = [];
            
            for (const cell of line.textItems) {
                const textLower = cell.text.toLowerCase().trim();
                
                // Try to find the matching header
                for (const kw of headerKeywords) {
                    if (textLower === kw.key || textLower.includes(kw.key)) {
                        // Prevent duplicate matches for the same column in one row
                        if (!matches.some(m => m.name === kw.name)) {
                            matches.push({ name: kw.name, x: cell.x });
                            break;
                        }
                    }
                }
            }
            
            // If we match 4 or more headers, this is the header row
            if (matches.length >= 4) {
                matches.sort((a, b) => a.x - b.x);
                pageHeaderColumns = matches;
                headerLineIndex = i;
                break;
            }
        }

        // Update active header columns if we found a header row on this page
        if (pageHeaderColumns.length >= 4) {
            activeHeaderColumns = pageHeaderColumns;
        }

        // If we don't have any active headers (e.g. skipped or not found yet), we cannot parse
        if (activeHeaderColumns.length === 0) continue;

        // 5. Parse data rows starting after the header row (or from page start if header was on previous page)
        const startIndex = headerLineIndex !== -1 ? headerLineIndex + 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if this line is likely a footer or summary line
            const lineText = line.textItems.map(c => c.text.toLowerCase()).join(' ');
            if (lineText.includes('total') || lineText.includes('page') || lineText.includes('document')) {
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
                const colName = getClosestColumn(cell.x, activeHeaderColumns);
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
                const isContinuation = !rowData['Pallet ID'] && !rowData['Pallet #'] && resultRows.length > 0;
                
                if (isContinuation) {
                    const lastRow = resultRows[resultRows.length - 1] as any;
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
                    resultRows.push(rowData);
                }
            }
        }
    }
    
    return resultRows;
}

function getClosestColumn(x: number, headerCols: { name: string; x: number }[]): string | null {
    if (headerCols.length === 0) return null;
    let closestCol = headerCols[0];
    let minDist = Math.abs(x - closestCol.x);
    
    for (let i = 1; i < headerCols.length; i++) {
        const col = headerCols[i];
        const dist = Math.abs(x - col.x);
        if (dist < minDist) {
            minDist = dist;
            closestCol = col;
        }
    }
    
    // If the element is too far from any column header, discard it
    if (minDist > 120) return null;
    return closestCol.name;
}
