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
  console.log("Searching for PALLET-11335 and PALLET-11343...");
  try {
    const querySnapshot = await getDocs(collection(db, "otherFruitReceptions"));
    console.log(`Checking ${querySnapshot.size} documents in otherFruitReceptions...`);
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
          if (item.palletId === "PALLET-11335" || item.palletId === "PALLET-11343") {
            console.log(`Doc ID: ${doc.id}, Doc: ${data.document}, DocNum: ${data.documentNumber}`);
            console.log(`  Item[${index}]: Pallet: ${item.palletId}, ContainerId/QR: ${item.containerId}, Coord: ${item.storageLocation?.coordinate}, Status: ${item.status}`);
          }
        });
      }
    });
  } catch (err) {
    console.error("Error querying documents:", err);
  }
}

run();
