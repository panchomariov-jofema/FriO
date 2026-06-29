const fs = require('fs');
const { getDocumentProxy } = require('unpdf');

async function main() {
    const pdfPath = 'C:\\Users\\francisco.villarreal\\Desktop\\Pallet log\\PROCESADOS\\PALLET LOG SHIP-0646 FRIGORIFICO ÑUBLE 25-06-2026 2° CAMION.pdf';
    console.log(`Reading PDF: ${pdfPath}`);
    const pdfBuffer = new Uint8Array(fs.readFileSync(pdfPath));
    const pdf = await getDocumentProxy(pdfBuffer);
    const numPages = pdf.numPages;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        console.log(`\n--- PAGE ${pageNum} ---`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const rawItems = textContent.items.filter(item => 
            item && typeof item.str === 'string' && item.str.trim() !== '' && Array.isArray(item.transform)
        );
        
        const rowsByY = [];
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

        rowsByY.sort((a, b) => b.y - a.y);
        for (const r of rowsByY) {
            r.items.sort((a, b) => a.transform[4] - b.transform[4]);
            const plainText = r.items.map(item => item.str).join(' ');
            if (plainText.includes("PALLET-11335") || plainText.includes("PALLET-11343") || plainText.includes("BIN-FC-") || plainText.includes("BIN-")) {
                console.log(`Y: ${r.y.toFixed(2)} -> ${plainText}`);
            }
        }
    }
}

main().catch(console.error);
