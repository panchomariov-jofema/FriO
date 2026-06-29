const { initializeApp } = require("firebase/app");
const { getFirestore, doc, updateDoc, getDoc } = require("firebase/firestore");

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
  const docId = "ogU8KgjFLH83T2yh84mu";
  console.log(`Updating document ${docId} in otherFruitReceptions collection...`);
  try {
    const docRef = doc(db, "otherFruitReceptions", docId);
    
    // Fetch current state
    const beforeSnap = await getDoc(docRef);
    if (!beforeSnap.exists()) {
      console.error("Document does not exist!");
      return;
    }
    console.log("Before update documentNumber:", JSON.stringify(beforeSnap.data().documentNumber));
    
    // Update
    await updateDoc(docRef, {
      documentNumber: "1458"
    });
    console.log("Update successful!");
    
    // Fetch updated state
    const afterSnap = await getDoc(docRef);
    console.log("After update documentNumber:", JSON.stringify(afterSnap.data().documentNumber));
  } catch (err) {
    console.error("Error updating document:", err);
  }
}

run();
