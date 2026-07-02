const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

const firebaseConfig = {
  projectId: "frigomanagerm1-96752421-f2f17",
  appId: "1:873975957236:web:34df8b97d4a5263ad380a1",
  apiKey: "AIzaSyC0CLOwHjYckpBDwuQYgYF4RSnMIX_P1uU",
  authDomain: "frigomanagerm1-96752421-f2f17.firebaseapp.com",
  messagingSenderId: "873975957236"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching detailed summary of manifest 4OyZmtmfq1Xb8ajjLQbm...");
  try {
    const docSnap = await getDoc(doc(db, "otherFruitReceptions", "4OyZmtmfq1Xb8ajjLQbm"));
    if (!docSnap.exists()) {
      console.log("Document not found.");
      return;
    }

    const data = docSnap.data();
    const items = data.items || [];
    console.log(`Manifest: "${data.document}"`);
    console.log(`Document Status: ${data.status}`);
    console.log(`Total Bins (items): ${items.length}`);
    
    const statusCounts = {};
    let qrCount = 0;
    let noQrCount = 0;
    const palletSummary = {};

    items.forEach(item => {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
      const hasQr = item.containerId && item.containerId.trim() !== '' && item.containerId !== '-';
      if (hasQr) qrCount++; else noQrCount++;

      const pId = item.palletId;
      if (!palletSummary[pId]) {
        palletSummary[pId] = {
          total: 0,
          received: 0,
          stored: 0,
          qrs: [],
          statuses: []
        };
      }
      palletSummary[pId].total++;
      if (item.status === 'Almacenado') palletSummary[pId].stored++;
      if (item.status !== 'Pendiente de recibir') palletSummary[pId].received++;
      if (hasQr) palletSummary[pId].qrs.push(item.containerId);
      palletSummary[pId].statuses.push(item.status);
    });

    console.log("\nStatus distribution:");
    console.log(JSON.stringify(statusCounts, null, 2));
    console.log(`\nBins with QR code: ${qrCount}`);
    console.log(`Bins without QR code: ${noQrCount}`);

    console.log("\nPallets summary (stored but without QRs):");
    Object.keys(palletSummary).forEach(pId => {
      const summary = palletSummary[pId];
      if (summary.stored > 0 && summary.qrs.length === 0) {
        console.log(`- Pallet ${pId}: ${summary.stored}/${summary.total} stored, QRs: [${summary.qrs.join(', ')}], Statuses: [${Array.from(new Set(summary.statuses)).join(', ')}]`);
      }
    });

    console.log("\nPallets summary (partially stored or mixed):");
    Object.keys(palletSummary).forEach(pId => {
      const summary = palletSummary[pId];
      if (summary.stored > 0 && summary.qrs.length > 0 && summary.qrs.length < summary.total) {
        console.log(`- Pallet ${pId}: ${summary.stored}/${summary.total} stored, QRs: [${summary.qrs.join(', ')}], Statuses: [${Array.from(new Set(summary.statuses)).join(', ')}]`);
      }
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
