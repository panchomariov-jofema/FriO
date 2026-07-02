const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, query, where } = require("firebase/firestore");

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
  console.log("Fetching manifest 'SHIP-0731 FRIGORIFICO'...");
  try {
    const q = query(collection(db, "otherFruitReceptions"), where("document", "==", "SHIP-0731 FRIGORIFICO"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      console.log("Manifest not found.");
      return;
    }

    snap.forEach(doc => {
      const data = doc.data();
      console.log(`Document ID: ${doc.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Client: ${data.clientName}`);
      console.log(`Created At: ${data.createdAt ? data.createdAt.toDate() : 'N/A'}`);
      console.log(`User: ${data.userName}`);
      console.log("\nItems details:");
      
      const items = data.items || [];
      
      // Let's filter items for the specific pallets we found:
      const targetPallets = ["PALLET-12148", "PALLET-12155", "PALLET-12156", "PALLET-12157"];
      
      items.forEach((item, index) => {
        if (targetPallets.includes(item.palletId)) {
          console.log(`[Item ${index}] Pallet ID: ${item.palletId}`);
          console.log(`  Status: ${item.status}`);
          console.log(`  QR/ContainerId: ${item.containerId || 'NONE'}`);
          console.log(`  Location: ${item.storageLocation?.chamberId} / ${item.storageLocation?.coordinate}`);
          console.log(`  Product: ${item.productName}`);
          console.log(`  Quantity: ${item.quantity}`);
          console.log(`  Stored At: ${item.storedAt ? (item.storedAt.toDate ? item.storedAt.toDate() : item.storedAt) : 'N/A'}`);
          console.log(`  Stored By: ${item.storedByUserName || 'N/A'}`);
          console.log("---");
        }
      });
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
