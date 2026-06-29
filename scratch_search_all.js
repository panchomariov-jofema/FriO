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

const COLLECTIONS = [
  "otherFruitReceptions",
  "otherFruitMovements",
  "receptionLots",
  "chamberLots",
  "binMaterialMovements"
];

async function run() {
  console.log("Searching for PALLET-11335 and PALLET-11343 across collections...");
  try {
    for (const colName of COLLECTIONS) {
      const snap = await getDocs(collection(db, colName));
      console.log(`Checking ${snap.size} documents in collection '${colName}'...`);
      snap.forEach(doc => {
        const data = doc.data();
        const dataStr = JSON.stringify(data);
        if (dataStr.includes("PALLET-11335") || dataStr.includes("PALLET-11343")) {
          console.log(`Match found in collection '${colName}', Document ID: ${doc.id}`);
          console.log(JSON.stringify(data, null, 2));
          console.log("-----------------------------------------");
        }
      });
    }
  } catch (err) {
    console.error("Error during search:", err);
  }
}

run();
