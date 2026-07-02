const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

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
  console.log("Searching for Fall Creek stored items with empty containerId/QR...");
  try {
    const snap = await getDocs(collection(db, "otherFruitReceptions"));
    const emptyQrStoredItems = [];

    snap.forEach(doc => {
      const reception = doc.data();
      if (reception.clientName?.toUpperCase() !== 'FALL CREEK') return;

      const items = reception.items || [];
      items.forEach((item, index) => {
        if (item.status === 'Almacenado') {
          const hasNoQr = !item.containerId || item.containerId.trim() === '' || item.containerId === '-';
          if (hasNoQr) {
            emptyQrStoredItems.push({
              receptionId: doc.id,
              manifest: reception.document,
              palletId: item.palletId,
              status: item.status,
              chamberId: item.storageLocation?.chamberId,
              coordinate: item.storageLocation?.coordinate,
              itemIndex: index,
              storedAt: item.storedAt ? (item.storedAt.toDate ? item.storedAt.toDate() : item.storedAt) : 'N/A',
              storedBy: item.storedByUserName || 'N/A'
            });
          }
        }
      });
    });

    console.log(`Found ${emptyQrStoredItems.length} stored items with empty QRs:\n`);
    emptyQrStoredItems.forEach(item => {
      console.log(`- Manifest: "${item.manifest}"`);
      console.log(`  Pallet ID: ${item.palletId}, Item Index: ${item.itemIndex}`);
      console.log(`  Location: ${item.chamberId} / ${item.coordinate}`);
      console.log(`  Stored At: ${item.storedAt}, By: ${item.storedBy}`);
      console.log("-----------------------------------------");
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
