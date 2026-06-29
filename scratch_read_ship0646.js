const path = require('path');
const XLSX = require('xlsx');

const filePath = 'C:\\Users\\francisco.villarreal\\Desktop\\Pallet log\\PROCESADOS\\PALLET LOG SHIP-0646 FRIGORIFICO ÑUBLE 25-06-2026 2° CAMION.xlsx';

try {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  rows.forEach((row, idx) => {
    console.log(`Row ${idx + 1}: Pallet ID = ${row["Pallet ID"]}, Package IDs = ${row["Package IDs"]}, Pallet # = ${row["Pallet #"]}`);
  });
} catch (e) {
  console.error('Error:', e);
}
