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
  console.log("Searching for document 'PALLET LOG SHIP-0646' or '1458' in otherFruitReceptions...");
  try {
    const q1 = query(collection(db, "otherFruitReceptions"), where("document", "==", "PALLET LOG SHIP-0646"));
    const snap1 = await getDocs(q1);
    console.log(`Query 'PALLET LOG SHIP-0646' returned ${snap1.size} documents.`);
    snap1.forEach(doc => {
      console.log(`Document ID: ${doc.id}, data:`, JSON.stringify(doc.data(), null, 2));
    });

    const q2 = query(collection(db, "otherFruitReceptions"), where("documentNumber", "==", "1458"));
    const snap2 = await getDocs(q2);
    console.log(`Query '1458' (documentNumber) returned ${snap2.size} documents.`);
    snap2.forEach(doc => {
      console.log(`Document ID: ${doc.id}, data:`, JSON.stringify(doc.data(), null, 2));
    });

    const q3 = query(collection(db, "otherFruitReceptions"), where("document", "==", "1458"));
    const snap3 = await getDocs(q3);
    console.log(`Query '1458' (document) returned ${snap3.size} documents.`);
    snap3.forEach(doc => {
      console.log(`Document ID: ${doc.id}, data:`, JSON.stringify(doc.data(), null, 2));
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
